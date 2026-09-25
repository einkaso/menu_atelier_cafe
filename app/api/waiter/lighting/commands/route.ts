import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { lightingCommandItems, lightingCommands, lightingDevices, lightingOutputs, lightingOutputStates } from "../../../../../db/schema";
import { currentWaiter } from "../../../../../lib/waiter-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });
  if (!employee.canControlLighting) return Response.json({ error: "Nie masz uprawnienia do sterowania oświetleniem." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { outputId?: unknown; command?: unknown; brightness?: unknown; position?: unknown; idempotencyKey?: unknown };
  const outputId = Number(body.outputId);
  const command = body.command === "ON" || body.command === "OFF" || body.command === "BRIGHTNESS" || body.command === "SHUTTER_UP" || body.command === "SHUTTER_DOWN" || body.command === "SHUTTER_STOP" || body.command === "SHUTTER_POSITION" ? body.command : null;
  const brightness = Number(body.brightness);
  const position = Number(body.position);
  const idempotencyKey = typeof body.idempotencyKey === "string" && /^[a-zA-Z0-9-]{16,80}$/.test(body.idempotencyKey) ? body.idempotencyKey : null;
  if (!Number.isInteger(outputId) || outputId < 1 || !command || !idempotencyKey) return Response.json({ error: "Nieprawidłowe polecenie oświetlenia." }, { status: 400 });
  if (command === "BRIGHTNESS" && (!Number.isInteger(brightness) || brightness < 0 || brightness > 100)) return Response.json({ error: "Wybierz jasność od 0 do 100%." }, { status: 400 });
  if (command === "SHUTTER_POSITION" && (!Number.isInteger(position) || position < 0 || position > 100)) return Response.json({ error: "Wybierz pozycję ekranu od 0 do 100%." }, { status: 400 });

  const [target] = await getDb().select({
    outputId: lightingOutputs.id,
    channel: lightingOutputs.channel,
    capabilities: lightingOutputs.capabilities,
    minBrightness: lightingOutputs.minBrightness,
    maxBrightness: lightingOutputs.maxBrightness,
    adapter: lightingDevices.apiType,
    bridgeId: lightingDevices.bridgeId,
    previousIsOn: lightingOutputStates.isOn,
    previousBrightness: lightingOutputStates.brightness,
    calibrated: lightingOutputStates.calibrated,
  }).from(lightingOutputs)
    .innerJoin(lightingDevices, eq(lightingDevices.id, lightingOutputs.deviceId))
    .leftJoin(lightingOutputStates, eq(lightingOutputStates.outputId, lightingOutputs.id))
    .where(and(eq(lightingOutputs.id, outputId), eq(lightingOutputs.active, true), eq(lightingDevices.active, true))).limit(1);
  if (!target) return Response.json({ error: "Punkt nie istnieje albo nie został zatwierdzony." }, { status: 404 });
  const shutterCommand = command === "SHUTTER_UP" || command === "SHUTTER_DOWN" || command === "SHUTTER_STOP" || command === "SHUTTER_POSITION";
  if (shutterCommand) {
    if (target.adapter !== "shutter" || target.channel !== "shutter:0" || target.capabilities.shutter !== true) return Response.json({ error: "Ten punkt nie obsługuje sterowania ekranem." }, { status: 409 });
    if (command === "SHUTTER_POSITION" && target.calibrated !== true) return Response.json({ error: "Najpierw skalibruj pozycję ekranu w aplikacji wBox." }, { status: 409 });
  } else if (command === "BRIGHTNESS") {
    if (target.adapter !== "dimmer" || target.channel !== "dimmer:0" || !target.capabilities.dimming) return Response.json({ error: "Ten punkt nie obsługuje regulacji jasności." }, { status: 409 });
    if (brightness !== 0 && (brightness < target.minBrightness || brightness > target.maxBrightness)) return Response.json({ error: `Dostępny zakres jasności to ${target.minBrightness}–${target.maxBrightness}%.` }, { status: 409 });
  } else if (!target.channel.startsWith("relay:") || !target.capabilities.onOff) {
    return Response.json({ error: "Sterowanie włącz/wyłącz tym typem punktu nie jest aktywne." }, { status: 409 });
  }

  const commandId = randomUUID();
  const expiresAt = new Date(Date.now() + 15_000);
  const created = await getDb().transaction(async (tx) => {
    const inserted = await tx.insert(lightingCommands).values({
      id: commandId,
      bridgeId: target.bridgeId,
      actorDotykackaId: employee.dotykackaId,
      actorName: employee.name,
      kind: command,
      idempotencyKey,
      status: "QUEUED",
      expiresAt,
    }).onConflictDoNothing().returning({ id: lightingCommands.id });
    if (!inserted.length) return false;
    await tx.insert(lightingCommandItems).values({
      commandId,
      outputId: target.outputId,
      previousIsOn: target.previousIsOn,
      previousBrightness: target.previousBrightness,
      requestedCommand: command,
      requestedBrightness: command === "BRIGHTNESS" ? brightness : null,
      requestedPosition: command === "SHUTTER_POSITION" ? position : null,
    });
    return true;
  });
  if (!created) {
    const [existing] = await getDb().select({ id: lightingCommands.id, status: lightingCommands.status }).from(lightingCommands).where(and(eq(lightingCommands.actorDotykackaId, employee.dotykackaId), eq(lightingCommands.idempotencyKey, idempotencyKey))).limit(1);
    return Response.json(existing ?? { error: "Nie udało się odnaleźć powtórzonego polecenia." }, { status: existing ? 200 : 409 });
  }
  return Response.json({ id: commandId, status: "QUEUED", expiresAt }, { status: 202 });
}
