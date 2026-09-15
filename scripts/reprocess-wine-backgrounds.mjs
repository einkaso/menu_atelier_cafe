import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import postgres from "postgres";
import sharp from "sharp";
import { createServer } from "vite";

const applyChanges = process.argv.includes("--apply");
const previewDirectory = process.argv.find((argument) => argument.startsWith("--preview-dir="))?.slice("--preview-dir=".length);
const baseUrl = `http://127.0.0.1:${process.env.PORT || "8080"}`;
const uploadDirectory = path.join(process.cwd(), "public", "uploads", "products");
const imagePattern = /^\d+-[a-f0-9]{16}\.(?:jpg|png|webp|avif)$/;

const response = await fetch(`${baseUrl}/api/menu`);
if (!response.ok) throw new Error(`Nie udało się pobrać menu (${response.status}).`);
const menu = await response.json();
const wines = menu.products.filter((product) => product.wine && product.image);
const uniqueWines = wines.filter((product, index, all) =>
  all.findIndex((candidate) => candidate.image === product.image) === index);

const vite = await createServer({
  appType: "custom",
  cacheDir: path.join("/tmp", "banaszek-menu-vite-audit-cache"),
  configFile: false,
  root: process.cwd(),
  server: { middlewareMode: true },
});

const candidates = [];
try {
  const { removeLightImageBackground } = await vite.ssrLoadModule("/lib/image-background.ts");
  for (const product of uniqueWines) {
    const filename = path.basename(new URL(product.image, baseUrl).pathname);
    if (!imagePattern.test(filename)) continue;
    const oldPath = `/api/product-images/${filename}`;
    const source = await readFile(path.join(uploadDirectory, filename));
    const metadata = await sharp(source).metadata();
    const result = await removeLightImageBackground(source);
    if (!result.backgroundRemoved) continue;
    candidates.push({ product, oldPath, source, result, metadata });
    if (previewDirectory) {
      await mkdir(previewDirectory, { recursive: true });
      const sourceExtension = metadata.format === "jpeg" ? "jpg" : metadata.format;
      await writeFile(path.join(previewDirectory, `${product.id}-before.${sourceExtension}`), source);
      await writeFile(path.join(previewDirectory, `${product.id}-after.webp`), result.bytes);
    }
    console.log(JSON.stringify({
      id: product.id,
      name: product.pl,
      image: oldPath,
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      action: applyChanges ? "apply" : "candidate",
    }));
  }

  if (applyChanges && candidates.length) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
    const sql = postgres(process.env.DATABASE_URL, { max: 1 });
    try {
      await mkdir(uploadDirectory, { recursive: true });
      for (const candidate of candidates) {
        const fingerprint = createHash("sha256").update(candidate.result.bytes).digest("hex").slice(0, 16);
        const filename = `${candidate.product.id}-${fingerprint}.webp`;
        const newPath = `/api/product-images/${filename}`;
        await writeFile(path.join(uploadDirectory, filename), candidate.result.bytes, { flag: "wx" }).catch((error) => {
          if (error.code !== "EEXIST") throw error;
        });
        const rows = await sql`
          update product_content
          set image_path = ${newPath}, updated_at = now()
          where image_path = ${candidate.oldPath}
          returning product_id
        `;
        console.log(JSON.stringify({
          id: candidate.product.id,
          name: candidate.product.pl,
          oldPath: candidate.oldPath,
          newPath,
          updatedProductIds: rows.map((row) => row.product_id),
        }));
      }
    } finally {
      await sql.end();
    }
  }
} finally {
  await vite.close();
}

console.log(JSON.stringify({
  mode: applyChanges ? "apply" : "dry-run",
  wines: wines.length,
  uniqueImages: uniqueWines.length,
  candidates: candidates.length,
}));
