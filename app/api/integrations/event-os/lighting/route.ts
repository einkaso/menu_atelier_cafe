import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { lightingBridges, lightingCommandItems, lightingCommands, lightingDevices, lightingOutputs, lightingOutputStates, lightingRooms } from "../../../../../db/schema";
import { eventOsAuthorized } from "../../../../../lib/event-os-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!eventOsAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const [bridge] = await db.select({ lastHeartbeatAt: lightingBridges.lastHeartbeatAt, lastError: lightingBridges.lastError }).from(lightingBridges).where(eq(lightingBridges.active, true)).orderBy(asc(lightingBridges.id)).limit(1);
  const outputs = await db.select({
    id: lightingOutputs.id, label: lightingOutputs.label, roomId: lightingOutputs.roomId, roomName: lightingRooms.name,
    deviceName: lightingDevices.name, channel: lightingOutputs.channel, capabilities: lightingOutputs.capabilities,
    isOn: lightingOutputStates.isOn, observedAt: lightingOutputStates.observedAt, quality: lightingOutputStates.quality, lastError: lightingOutputStates.lastError,
  }).from(lightingOutputs).innerJoin(lightingDevices, eq(lightingDevices.id, lightingOutputs.deviceId)).leftJoin(lightingRooms, eq(lightingRooms.id, lightingOutputs.roomId)).leftJoin(lightingOutputStates, eq(lightingOutputStates.outputId, lightingOutputs.id)).where(and(eq(lightingOutputs.active, true), eq(lightingDevices.active, true))).orderBy(asc(lightingRooms.sortOrder), asc(lightingOutputs.label));
  const now = Date.now();
  return Response.json({
    bridge: { online: Boolean(bridge?.lastHeartbeatAt && now - bridge.lastHeartbeatAt.getTime() <= 60_000), lastHeartbeatAt: bridge?.lastHeartbeatAt ?? null, error: bridge?.lastError ?? null },
    outputs: outputs.map(output => ({ ...output, stale: !output.observedAt || now - output.observedAt.getTime() > 45_000, controlAvailable: output.channel.startsWith("relay:") && output.capabilities.onOff })),
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  if (!eventOsAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { outputId?: unknown; command?: unknown; idempotencyKey?: unknown };
  const outputId = Number(body.outputId), command = body.command === "ON" || body.command === "OFF" ? body.command : null;
  const idempotencyKey = typeof body.idempotencyKey === "string" && /^[a-zA-Z0-9-]{16,80}$/.test(body.idempotencyKey) ? body.idempotencyKey : null;
  if (!Number.isInteger(outputId) || outputId < 1 || !command || !idempotencyKey) return Response.json({ error: "Nieprawidłowe polecenie oświetlenia." }, { status: 400 });
  const db = getDb();
  const [target] = await db.select({ outputId: lightingOutputs.id, channel: lightingOutputs.channel, capabilities: lightingOutputs.capabilities, bridgeId: lightingDevices.bridgeId, previousIsOn: lightingOutputStates.isOn, previousBrightness: lightingOutputStates.brightness }).from(lightingOutputs).innerJoin(lightingDevices, eq(lightingDevices.id, lightingOutputs.deviceId)).leftJoin(lightingOutputStates, eq(lightingOutputStates.outputId, lightingOutputs.id)).where(and(eq(lightingOutputs.id, outputId), eq(lightingOutputs.active, true), eq(lightingDevices.active, true))).limit(1);
  if (!target) return Response.json({ error: "Punkt nie istnieje albo nie został zatwierdzony w MENU." }, { status: 404 });
  if (!target.channel.startsWith("relay:") || !target.capabilities.onOff) return Response.json({ error: "Ten punkt nie obsługuje sterowania włącz/wyłącz." }, { status: 409 });
  const commandId = randomUUID(), expiresAt = new Date(Date.now() + 15_000), actor = "event-os";
  const created = await db.transaction(async tx => {
    const inserted = await tx.insert(lightingCommands).values({ id: commandId, bridgeId: target.bridgeId, actorDotykackaId: actor, actorName: "Events", kind: command, idempotencyKey, status: "QUEUED", expiresAt }).onConflictDoNothing().returning({ id: lightingCommands.id });
    if (!inserted.length) return false;
    await tx.insert(lightingCommandItems).values({ commandId, outputId: target.outputId, previousIsOn: target.previousIsOn, previousBrightness: target.previousBrightness, requestedCommand: command });
    return true;
  });
  if (!created) {
    const [existing] = await db.select({ id: lightingCommands.id, status: lightingCommands.status }).from(lightingCommands).where(and(eq(lightingCommands.actorDotykackaId, actor), eq(lightingCommands.idempotencyKey, idempotencyKey))).limit(1);
    return Response.json(existing ?? { error: "Nie udało się odnaleźć powtórzonego polecenia." }, { status: existing ? 200 : 409 });
  }
  return Response.json({ id: commandId, status: "QUEUED", expiresAt }, { status: 202 });
}
