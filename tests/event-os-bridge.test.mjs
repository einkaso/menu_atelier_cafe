import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("EVENT OS catalogue is explicit, category-selectable and protected", () => {
  const schema = read("db/schema.ts");
  const admin = read("app/admin/event-os/event-os-admin.tsx");
  const catalogRoute = read("app/api/admin/event-os/catalog/route.ts");
  const auth = read("lib/event-os-auth.ts");
  assert.match(schema, /eventOsProductAccess/);
  assert.match(schema, /eventOsEventProducts/);
  assert.match(admin, /Wybierz grupę/);
  assert.match(admin, /Usuń grupę/);
  assert.match(admin, /Ukryj niewidoczne/);
  assert.match(admin, /!hideInvisible \|\| product\.eventEnabled/);
  assert.match(admin, /Wszystkie kategorie/);
  assert.match(catalogRoute, /eventId/);
  assert.match(catalogRoute, /eventOsEventProducts/);
  const integrationCatalogRoute = read("app/api/integrations/event-os/catalog/route.ts");
  assert.match(integrationCatalogRoute, /eventOsEventProducts/);
  assert.match(integrationCatalogRoute, /searchParams\.get\("eventId"\)/);
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
  assert.match(screen, /Według produktów/);
  assert.match(screen, /Według stolików/);
  assert.match(screen, /Osoba po osobie/);
  assert.match(detail, /forecastTotal/);
  assert.match(detail, /sentToPos/);
});

test("EVENT OS uses the shared black administrator header", () => {
  const screen = read("app/admin/event-os/event-os-admin.tsx");
  const sharedStyles = read("app/admin/unified-header.css");
  assert.match(screen, /className="admin-topbar admin-section-topbar"/);
  assert.match(screen, /className="admin-secondary" href="\/admin">Panel główny/);
  assert.match(sharedStyles, /\.admin-shell \.admin-topbar,[\s\S]*background: #000/);
  assert.match(sharedStyles, /\.admin-shell \.admin-topbar > img \{[\s\S]*width: 172px/);
  assert.doesNotMatch(screen, /styles\.topbar|styles\.brand|ArrowLeft/);
});

test("EVENT OS migration contains only the new bridge tables", () => {
  const migration = read("drizzle/0077_event_os_bridge.sql");
  assert.match(migration, /CREATE TABLE "event_os_events"/);
  assert.match(migration, /CREATE TABLE "event_os_product_access"/);
  assert.match(migration, /CREATE TABLE "event_os_orders"/);
  assert.doesNotMatch(migration, /ALTER TABLE "lighting_/);
  assert.doesNotMatch(migration, /DROP INDEX/);
});
