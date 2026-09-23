import assert from "node:assert/strict";
import test from "node:test";

import { glasswareById, glasswareCatalog } from "../lib/glassware-catalog.ts";

test("stores unique glassware icons with an operational capacity", () => {
  assert.equal(new Set(glasswareCatalog.map((item) => item.id)).size, glasswareCatalog.length);
  assert.ok(glasswareCatalog.every((item) => item.capacityMl > 0));
  assert.ok(glasswareCatalog.every((item) => new URL(item.imageUrl, "https://menu.martabanaszek.pl").protocol === "https:"));
});

test("includes the 350 ml Elysia whisky tumbler", () => {
  const item = glasswareById("elysia-whisky-350");
  assert.equal(item?.capacityMl, 350);
  assert.equal(item?.kind, "whisky");
  assert.equal(item?.imageUrl, "/drink-vessels/elysia-whisky-350.webp");
});

test("includes the 360 ml Elysia highball glass", () => {
  const item = glasswareById("elysia-highball-360");
  assert.equal(item?.capacityMl, 360);
  assert.equal(item?.kind, "highball");
  assert.equal(item?.imageUrl, "/drink-vessels/elysia-highball-360.webp");
});

test("includes the 280 ml slim Elysia highball glass", () => {
  const item = glasswareById("elysia-highball-280");
  assert.equal(item?.capacityMl, 280);
  assert.equal(item?.kind, "highball");
  assert.equal(item?.imageUrl, "/drink-vessels/elysia-highball-280.webp");
});

test("includes the 1 l Elysia carafe", () => {
  const item = glasswareById("elysia-carafe-1000");
  assert.equal(item?.capacityMl, 1000);
  assert.equal(item?.kind, "carafe");
  assert.equal(item?.imageUrl, "/drink-vessels/elysia-carafe-1000.webp");
});

test("includes the 500 ml Elysia cocktail glass", () => {
  const item = glasswareById("elysia-cocktail-500");
  assert.equal(item?.capacityMl, 500);
  assert.equal(item?.kind, "cocktail");
  assert.equal(item?.imageUrl, "/drink-vessels/elysia-cocktail-500.webp");
});

test("includes the 260 ml Elysia champagne coupe", () => {
  const item = glasswareById("elysia-champagne-coupe-260");
  assert.equal(item?.capacityMl, 260);
  assert.equal(item?.kind, "cocktail");
  assert.equal(item?.imageUrl, "/drink-vessels/elysia-champagne-coupe-260.webp");
});

test("includes the 320 ml Luminarc New Morning glass mug", () => {
  const item = glasswareById("luminarc-new-morning-320");
  assert.equal(item?.capacityMl, 320);
  assert.equal(item?.kind, "mug");
  assert.equal(item?.imageUrl, "/drink-vessels/luminarc-new-morning-320ml.webp");
});

test("includes the 200 ml FAJA stemmed glass", () => {
  const item = glasswareById("faja-stemmed-glass-200");
  assert.equal(item?.capacityMl, 200);
  assert.equal(item?.kind, "wine");
  assert.equal(item?.imageUrl, "/drink-vessels/faja-glass-200ml.webp");
});
