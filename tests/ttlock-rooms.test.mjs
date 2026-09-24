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

test("Pomieszczenia require per-lock employee permissions and audit every command", async () => {
  const [schema, auth, waiterRoute, modulePermissionRoute, lockPermissionRoute, migration] = await Promise.all([
    read("db/schema.ts"),
    read("lib/waiter-auth.ts"),
    read("app/api/waiter/rooms/route.ts"),
    read("app/api/admin/waiter/employees/[dotykackaId]/rooms/route.ts"),
    read("app/api/admin/rooms/permissions/route.ts"),
    read("drizzle/0069_room_lock_permissions.sql"),
  ]);
  assert.match(schema, /canControlRooms/);
  assert.match(schema, /roomLockEvents/);
  assert.match(schema, /roomLockPermissions/);
  assert.match(schema, /room_lock_permissions_employee_lock_uq/);
  assert.match(auth, /canControlRooms/);
  assert.match(waiterRoute, /!employee\.canControlRooms/);
  assert.match(waiterRoute, /roomLockPermissions\.employeeDotykackaId/);
  assert.match(waiterRoute, /Nie masz uprawnienia do tego zamka/);
  assert.match(waiterRoute, /status: "SUCCEEDED"/);
  assert.match(waiterRoute, /status: "FAILED"/);
  assert.match(modulePermissionRoute, /canControlRooms: body\.enabled/);
  assert.match(modulePermissionRoute, /delete\(roomLockPermissions\)/);
  assert.match(lockPermissionRoute, /currentAdmin/);
  assert.match(lockPermissionRoute, /listTtLocks/);
  assert.match(lockPermissionRoute, /onConflictDoUpdate/);
  assert.match(lockPermissionRoute, /canControlRooms: true/);
  assert.match(migration, /CREATE TABLE "room_lock_permissions"/);
  assert.match(migration, /CREATE UNIQUE INDEX "room_lock_permissions_employee_lock_uq"/);
});

test("administrator and employee interfaces use the Pomieszczenia name", async () => {
  const [admin, employee, dashboard, preferences, adminStyles, employeeStyles] = await Promise.all([
    read("app/admin/rooms/rooms-admin-client.tsx"),
    read("app/kelner/pomieszczenia/rooms-employee-client.tsx"),
    read("app/admin/admin-panel.tsx"),
    read("app/api/admin/dashboard-preferences/route.ts"),
    read("app/admin/rooms/rooms.css"),
    read("app/kelner/pomieszczenia/rooms.css"),
  ]);
  assert.match(admin, /title="Pomieszczenia"/);
  assert.match(admin, /Kto może otwierać który zamek/);
  assert.match(admin, /\/api\/admin\/rooms\/permissions/);
  assert.match(employee, /title="Pomieszczenia"/);
  assert.match(employee, /Brak przypisanych zamków/);
  assert.match(dashboard, /title: "Pomieszczenia"/);
  assert.match(preferences, /"rooms"/);
  assert.doesNotMatch(admin, /process\.env/);
  assert.doesNotMatch(employee, /process\.env/);
  assert.doesNotMatch(admin, /window\.confirm/);
  assert.doesNotMatch(employee, /window\.confirm/);
  assert.match(adminStyles, /\.rooms-grid\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\);gap:12px\}/);
  assert.match(employeeStyles, /\.waiter-rooms-grid\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\);gap:12px\}/);
  assert.match(adminStyles, /\.room-card\{min-height:178px;padding:16px\}/);
  assert.match(employeeStyles, /\.waiter-room-card\{min-height:184px;padding:16px/);
});
