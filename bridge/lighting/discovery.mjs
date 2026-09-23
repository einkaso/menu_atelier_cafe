import http from "node:http";
import { classifyBleboxDevice, normalizeDeviceInfo, parseBleboxState, stateReadPaths } from "./blebox-adapters.mjs";

const MAX_RESPONSE_BYTES = 64 * 1024;

function ipv4Parts(value) {
  if (typeof value !== "string" || !/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return null;
  const parts = value.split(".").map(Number);
  return parts.every((part) => part >= 0 && part <= 255) ? parts : null;
}

export function isPrivateIpv4(value) {
  const parts = ipv4Parts(value);
  if (!parts) return false;
  const [a, b] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function toNumber(parts) {
  return parts.reduce((value, part) => ((value << 8) | part) >>> 0, 0);
}

function fromNumber(value) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

export function hostsFromCidr(cidr) {
  const [address, prefixText, extra] = String(cidr).split("/");
  const parts = ipv4Parts(address);
  const prefix = Number(prefixText);
  if (extra !== undefined || !parts || !Number.isInteger(prefix) || prefix < 22 || prefix > 30) {
    throw new Error("Podaj prywatną podsieć IPv4 od /22 do /30, np. 192.168.1.0/24.");
  }
  if (!isPrivateIpv4(address)) throw new Error("Wykrywanie jest dozwolone wyłącznie w prywatnej sieci IPv4.");
  const addressNumber = toNumber(parts);
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  const network = (addressNumber & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const hosts = [];
  for (let value = network + 1; value < broadcast; value += 1) hosts.push(fromNumber(value >>> 0));
  return hosts;
}

export function readJson(host, path, { timeoutMs = 900 } = {}) {
  if (!isPrivateIpv4(host)) return Promise.reject(new Error("Host BleBox musi być prywatnym adresem IPv4."));
  if (!/^\/[a-z0-9/]+$/i.test(path)) return Promise.reject(new Error("Niedozwolona ścieżka odczytu BleBox."));
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };
    const request = http.get({
      host,
      port: 80,
      path,
      headers: { Accept: "application/json", Connection: "close" },
      agent: false,
    }, (response) => {
      if ((response.statusCode ?? 500) >= 300 && (response.statusCode ?? 500) < 400) {
        response.resume();
        finish(reject, new Error("Przekierowania HTTP są zablokowane."));
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        finish(resolve, null);
        return;
      }
      const chunks = [];
      let length = 0;
      response.on("data", (chunk) => {
        length += chunk.length;
        if (length <= MAX_RESPONSE_BYTES) chunks.push(chunk);
        else request.destroy(new Error("Odpowiedź BleBox przekroczyła bezpieczny limit."));
      });
      response.on("end", () => {
        try {
          finish(resolve, JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          finish(resolve, null);
        }
      });
    });
    timeout = setTimeout(() => {
      finish(reject, new Error("Przekroczono czas odczytu BleBox."));
      request.destroy();
    }, timeoutMs);
    request.setTimeout(timeoutMs, () => {
      finish(reject, new Error("Przekroczono czas odczytu BleBox."));
      request.destroy();
    });
    request.on("error", (error) => finish(reject, error));
  });
}

export async function inspectBleboxHost(host, options = {}) {
  let payload;
  try {
    payload = await readJson(host, "/api/device/state", options);
  } catch {
    return null;
  }
  const device = normalizeDeviceInfo(host, payload);
  if (!device) return null;

  let outputs = [];
  let statePath = null;
  for (const path of stateReadPaths(device.adapter)) {
    try {
      const state = await readJson(host, path, options);
      const parsed = state && parseBleboxState(device.adapter, state);
      if (parsed) {
        outputs = parsed;
        statePath = path;
        break;
      }
    } catch {
      // A different API level may expose another path from the fixed allowlist.
    }
  }
  return { ...device, statePath, outputs };
}

export async function discoverBleboxNetwork(cidr, { concurrency = 32, timeoutMs = 900, onProgress } = {}) {
  const queue = hostsFromCidr(cidr);
  const total = queue.length;
  const found = [];
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), 64, total) }, async () => {
    while (queue.length) {
      const host = queue.shift();
      const result = await inspectBleboxHost(host, { timeoutMs });
      if (result) found.push(result);
      onProgress?.({ host, found: found.length, remaining: queue.length });
    }
  });
  await Promise.all(workers);
  found.sort((left, right) => toNumber(ipv4Parts(left.host)) - toNumber(ipv4Parts(right.host)));
  return {
    discoveredAt: new Date().toISOString(),
    cidr,
    scannedHosts: total,
    devices: found,
    summary: found.reduce((summary, device) => {
      summary.total += 1;
      summary[device.adapter] = (summary[device.adapter] ?? 0) + 1;
      summary.outputs += device.outputs.length;
      return summary;
    }, { total: 0, outputs: 0 }),
  };
}

export function classifyDiscoveryPayload(payload) {
  const device = payload?.device;
  return device ? classifyBleboxDevice(device) : null;
}
