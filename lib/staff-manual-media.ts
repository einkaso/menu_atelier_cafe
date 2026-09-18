import "server-only";
import { createHash } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StaffManualMedia } from "../db/schema";
import { optimizeProductImage } from "./image-background";

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const filenamePattern = /^\d+-[a-f0-9]{16}\.(?:jpg|png|webp|avif|gif|mp4|webm)$/;

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function detectMedia(bytes: Buffer): { extension: string; type: StaffManualMedia["type"] } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { extension: "jpg", type: "IMAGE" };
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { extension: "png", type: "IMAGE" };
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return { extension: "webp", type: "IMAGE" };
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp" && ["avif", "avis"].includes(bytes.subarray(8, 12).toString("ascii"))) return { extension: "avif", type: "IMAGE" };
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp" && ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(bytes.subarray(8, 12).toString("ascii"))) return { extension: "heic", type: "IMAGE" };
  if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return { extension: "gif", type: "IMAGE" };
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return { extension: "webm", type: "VIDEO" };
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") return { extension: "mp4", type: "VIDEO" };
  return null;
}

export function staffManualMediaDirectory() {
  return path.join(process.cwd(), "public", "uploads", "staff-manuals");
}

export function staffManualMediaFilename(storedPath: string | null | undefined) {
  if (!storedPath) return null;
  const filename = path.basename(storedPath);
  return filenamePattern.test(filename) ? filename : null;
}

export function staffManualMediaContentType(filename: string) {
  return contentTypes[path.extname(filename)] ?? "application/octet-stream";
}

export async function importStaffManualMedia(productId: number, file: File): Promise<StaffManualMedia> {
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error("Zdjęcie może mieć maksymalnie 50 MB, a film 25 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("Plik jest pusty albo większy niż 50 MB.");
  const detected = detectMedia(bytes);
  if (!detected) throw new Error("Dozwolone są zdjęcia JPG, PNG, WebP, AVIF, HEIC, HEIF i GIF oraz filmy MP4 i WebM.");
  if ((detected.type === "VIDEO" || detected.extension === "gif") && bytes.length > MAX_VIDEO_BYTES) {
    throw new Error("Film lub animowany GIF może mieć maksymalnie 25 MB.");
  }
  const prepared = detected.type === "IMAGE" && detected.extension !== "gif"
    ? await optimizeProductImage(bytes, undefined, detected.extension === "heic")
    : bytes;
  const storedType = detectMedia(prepared);
  if (!storedType || storedType.extension === "heic") throw new Error("Nie udało się przygotować zdjęcia do formatu obsługiwanego przez aplikację.");
  const id = createHash("sha256").update(prepared).digest("hex").slice(0, 16);
  const filename = `${productId}-${id}.${storedType.extension}`;
  const directory = staffManualMediaDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), prepared, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  return {
    id,
    path: `/api/staff-manual-media/${filename}`,
    type: storedType.type,
    name: file.name.slice(0, 180) || filename,
  };
}

export async function removeStaffManualMedia(storedPath: string | null | undefined) {
  const filename = staffManualMediaFilename(storedPath);
  if (!filename) return;
  await unlink(path.join(staffManualMediaDirectory(), filename)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}
