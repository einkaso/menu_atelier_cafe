import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { coldStorageSensorStates } from "../../../../db/schema";
import { TEMPERATURE_SENSOR_CONFIG, temperatureSensorRequiresAttention, temperatureSensorStatus, type ColdStorageSensorKey } from "../../../../lib/lighting/cold-storage";
import { coldStorageMonitoringInput } from "../../../../lib/lighting/validation";
import { currentWaiter } from "../../../../lib/waiter-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });
  const now = new Date();
  const sensors = await getDb().select({
    key: coldStorageSensorStates.sensorKey,
    name: coldStorageSensorStates.name,
    temperatureC: coldStorageSensorStates.temperatureC,
    thresholdC: coldStorageSensorStates.alarmThresholdC,
    observedAt: coldStorageSensorStates.observedAt,
    monitoringEnabled: coldStorageSensorStates.monitoringEnabled,
    monitoringUpdatedAt: coldStorageSensorStates.monitoringUpdatedAt,
    monitoringUpdatedByName: coldStorageSensorStates.monitoringUpdatedByName,
  }).from(coldStorageSensorStates).where(eq(coldStorageSensorStates.active, true)).orderBy(asc(coldStorageSensorStates.name));

  const byKey = new Map(sensors.map((sensor) => [sensor.key, sensor]));
  return Response.json({
    employeeName: employee.name,
    checkedAt: now.toISOString(),
    sensors: (Object.entries(TEMPERATURE_SENSOR_CONFIG) as Array<[ColdStorageSensorKey, typeof TEMPERATURE_SENSOR_CONFIG[ColdStorageSensorKey]]>).map(([key, config]) => {
      const sensor = byKey.get(key);
      const monitoringEnabled = sensor?.monitoringEnabled ?? config.defaultMonitoring;
      if (!sensor) {
        const status = config.monitoringMode === "INFO" ? "INFO" as const : config.monitoringMode === "SWITCHED" && !monitoringEnabled ? "OFF" as const : "MISSING" as const;
        return { key, name: config.name, monitoringMode: config.monitoringMode, monitoringEnabled, monitoringUpdatedAt: null, monitoringUpdatedByName: null, temperatureC: null, thresholdC: config.alarmThresholdC, observedAt: null, status, requiresAttention: temperatureSensorRequiresAttention(status) };
      }
      const status = temperatureSensorStatus(key, Number(sensor.temperatureC), sensor.observedAt, monitoringEnabled, now);
      return {
        ...sensor,
        name: config.name,
        monitoringMode: config.monitoringMode,
        monitoringEnabled,
        temperatureC: Number(sensor.temperatureC),
        thresholdC: config.alarmThresholdC,
        status,
        requiresAttention: temperatureSensorRequiresAttention(status),
      };
    }),
  });
}

export async function PUT(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });
  const input = coldStorageMonitoringInput.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Nieprawidłowa zmiana stanu urządzenia." }, { status: 400 });
  const updatedAt = new Date();
  const updated = await getDb().update(coldStorageSensorStates).set({
    monitoringEnabled: input.data.monitoringEnabled,
    monitoringUpdatedAt: updatedAt,
    monitoringUpdatedByDotykackaId: employee.dotykackaId,
    monitoringUpdatedByName: employee.name,
  }).where(eq(coldStorageSensorStates.sensorKey, input.data.key)).returning({ key: coldStorageSensorStates.sensorKey });
  if (!updated.length) return Response.json({ error: "Czujnik lodówki nie przesłał jeszcze pierwszego odczytu." }, { status: 409 });
  return Response.json({ ok: true, key: input.data.key, monitoringEnabled: input.data.monitoringEnabled, monitoringUpdatedAt: updatedAt.toISOString(), monitoringUpdatedByName: employee.name });
}
