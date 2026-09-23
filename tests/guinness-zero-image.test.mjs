import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("ships the transparent Guinness 0% can cutout for the exact Dotykacka product", async () => {
  const migration = await read("drizzle/0059_guinness_zero_product_image.sql");

  await access(new URL("../deployment-assets/product-images/261-195b332ba07a054d.png", import.meta.url));
  assert.match(migration, /1744044472238067/);
  assert.match(migration, /\/api\/product-images\/261-195b332ba07a054d\.png/);
});
