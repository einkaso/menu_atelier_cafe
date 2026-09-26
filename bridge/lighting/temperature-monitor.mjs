#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { isPrivateIpv4, readJson } from "./discovery.mjs";

const SENSOR_MAP = new Map([
  [0, "room-ambient"],
  [1, "fridge-glass"],
  [2, "freezer-small"],
  [3, "freezer-large"],
]);

export function temperatureReadings(payload, observedAt = new Date()) {
  const sensors = payload?.multiSensor?.sensors;
  if (!Array.isArray(sensors)) throw new Error("BleBox nie zwrócił listy czujników temperatury.");
  const readings = sensors.flatMap((sensor) => {
    const key = SENSOR_MAP.get(sensor?.id);
    if (!key || sensor?.type !== "temperature" || !Number.isFinite(Number(sensor?.value))) return [];
    return [{ key, temperatureC: Number((Number(sensor.value) / 100).toFixed(2)), observedAt: observedAt.toISOString() }];
  });
  if (readings.length !== SENSOR_MAP.size) throw new Error("Nie udało się odczytać wszystkich czterech sond temperatury.");
  return readings;
}

function serverUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("Agent może wysyłać dane wyłącznie przez HTTPS.");
  }
  return new URL("/api/lighting/bridge/temperatures", url);
}

export async function reportTemperatures({ host, baseUrl, token }) {
  if (!isPrivateIpv4(host)) throw new Error("BLEBOX_TEMPERATURE_HOST musi być prywatnym adresem IPv4.");
  if (!/^[a-zA-Z0-9_-]{40,}$/.test(token)) throw new Error("Brak prawidłowego LIGHTING_BRIDGE_TOKEN.");
  const state = await readJson(host, "/state/extended", { timeoutMs: 3000 });
  const readings = temperatureReadings(state);
  const response = await fetch(serverUrl(baseUrl), {
    method: "POST",
    redirect: "error",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ readings }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Serwer odrzucił raport temperatury (${response.status}).`);
  return readings;
}

export async function main() {
  const config = {
    host: process.env.BLEBOX_TEMPERATURE_HOST ?? "",
    baseUrl: process.env.LIGHTING_BRIDGE_SERVER_URL ?? "",
    token: process.env.LIGHTING_BRIDGE_TOKEN ?? "",
  };
  const intervalMs = Number(process.env.TEMPERATURE_REPORT_INTERVAL_MS ?? 30_000);
  if (!Number.isInteger(intervalMs) || intervalMs < 10_000 || intervalMs > 300_000) throw new Error("Interwał raportowania musi wynosić 10–300 sekund.");
  for (;;) {
    try {
      const readings = await reportTemperatures(config);
      process.stdout.write(`${new Date().toISOString()} Temperatury wysłane: ${readings.map((item) => `${item.key}=${item.temperatureC}°C`).join(", ")}\n`);
    } catch (error) {
      process.stderr.write(`${new Date().toISOString()} Błąd temperatur: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
