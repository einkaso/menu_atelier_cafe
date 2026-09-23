import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("ships the tighter Limoncello shot crop for the exact Dotykacka product", async () => {
  const migration = await read("drizzle/0058_limoncello_shot_image.sql");

  await access(new URL("../deployment-assets/product-images/901088-9a1764fa9b5fed12.webp", import.meta.url));
  assert.match(migration, /1659034450653007/);
  assert.match(migration, /\/api\/product-images\/901088-9a1764fa9b5fed12\.webp/);
});
