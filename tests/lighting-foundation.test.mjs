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
  assert.equal(lightingCommandInput.safeParse({ kind: "SHUTTER_POSITION", outputId: 4, position: 75 }).success, true);
  assert.equal(lightingCommandInput.safeParse({ kind: "SHUTTER_POSITION", outputId: 4, position: 101 }).success, false);
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
  const { coldStorageStatus, temperatureSensorStatus, COLD_STORAGE_ALARM_THRESHOLD_C, FRIDGE_ALARM_THRESHOLD_C } = await vite.ssrLoadModule("/lib/lighting/cold-storage.ts");
  const now = new Date("2026-09-23T12:00:00Z");
  assert.equal(COLD_STORAGE_ALARM_THRESHOLD_C, -8);
  assert.equal(FRIDGE_ALARM_THRESHOLD_C, 10);
  assert.equal(coldStorageStatus(-8.01, new Date("2026-09-23T11:59:30Z"), now), "OK");
  assert.equal(coldStorageStatus(-8, new Date("2026-09-23T11:59:30Z"), now), "ALERT");
  assert.equal(coldStorageStatus(-7.99, new Date("2026-09-23T11:59:30Z"), now), "ALERT");
  assert.equal(coldStorageStatus(-20, new Date("2026-09-23T11:54:59Z"), now), "STALE");
  assert.equal(temperatureSensorStatus("room-ambient", 25, new Date("2026-09-23T11:00:00Z"), false, now), "INFO");
  assert.equal(temperatureSensorStatus("fridge-glass", 18, new Date("2026-09-23T11:59:30Z"), false, now), "OFF");
  assert.equal(temperatureSensorStatus("fridge-glass", 10, new Date("2026-09-23T11:59:30Z"), true, now), "OK");
  assert.equal(temperatureSensorStatus("fridge-glass", 10.01, new Date("2026-09-23T11:59:30Z"), true, now), "ALERT");
});

test("cold storage migration and waiter alert UI remain wired", async () => {
  const [schema, migration, sensorModeMigration, bridgeMonitor, validation, alertsApi, client, coldPage, coldCss] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0064_cold_storage_temperature_alerts.sql"),
    read("drizzle/0076_temperature_sensor_modes.sql"),
    read("bridge/lighting/temperature-monitor.mjs"),
    read("lib/lighting/validation.ts"),
    read("app/api/waiter/environment-alerts/route.ts"),
    read("app/kelner/waiter-client.tsx"),
    read("app/kelner/chlodnie/cold-storage-client.tsx"),
    read("app/kelner/chlodnie/cold-storage.css"),
  ]);
  assert.match(schema, /coldStorageSensorStates/);
  assert.match(schema, /monitoringEnabled: boolean\("monitoring_enabled"\)/);
  assert.match(migration, /cold_storage_sensor_states/);
  assert.match(sensorModeMigration, /monitoring_updated_by_name/);
  assert.match(bridgeMonitor, /\[0, "room-ambient"\]/);
  assert.match(bridgeMonitor, /\[1, "fridge-glass"\]/);
  assert.match(validation, /\.length\(4\)/);
  assert.match(alertsApi, /coldStorageMonitoringInput/);
  assert.match(alertsApi, /monitoringUpdatedByName: employee\.name/);
  assert.match(client, /ALARM TEMPERATURY/);
  assert.match(client, /environment-alerts/);
  assert.match(client, /href="\/kelner\/chlodnie"/);
  assert.match(coldPage, /window\.setInterval\(refresh, 15_000\)/);
  assert.match(coldPage, /Próg alarmu/);
  assert.match(coldPage, /Odczyt nieaktualny/);
  assert.match(coldPage, /Uruchomiona/);
  assert.match(coldPage, /Temperatura otoczenia/);
  assert.match(coldPage, /po przekroczeniu 10,00°C/);
  assert.match(coldCss, /\.waiter-cold-grid/);
  assert.match(coldCss, /\.waiter-cold-monitoring/);
  assert.match(coldCss, /\.waiter-cold-information/);
});

test("lighting inventory, administration and employee controls are wired", async () => {
  const [inventory, adminApi, adminUi, waiterApi, commandApi, preferredPositionApi, waiterUi, waiterCss, agent, shutterMigration] = await Promise.all([
    read("app/api/lighting/bridge/inventory/route.ts"),
    read("app/api/admin/lighting/config/route.ts"),
    read("app/admin/lighting/lighting-admin-client.tsx"),
    read("app/api/waiter/lighting/route.ts"),
    read("app/api/waiter/lighting/commands/route.ts"),
    read("app/api/waiter/lighting/preferred-position/route.ts"),
    read("app/kelner/oswietlenie/lighting-preparation-client.tsx"),
    read("app/kelner/oswietlenie/lighting-preparation.css"),
    read("bridge/lighting/agent.mjs"),
    read("drizzle/0071_shutter_screen_control.sql"),
  ]);
  assert.match(inventory, /active: false/);
  assert.match(adminApi, /lightingOutputConfigurationInput/);
  assert.match(adminUi, /Najpierw zatwierdź rzeczywiste urządzenia/);
  assert.match(waiterApi, /canControlLighting/);
  assert.match(commandApi, /body\.command === "ON" \|\| body\.command === "OFF" \|\| body\.command === "BRIGHTNESS"/);
  assert.doesNotMatch(commandApi, /TOGGLE/);
  assert.match(waiterUi, />Włącz</);
  assert.match(waiterUi, />Wyłącz</);
  assert.match(waiterUi, /type="range"/);
  assert.match(waiterUi, /scheduleBrightness/);
  assert.match(waiterUi, /SHUTTER_UP/);
  assert.match(waiterUi, /SHUTTER_DOWN/);
  assert.match(waiterUi, /SHUTTER_STOP/);
  assert.match(waiterUi, /Pozycja robocza · \{output\.preferredPosition\}%/);
  assert.match(preferredPositionApi, /preferredPosition: target\.position/);
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
  assert.match(waiterCss, /\.waiter-lighting-dimmer input\[type="range"\]/);
  assert.match(waiterUi, /cardWidth = outputs\.some\(\(output\) => output\.dimmingAvailable \|\| output\.shutterAvailable\) \? 286 : 232/);
  assert.match(waiterUi, /output\.dimmingAvailable && desktopColumns > 1 \? " is-wide"/);
  assert.match(waiterCss, /\.waiter-lighting-card\.is-dimmer\.is-wide \{ grid-column: span 2; \}/);
  assert.match(waiterCss, /\.waiter-lighting-room\.has-dimmers \{ width: calc\(100% - 32px\); \}/);
  assert.match(waiterCss, /\.waiter-lighting-card\.is-on \{ border-color: #9fcdbb; background: linear-gradient\(145deg, #fbfffd, #e9f7f0\)/);
  assert.match(waiterCss, /\.waiter-lighting-dimmer footer button \{ min-height: 46px/);
  assert.match(waiterCss, /\.waiter-lighting-shutter-controls/);
  assert.match(agent, /inspectBleboxHost/);
  assert.match(agent, /writeDimmerBrightness/);
  assert.match(agent, /writeShutterCommand/);
  assert.match(shutterMigration, /preferred_position/);
  assert.match(agent, /Nie udało się potwierdzić nowego stanu urządzenia/);
});

test("lighting administration keeps a compact centered desktop layout", async () => {
  const css = await read("app/admin/lighting/lighting.css");
  assert.match(css, /\.lighting-admin-summary\{[^}]*width:min\(1100px,calc\(100% - 36px\)\)[^}]*margin:0 auto/);
  assert.match(css, /\.lighting-admin-intro\{[^}]*width:min\(1100px,calc\(100% - 36px\)/);
  assert.match(css, /\.lighting-device-list\{[^}]*width:min\(1100px,calc\(100% - 36px\)\)[^}]*margin:0 auto/);
  assert.match(css, /grid-template-columns:minmax\(210px,1fr\) minmax\(180px,250px\) minmax\(160px,210px\) 105px 88px/);
});

test("lighting scenes persist delayed execution and bounded dimmer fades", async () => {
  const { buildBrightnessFadeSteps } = await vite.ssrLoadModule("/lib/lighting/scenes.ts");
  const [schema, migration, scopeMigration, delayMigration, adminApi, waiterApi, waiterLightingApi, claimApi, adminUi, waiterUi] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0072_lighting_scenes.sql"),
    read("drizzle/0074_lighting_scene_scope.sql"),
    read("drizzle/0075_lighting_scene_action_delay.sql"),
    read("app/api/admin/lighting/scenes/route.ts"),
    read("app/api/waiter/lighting/scenes/route.ts"),
    read("app/api/waiter/lighting/route.ts"),
    read("app/api/lighting/bridge/commands/claim/route.ts"),
    read("app/admin/lighting/lighting-admin-client.tsx"),
    read("app/kelner/oswietlenie/lighting-preparation-client.tsx"),
  ]);
  const fade = buildBrightnessFadeSteps({ start: 100, target: 0, minimum: 10, maximum: 100, durationMs: 10_000 });
  assert.equal(fade.length, 10);
  assert.deepEqual(fade.at(-1), { brightness: 0, offsetMs: 10_000 });
  assert.ok(fade.every((step, index) => index === 0 || step.offsetMs > fade[index - 1].offsetMs));
  assert.equal(buildBrightnessFadeSteps({ start: 20, target: 80, minimum: 10, maximum: 100, durationMs: 0 })[0].offsetMs, 0);
  assert.match(schema, /fadeDurationMs: integer\("fade_duration_ms"\)/);
  assert.match(schema, /startDelayMs: integer\("start_delay_ms"\)/);
  assert.match(schema, /executeAt: timestamp\("execute_at"/);
  assert.match(migration, /lighting_commands_status_execute_idx/);
  assert.match(adminApi, /fadeDurationSeconds/);
  assert.match(adminApi, /startDelaySeconds/);
  assert.match(waiterApi, /delaySeconds > 3600/);
  assert.match(waiterApi, /buildBrightnessFadeSteps/);
  assert.match(waiterApi, /scheduledFor\.getTime\(\) \+ action\.startDelayMs/);
  assert.match(claimApi, /lte\(lightingCommands\.executeAt, now\)/);
  assert.match(adminUi, /Zamknięty lokal/);
  assert.match(waiterUi, /Sceny oświetlenia/);
  assert.match(schema, /lightingScenes = pgTable\("lighting_scenes", \{[\s\S]*roomId: integer\("room_id"\)/);
  assert.match(scopeMigration, /lighting_scenes_room_id_lighting_rooms_id_fk/);
  assert.match(delayMigration, /lighting_scene_actions_start_delay_check/);
  assert.match(adminApi, /roomId: z\.number\(\)\.int\(\)\.positive\(\)\.nullable\(\)\.default\(null\)/);
  assert.match(adminApi, /Scena pomieszczenia może sterować tylko punktami przypisanymi do tego pomieszczenia/);
  assert.match(waiterLightingApi, /roomName: lightingRooms\.name/);
  assert.match(waiterLightingApi, /sequenceDurationSeconds/);
  assert.match(adminUi, /ATELIER CAFE · cały lokal/);
  assert.match(adminUi, /Opóźnienie startu/);
  assert.match(waiterUi, /<em>SCENA<\/em>/);
  assert.match(waiterUi, /group\.global \? "CAŁY LOKAL" : "POMIESZCZENIE"/);
  assert.match(waiterUi, /sekwencja/);
});
