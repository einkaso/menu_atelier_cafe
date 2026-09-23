export const COLD_STORAGE_ALARM_THRESHOLD_C = -8;
export const COLD_STORAGE_STALE_AFTER_MS = 5 * 60 * 1000;

export const COLD_STORAGE_SENSOR_NAMES = {
  "freezer-small": "Zamrażarka mała",
  "freezer-large": "Zamrażarka duża",
} as const;

export type ColdStorageSensorKey = keyof typeof COLD_STORAGE_SENSOR_NAMES;

export function coldStorageStatus(temperatureC: number, observedAt: Date, now = new Date()) {
  if (now.getTime() - observedAt.getTime() > COLD_STORAGE_STALE_AFTER_MS) return "STALE" as const;
  return temperatureC >= COLD_STORAGE_ALARM_THRESHOLD_C ? "ALERT" as const : "OK" as const;
}
