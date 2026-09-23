import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { lightingBridges, lightingDevices, lightingOutputs, lightingOutputStates, lightingRooms } from "../../../../db/schema";
import { currentWaiter } from "../../../../lib/waiter-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });
  if (!employee.canControlLighting) return Response.json({ error: "Nie masz uprawnienia do sterowania oświetleniem." }, { status: 403 });
  const db = getDb();
  const [bridge] = await db.select({ lastHeartbeatAt: lightingBridges.lastHeartbeatAt, lastError: lightingBridges.lastError })
    .from(lightingBridges).where(eq(lightingBridges.active, true)).orderBy(asc(lightingBridges.id)).limit(1);
  const outputs = await db.select({
    id: lightingOutputs.id,
    label: lightingOutputs.label,
    channel: lightingOutputs.channel,
    capabilities: lightingOutputs.capabilities,
    roomId: lightingOutputs.roomId,
    roomName: lightingRooms.name,
    deviceName: lightingDevices.name,
    isOn: lightingOutputStates.isOn,
    brightness: lightingOutputStates.brightness,
    observedAt: lightingOutputStates.observedAt,
    quality: lightingOutputStates.quality,
    lastError: lightingOutputStates.lastError,
  }).from(lightingOutputs)
    .innerJoin(lightingDevices, eq(lightingDevices.id, lightingOutputs.deviceId))
    .leftJoin(lightingRooms, eq(lightingRooms.id, lightingOutputs.roomId))
    .leftJoin(lightingOutputStates, eq(lightingOutputStates.outputId, lightingOutputs.id))
    .where(and(eq(lightingOutputs.active, true), eq(lightingDevices.active, true)))
    .orderBy(asc(lightingRooms.sortOrder), asc(lightingOutputs.label));
  const now = Date.now();
  return Response.json({
    bridge: {
      online: Boolean(bridge?.lastHeartbeatAt && now - bridge.lastHeartbeatAt.getTime() <= 60_000),
      lastHeartbeatAt: bridge?.lastHeartbeatAt ?? null,
      error: bridge?.lastError ?? null,
    },
    outputs: outputs.map((output) => ({
      ...output,
      stale: !output.observedAt || now - output.observedAt.getTime() > 45_000,
      controlAvailable: output.channel.startsWith("relay:") && output.capabilities.onOff,
    })),
  });
}
