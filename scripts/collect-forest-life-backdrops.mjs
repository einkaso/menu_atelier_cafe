import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const products = [
  [337817, "Syrop ananasowy", "syrop-ananasowy"],
  [336990, "Syrop cynamonowy", "syrop-cynamonowy"],
  [336991, "Syrop cytrynowy", "syrop-cytrynowy"],
  [336992, "Syrop korzenny", "syrop-korzenny"],
  [336993, "Syrop lawendowy", "syrop-lawendowy"],
  [336994, "Syrop malinowy", "syrop-malinowy"],
  [336995, "Syrop mango", "syrop-mango"],
  [336996, "Syrop marakuja z pestką", "syrop-marakuja-z-pestka"],
  [336997, "Syrop o smaku aloes z pomelo", "syrop-o-smaku-aloes-z-pomelo"],
  [336998, "Syrop o smaku czekoladowym", "syrop-o-smaku-czekoladowym"],
  [336999, "Syrop o smaku karmelowym", "syrop-o-smaku-karmelowym"],
  [337000, "Syrop o smaku mojito mint", "syrop-o-smaku-mojito-mint"],
  [337001, "Syrop pomarańczowy z imbirem", "syrop-pomaraczowy-z-imbirem"],
  [337002, "Syrop truskawkowy", "syrop-truskawkowy"],
  [337003, "Syrop waniliowy Bourbon", "syrop-waniliowy-bourbon"],
  [337004, "Syrop wiśniowy z kardamonem", "syrop-wisniowy-z-kardamonem"],
  [336989, "Słony karmel", "syrop-o-smaku-slonego-karmelu"],
];

const outputDirectory = path.resolve(process.cwd(), ".artifacts", "forest-life-backgrounds");
const download = process.argv.includes("--download");
const pageUrl = (slug) => `https://lesnezycie.pl/produkt/${slug}/`;
const sourceUrlPattern = /https:\/\/lesnezycie\.pl\/wp-content\/uploads\/[^"' )<>]+/gu;
const excludedName = /(favicon|fav\.|avatar|logo|cropped-|woocommerce-placeholder|\.png(?:$|\?))/i;

function htmlDecode(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&#038;", "&").replaceAll("\\/", "/");
}

function canonicalImageUrl(value) {
  const decoded = htmlDecode(value);
  return decoded.replace(/-\d+x\d+(?=\.(?:jpe?g|webp)(?:$|\?))/i, "");
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function createContactSheet(results) {
  const columns = 4;
  const cellWidth = 360;
  const cellHeight = 260;
  const imageWidth = 332;
  const imageHeight = 194;
  const rows = Math.ceil(results.length / columns);
  const canvas = sharp({
    create: {
      width: columns * cellWidth,
      height: rows * cellHeight,
      channels: 3,
      background: "#f2ece1",
    },
  });
  const layers = [];

  for (const [index, result] of results.entries()) {
    const selected = result.candidates[0];
    if (!selected) continue;
    const left = (index % columns) * cellWidth + 14;
    const top = Math.floor(index / columns) * cellHeight + 14;
    const thumbnail = await sharp(selected.bytes)
      .rotate()
      .resize({ width: imageWidth, height: imageHeight, fit: "cover", position: "attention" })
      .webp({ quality: 80 })
      .toBuffer();
    const label = Buffer.from(`<svg width="${imageWidth}" height="42" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#191511"/>
      <text x="12" y="26" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#fff">${escapeXml(result.name)}</text>
    </svg>`);
    layers.push({ input: thumbnail, left, top });
    layers.push({ input: label, left, top: top + imageHeight });
  }

  await canvas.composite(layers).webp({ quality: 88 }).toFile(path.join(outputDirectory, "contact-sheet.webp"));
}

async function imageCandidate(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "Mozilla/5.0 Atelier Cafe menu research" } });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(bytes).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    // The producer uses both landscape and portrait ingredient photography.
    // The portrait images work especially well behind the bottle in the
    // right-hand product panel, so orientation must not disqualify them.
    if (Math.min(width, height) < 700) return null;
    return { url, bytes, width, height, format: metadata.format ?? "image" };
  } catch {
    return null;
  }
}

async function inspectProduct([id, name, slug]) {
  const url = pageUrl(slug);
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "Mozilla/5.0 Atelier Cafe menu research" } });
  if (!response.ok) return { id, name, slug, pageUrl: url, error: `HTTP ${response.status}`, candidates: [] };
  const html = await response.text();
  const found = Array.from(new Set(Array.from(html.matchAll(sourceUrlPattern), (match) => canonicalImageUrl(match[0]))))
    .filter((imageUrl) => !excludedName.test(imageUrl));
  const candidates = (await Promise.all(found.map(imageCandidate))).filter(Boolean)
    .sort((left, right) => (right.width * right.height) - (left.width * left.height));
  return { id, name, slug, pageUrl: url, candidates };
}

const results = await Promise.all(products.map(inspectProduct));
const report = results.map((result) => ({
  id: result.id,
  name: result.name,
  slug: result.slug,
  pageUrl: result.pageUrl,
  error: result.error,
  selected: result.candidates[0]
    ? {
        sourceUrl: result.candidates[0].url,
        sourceWidth: result.candidates[0].width,
        sourceHeight: result.candidates[0].height,
        sourceFormat: result.candidates[0].format,
        localFile: `${result.id}-${result.slug}.webp`,
      }
    : null,
}));

if (download) {
  await mkdir(outputDirectory, { recursive: true });
  for (const result of results) {
    const candidate = result.candidates[0];
    if (!candidate) continue;
    const filename = `${result.id}-${result.slug}.webp`;
    const optimized = await sharp(candidate.bytes).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
    await writeFile(path.join(outputDirectory, filename), optimized);
  }
  await createContactSheet(results);
  await writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify({
    source: "Leśne Życie",
    collectedAt: new Date().toISOString(),
    products: report,
  }, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify({ outputDirectory: download ? outputDirectory : null, products: report }, null, 2)}\n`);
