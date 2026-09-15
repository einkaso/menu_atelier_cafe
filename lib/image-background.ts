import sharp from "sharp";

const MAX_SIDE = 1_600;
const MAX_INPUT_PIXELS = 32_000_000;

type BackgroundRemovalResult = { bytes: Buffer; backgroundRemoved: boolean };

export async function removeLightImageBackground(bytes: Buffer): Promise<BackgroundRemovalResult> {
  const { data, info } = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const pixelCount = width * height;
  if (width < 3 || height < 3 || pixelCount === 0) return { bytes, backgroundRemoved: false };

  const border: number[] = [];
  for (let x = 0; x < width; x += 1) border.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y += 1) border.push(y * width, y * width + width - 1);

  let transparentBorderPixels = 0;
  const lightBorderPixels: number[] = [];
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const index of border) {
    const offset = index * 4;
    const alpha = data[offset + 3];
    if (alpha < 245) transparentBorderPixels += 1;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    if (alpha >= 245 && Math.min(r, g, b) >= 220 && Math.max(r, g, b) - Math.min(r, g, b) <= 28) {
      lightBorderPixels.push(index);
      red += r;
      green += g;
      blue += b;
    }
  }

  // Existing transparent cutouts must never be recompressed or altered.
  if (transparentBorderPixels >= Math.max(2, Math.round(border.length * .01))) return { bytes, backgroundRemoved: false };
  if (lightBorderPixels.length < border.length * .3) return { bytes, backgroundRemoved: false };

  const background = {
    r: red / lightBorderPixels.length,
    g: green / lightBorderPixels.length,
    b: blue / lightBorderPixels.length,
  };
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  let changedPixels = 0;

  const eligible = (index: number) => {
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    const distance = Math.sqrt((r - background.r) ** 2 + (g - background.g) ** 2 + (b - background.b) ** 2);
    return Math.min(r, g, b) >= 198 && spread <= 42 && distance <= 72;
  };
  const enqueue = (index: number) => {
    if (visited[index] || !eligible(index)) return;
    visited[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (const index of border) enqueue(index);
  while (head < tail) {
    const index = queue[head];
    head += 1;
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const distance = Math.sqrt((r - background.r) ** 2 + (g - background.g) ** 2 + (b - background.b) ** 2);
    const edgeAlpha = Math.max(0, Math.min(255, Math.round((distance - 8) / 40 * 255)));
    if (edgeAlpha < data[offset + 3]) {
      data[offset + 3] = edgeAlpha;
      changedPixels += 1;
    }

    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }

  if (changedPixels < pixelCount * .01) return { bytes, backgroundRemoved: false };
  const output = await sharp(data, { raw: { width, height, channels: 4 } })
    .webp({ quality: 92, alphaQuality: 100, effort: 4 })
    .toBuffer();
  return { bytes: output, backgroundRemoved: true };
}
