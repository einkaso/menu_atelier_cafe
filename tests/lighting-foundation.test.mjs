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
