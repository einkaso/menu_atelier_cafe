import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DRAUGHT_BEER_CONFIGS, draughtBeerConsumption } from "../scripts/configure-draught-beer.mjs";

test("adds three percent draught loss to each sold serving", () => {
  assert.equal(draughtBeerConsumption(0.5), 0.515);
  assert.equal(draughtBeerConsumption(0.3), 0.309);
  assert.equal(DRAUGHT_BEER_CONFIGS[0].stockProduct.litersPerPackage, 30);
});

test("keeps draught beer writes gated, backed up and idempotently recipe-based", async () => {
  const source = await readFile(new URL("../scripts/configure-draught-beer.mjs", import.meta.url), "utf8");
  assert.match(source, /DOTYKACKA_DRAUGHT_BEER_WRITE_ENABLED/);
  assert.match(source, /draught-beer-\$\{new Date/);
  assert.match(source, /stockDeduct: false/);
  assert.match(source, /quantity: sale\.consumptionLiters, unit: "Liter"/);
  assert.match(source, /name: "KEG 30 l", quantity: plan\.stockProduct\.litersPerPackage/);
});
