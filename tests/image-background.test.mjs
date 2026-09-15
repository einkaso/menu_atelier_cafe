import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

test("removes only a light background connected to the image border", async () => {
  const { removeLightImageBackground } = await vite.ssrLoadModule("/lib/image-background.ts");
  const bottle = Buffer.from(`
    <svg width="76" height="160" xmlns="http://www.w3.org/2000/svg">
      <rect x="28" y="0" width="20" height="38" rx="4" fill="#172534"/>
      <rect x="8" y="32" width="60" height="128" rx="18" fill="#315773"/>
      <rect x="12" y="72" width="52" height="52" rx="3" fill="#fff" stroke="#d7d7d7" stroke-width="2"/>
      <path d="M22 88h32M22 98h26M22 108h30" stroke="#1d3142" stroke-width="3"/>
    </svg>
  `);
  const source = await sharp({
    create: { width: 120, height: 180, channels: 3, background: "white" },
  }).composite([{ input: bottle, left: 22, top: 10 }]).jpeg({ quality: 95 }).toBuffer();

  const result = await removeLightImageBackground(source);
  assert.equal(result.backgroundRemoved, true);

  const { data, info } = await sharp(result.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * 4 + 3];
  assert.ok(alphaAt(0, 0) < 5, "background corner should be transparent");
  assert.ok(alphaAt(60, 105) > 245, "the enclosed white label should stay opaque");
});

test("keeps an existing transparent cutout byte-for-byte", async () => {
  const { removeLightImageBackground } = await vite.ssrLoadModule("/lib/image-background.ts");
  const bottle = Buffer.from(`
    <svg width="40" height="100" xmlns="http://www.w3.org/2000/svg">
      <rect x="14" width="12" height="28" fill="#293a24"/>
      <rect y="24" width="40" height="76" rx="11" fill="#77935e"/>
    </svg>
  `);
  const source = await sharp({
    create: { width: 80, height: 120, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: bottle, left: 20, top: 10 }]).png().toBuffer();

  const result = await removeLightImageBackground(source);
  assert.equal(result.backgroundRemoved, false);
  assert.deepEqual(result.bytes, source);
});
