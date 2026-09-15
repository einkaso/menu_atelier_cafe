import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Podaj ścieżkę do oryginalnego zdjęcia Winnicy Fredrówka.");

const source = await readFile(sourcePath);
const { data, info } = await sharp(source).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
if (width < 20 || height < 20) throw new Error("Zdjęcie źródłowe jest zbyt małe.");

const foreground = new Uint8Array(width * height);
for (let y = 0; y < height; y += 1) {
  let left = width;
  let right = -1;
  for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4;
    if (Math.min(data[offset], data[offset + 1], data[offset + 2]) < 245) {
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  if (right < left) continue;
  // The bottle and its rectangular white label are preserved as one opaque
  // silhouette. Only pixels outside the detected left/right contour are cut.
  for (let x = left; x <= right; x += 1) {
    foreground[y * width + x] = 1;
  }
}

const output = Buffer.alloc(width * height * 4);
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const index = y * width + x;
    const offset = index * 4;
    if (foreground[index]) {
      output[offset] = data[offset];
      output[offset + 1] = data[offset + 1];
      output[offset + 2] = data[offset + 2];
      output[offset + 3] = 255;
      continue;
    }
    let touchesBottle = false;
    for (let dy = -1; dy <= 1 && !touchesBottle; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && foreground[ny * width + nx]) {
          touchesBottle = true;
          break;
        }
      }
    }
    if (touchesBottle) {
      output[offset] = 116;
      output[offset + 1] = 124;
      output[offset + 2] = 124;
      output[offset + 3] = 88;
    }
  }
}

const png = await sharp(output, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
const fingerprint = createHash("sha256").update(png).digest("hex").slice(0, 16);
const directory = path.join(process.cwd(), "public", "uploads", "products");
const filename = `617728-${fingerprint}.png`;
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, filename), png);
console.log(JSON.stringify({ filename, path: path.join(directory, filename), width, height, bytes: png.length }));
