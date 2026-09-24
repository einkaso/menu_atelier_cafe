import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("TTLock credentials remain server-only and commands use official cloud endpoints", async () => {
  const source = await read("lib/ttlock.ts");
  assert.match(source, /import "server-only"/);
  assert.match(source, /TTLOCK_CLIENT_ID/);
  assert.match(source, /TTLOCK_ACCESS_TOKEN/);
  assert.match(source, /application\/x-www-form-urlencoded/);
  assert.match(source, /\/v3\/lock\/list/);
  assert.match(source, /\/v3\/lock\/queryOpenState/);
  assert.match(source, /\/v3\/lock\/unlock/);
  assert.match(source, /\/v3\/lock\/lock/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_TTLOCK/);
});

test("Pomieszczenia require a separate employee permission and audit every command", async () => {
  const [schema, auth, waiterRoute, permissionRoute] = await Promise.all([
    read("db/schema.ts"),
    read("lib/waiter-auth.ts"),
    read("app/api/waiter/rooms/route.ts"),
    read("app/api/admin/waiter/employees/[dotykackaId]/rooms/route.ts"),
  ]);
  assert.match(schema, /canControlRooms/);
  assert.match(schema, /roomLockEvents/);
  assert.match(auth, /canControlRooms/);
  assert.match(waiterRoute, /!employee\.canControlRooms/);
  assert.match(waiterRoute, /status: "SUCCEEDED"/);
  assert.match(waiterRoute, /status: "FAILED"/);
  assert.match(permissionRoute, /canControlRooms: body\.enabled/);
});

test("administrator and employee interfaces use the Pomieszczenia name", async () => {
  const [admin, employee, dashboard, preferences] = await Promise.all([
    read("app/admin/rooms/rooms-admin-client.tsx"),
    read("app/kelner/pomieszczenia/rooms-employee-client.tsx"),
    read("app/admin/admin-panel.tsx"),
    read("app/api/admin/dashboard-preferences/route.ts"),
  ]);
  assert.match(admin, /title="Pomieszczenia"/);
  assert.match(employee, /title="Pomieszczenia"/);
  assert.match(dashboard, /title: "Pomieszczenia"/);
  assert.match(preferences, /"rooms"/);
  assert.doesNotMatch(admin, /process\.env/);
  assert.doesNotMatch(employee, /process\.env/);
});
