import "server-only";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";

import { optimizeProductImage, removeLightImageBackground } from "./image-background";

const MAX_BYTES = 32 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const contentTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
};

const filenamePattern = /^\d+-[a-f0-9]{16}\.(?:jpg|png|webp|avif)$/;

function detectedImageType(bytes: Buffer) {
  if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", extension: "png" };
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return { mime: "image/webp", extension: "webp" };
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp" && ["avif", "avis"].includes(bytes.subarray(8, 12).toString("ascii"))) return { mime: "image/avif", extension: "avif" };
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp" && ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(bytes.subarray(8, 12).toString("ascii"))) return { mime: "image/heic", extension: "heic" };
  return null;
}

async function storeProductImage(productId: number, bytes: Buffer) {
  const prepared = await removeLightImageBackground(bytes).catch(() => ({ bytes, backgroundRemoved: false }));
  const preparedType = detectedImageType(prepared.bytes);
  const optimized = await optimizeProductImage(prepared.bytes, undefined, preparedType?.mime === "image/heic" || preparedType?.mime === "image/heif");
  const detected = detectedImageType(optimized);
  if (!detected || !contentTypes[detected.mime]) throw new Error("Plik nie jest prawidłowym zdjęciem JPG, PNG, WebP lub AVIF.");
  const fingerprint = createHash("sha256").update(optimized).digest("hex").slice(0, 16);
  const filename = `${productId}-${fingerprint}.${detected.extension}`;
  const directory = productImageDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), optimized, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  return `/api/product-images/${filename}`;
}

export function productImageDirectory() {
  return path.join(process.cwd(), "public", "uploads", "products");
}

export function productImageFilename(storedPath: string | null | undefined) {
  if (!storedPath) return null;
  const filename = path.basename(storedPath);
  return filenamePattern.test(filename) ? filename : null;
}

export function productImageUrl(storedPath: string | null | undefined) {
  const filename = productImageFilename(storedPath);
  return filename ? `/api/product-images/${filename}` : null;
}

export async function removeProductImageFile(storedPath: string | null | undefined) {
  const filename = productImageFilename(storedPath);
  if (!filename) return;
  await unlink(path.join(productImageDirectory(), filename)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase().startsWith("::ffff:") ? address.slice(7) : address;
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")) return true;
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

async function validateUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Dozwolony jest wyłącznie publiczny link HTTP lub HTTPS.");
  if (["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase())) throw new Error("Adres lokalny nie jest dozwolony.");
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("Adres zdjęcia nie może prowadzić do sieci prywatnej.");
  return url;
}

export async function importProductImage(productId: number, sourceUrl: string) {
  let url = await validateUrl(sourceUrl);
  let response: Response | null = null;
  for (let redirects = 0; redirects < 4; redirects += 1) {
    response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "accept-language": "pl-PL,pl;q=0.9,en;q=0.7",
        "referer": `${url.origin}/`,
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location) throw new Error("Nieprawidłowe przekierowanie podczas pobierania zdjęcia.");
    url = await validateUrl(new URL(location, url).toString());
    response = null;
  }
  if (!response?.ok) throw new Error(`Nie udało się pobrać zdjęcia (${response?.status ?? "zbyt wiele przekierowań"}).`);
  const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  if (!contentTypes[type]) throw new Error("Plik musi być zdjęciem JPG, PNG, WebP lub AVIF.");
  const announcedSize = Number(response.headers.get("content-length") ?? 0);
  if (announcedSize > MAX_BYTES) throw new Error("Zdjęcie źródłowe jest większe niż 32 MB.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error("Zdjęcie jest puste albo większe niż 32 MB.");
  return storeProductImage(productId, bytes);
}

export async function importUploadedProductImage(productId: number, file: File) {
  if (!contentTypes[file.type]) throw new Error("Wybierz zdjęcie JPG, PNG, WebP, AVIF, HEIC lub HEIF.");
  if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new Error("Zdjęcie źródłowe może mieć maksymalnie 50 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) throw new Error("Zdjęcie jest puste albo większe niż 50 MB.");
  return storeProductImage(productId, bytes);
}
