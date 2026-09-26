export const COLD_STORAGE_ALARM_THRESHOLD_C = -8;
export const FRIDGE_ALARM_THRESHOLD_C = 10;
export const COLD_STORAGE_STALE_AFTER_MS = 5 * 60 * 1000;

export const TEMPERATURE_SENSOR_CONFIG = {
  "room-ambient": { name: "Pomieszczenie", monitoringMode: "INFO", alarmThresholdC: null, defaultMonitoring: false },
  "fridge-glass": { name: "Lodówka szklane drzwi", monitoringMode: "SWITCHED", alarmThresholdC: FRIDGE_ALARM_THRESHOLD_C, defaultMonitoring: false },
  "freezer-small": { name: "Zamrażarka mała", monitoringMode: "ALWAYS", alarmThresholdC: COLD_STORAGE_ALARM_THRESHOLD_C, defaultMonitoring: true },
  "freezer-large": { name: "Zamrażarka duża", monitoringMode: "ALWAYS", alarmThresholdC: COLD_STORAGE_ALARM_THRESHOLD_C, defaultMonitoring: true },
} as const;

export const COLD_STORAGE_SENSOR_NAMES = Object.fromEntries(
  Object.entries(TEMPERATURE_SENSOR_CONFIG).map(([key, config]) => [key, config.name]),
) as { [Key in keyof typeof TEMPERATURE_SENSOR_CONFIG]: typeof TEMPERATURE_SENSOR_CONFIG[Key]["name"] };

export type ColdStorageSensorKey = keyof typeof TEMPERATURE_SENSOR_CONFIG;
export type TemperatureSensorStatus = "OK" | "ALERT" | "STALE" | "MISSING" | "INFO" | "OFF";

export function coldStorageStatus(temperatureC: number, observedAt: Date, now = new Date()) {
  if (now.getTime() - observedAt.getTime() > COLD_STORAGE_STALE_AFTER_MS) return "STALE" as const;
  return temperatureC >= COLD_STORAGE_ALARM_THRESHOLD_C ? "ALERT" as const : "OK" as const;
}

export function temperatureSensorStatus(key: ColdStorageSensorKey, temperatureC: number, observedAt: Date, monitoringEnabled: boolean, now = new Date()): TemperatureSensorStatus {
  const config = TEMPERATURE_SENSOR_CONFIG[key];
  if (config.monitoringMode === "INFO") return "INFO";
  if (config.monitoringMode === "SWITCHED" && !monitoringEnabled) return "OFF";
  if (now.getTime() - observedAt.getTime() > COLD_STORAGE_STALE_AFTER_MS) return "STALE";
  if (config.alarmThresholdC === null) return "OK";
  const alarm = key === "fridge-glass" ? temperatureC > config.alarmThresholdC : temperatureC >= config.alarmThresholdC;
  return alarm ? "ALERT" : "OK";
}

export function temperatureSensorRequiresAttention(status: TemperatureSensorStatus) {
  return status === "ALERT" || status === "STALE" || status === "MISSING";
}
