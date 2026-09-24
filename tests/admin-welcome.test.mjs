import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("admin opens on a personalized welcome screen instead of the first product", async () => {
  const [source, page, styles, preferencesRoute, schema, migration] = await Promise.all([
    read("app/admin/admin-panel.tsx"),
    read("app/admin/page.tsx"),
    read("app/admin/admin.css"),
    read("app/api/admin/dashboard-preferences/route.ts"),
    read("db/schema.ts"),
    read("drizzle/0066_admin_dashboard_preferences.sql"),
  ]);

  assert.match(source, /type AdminView = "home" \| "connection" \| "products"/);
  assert.match(source, /useState<AdminView>/);
  assert.match(source, /\("home"\)/);
  assert.match(page, /<AdminPanel administratorName=\{administrator\.employeeName \?\? administrator\.username\}/);
  assert.match(source, /Witaj, \{greetingName\}/);
  assert.match(source, /AdminWelcomeDateTime/);
  assert.match(source, /Aktualna godzina/);
  assert.match(source, /Twój pulpit/);
  assert.match(source, /Dostosuj pulpit/);
  assert.match(source, /Dowolny kolor/);
  assert.match(source, /Kolor tekstu i ikony/);
  assert.match(source, /Automatyczny kontrast/);
  assert.match(source, /Przywróć domyślny/);
  assert.match(source, /Połączenie z Dotykačką/);
  assert.doesNotMatch(source, /className="admin-primary" onClick=\{openProductSearch\}>Znajdź produkt/);
  assert.match(styles, /Personal dashboard/);
  assert.match(styles, /\.admin-dashboard-workspace\.is-editing/);
  assert.match(styles, /\.admin-dashboard-editor/);
  assert.match(styles, /\.admin-welcome\{padding-top:clamp\(5rem,8vh,6\.5rem\)\}/);
  assert.match(styles, /\.admin-welcome-hero\{min-height:250px;[^}]*background:#193e76;color:#fff\}/);
  assert.match(styles, /\.admin-welcome-grid button>\.admin-dashboard-tile-icon\{position:absolute;top:16px;right:16px;[^}]*color:var\(--admin-dashboard-tile-fg\)/);
  assert.match(styles, /\.admin-welcome-grid button>\.admin-dashboard-tile-copy\{[^}]*color:var\(--admin-dashboard-tile-fg\)/);
  assert.match(styles, /\.admin-welcome-grid \.admin-dashboard-tile-copy strong\{color:var\(--admin-dashboard-tile-fg\)\}/);
  assert.match(styles, /\.admin-dashboard-tile-arrow\{[^}]*color:var\(--admin-dashboard-tile-fg\)\}/);
  assert.match(styles, /\.admin-dashboard-foregrounds \.is-auto/);
  assert.match(styles, /\.admin-welcome-calendar/);
  assert.match(styles, /\.admin-welcome-clock/);
  assert.doesNotMatch(source, /rows\[0\]\?\.id/);
  assert.match(source, /setSelectedId\(\(current\) => preferredId \?\? current \?\? null\)/);
  assert.match(preferencesRoute, /currentAdmin/);
  assert.match(preferencesRoute, /tiles\.some\(\(item\) => item\.visible\)/);
  assert.match(preferencesRoute, /validForeground/);
  assert.match(preferencesRoute, /onConflictDoUpdate/);
  assert.match(schema, /adminDashboardPreferences = pgTable\("admin_dashboard_preferences"/);
  assert.match(schema, /foreground\?: string/);
  assert.match(migration, /CREATE TABLE "admin_dashboard_preferences"/);
});

test("products stay empty until an administrator configures the search", async () => {
  const source = await read("app/admin/admin-panel.tsx");

  assert.match(source, /const \[category, setCategory\] = useState\(""\)/);
  assert.match(source, /const \[visibilityFilter, setVisibilityFilter\] = useState<VisibilityFilter>\(""\)/);
  assert.match(source, /const productSearchReady = normalizedProductSearch\(query\)\.length >= 2/);
  assert.match(source, /!productSearchReady \? \[\]/);
  assert.match(source, /Najpierw ustaw kryteria wyszukiwania powyżej/);
  assert.match(source, /function openProductSearch\(\)[\s\S]*setSelectedId\(null\)[\s\S]*setQuery\(""\)[\s\S]*setCategory\(""\)[\s\S]*setVisibilityFilter\(""\)/);
});
