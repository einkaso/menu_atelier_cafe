import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { acceptsFlavorSyrup, isForestLifeSyrupCategory, isGenericFlavorSyrupOption, isLemonadeProduct } from "../lib/flavor-syrups.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("recognizes Leśne Życie bottles and only the generic syrup add-on", () => {
  assert.equal(isForestLifeSyrupCategory("Syropy Leśne Życie "), true);
  assert.equal(isForestLifeSyrupCategory("SYROPY LESNE ZYCIE"), true);
  assert.equal(isGenericFlavorSyrupOption("Syrop smakowy"), true);
  assert.equal(isGenericFlavorSyrupOption("syrop smakowy (do kawy)"), true);
  assert.equal(isGenericFlavorSyrupOption("Syrop smakowy do kawy"), true);
  assert.equal(isGenericFlavorSyrupOption("Syrop malinowy 0,7 l"), false);
});

test("offers syrup with coffee, matcha, tea and lemonade but not every cold drink", () => {
  assert.equal(acceptsFlavorSyrup("KAWY", "Latte"), true);
  assert.equal(acceptsFlavorSyrup("MATCHA", "Matcha Latte"), true);
  assert.equal(acceptsFlavorSyrup("HERBATY", "Paris"), true);
  assert.equal(acceptsFlavorSyrup("NAPOJE", "Lemoniada malinowa"), true);
  assert.equal(acceptsFlavorSyrup("NAPOJE", "Cola"), false);
  assert.equal(isLemonadeProduct("Lemoniada własna"), true);
  assert.equal(isLemonadeProduct("Ice tea"), false);
});

test("includes up to two lemonade flavours without adding a syrup charge", async () => {
  const [menuClient, waiterClient, waiterCatalog, waiterOrders, css] = await Promise.all([
    read("app/menu-client.tsx"),
    read("app/kelner/waiter-client.tsx"),
    read("app/api/waiter/catalog/route.ts"),
    read("app/api/waiter/orders/route.ts"),
    read("app/globals.css"),
  ]);
  assert.match(menuClient, /Wybierz jeden smak albo połącz dwa/);
  assert.match(menuClient, /Cena smaku jest już zawarta/);
  assert.match(waiterClient, /group\.maxSelections&&previous\.length>=group\.maxSelections/);
  assert.match(waiterCatalog, /maxSelections: lemonade \? 2 : 1/);
  assert.match(waiterCatalog, /price: "0"/);
  assert.match(waiterOrders, /maxFlavorCount = isLemonadeProduct\(product\.name\) \? 2 : 1/);
  assert.match(waiterOrders, /addon\.fallback === "syrup" && !isLemonadeProduct\(product\.name\)/);
  assert.match(css, /\.lemonade-flavor-action\{[^}]*margin-top:1\.35rem/);
});

test("keeps the syrup chooser above its overlay and leaves forest syrups accessible through regular product filters", async () => {
  const [css, admin, sync] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/dotykacka/sync.ts", import.meta.url), "utf8"),
  ]);

  assert.match(css, /\.flavor-syrup-dialog\{position:fixed;z-index:52;left:50%;top:50%/);
  assert.match(admin, /product\.category \?\? ""/);
  assert.match(admin, /normalizedProductSearch/);
  assert.match(admin, /Szukaj produktu lub kategorii/);
  assert.doesNotMatch(admin, /Leśne Życie · zdjęcia i opisy/);
  assert.match(sync, /isForestLifeSyrupCategory\(categoryName\)/);
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

test("layers a separately managed ingredient backdrop behind each forest syrup bottle", async () => {
  const [schema, migration, menuApi, menuClient, css, admin, backdropRoute, imageImport] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0035_product_detail_backdrop.sql"),
    read("app/api/menu/route.ts"),
    read("app/menu-client.tsx"),
    read("app/globals.css"),
    read("app/admin/admin-panel.tsx"),
    read("app/api/admin/products/[id]/backdrop/route.ts"),
    read("lib/image-import.ts"),
  ]);
  assert.match(schema, /detailBackdropPath: text\("detail_backdrop_path"\)/);
  assert.match(migration, /ADD COLUMN "detail_backdrop_path" text/);
  assert.match(menuApi, /backdropImage: isForestLifeSyrupCategory\(item\.category\)/);
  assert.match(menuClient, /forest-syrup-backdrop/);
  assert.match(menuClient, /forest-syrup-bottle/);
  assert.match(menuClient, /forestSyrupBackdropVariant/);
  assert.match(menuClient, /name\.includes\("ananas"\)/);
  assert.match(menuClient, /name\.includes\("malin"\)/);
  assert.match(css, /\.forest-syrup-detail-visual>img\.forest-syrup-backdrop/);
  assert.match(css, /\.is-pineapple-backdrop>img\.forest-syrup-backdrop\{transform:translateX\(-11%\) scale\(1\.28\)\}/);
  assert.match(css, /\.is-raspberry-backdrop>img\.forest-syrup-backdrop\{transform:translateX\(11%\) scale\(1\.28\)\}/);
  assert.match(css, /\.forest-syrup-detail-visual>img\.forest-syrup-bottle\{[^}]*width:91\.2%;height:min\(570px,86\.4%\)/);
  assert.match(css, /\.forest-syrup-detail-visual>img\.forest-syrup-bottle\{[^}]*transform:translateY\(8%\) scale\(1\.2\)/);
  assert.match(admin, /Tło podglądu syropu/);
  assert.match(admin, /Dodaj, podmień albo usuń wyłącznie fotografię tła/);
  assert.match(admin, /Podmień tło plikiem z urządzenia/);
  assert.match(admin, /Zdjęcie butelki pozostanie bez zmian/);
  assert.match(backdropRoute, /isForestLifeSyrupCategory\(product\.category\)/);
  assert.match(backdropRoute, /removeBackdropWhenUnused\(current\?\.path\)/);
  assert.doesNotMatch(backdropRoute, /Produkt ma już tło podglądu/);
  assert.match(imageImport, /importProductBackdrop/);
  assert.match(imageImport, /storeProductImage\(productId, await downloadPublicImage\(sourceUrl\), false\)/);
});
