import { getDb } from "../../../../../db";
import { coldStorageSensorStates } from "../../../../../db/schema";
import { currentLightingBridge } from "../../../../../lib/lighting/bridge-request-auth";
import { TEMPERATURE_SENSOR_CONFIG } from "../../../../../lib/lighting/cold-storage";
import { coldStorageTemperatureReport } from "../../../../../lib/lighting/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const bridge = await currentLightingBridge(request);
  if (!bridge) return Response.json({ error: "Nieprawidłowy token agenta." }, { status: 401 });
  const input = coldStorageTemperatureReport.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Nieprawidłowy raport temperatury." }, { status: 400 });

  const db = getDb();
  const reportedAt = new Date();
  await db.transaction(async (tx) => {
    for (const reading of input.data.readings) {
      const config = TEMPERATURE_SENSOR_CONFIG[reading.key];
      await tx.insert(coldStorageSensorStates).values({
        bridgeId: bridge.id,
        sensorKey: reading.key,
        name: config.name,
        temperatureC: reading.temperatureC.toFixed(2),
        alarmThresholdC: (config.alarmThresholdC ?? 0).toFixed(2),
        observedAt: reading.observedAt,
        reportedAt,
        active: true,
        monitoringEnabled: config.defaultMonitoring,
      }).onConflictDoUpdate({
        target: coldStorageSensorStates.sensorKey,
        set: {
          bridgeId: bridge.id,
          name: config.name,
          temperatureC: reading.temperatureC.toFixed(2),
          alarmThresholdC: (config.alarmThresholdC ?? 0).toFixed(2),
          observedAt: reading.observedAt,
          reportedAt,
        },
      });
    }
  });
  return Response.json({ status: "ok", reportedAt: reportedAt.toISOString() });
}
