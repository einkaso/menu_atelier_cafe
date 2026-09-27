import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("EVENT OS catalogue is explicit, category-selectable and protected", () => {
  const schema = read("db/schema.ts");
  const admin = read("app/admin/event-os/event-os-admin.tsx");
  const auth = read("lib/event-os-auth.ts");
  assert.match(schema, /eventOsProductAccess/);
  assert.match(admin, /Pokaż całą grupę/);
  assert.match(admin, /Nie pokazuj grupy/);
  assert.match(auth, /timingSafeEqual/);
  assert.match(auth, /MENU_EVENT_OS_SECRET/);
});

test("EVENT OS keeps parallel events, guest orders and revenue forecasts separate", () => {
  const schema = read("db/schema.ts");
  const screen = read("app/admin/event-os/event-os-admin.tsx");
  const detail = read("app/api/admin/event-os/events/[id]/orders/route.ts");
  assert.match(schema, /eventOsEvents/);
  assert.match(schema, /eventOsOrders/);
  assert.match(screen, /TRWA TERAZ/);
  assert.match(screen, /NAJBLIŻSZE/);
  assert.match(screen, /Produkty i ilości/);
  assert.match(screen, /Osoba po osobie/);
  assert.match(detail, /forecastTotal/);
  assert.match(detail, /sentToPos/);
});

test("EVENT OS migration contains only the new bridge tables", () => {
  const migration = read("drizzle/0077_event_os_bridge.sql");
  assert.match(migration, /CREATE TABLE "event_os_events"/);
  assert.match(migration, /CREATE TABLE "event_os_product_access"/);
  assert.match(migration, /CREATE TABLE "event_os_orders"/);
  assert.doesNotMatch(migration, /ALTER TABLE "lighting_/);
  assert.doesNotMatch(migration, /DROP INDEX/);
});
