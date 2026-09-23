import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("keeps vessel capacity in the icon catalog and only the relation on a drink", async () => {
  const [schema, admin, productApi, catalogApi, publicMenu, waiterCatalog, guestClient, waiterClient] = await Promise.all([
    read("db/schema.ts"),
    read("app/admin/admin-panel.tsx"),
    read("app/api/admin/products/[id]/route.ts"),
    read("app/api/admin/drink-vessels/route.ts"),
    read("app/api/menu/route.ts"),
    read("app/api/waiter/catalog/route.ts"),
    read("app/menu-client.tsx"),
    read("app/kelner/waiter-client.tsx"),
  ]);

  assert.match(schema, /drinkVessels = pgTable\("drink_vessels"[\s\S]*capacityMl: integer\("capacity_ml"\)\.notNull\(\)/);
  assert.match(schema, /drinkVesselId: integer\("drink_vessel_id"\)\.references\(\(\) => drinkVessels\.id/);
  assert.match(schema, /espressoShots: integer\("espresso_shots"\)/);
  assert.match(schema, /product_content_espresso_shots_check[\s\S]*in \(0, 1, 2\)/);
  assert.match(productApi, /espressoShots: z\.union\(\[z\.literal\(0\), z\.literal\(1\), z\.literal\(2\)\]\)\.nullable\(\)\.optional\(\)/);
  assert.match(catalogApi, /capacityMl: drinkVessels\.capacityMl/);
  assert.match(admin, /Pojemność jest przypisana do ikony naczynia/);
  assert.match(admin, /name="drinkVesselId"/);
  assert.match(admin, /admin-drink-vessel-picker/);
  assert.match(admin, /type="radio" name="drinkVesselId"/);
  assert.doesNotMatch(admin, /<select name="drinkVesselId"/);
  assert.match(admin, /name="espressoShots"/);
  assert.match(admin, /<option value="">Bez oznaczenia<\/option><option value="0">0 espresso<\/option>/);
  assert.match(admin, /espressoShots !== "" && <b>\{espressoShots\}<\/b>/);
  assert.match(publicMenu, /drinkVessel: item\.drinkVesselId/);
  assert.match(publicMenu, /item\.espressoShots === 0 \|\| item\.espressoShots === 1 \|\| item\.espressoShots === 2/);
  assert.match(waiterCatalog, /drinkVessel: product\.drinkVesselId/);
  assert.match(waiterCatalog, /product\.espressoShots === 0 \|\| product\.espressoShots === 1 \|\| product\.espressoShots === 2/);
  assert.match(guestClient, /function DrinkVesselMark/);
  assert.match(guestClient, /espressoShots\?:0\|1\|2/);
  assert.match(guestClient, /hasEspressoMark=product\.espressoShots!==undefined/);
  assert.match(waiterClient, /function WaiterDrinkVesselMark/);
  assert.match(waiterClient, /espressoShots: 0 \| 1 \| 2 \| null/);
  assert.match(waiterClient, /product\.espressoShots !== null && <b>\{product\.espressoShots\}<\/b>/);
});

test("keeps zero espresso distinct from the no-marker null state", async () => {
  const migration = await read("drizzle/0055_allow_zero_espresso_marker.sql");

  assert.match(migration, /DROP CONSTRAINT IF EXISTS "product_content_espresso_shots_check"/);
  assert.match(migration, /"espresso_shots" is null or "espresso_shots" in \(0, 1, 2\)/);
});

test("ships the Churchill vessel catalog with optimized local icons", async () => {
  const migration = await read("drizzle/0047_churchill_drink_vessels.sql");
  const expectedFiles = [
    "churchill-espresso-100ml.png",
    "churchill-cup-220ml.png",
    "churchill-mug-340ml.png",
    "churchill-cup-340ml.png",
    "churchill-teapot-400ml.png",
  ];

  for (const file of expectedFiles) {
    await access(new URL(`../public/drink-vessels/${file}`, import.meta.url));
    assert.match(migration, new RegExp(file.replace(".", "\\.")));
  }
});

test("corrects the operational capacities without changing existing vessel assignments", async () => {
  const migration = await read("drizzle/0051_correct_churchill_vessel_capacities.sql");

  assert.match(migration, /capacity_ml" = 230[\s\S]*churchill-monochrome-cup-220/);
  assert.match(migration, /capacity_ml" = 330[\s\S]*churchill-monochrome-mug-340/);
});

test("adds the 320 ml Luminarc New Morning mug to the assignable vessel catalog", async () => {
  const migration = await read("drizzle/0052_luminarc_new_morning_vessel.sql");

  await access(new URL("../public/drink-vessels/luminarc-new-morning-320ml.webp", import.meta.url));
  assert.match(migration, /luminarc-new-morning-320/);
  assert.match(migration, /Kubek szklany Luminarc New Morning/);
  assert.match(migration, /320/);
  assert.match(migration, /\/drink-vessels\/luminarc-new-morning-320ml\.webp/);
});

test("adds the 200 ml FAJA glass with a cleaned local catalog image", async () => {
  const migration = await read("drizzle/0053_faja_200ml_vessel.sql");

  await access(new URL("../public/drink-vessels/faja-glass-200ml.webp", import.meta.url));
  assert.match(migration, /faja-stemmed-glass-200/);
  assert.match(migration, /Kieliszek FAJA/);
  assert.match(migration, /200/);
  assert.match(migration, /\/drink-vessels\/faja-glass-200ml\.webp/);
});

test("adds every Elysia vessel to the assignable database catalog with local icons", async () => {
  const migration = await read("drizzle/0054_elysia_vessel_catalog.sql");
  const expected = [
    ["elysia-whisky-350", 350],
    ["elysia-highball-360", 360],
    ["elysia-highball-280", 280],
    ["elysia-carafe-1000", 1000],
    ["elysia-cocktail-500", 500],
    ["elysia-champagne-coupe-260", 260],
  ];

  for (const [key, capacity] of expected) {
    await access(new URL(`../public/drink-vessels/${key}.webp`, import.meta.url));
    assert.match(migration, new RegExp(`'${key}'[^\\n]+${capacity}`));
    assert.match(migration, new RegExp(`/drink-vessels/${key}\\.webp`));
  }
});

test("visually distinguishes the otherwise identical small and large Churchill cups", async () => {
  const [adminCss, guestCss, waiterCss] = await Promise.all([
    read("app/admin/admin.css"),
    read("app/globals.css"),
    read("app/kelner/waiter.css"),
  ]);

  for (const css of [adminCss, guestCss, waiterCss]) {
    assert.match(css, /img\[src\*="churchill-cup-220ml"\][^{]*\{[^}]*\.82/);
    assert.match(css, /img\[src\*="churchill-cup-340ml"\][^{]*\{[^}]*1\.08/);
  }
});
