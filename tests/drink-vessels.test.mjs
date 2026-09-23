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
  assert.match(schema, /product_content_espresso_shots_check[\s\S]*in \(1, 2\)/);
  assert.match(productApi, /espressoShots: z\.union\(\[z\.literal\(1\), z\.literal\(2\)\]\)\.nullable\(\)\.optional\(\)/);
  assert.match(catalogApi, /capacityMl: drinkVessels\.capacityMl/);
  assert.match(admin, /Pojemność jest przypisana do ikony naczynia/);
  assert.match(admin, /name="drinkVesselId"/);
  assert.match(admin, /admin-drink-vessel-picker/);
  assert.match(admin, /type="radio" name="drinkVesselId"/);
  assert.doesNotMatch(admin, /<select name="drinkVesselId"/);
  assert.match(admin, /name="espressoShots"/);
  assert.match(publicMenu, /drinkVessel: item\.drinkVesselId/);
  assert.match(waiterCatalog, /drinkVessel: product\.drinkVesselId/);
  assert.match(guestClient, /function DrinkVesselMark/);
  assert.match(waiterClient, /function WaiterDrinkVesselMark/);
});

test("ships the Churchill vessel catalog with optimized local icons", async () => {
  const migration = await read("drizzle/0047_churchill_drink_vessels.sql");
  const expected = [
    ["churchill-espresso-100ml.png", 100],
    ["churchill-cup-220ml.png", 220],
    ["churchill-mug-340ml.png", 340],
    ["churchill-cup-340ml.png", 340],
    ["churchill-teapot-400ml.png", 400],
  ];

  for (const [file, capacity] of expected) {
    await access(new URL(`../public/drink-vessels/${file}`, import.meta.url));
    assert.match(migration, new RegExp(`${file.replace(".", "\\.")}[^\\n]+${capacity}|${capacity}[^\\n]+${file.replace(".", "\\.")}`));
  }
});

test("visually distinguishes the otherwise identical 220 ml and 340 ml Churchill cups", async () => {
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
