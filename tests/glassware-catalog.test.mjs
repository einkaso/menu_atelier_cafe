import assert from "node:assert/strict";
import test from "node:test";

import { glasswareById, glasswareCatalog } from "../lib/glassware-catalog.ts";

test("stores unique glassware icons with an operational capacity", () => {
  assert.equal(new Set(glasswareCatalog.map((item) => item.id)).size, glasswareCatalog.length);
  assert.ok(glasswareCatalog.every((item) => item.capacityMl > 0));
  assert.ok(glasswareCatalog.every((item) => new URL(item.imageUrl).protocol === "https:"));
});

test("includes the 350 ml Elysia whisky tumbler", () => {
  const item = glasswareById("elysia-whisky-350");
  assert.equal(item?.capacityMl, 350);
  assert.equal(item?.kind, "whisky");
  assert.match(item?.imageUrl ?? "", /elysia-szklanka-do-whisky/);
});

test("includes the 360 ml Elysia highball glass", () => {
  const item = glasswareById("elysia-highball-360");
  assert.equal(item?.capacityMl, 360);
  assert.equal(item?.kind, "highball");
  assert.match(item?.imageUrl ?? "", /elysia-szklanka-wysoka/);
});

test("includes the 280 ml slim Elysia highball glass", () => {
  const item = glasswareById("elysia-highball-280");
  assert.equal(item?.capacityMl, 280);
  assert.equal(item?.kind, "highball");
  assert.match(item?.imageUrl ?? "", /elysia-szklanka-wysoka-poj-280-ml/);
});

test("includes the 1 l Elysia carafe", () => {
  const item = glasswareById("elysia-carafe-1000");
  assert.equal(item?.capacityMl, 1000);
  assert.equal(item?.kind, "carafe");
  assert.match(item?.imageUrl ?? "", /elysia-karafka-poj-940-ml/);
});

test("includes the 500 ml Elysia cocktail glass", () => {
  const item = glasswareById("elysia-cocktail-500");
  assert.equal(item?.capacityMl, 500);
  assert.equal(item?.kind, "cocktail");
  assert.match(item?.imageUrl ?? "", /kieliszek-koktailowy-poj-500-ml/);
});

test("includes the 260 ml Elysia champagne coupe", () => {
  const item = glasswareById("elysia-champagne-coupe-260");
  assert.equal(item?.capacityMl, 260);
  assert.equal(item?.kind, "cocktail");
  assert.match(item?.imageUrl ?? "", /kieliszek-koktajlowy-do-szampana-poj-260-ml/);
});
