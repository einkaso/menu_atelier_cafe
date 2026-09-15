import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, server: { middlewareMode: true } });
after(async () => vite.close());

test("builds a Google wine query from the product title", async () => {
  const { manualProductSearchUrl } = await vite.ssrLoadModule("/lib/manual-product-search.ts");
  const url = new URL(manualProductSearchUrl("Gran Sasso Montepulciano D’Abruzzo DOC", "wine"));
  assert.equal(url.hostname, "www.google.com");
  assert.equal(url.pathname, "/search");
  assert.equal(url.searchParams.get("q"), '"Gran Sasso Montepulciano D’Abruzzo DOC" wino');
});

test("removes a POS-only glass suffix before searching", async () => {
  const { productSearchTitle } = await vite.ssrLoadModule("/lib/manual-product-search.ts");
  assert.equal(productSearchTitle("PALAU SOLA CAVA_ kieliszek"), "PALAU SOLA CAVA");
  assert.equal(productSearchTitle("WIN45 Gran Sasso — butelka"), "Gran Sasso");
  assert.equal(productSearchTitle("Pfitscher Gewurztraminer Stoas 750ml"), "Pfitscher Gewurztraminer Stoas");
});

test("builds a spirits query for whisky, cognac and brandy", async () => {
  const { manualProductSearchUrl } = await vite.ssrLoadModule("/lib/manual-product-search.ts");
  const url = new URL(manualProductSearchUrl("Springbank 10 yo 46% 50ml", "whisky"));
  assert.equal(url.searchParams.get("q"), '"Springbank 10 yo 46%" whisky koniak brandy');
});
