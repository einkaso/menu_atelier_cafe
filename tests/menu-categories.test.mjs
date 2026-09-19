import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, server: { middlewareMode: true } });
after(async () => vite.close());

test("classifies the Dotykacka WHISKEY category as spirits", async () => {
  const { sectionFor } = await vite.ssrLoadModule("/lib/menu-categories.ts");
  assert.equal(sectionFor("WHISKEY"), "whisky");
  assert.equal(sectionFor("Koniak"), "whisky");
  assert.equal(sectionFor("Brandy"), "whisky");
});

test("classifies both cakes and desserts as one sweet menu section", async () => {
  const { sectionFor } = await vite.ssrLoadModule("/lib/menu-categories.ts");
  assert.equal(sectionFor("Ciasta"), "cakes");
  assert.equal(sectionFor("Desery"), "cakes");
});

test("classifies Dotykacka drinks and alcohol as one Alko Bar section", async () => {
  const { sectionFor } = await vite.ssrLoadModule("/lib/menu-categories.ts");
  assert.equal(sectionFor("DRINKI"), "cocktails");
  assert.equal(sectionFor("ALKOHOLE"), "cocktails");
  assert.equal(sectionFor("BEZALKOHOLOWE"), "zero");
});

test("groups Alko Bar products by guest-facing offer type", async () => {
  const { suggestProductGroup } = await vite.ssrLoadModule("/lib/product-order.ts");
  assert.equal(suggestProductGroup("DRINKI", "Sarti Spritz")?.pl, "Spritze");
  assert.equal(suggestProductGroup("DRINKI", "Mimoza b/a")?.pl, "Drinki 0%");
  assert.equal(suggestProductGroup("DRINKI", "Margarita")?.pl, "Koktajle");
  assert.equal(suggestProductGroup("ALKOHOLE", "WÓDKA Absolut 40% 50ml")?.pl, "Shoty · 50 ml");
  assert.equal(suggestProductGroup("ALKOHOLE", "WÓDKA Absolut 40% 0,7l")?.pl, "Wódka na butelki");
});
