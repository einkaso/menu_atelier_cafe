import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("ships the cleaned Crodino cutout and assigns it to the exact Dotykacka product", async () => {
  const [migration, installer] = await Promise.all([
    read("drizzle/0057_crodino_product_image.sql"),
    read("ops/install-bundled-product-images.sh"),
  ]);

  await access(new URL("../deployment-assets/product-images/601572-cee5801e25ee8f32.webp", import.meta.url));
  assert.match(migration, /2248840919868519/);
  assert.match(migration, /\/api\/product-images\/601572-cee5801e25ee8f32\.webp/);
  assert.match(installer, /deployment-assets\/product-images/);
  assert.match(installer, /\/var\/lib\/banaszek-menu\/uploads\/products/);
});
