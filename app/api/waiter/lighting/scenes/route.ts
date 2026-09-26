import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { lightingCommandItems, lightingCommands, lightingDevices, lightingOutputs, lightingOutputStates, lightingSceneActions, lightingScenes } from "../../../../../db/schema";
import { currentWaiter } from "../../../../../lib/waiter-auth";
import { buildBrightnessFadeSteps } from "../../../../../lib/lighting/scenes";

export const dynamic = "force-dynamic";

type PendingCommand = {
  id: string;
  outputId: number;
  bridgeId: number;
  sceneId: number;
  kind: "ON" | "OFF" | "BRIGHTNESS";
  requestedBrightness: number | null;
  previousIsOn: boolean | null;
  previousBrightness: number | null;
  executeAt: Date;
  expiresAt: Date;
  idempotencyKey: string;
};

export async function POST(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });
  if (!employee.canControlLighting) return Response.json({ error: "Nie masz uprawnienia do sterowania oświetleniem." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { sceneId?: unknown; delaySeconds?: unknown; idempotencyKey?: unknown };
  const sceneId = Number(body.sceneId);
  const delaySeconds = Number(body.delaySeconds);
  const baseKey = typeof body.idempotencyKey === "string" && /^[a-zA-Z0-9-]{16,48}$/.test(body.idempotencyKey) ? body.idempotencyKey : null;
  if (!Number.isInteger(sceneId) || sceneId < 1 || !Number.isInteger(delaySeconds) || delaySeconds < 0 || delaySeconds > 3600 || !baseKey) return Response.json({ error: "Nieprawidłowa scena albo czas uruchomienia." }, { status: 400 });

  const [scene] = await getDb().select({ id: lightingScenes.id, name: lightingScenes.name }).from(lightingScenes).where(and(eq(lightingScenes.id, sceneId), eq(lightingScenes.active, true))).limit(1);
  if (!scene) return Response.json({ error: "Scena nie istnieje albo została wyłączona." }, { status: 404 });
  const actions = await getDb().select({
    actionId: lightingSceneActions.id,
    outputId: lightingOutputs.id,
    bridgeId: lightingDevices.bridgeId,
    channel: lightingOutputs.channel,
    adapter: lightingDevices.apiType,
    capabilities: lightingOutputs.capabilities,
    minBrightness: lightingOutputs.minBrightness,
    maxBrightness: lightingOutputs.maxBrightness,
    command: lightingSceneActions.command,
    brightness: lightingSceneActions.brightness,
    startDelayMs: lightingSceneActions.startDelayMs,
    fadeDurationMs: lightingSceneActions.fadeDurationMs,
    previousIsOn: lightingOutputStates.isOn,
    previousBrightness: lightingOutputStates.brightness,
  }).from(lightingSceneActions)
    .innerJoin(lightingOutputs, eq(lightingOutputs.id, lightingSceneActions.outputId))
    .innerJoin(lightingDevices, eq(lightingDevices.id, lightingOutputs.deviceId))
    .leftJoin(lightingOutputStates, eq(lightingOutputStates.outputId, lightingOutputs.id))
    .where(and(eq(lightingSceneActions.sceneId, sceneId), eq(lightingOutputs.active, true), eq(lightingDevices.active, true)))
    .orderBy(asc(lightingSceneActions.id));
  if (!actions.length) return Response.json({ error: "Ta scena nie ma aktywnych ustawień." }, { status: 409 });

  const scheduledFor = new Date(Date.now() + delaySeconds * 1000);
  const pending: PendingCommand[] = [];
  for (const action of actions) {
    const actionStartsAt = new Date(scheduledFor.getTime() + action.startDelayMs);
    if ((action.command === "ON" || action.command === "OFF") && action.channel.startsWith("relay:") && action.capabilities.onOff) {
      pending.push({ id: randomUUID(), outputId: action.outputId, bridgeId: action.bridgeId, sceneId, kind: action.command, requestedBrightness: null, previousIsOn: action.previousIsOn, previousBrightness: action.previousBrightness, executeAt: actionStartsAt, expiresAt: new Date(actionStartsAt.getTime() + 45_000), idempotencyKey: `${baseKey}-${action.actionId}-0` });
      continue;
    }
    if (action.command !== "BRIGHTNESS" || action.adapter !== "dimmer" || action.channel !== "dimmer:0" || !action.capabilities.dimming || action.brightness == null) continue;
    const steps = buildBrightnessFadeSteps({ start: action.previousBrightness ?? (action.previousIsOn ? action.maxBrightness : 0), target: action.brightness, minimum: action.minBrightness, maximum: action.maxBrightness, durationMs: action.fadeDurationMs });
    for (let step = 0; step < steps.length; step += 1) {
      const executeAt = new Date(actionStartsAt.getTime() + steps[step].offsetMs);
      pending.push({ id: randomUUID(), outputId: action.outputId, bridgeId: action.bridgeId, sceneId, kind: "BRIGHTNESS", requestedBrightness: steps[step].brightness, previousIsOn: action.previousIsOn, previousBrightness: action.previousBrightness, executeAt, expiresAt: new Date(executeAt.getTime() + 45_000), idempotencyKey: `${baseKey}-${action.actionId}-${step + 1}` });
    }
  }
  if (!pending.length) return Response.json({ error: "Urządzenia przypisane do sceny nie obsługują zapisanych poleceń." }, { status: 409 });

  const insertedCount = await getDb().transaction(async (tx) => {
    const inserted = await tx.insert(lightingCommands).values(pending.map((command) => ({
      id: command.id,
      bridgeId: command.bridgeId,
      sceneId: command.sceneId,
      actorDotykackaId: employee.dotykackaId,
      actorName: employee.name,
      kind: command.kind,
      idempotencyKey: command.idempotencyKey,
      status: "QUEUED",
      executeAt: command.executeAt,
      expiresAt: command.expiresAt,
    }))).onConflictDoNothing().returning({ id: lightingCommands.id });
    const insertedIds = new Set(inserted.map((item) => item.id));
    const items = pending.filter((command) => insertedIds.has(command.id)).map((command) => ({
      commandId: command.id,
      outputId: command.outputId,
      previousIsOn: command.previousIsOn,
      previousBrightness: command.previousBrightness,
      requestedCommand: command.kind,
      requestedBrightness: command.requestedBrightness,
    }));
    if (items.length) await tx.insert(lightingCommandItems).values(items);
    return inserted.length;
  });
  const completesAt = new Date(Math.max(...pending.map((command) => command.executeAt.getTime())));
  return Response.json({ scene: scene.name, status: insertedCount ? "QUEUED" : "ALREADY_QUEUED", scheduledFor, completesAt, commandCount: pending.length }, { status: insertedCount ? 202 : 200 });
}
