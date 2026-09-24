import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, server: { middlewareMode: true } });
after(async () => vite.close());
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("lighting foundation keeps configuration, state and command history separate", async () => {
  const [schema, migration] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0049_lighting_control_foundation.sql"),
  ]);
  for (const name of ["lighting_bridges", "lighting_devices", "lighting_outputs", "lighting_output_states", "lighting_commands", "lighting_command_items"]) {
    assert.match(schema, new RegExp(name));
    assert.match(migration, new RegExp(name));
  }
  assert.match(schema, /canControlLighting: boolean\("can_control_lighting"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "can_control_lighting"/);
  assert.match(migration, /lighting_commands_idempotency_uq/);
});

test("lighting input validation rejects toggle-like and out-of-range commands", async () => {
  const { lightingCommandInput } = await vite.ssrLoadModule("/lib/lighting/validation.ts");
  assert.equal(lightingCommandInput.safeParse({ kind: "ON", outputId: 4 }).success, true);
  assert.equal(lightingCommandInput.safeParse({ kind: "BRIGHTNESS", outputId: 4, brightness: 101 }).success, false);
  assert.equal(lightingCommandInput.safeParse({ kind: "TOGGLE", outputId: 4 }).success, false);
  assert.equal(lightingCommandInput.safeParse({ kind: "ALL_OFF", confirmation: "HOLD" }).success, true);
});

test("bridge secrets are stored as hashes and compared in constant time", async () => {
  const { createBridgeToken, verifyBridgeToken } = await vite.ssrLoadModule("/lib/lighting/bridge-auth.ts");
  const created = createBridgeToken();
  assert.equal(verifyBridgeToken(created.token, created.tokenHash), true);
  assert.equal(verifyBridgeToken(`${created.token}x`, created.tokenHash), false);
  assert.match(created.tokenHint, /^.{4}….{4}$/);
});

test("cold storage alert starts at minus eight degrees and detects stale readings", async () => {
  const { coldStorageStatus, COLD_STORAGE_ALARM_THRESHOLD_C } = await vite.ssrLoadModule("/lib/lighting/cold-storage.ts");
  const now = new Date("2026-09-23T12:00:00Z");
  assert.equal(COLD_STORAGE_ALARM_THRESHOLD_C, -8);
  assert.equal(coldStorageStatus(-8.01, new Date("2026-09-23T11:59:30Z"), now), "OK");
  assert.equal(coldStorageStatus(-8, new Date("2026-09-23T11:59:30Z"), now), "ALERT");
  assert.equal(coldStorageStatus(-7.99, new Date("2026-09-23T11:59:30Z"), now), "ALERT");
  assert.equal(coldStorageStatus(-20, new Date("2026-09-23T11:54:59Z"), now), "STALE");
});

test("cold storage migration and waiter alert UI remain wired", async () => {
  const [schema, migration, client] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0064_cold_storage_temperature_alerts.sql"),
    read("app/kelner/waiter-client.tsx"),
  ]);
  assert.match(schema, /coldStorageSensorStates/);
  assert.match(migration, /cold_storage_sensor_states/);
  assert.match(client, /ALARM TEMPERATURY/);
  assert.match(client, /environment-alerts/);
});

test("lighting inventory, administration and employee controls are wired", async () => {
  const [inventory, adminApi, adminUi, waiterApi, commandApi, waiterUi, waiterCss, agent] = await Promise.all([
    read("app/api/lighting/bridge/inventory/route.ts"),
    read("app/api/admin/lighting/config/route.ts"),
    read("app/admin/lighting/lighting-admin-client.tsx"),
    read("app/api/waiter/lighting/route.ts"),
    read("app/api/waiter/lighting/commands/route.ts"),
    read("app/kelner/oswietlenie/lighting-preparation-client.tsx"),
    read("app/kelner/oswietlenie/lighting-preparation.css"),
    read("bridge/lighting/agent.mjs"),
  ]);
  assert.match(inventory, /active: false/);
  assert.match(adminApi, /lightingOutputConfigurationInput/);
  assert.match(adminUi, /Najpierw zatwierdź rzeczywiste lampy/);
  assert.match(waiterApi, /canControlLighting/);
  assert.match(commandApi, /body\.command === "ON" \|\| body\.command === "OFF"/);
  assert.doesNotMatch(commandApi, /TOGGLE/);
  assert.match(waiterUi, />Włącz</);
  assert.match(waiterUi, />Wyłącz</);
  assert.match(waiterUi, /headers: waiterSessionHeaders\(\{ "content-type": "application\/json" \}\)/);
  assert.match(waiterUi, /idempotencyKey: createClientRequestId\(\)/);
  assert.match(waiterUi, /Tablet nie zdołał wysłać polecenia/);
  assert.doesNotMatch(waiterUi, /crypto\.randomUUID\(\)/);
  assert.match(waiterUi, /<header><span>STREFA<\/span><h2>\{room\}<\/h2><\/header>/);
  assert.match(waiterUi, /desktopColumns = Math\.min\(outputs\.length, 4\)/);
  assert.match(waiterUi, /--lighting-room-width/);
  assert.match(waiterCss, /\.waiter-lighting-room > header \{ display: grid;[^}]*background: #0b3440; color: #fff;/);
  assert.match(waiterCss, /\.waiter-lighting-room h2 \{[^}]*color: #fff;/);
  assert.match(waiterCss, /\.waiter-lighting-room \{[^}]*width: min\(var\(--lighting-room-width\), calc\(100% - 40px\)\)/);
  assert.match(waiterCss, /\.waiter-lighting-card \{[^}]*min-height: 174px; padding: 16px/);
  assert.match(waiterCss, /\.waiter-lighting-actions button \{[^}]*min-height: 42px;[^}]*touch-action: manipulation;/);
  assert.match(agent, /inspectBleboxHost/);
  assert.match(agent, /Nie udało się potwierdzić nowego stanu urządzenia/);
});

test("lighting administration keeps a compact centered desktop layout", async () => {
  const css = await read("app/admin/lighting/lighting.css");
  assert.match(css, /\.lighting-admin-summary\{[^}]*width:min\(1100px,calc\(100% - 36px\)\)[^}]*margin:0 auto/);
  assert.match(css, /\.lighting-admin-intro\{[^}]*width:min\(1100px,calc\(100% - 36px\)/);
  assert.match(css, /\.lighting-device-list\{[^}]*width:min\(1100px,calc\(100% - 36px\)\)[^}]*margin:0 auto/);
  assert.match(css, /grid-template-columns:minmax\(210px,1fr\) minmax\(180px,250px\) minmax\(160px,210px\) 105px 88px/);
});
