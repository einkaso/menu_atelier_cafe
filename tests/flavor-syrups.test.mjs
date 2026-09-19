import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { acceptsFlavorSyrup, isForestLifeSyrupCategory, isGenericFlavorSyrupOption } from "../lib/flavor-syrups.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("recognizes Leśne Życie bottles and only the generic syrup add-on", () => {
  assert.equal(isForestLifeSyrupCategory("Syropy Leśne Życie "), true);
  assert.equal(isForestLifeSyrupCategory("SYROPY LESNE ZYCIE"), true);
  assert.equal(isGenericFlavorSyrupOption("Syrop smakowy"), true);
  assert.equal(isGenericFlavorSyrupOption("Syrop malinowy 0,7 l"), false);
});

test("offers syrup with coffee, matcha, tea and lemonade but not every cold drink", () => {
  assert.equal(acceptsFlavorSyrup("KAWY", "Latte"), true);
  assert.equal(acceptsFlavorSyrup("MATCHA", "Matcha Latte"), true);
  assert.equal(acceptsFlavorSyrup("HERBATY", "Paris"), true);
  assert.equal(acceptsFlavorSyrup("NAPOJE", "Lemoniada malinowa"), true);
  assert.equal(acceptsFlavorSyrup("NAPOJE", "Cola"), false);
});

test("keeps a full shelf bottle separate from a flavoured drink add-on", async () => {
  const [menuApi, menuClient, waiterCatalog, waiterOrders] = await Promise.all([
    read("app/api/menu/route.ts"),
    read("app/menu-client.tsx"),
    read("app/api/waiter/catalog/route.ts"),
    read("app/api/waiter/orders/route.ts"),
  ]);
  assert.match(menuApi, /flavorSyrups/);
  assert.match(menuClient, /Pełne butelki tych syropów kupisz osobno/);
  assert.match(waiterCatalog, /`syrup-flavor:\$\{product\.dotykackaId\}`/);
  assert.match(waiterOrders, /Syrop: \$\{selection\.flavorName\}/);
  assert.match(waiterOrders, /genericSyrupAddon/);
  assert.doesNotMatch(waiterOrders, /standaloneAddons = customizations\.filter\(\(addon\) => addon\.fallback === "syrup"\)/);
});
