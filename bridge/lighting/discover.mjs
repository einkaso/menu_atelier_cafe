#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { discoverBleboxNetwork } from "./discovery.mjs";

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

export async function main() {
  const cidr = option("--cidr", process.env.BLEBOX_DISCOVERY_CIDR);
  if (!cidr) throw new Error("Brak podsieci. Użyj: --cidr 192.168.1.0/24");
  const timeoutMs = Number(option("--timeout-ms", "900"));
  const concurrency = Number(option("--concurrency", "32"));
  if (!Number.isInteger(timeoutMs) || timeoutMs < 200 || timeoutMs > 5000) throw new Error("timeout-ms musi mieć wartość 200–5000.");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 64) throw new Error("concurrency musi mieć wartość 1–64.");

  const result = await discoverBleboxNetwork(cidr, { timeoutMs, concurrency });
  process.stdout.write(`${JSON.stringify(result, null, process.argv.includes("--pretty") ? 2 : 0)}\n`);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`Błąd wykrywania BleBox: ${error.message}\n`);
    process.exitCode = 1;
  });
}
