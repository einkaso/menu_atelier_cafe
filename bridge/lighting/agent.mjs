#!/usr/bin/env node
import http from "node:http";
import { pathToFileURL } from "node:url";
import { discoverBleboxNetwork, inspectBleboxHost, isPrivateIpv4 } from "./discovery.mjs";
import { reportTemperatures } from "./temperature-monitor.mjs";

const AGENT_VERSION = "1.0.1";

function configuration() {
  const baseUrl = process.env.LIGHTING_BRIDGE_SERVER_URL ?? "";
  const token = process.env.LIGHTING_BRIDGE_TOKEN ?? "";
  const temperatureHost = process.env.BLEBOX_TEMPERATURE_HOST ?? "";
  const discoveryCidr = process.env.BLEBOX_DISCOVERY_CIDR ?? "192.168.1.0/24";
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Agent może łączyć się z aplikacją wyłącznie przez HTTPS.");
  if (!/^[a-zA-Z0-9_-]{40,}$/.test(token)) throw new Error("Brak prawidłowego LIGHTING_BRIDGE_TOKEN.");
  return { baseUrl: url, token, temperatureHost, discoveryCidr };
}

async function bridgeRequest(config, path, options = {}) {
  const response = await fetch(new URL(path, config.baseUrl), {
    ...options,
    redirect: "error",
    headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json", ...(options.headers ?? {}) },
    signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
  });
  if (!response.ok) throw new Error(`${path}: serwer zwrócił ${response.status}.`);
  return response.json().catch(() => ({}));
}

export function relayCommandPayload(channel, command) {
  const match = /^relay:(\d+)$/.exec(String(channel));
  if (!match || (command !== "ON" && command !== "OFF")) throw new Error("Agent odrzucił nieobsługiwane polecenie.");
  return { relays: [{ relay: Number(match[1]), state: command === "ON" ? 1 : 0 }] };
}

export function writeRelayState(host, channel, command, { timeoutMs = 1800 } = {}) {
  if (!isPrivateIpv4(host)) {
    return Promise.reject(new Error("Sterowanie jest dozwolone wyłącznie pod prywatnym adresem IPv4."));
  }
  const body = JSON.stringify(relayCommandPayload(channel, command));
  const post = (path) => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    const request = http.request({
      host,
      port: 80,
      path,
      method: "POST",
      agent: false,
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body), Connection: "close" },
    }, (response) => {
      response.resume();
      response.on("end", () => finish(resolve, response.statusCode === 200));
    });
    request.setTimeout(timeoutMs, () => { finish(reject, new Error("Przekroczono czas sterowania BleBox.")); request.destroy(); });
    request.on("error", (error) => finish(reject, error));
    request.end(body);
  });
  return post("/state").then(async (success) => success || post("/api/relay/set"));
}

export async function processNextCommand(config) {
  const response = await bridgeRequest(config, "/api/lighting/bridge/commands/claim", { method: "POST" });
  const command = response.command;
  if (!command) return false;
  let success = false;
  let isOn = null;
  let brightness = null;
  let error = null;
  try {
    if (command.adapter !== "relay") throw new Error("Sterowanie tego typu urządzeniem nie zostało uruchomione.");
    const accepted = await writeRelayState(command.host, command.channel, command.kind);
    if (!accepted) throw new Error("Urządzenie BleBox odrzuciło polecenie.");
    const verified = await inspectBleboxHost(command.host, { timeoutMs: 1800 });
    const state = verified?.outputs.find((output) => output.channel === command.channel);
    const requestedIsOn = command.kind === "ON";
    if (!state || state.isOn !== requestedIsOn) throw new Error("Nie udało się potwierdzić nowego stanu urządzenia.");
    success = true;
    isOn = state.isOn;
    brightness = state.brightness;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  await bridgeRequest(config, `/api/lighting/bridge/commands/${encodeURIComponent(command.id)}/result`, {
    method: "POST",
    body: JSON.stringify({ success, outputId: command.outputId, isOn, brightness, observedAt: new Date().toISOString(), error }),
  });
  if (!success) throw new Error(error ?? "Polecenie BleBox nie powiodło się.");
  return true;
}

export async function reportInventory(config) {
  const inventory = await discoverBleboxNetwork(config.discoveryCidr, { concurrency: 64, timeoutMs: 1500 });
  await bridgeRequest(config, "/api/lighting/bridge/inventory", {
    method: "POST",
    timeoutMs: 20_000,
    body: JSON.stringify({ agentVersion: AGENT_VERSION, discoveredAt: inventory.discoveredAt, devices: inventory.devices }),
  });
  return inventory.summary;
}

export async function reportApprovedStates(config) {
  const configured = await bridgeRequest(config, "/api/lighting/bridge/config", { method: "GET" });
  const outputs = Array.isArray(configured.outputs) ? configured.outputs : [];
  const byDevice = new Map();
  for (const output of outputs) byDevice.set(output.stableId, { host: output.host, outputs: [...(byDevice.get(output.stableId)?.outputs ?? []), output] });
  const states = [];
  await Promise.all([...byDevice.entries()].map(async ([stableId, item]) => {
    const observedAt = new Date().toISOString();
    const device = await inspectBleboxHost(item.host, { timeoutMs: 1500 });
    for (const configuredOutput of item.outputs) {
      const state = device?.stableId === stableId ? device.outputs.find((candidate) => candidate.channel === configuredOutput.channel) : null;
      states.push({
        outputId: configuredOutput.outputId,
        isOn: state?.isOn ?? null,
        brightness: state?.brightness ?? null,
        observedAt,
        error: state ? null : "Brak odpowiedzi zatwierdzonego kanału BleBox.",
      });
    }
  }));
  if (states.length) await bridgeRequest(config, "/api/lighting/bridge/states", { method: "POST", body: JSON.stringify({ states }) });
  return states.length;
}

export async function main() {
  const config = configuration();
  let lastInventoryAt = 0;
  let lastTemperatureAt = 0;
  let lastStatesAt = 0;
  let lastError = null;
  for (;;) {
    const now = Date.now();
    try {
      await processNextCommand(config);
      if (now - lastInventoryAt >= 10 * 60_000) {
        const summary = await reportInventory(config);
        process.stdout.write(`${new Date().toISOString()} Inwentaryzacja BleBox: ${summary.total} urządzeń, ${summary.outputs} wyjść.\n`);
        lastInventoryAt = Date.now();
      }
      if (now - lastTemperatureAt >= 30_000) {
        const readings = await reportTemperatures({ host: config.temperatureHost, baseUrl: config.baseUrl.toString(), token: config.token });
        process.stdout.write(`${new Date().toISOString()} Temperatury: ${readings.map((item) => `${item.key}=${item.temperatureC}°C`).join(", ")}\n`);
        lastTemperatureAt = Date.now();
      }
      if (now - lastStatesAt >= 10_000) {
        await reportApprovedStates(config);
        lastStatesAt = Date.now();
      }
      lastError = null;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${new Date().toISOString()} Błąd agenta BleBox: ${lastError}\n`);
    }
    try {
      await bridgeRequest(config, "/api/lighting/bridge/heartbeat", { method: "POST", body: JSON.stringify({ agentVersion: AGENT_VERSION, error: lastError }) });
    } catch (error) {
      process.stderr.write(`${new Date().toISOString()} Błąd heartbeat: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
