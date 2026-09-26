import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { lightingBridges, lightingDevices, lightingOutputs, lightingOutputStates, lightingRooms, lightingSceneActions, lightingScenes } from "../../../../db/schema";
import { currentWaiter } from "../../../../lib/waiter-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });
  if (!employee.canControlLighting) return Response.json({ error: "Nie masz uprawnienia do sterowania oświetleniem." }, { status: 403 });
  const db = getDb();
  const [bridge] = await db.select({ lastHeartbeatAt: lightingBridges.lastHeartbeatAt, lastError: lightingBridges.lastError })
    .from(lightingBridges).where(eq(lightingBridges.active, true)).orderBy(asc(lightingBridges.id)).limit(1);
  const [outputs, scenes, sceneActions] = await Promise.all([db.select({
    id: lightingOutputs.id,
    label: lightingOutputs.label,
    channel: lightingOutputs.channel,
    capabilities: lightingOutputs.capabilities,
    minBrightness: lightingOutputs.minBrightness,
    maxBrightness: lightingOutputs.maxBrightness,
    preferredPosition: lightingOutputs.preferredPosition,
    roomId: lightingOutputs.roomId,
    roomName: lightingRooms.name,
    deviceName: lightingDevices.name,
    isOn: lightingOutputStates.isOn,
    brightness: lightingOutputStates.brightness,
    position: lightingOutputStates.position,
    desiredPosition: lightingOutputStates.desiredPosition,
    motion: lightingOutputStates.motion,
    calibrated: lightingOutputStates.calibrated,
    observedAt: lightingOutputStates.observedAt,
    quality: lightingOutputStates.quality,
    lastError: lightingOutputStates.lastError,
  }).from(lightingOutputs)
    .innerJoin(lightingDevices, eq(lightingDevices.id, lightingOutputs.deviceId))
    .leftJoin(lightingRooms, eq(lightingRooms.id, lightingOutputs.roomId))
    .leftJoin(lightingOutputStates, eq(lightingOutputStates.outputId, lightingOutputs.id))
    .where(and(eq(lightingOutputs.active, true), eq(lightingDevices.active, true)))
    .orderBy(asc(lightingRooms.sortOrder), asc(lightingOutputs.label)),
    db.select({ id: lightingScenes.id, name: lightingScenes.name, roomId: lightingScenes.roomId, roomName: lightingRooms.name })
      .from(lightingScenes)
      .leftJoin(lightingRooms, eq(lightingRooms.id, lightingScenes.roomId))
      .where(eq(lightingScenes.active, true))
      .orderBy(asc(lightingScenes.sortOrder), asc(lightingScenes.id)),
    db.select({ sceneId: lightingSceneActions.sceneId, startDelayMs: lightingSceneActions.startDelayMs, fadeDurationMs: lightingSceneActions.fadeDurationMs }).from(lightingSceneActions),
  ]);
  const now = Date.now();
  return Response.json({
    bridge: {
      online: Boolean(bridge?.lastHeartbeatAt && now - bridge.lastHeartbeatAt.getTime() <= 60_000),
      lastHeartbeatAt: bridge?.lastHeartbeatAt ?? null,
      error: bridge?.lastError ?? null,
    },
    scenes: scenes.map((scene) => {
      const actions = sceneActions.filter((action) => action.sceneId === scene.id);
      return {
        ...scene,
        actionCount: actions.length,
        sequenceDurationSeconds: Math.max(0, ...actions.map((action) => Math.round((action.startDelayMs + action.fadeDurationMs) / 1000))),
      };
    }).filter((scene) => scene.actionCount > 0),
    outputs: outputs.map((output) => ({
      ...output,
      stale: !output.observedAt || now - output.observedAt.getTime() > 45_000,
      controlAvailable: output.channel.startsWith("relay:") && output.capabilities.onOff,
      dimmingAvailable: output.channel === "dimmer:0" && output.capabilities.dimming,
      shutterAvailable: output.channel === "shutter:0" && output.capabilities.shutter === true,
    })),
  });
}
