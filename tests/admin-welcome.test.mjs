import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("admin opens on a personalized welcome screen instead of the first product", async () => {
  const [source, page, styles] = await Promise.all([
    read("app/admin/admin-panel.tsx"),
    read("app/admin/page.tsx"),
    read("app/admin/admin.css"),
  ]);

  assert.match(source, /useState<"home" \| "connection" \| "products"/);
  assert.match(source, /\("home"\)/);
  assert.match(page, /<AdminPanel administratorName=\{administrator\.employeeName \?\? administrator\.username\}/);
  assert.match(source, /Witaj, \{greetingName\}/);
  assert.match(source, /AdminWelcomeDateTime/);
  assert.match(source, /Aktualna godzina/);
  assert.match(source, /Produkty[\s\S]*admin-welcome-card-action">Znajdź produkt →/);
  assert.match(source, /className="is-dotykacka"[\s\S]*Połączenie z Dotykačką/);
  assert.doesNotMatch(source, /className="admin-primary" onClick=\{openProductSearch\}>Znajdź produkt/);
  assert.match(styles, /\.admin-welcome\{[^}]*padding:clamp\(4\.5rem,8vh,7rem\)/);
  assert.match(styles, /\.admin-welcome-calendar/);
  assert.match(styles, /\.admin-welcome-clock/);
  assert.match(styles, /\.admin-welcome-grid button\.is-dotykacka\{background:#519e46;color:#fff\}/);
  assert.doesNotMatch(source, /rows\[0\]\?\.id/);
  assert.match(source, /setSelectedId\(\(current\) => preferredId \?\? current \?\? null\)/);
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
