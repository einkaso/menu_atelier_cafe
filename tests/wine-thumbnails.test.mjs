import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const thumbnails = [
  ["1161577021855155", "109-032db62953dc1aa3.webp"],
  ["1232888902406771", "116-70611b8460686786.webp"],
  ["1232891726132895", "123-b46a7d58f3bc1568.webp"],
  ["2301314891134215", "2187461-5eb6eac73eb3a4cd.webp"],
  ["2279946920195279", "404-a60ea0a7e9564c3a.webp"],
  ["2283277910504359", "412-5dad24d675e544b5.webp"],
  ["2279947645426835", "414-abaab376574a5dde.webp"],
  ["2283277652774139", "427-59acd37ba76bedef.webp"],
  ["2283277494028975", "608577-3af31b34046f1255.webp"],
  ["2283277298686039", "611469-14e3add3f42e1500.webp"],
  ["1511758512586171", "615613-7a1439ab9ebf59b0.webp"],
  ["1436393381986111", "79-49fc5c737ba9f951.webp"],
  ["1511697061831599", "9277-1e514ef9579fd97c.webp"],
  ["1331839498695807", "94-105cb033e2f645bf.webp"],
  ["1368857729559711", "96-3a82124fee93ff7f.webp"],
  ["1453566410875831", "98-dedefffe353119ee.webp"],
];

test("ships consistently framed transparent wine thumbnails", async () => {
  const migration = await read("drizzle/0062_normalize_wine_thumbnail_images.sql");

  for (const [dotykackaId, filename] of thumbnails) {
    const asset = new URL(`../deployment-assets/product-images/${filename}`, import.meta.url);
    await access(asset);
    assert.match(migration, new RegExp(dotykackaId));
    assert.match(migration, new RegExp(`/api/product-images/${filename.replace(".", "\\.")}`));

    const assetPath = fileURLToPath(asset);
    const metadata = await sharp(assetPath).metadata();
    assert.equal(metadata.width, 600);
    assert.equal(metadata.height, 800);
    assert.equal(metadata.hasAlpha, true);

    const { info } = await sharp(assetPath)
      .trim({ background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer({ resolveWithObject: true });
    assert.ok(info.height >= 775 && info.height <= 780);
  }
});
