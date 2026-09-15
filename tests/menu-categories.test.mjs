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
