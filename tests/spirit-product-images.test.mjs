import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("ships enlarged transparent Olmeca, Captain Morgan and Jameson images", async () => {
  const [olmecaMigration, captainMigration, jamesonMigration] = await Promise.all([
    read("drizzle/0060_olmeca_shot_product_image.sql"),
    read("drizzle/0061_captain_morgan_shot_product_image.sql"),
    read("drizzle/0063_jameson_thumbnail_image.sql"),
  ]);

  await Promise.all([
    access(new URL("../deployment-assets/product-images/901101-fc51177ac11429af.png", import.meta.url)),
    access(new URL("../deployment-assets/product-images/901105-0de88dddb8d6bb9a.png", import.meta.url)),
    access(new URL("../deployment-assets/product-images/36753-e1a66dd61fd8bd7f.webp", import.meta.url)),
  ]);
  assert.match(olmecaMigration, /1163500769319863/);
  assert.match(olmecaMigration, /\/api\/product-images\/901101-fc51177ac11429af\.png/);
  assert.match(captainMigration, /1242835061521895/);
  assert.match(captainMigration, /\/api\/product-images\/901105-0de88dddb8d6bb9a\.png/);
  assert.match(jamesonMigration, /2037163777390383/);
  assert.match(jamesonMigration, /\/api\/product-images\/36753-e1a66dd61fd8bd7f\.webp/);
});
