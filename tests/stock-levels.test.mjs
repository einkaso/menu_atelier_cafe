import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { filterStockLevels, formatStockQuantity, usedStockTags } from "../lib/stock-levels.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const product = (overrides = {}) => ({
  id: 1,
  dotykackaId: "1",
  name: "Woda",
  category: "Napoje",
  stockQuantity: "0",
  unit: "szt.",
  tags: ["MENU"],
  stockDeduct: true,
  display: true,
  syncedAt: "2026-09-21T10:00:00.000Z",
  ...overrides,
});

test("exposes only tags assigned to active stock products and merges spelling case", () => {
  assert.deepEqual(usedStockTags([
    product({ tags: ["MENU", "ABC"] }),
    product({ id: 2, tags: [" menu ", "PÓŁKA"] }),
    product({ id: 3, tags: [] }),
  ]), [
    { key: "abc", label: "ABC", count: 1 },
    { key: "menu", label: "MENU", count: 2 },
    { key: "polka", label: "PÓŁKA", count: 1 },
  ]);
});

test("filters zero stock, category and every selected used tag", () => {
  const products = [
    product({ id: 1, name: "Woda", tags: ["MENU", "COLD"] }),
    product({ id: 2, name: "Cola", stockQuantity: "12.5", tags: ["MENU", "COLD"] }),
    product({ id: 3, name: "Syrop", category: null, tags: ["COLD"] }),
  ];
  assert.deepEqual(filterStockLevels(products, { query: "woda", category: "Napoje", state: "zero", tags: ["menu", "cold"] }).map((item) => item.id), [1]);
  assert.deepEqual(filterStockLevels(products, { query: "", category: "Bez kategorii", state: "all", tags: [] }).map((item) => item.id), [3]);
  assert.equal(formatStockQuantity("12.500"), "12,5");
  assert.equal(formatStockQuantity(null), "—");
});

test("stores Dotykacka tags and renders the dedicated stock-level tab", async () => {
  const [schema, migration, sync, route, panel, styles] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0045_stock_level_tags.sql"),
    read("lib/dotykacka/sync.ts"),
    read("app/api/admin/stock-levels/route.ts"),
    read("app/admin/admin-panel.tsx"),
    read("app/admin/admin.css"),
  ]);
  assert.match(schema, /inventoryCatalogProducts[\s\S]*tags: jsonb\("tags"\)/);
  assert.match(migration, /ADD COLUMN "tags" jsonb/);
  assert.match(sync, /tags: product\.tags \?\? \[\]/);
  assert.match(route, /where\(eq\(inventoryCatalogProducts\.deleted, false\)\)/);
  assert.match(route, /usedStockTags\(products\)/);
  assert.match(route, /export async function POST\(request: Request\)/);
  assert.match(route, /syncDotykackaStockCategory\(categoryId\)/);
  assert.match(panel, />Stany magazynowe</);
  assert.match(panel, /Grupa do wyświetlenia i synchronizacji/);
  assert.match(panel, /Odśwież wybraną grupę/);
  assert.match(panel, /disabled=\{!categoryId \|\| syncing \|\| refreshing\}/);
  assert.match(panel, /view !== "stock" && <button className="admin-primary admin-dotykacka-action"/);
  assert.match(panel, /brak jednostki/);
  assert.match(styles, /\.admin-stock-table/);
  assert.match(styles, /\.admin-primary\.admin-dotykacka-action\{background:#519e46/);
});

test("updates stock only for products from the selected category", async () => {
  const sync = await read("lib/dotykacka/stock-group-sync.ts");
  assert.match(sync, /categoryDotykackaId, category\.dotykackaId/);
  assert.match(sync, /new DotykackaClient\(config\)\.stockProducts\(\)/);
  assert.match(sync, /for \(const product of products\)/);
  assert.match(sync, /update\(inventoryCatalogProducts\)/);
  assert.match(sync, /update\(menuProducts\)/);
  assert.match(sync, /update\(waiterExtraProducts\)/);
});
