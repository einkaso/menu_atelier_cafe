import sharp from "sharp";

const MAX_INPUT_PIXELS = 64_000_000;
const MAX_SIDE = 1_600;
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);
const AVIF_BRANDS = new Set(["avif", "avis"]);

export type UploadedImageType = {
  mime: "image/jpeg" | "image/png" | "image/webp" | "image/avif" | "image/heic";
  extension: "jpg" | "png" | "webp" | "avif" | "heic";
  requiresHeicDecode: boolean;
};

function isoBaseMediaBrands(bytes: Buffer) {
  if (bytes.length < 12 || bytes.subarray(4, 8).toString("ascii") !== "ftyp") return [];
  const announcedSize = bytes.readUInt32BE(0);
  const boxSize = Math.min(bytes.length, Math.max(16, announcedSize || bytes.length), 256);
  const brands = [bytes.subarray(8, 12).toString("ascii")];
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) brands.push(bytes.subarray(offset, offset + 4).toString("ascii"));
  return brands;
}

export function detectUploadedImageType(bytes: Buffer): UploadedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg", requiresHeicDecode: false };
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", extension: "png", requiresHeicDecode: false };
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return { mime: "image/webp", extension: "webp", requiresHeicDecode: false };
  }
  const brands = isoBaseMediaBrands(bytes);
  if (brands.some((brand) => AVIF_BRANDS.has(brand))) {
    return { mime: "image/avif", extension: "avif", requiresHeicDecode: false };
  }
  if (brands.some((brand) => HEIC_BRANDS.has(brand))) {
    return { mime: "image/heic", extension: "heic", requiresHeicDecode: true };
  }
  return null;
}

export async function prepareUploadedImage(bytes: Buffer) {
  const detected = detectUploadedImageType(bytes);
  if (!detected) throw new Error("Plik nie jest prawidłowym zdjęciem JPG, PNG, WebP, AVIF, HEIC ani HEIF.");
  if (!detected.requiresHeicDecode) return bytes;

  try {
    const { default: decodeHeic } = await import("heic-decode");
    const decoded = await decodeHeic({ buffer: bytes });
    const width = Number(decoded.width);
    const height = Number(decoded.height);
    const pixels = width * height;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || pixels > MAX_INPUT_PIXELS) {
      throw new Error("Nieprawidłowe lub zbyt duże wymiary zdjęcia.");
    }
    if (!(decoded.data instanceof Uint8ClampedArray) || decoded.data.byteLength !== pixels * 4) {
      throw new Error("Dekoder zwrócił niepełne dane zdjęcia.");
    }
    const raw = Buffer.from(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength);
    return await sharp(raw, { raw: { width, height, channels: 4 }, limitInputPixels: MAX_INPUT_PIXELS })
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86, alphaQuality: 92, effort: 4 })
      .toBuffer();
  } catch (error) {
    const details = error instanceof Error ? error.message : "nieznany błąd dekodera";
    throw new Error(`Nie udało się odczytać zdjęcia HEIC/HEIF z iPhone’a: ${details}`);
  }
}
