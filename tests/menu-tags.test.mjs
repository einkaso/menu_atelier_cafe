import assert from "node:assert/strict";
import test from "node:test";

import { hasTag, isShelfProduct, menuProductDestinations, menuProductIsAvailable, regularProductStockIsAvailable, shelfHasPositiveStock, shouldSyncMenuProduct } from "../lib/menu-tags.ts";

test("recognizes the PÓŁKA tag regardless of case, whitespace or missing Polish diacritics", () => {
  assert.equal(isShelfProduct(["MENU", " PÓŁKA "]), true);
  assert.equal(isShelfProduct(["menu", "polka"]), true);
  assert.equal(isShelfProduct(["MENU", "PROMO"]), false);
});

test("keeps exact tag semantics after normalization", () => {
  assert.equal(hasTag(["JESIEŃ"], "jesień"), true);
  assert.equal(hasTag(["PÓŁKAT"] , "PÓŁKA"), false);
});

test("imports a shelf product without MENU but ignores unrelated POS products", () => {
  assert.equal(shouldSyncMenuProduct(["PÓŁKA"], "menu"), true);
  assert.equal(shouldSyncMenuProduct(["MENU"], "menu"), true);
  assert.equal(shouldSyncMenuProduct(["PROMO"], "menu"), false);
});

test("publishes shelf products only when their stock is greater than zero", () => {
  assert.equal(shelfHasPositiveStock("3.000"), true);
  assert.equal(shelfHasPositiveStock("0"), false);
  assert.equal(shelfHasPositiveStock("-1"), false);
  assert.equal(shelfHasPositiveStock(null), false);
});

test("composes MENU, ZIARNO and PÓŁKA instead of making the shelf exclusive", () => {
  assert.deepEqual(menuProductDestinations(["MENU", "ZIARNO", "PÓŁKA"], "MENU", "2"), {
    regular: true,
    shelf: true,
  });
  assert.deepEqual(menuProductDestinations(["PÓŁKA"], "MENU", "2"), {
    regular: false,
    shelf: true,
  });
  assert.deepEqual(menuProductDestinations(["MENU", "ZIARNO", "PÓŁKA"], "MENU", "0"), {
    regular: true,
    shelf: false,
  });
});

test("uses the same availability rule in guest and waiter menus", () => {
  assert.equal(menuProductIsAvailable(["PÓŁKA"], "MENU", true, "ALLOW", "5"), true);
  assert.equal(menuProductIsAvailable(["PÓŁKA"], "MENU", true, "ALLOW", null), false);
  assert.equal(menuProductIsAvailable(["PÓŁKA"], "MENU", true, "ALLOW", "-1"), false);
  assert.equal(menuProductIsAvailable(["MENU"], "MENU", true, "DISABLE", "0"), false);
  assert.equal(menuProductIsAvailable(["MENU"], "MENU", true, "ALLOW", "0"), true);
  assert.equal(menuProductIsAvailable(["MENU", "PÓŁKA"], "MENU", true, "ALLOW", "0"), true);
});

test("respects ordinary Dotykacka stock rules for waiter-only products", () => {
  assert.equal(regularProductStockIsAvailable(false, "ALLOW", null), true);
  assert.equal(regularProductStockIsAvailable(true, "ALLOW", "0"), true);
  assert.equal(regularProductStockIsAvailable(true, "WARN", "-1"), true);
  assert.equal(regularProductStockIsAvailable(true, "DISABLE", "0"), false);
});
