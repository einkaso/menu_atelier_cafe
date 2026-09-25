import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { coldStorageSensorStates } from "../../../../db/schema";
import { COLD_STORAGE_ALARM_THRESHOLD_C, COLD_STORAGE_SENSOR_NAMES, coldStorageStatus, type ColdStorageSensorKey } from "../../../../lib/lighting/cold-storage";
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
  }).from(coldStorageSensorStates).where(eq(coldStorageSensorStates.active, true)).orderBy(asc(coldStorageSensorStates.name));

  const byKey = new Map(sensors.map((sensor) => [sensor.key, sensor]));
  return Response.json({
    employeeName: employee.name,
    checkedAt: now.toISOString(),
    sensors: (Object.entries(COLD_STORAGE_SENSOR_NAMES) as Array<[ColdStorageSensorKey, string]>).map(([key, name]) => {
      const sensor = byKey.get(key);
      if (!sensor) return { key, name, temperatureC: null, thresholdC: COLD_STORAGE_ALARM_THRESHOLD_C, observedAt: null, status: "MISSING" as const };
      return {
        ...sensor,
        temperatureC: Number(sensor.temperatureC),
        thresholdC: Number(sensor.thresholdC),
        status: coldStorageStatus(Number(sensor.temperatureC), sensor.observedAt, now),
      };
    }),
  });
}
