import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/api/integrations/event-os/lighting/route.ts", import.meta.url), "utf8");

test("Event OS lighting bridge exposes approved outputs and authenticated on/off commands", () => {
  assert.match(source, /eventOsAuthorized\(request\)/);
  assert.match(source, /eq\(lightingOutputs\.active, true\)/);
  assert.match(source, /eq\(lightingDevices\.active, true\)/);
  assert.match(source, /output\.channel\.startsWith\("relay:"\)/);
  assert.match(source, /body\.command === "ON" \|\| body\.command === "OFF"/);
  assert.match(source, /actorDotykackaId: actor/);
  assert.doesNotMatch(source, /host:/);
});
