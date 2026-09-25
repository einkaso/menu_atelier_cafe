import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { lightingBridges, lightingDevices, lightingOutputs, lightingOutputStates } from "../../../../../db/schema";
import { currentLightingBridge } from "../../../../../lib/lighting/bridge-request-auth";
import { lightingInventoryReport } from "../../../../../lib/lighting/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const bridge = await currentLightingBridge(request);
  if (!bridge) return Response.json({ error: "Nieprawidłowy token agenta." }, { status: 401 });
  const input = lightingInventoryReport.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Nieprawidłowy raport urządzeń.", details: input.error.flatten() }, { status: 400 });
  const db = getDb();
  const seenAt = new Date();

  await db.transaction(async (tx) => {
    for (const device of input.data.devices) {
      const [storedDevice] = await tx.insert(lightingDevices).values({
        bridgeId: bridge.id,
        stableId: device.stableId,
        name: device.name,
        host: device.host,
        apiType: device.adapter,
        apiLevel: device.apiLevel,
        hardwareVersion: device.hardwareVersion,
        firmwareVersion: device.firmwareVersion,
        channels: device.outputs.map((output) => output.channel),
        active: device.controllable,
        lastSeenAt: seenAt,
        lastError: null,
        updatedAt: seenAt,
      }).onConflictDoUpdate({
        target: [lightingDevices.bridgeId, lightingDevices.stableId],
        set: {
          name: device.name,
          host: device.host,
          apiType: device.adapter,
          apiLevel: device.apiLevel,
          hardwareVersion: device.hardwareVersion,
          firmwareVersion: device.firmwareVersion,
          channels: device.outputs.map((output) => output.channel),
          active: device.controllable,
          lastSeenAt: seenAt,
          lastError: null,
          updatedAt: seenAt,
        },
      }).returning({ id: lightingDevices.id });

      for (const output of device.outputs) {
        const [storedOutput] = await tx.insert(lightingOutputs).values({
          deviceId: storedDevice.id,
          channel: output.channel,
          label: output.label,
          capabilities: output.capabilities,
          minBrightness: output.minBrightness,
          maxBrightness: output.maxBrightness,
          active: false,
        }).onConflictDoUpdate({
          target: [lightingOutputs.deviceId, lightingOutputs.channel],
          set: {
            capabilities: output.capabilities,
            minBrightness: output.minBrightness,
            maxBrightness: output.maxBrightness,
            updatedAt: seenAt,
          },
        }).returning({ id: lightingOutputs.id });
        await tx.insert(lightingOutputStates).values({
          outputId: storedOutput.id,
          isOn: output.isOn,
          brightness: output.brightness,
          position: output.position ?? null,
          desiredPosition: output.desiredPosition ?? null,
          motion: output.motion ?? null,
          calibrated: output.calibrated ?? null,
          observedAt: input.data.discoveredAt,
          quality: "CONFIRMED",
          lastError: null,
          updatedAt: seenAt,
        }).onConflictDoUpdate({
          target: lightingOutputStates.outputId,
          set: { isOn: output.isOn, brightness: output.brightness, position: output.position ?? null, desiredPosition: output.desiredPosition ?? null, motion: output.motion ?? null, calibrated: output.calibrated ?? null, observedAt: input.data.discoveredAt, quality: "CONFIRMED", lastError: null, updatedAt: seenAt },
        });
      }
    }
    await tx.update(lightingBridges).set({ agentVersion: input.data.agentVersion, lastHeartbeatAt: seenAt, lastError: null, updatedAt: seenAt }).where(eq(lightingBridges.id, bridge.id));
  });
  return Response.json({ status: "ok", devices: input.data.devices.length, seenAt: seenAt.toISOString() });
}
