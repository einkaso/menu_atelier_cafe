import assert from "node:assert/strict";
import test from "node:test";

import { hasTag, isIngredientInventoryCategory, isInventoryTaggedIngredient, isShelfProduct, menuProductDestinations, menuProductIsAvailable, productTakeawayAvailable, productTemperatures, regularProductStockIsAvailable, shelfHasPositiveStock, shouldManageMenuProduct, shouldSyncMenuProduct, wineOfferHasStock } from "../lib/menu-tags.ts";

test("recognizes the PÓŁKA tag regardless of case, whitespace or missing Polish diacritics", () => {
  assert.equal(isShelfProduct(["MENU", " PÓŁKA "]), true);
  assert.equal(isShelfProduct(["menu", "polka"]), true);
  assert.equal(isShelfProduct(["MENU", "PROMO"]), false);
});

test("keeps exact tag semantics after normalization", () => {
  assert.equal(hasTag(["JESIEŃ"], "jesień"), true);
  assert.equal(hasTag(["PÓŁKAT"] , "PÓŁKA"), false);
});

test("maps WARM and COLD tags to available serving temperatures", () => {
  assert.deepEqual(productTemperatures(["MENU", "WARM"]), ["warm"]);
  assert.deepEqual(productTemperatures(["cold", " WARM "]), ["warm", "cold"]);
  assert.deepEqual(productTemperatures(["MENU", "WARM COLD"]), ["warm", "cold"]);
  assert.deepEqual(productTemperatures(["MENU", "COLD/WARM"]), ["warm", "cold"]);
  assert.deepEqual(productTemperatures(["MENU", "CIEPŁO"]), ["warm"]);
  assert.deepEqual(productTemperatures(["MENU", "ZIMNO"]), ["cold"]);
  assert.deepEqual(productTemperatures(["MENU", "CIEPŁO/ZIMNO"]), ["warm", "cold"]);
  assert.deepEqual(productTemperatures(["MENU", "WARMER"]), []);
  assert.deepEqual(productTemperatures(["MENU", "CIEPŁY"]), []);
});

test("recognizes only the exact TOGO tag as takeaway availability", () => {
  assert.equal(productTakeawayAvailable(["MENU", "TOGO"]), true);
  assert.equal(productTakeawayAvailable(["MENU", "to go"]), false);
  assert.equal(productTakeawayAvailable(["MENU", "TOGOTHER"]), false);
});

test("imports a shelf product without MENU but ignores unrelated POS products", () => {
  assert.equal(shouldSyncMenuProduct(["PÓŁKA"], "menu"), true);
  assert.equal(shouldSyncMenuProduct(["MENU"], "menu"), true);
  assert.equal(shouldSyncMenuProduct(["PROMO"], "menu"), false);
});

test("imports inventory-tracked products for administration without publishing them in the menu", () => {
  assert.equal(shouldManageMenuProduct(["SYROP"], "MENU", true), true);
  assert.equal(shouldSyncMenuProduct(["SYROP"], "MENU"), false);
  assert.equal(shouldManageMenuProduct(["SYROP"], "MENU", false), false);
});

test("uses INWENT as the authoritative inventory rule only in the Ingredients category", () => {
  assert.equal(isIngredientInventoryCategory("Składniki"), true);
  assert.equal(isIngredientInventoryCategory(" SKLADNIKI "), true);
  assert.equal(isIngredientInventoryCategory("Napoje"), false);
  assert.equal(isInventoryTaggedIngredient("Składniki", [" INWENT "]), true);
  assert.equal(isInventoryTaggedIngredient("Składniki", ["INWENTARZ"]), false);
  assert.equal(isInventoryTaggedIngredient("Napoje", ["INWENT"]), false);
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

test("requires positive direct stock for wine bottles without hiding prepared wine drinks", () => {
  assert.equal(wineOfferHasStock(true, false, "WIN48", null), false);
  assert.equal(wineOfferHasStock(true, false, "WIN02", "-5.549"), false);
  assert.equal(wineOfferHasStock(true, false, "WIN01", "0"), false);
  assert.equal(wineOfferHasStock(true, false, "WIN73", "3"), true);
  assert.equal(wineOfferHasStock(true, false, null, "0"), false);
  assert.equal(wineOfferHasStock(true, false, null, null), true);
  assert.equal(wineOfferHasStock(true, true, "WIN02", "-7"), true);
  assert.equal(wineOfferHasStock(false, false, null, null), true);
});
