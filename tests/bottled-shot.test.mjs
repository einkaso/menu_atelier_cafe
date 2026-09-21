import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("configures 1800 Tequila as a visible 50 ml shot backed by a hidden 0.7 l bottle", async () => {
  const [script, docs] = await Promise.all([
    read("scripts/configure-bottled-shot.mjs"),
    read("docs/MENU_CONFIGURATION.md"),
  ]);
  assert.match(script, /BOTTLED_SHOT_CONFIGS/);
  assert.match(script, /id: 1560018041886335, expectedName: "1800 Tequila", bottleLiters: 0\.7/);
  assert.match(script, /id: 2236540314478447, expectedName: "1800 Tequila", servingLiters: 0\.05/);
  assert.match(script, /id: 1509109830436299, expectedName: "ABSOLUT Elyx", bottleLiters: 0\.7/);
  assert.match(script, /id: 1509112753113695, expectedName: "ABSOLUT Elyx", servingLiters: 0\.05/);
  assert.match(script, /id: 1744027210548575, expectedName: "BACARDI RISERVA OCHO RUM", bottleLiters: 0\.7/);
  assert.match(script, /id: 1746873160084767, expectedName: "BACARDI RISERVA OCHO RUM", servingLiters: 0\.05/);
  assert.match(script, /id: 1242835479192703, expectedName: "BACARDI Spiced Rum", bottleLiters: 0\.7/);
  assert.match(script, /id: 1242836935204855, expectedName: "BACARDI Spiced Rum", servingLiters: 0\.05/);
  assert.match(script, /id: 2304638502441591, expectedName: "Bombay Sapphire Sunset", bottleLiters: 0\.7, convertPieceStockToLiters: true/);
  assert.match(script, /id: 2236552619374519, expectedName: "Bombay Sapphire Sunset", servingLiters: 0\.05/);
  assert.match(script, /process\.env\.BOTTLED_SHOT_TARGET/);
  assert.match(script, /display: false, stockDeduct: true, unit: "Liter", packaging: 1/);
  assert.match(script, /display: true, stockDeduct: false, unit: "Piece", packaging: 1/);
  assert.match(script, /name: "Butelka 0,7 l"/);
  assert.match(script, /DOTYKACKA_BOTTLED_SHOT_WRITE_ENABLED/);
  assert.match(script, /syncLocalProductState/);
  assert.match(script, /update menu_products set display = true, stock_deduct = false, stock_unit = 'Piece', menu_group = 'Shoty · 50 ml'/);
  assert.match(script, /cocktailType: "Shot"/);
  assert.match(script, /servingStyle: "Shot"/);
  assert.match(script, /volume: "50 ml"/);
  assert.match(script, /__en__volume: "50 ml"/);
  assert.match(script, /stockConversion/);
  assert.match(script, /on conflict \(product_id\) do update/);
  assert.match(script, /update inventory_catalog_products set display = false, stock_deduct = true, unit = 'Liter'/);
  assert.match(docs, /receptura każdej sprzedanej sztuki odejmuje dokładnie `0,05 l`/);
  assert.match(docs, /`ABSOLUT Elyx` działa według tej samej reguły/);
  assert.match(docs, /`BACARDI RISERVA OCHO RUM` \(EAN `7610113001516`\)/);
  assert.match(docs, /`BACARDI Spiced Rum` \(EAN `7610113007518`\)/);
});
