import "server-only";
import { spawn } from "node:child_process";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { StaffManualMedia } from "../db/schema";
import { optimizeProductImage } from "./image-background";
import { detectUploadedImageType, prepareUploadedImage } from "./uploaded-image";

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SOURCE_BYTES = 95 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const VIDEO_CONVERSION_TIMEOUT_MS = 4 * 60 * 1000;
const MEDIA_ACCESS_SECONDS = 18 * 60 * 60;
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
  const image = detectUploadedImageType(bytes);
  if (image) return { extension: image.extension, type: "IMAGE" };
  if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return { extension: "gif", type: "IMAGE" };
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return { extension: "webm", type: "VIDEO" };
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") return { extension: "mp4", type: "VIDEO" };
  return null;
}

function convertVideo(inputPath: string, outputPath: string) {
  return new Promise<void>((resolve, reject) => {
    const errors: Buffer[] = [];
    const process = spawn("ffmpeg", [
      "-nostdin",
      "-hide_banner",
      "-loglevel", "error",
      "-y",
      "-i", inputPath,
      "-map", "0:v:0",
      "-map", "0:a:0?",
      "-map_metadata", "-1",
      "-vf", "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "25",
      "-profile:v", "main",
      "-c:a", "aac",
      "-b:a", "128k",
      "-ac", "2",
      "-movflags", "+faststart",
      outputPath,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    process.stderr.on("data", (chunk: Buffer) => {
      if (errors.reduce((sum, item) => sum + item.length, 0) < 12_000) errors.push(chunk);
    });
    const timeout = setTimeout(() => process.kill("SIGKILL"), VIDEO_CONVERSION_TIMEOUT_MS);
    process.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      reject(error.code === "ENOENT"
        ? new Error("Konwerter filmów nie jest dostępny na serwerze.")
        : error);
    });
    process.once("close", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(signal === "SIGKILL"
        ? "Konwersja filmu trwała zbyt długo. Skróć nagranie i spróbuj ponownie."
        : `Nie udało się przekonwertować filmu do MP4. ${Buffer.concat(errors).toString("utf8").trim()}`.trim()));
    });
  });
}

async function prepareUploadedVideo(bytes: Buffer, sourceExtension: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "atelier-staff-video-"));
  const inputPath = path.join(directory, `source.${sourceExtension}`);
  const outputPath = path.join(directory, "prepared.mp4");
  try {
    await writeFile(inputPath, bytes);
    await convertVideo(inputPath, outputPath);
    const prepared = await readFile(outputPath);
    if (!prepared.length) throw new Error("Konwersja filmu utworzyła pusty plik.");
    if (prepared.length > MAX_VIDEO_BYTES) throw new Error("Film po konwersji jest większy niż 50 MB. Skróć nagranie i spróbuj ponownie.");
    return prepared;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function staffManualMediaDirectory() {
  const managedRoot = process.env.MENU_UPLOADS_DIRECTORY?.replace(/\/+$/, "");
  return managedRoot ? `${managedRoot}/staff-manuals` : path.join(process.cwd(), "public", "uploads", "staff-manuals");
}

export function staffManualMediaFilename(storedPath: string | null | undefined) {
  if (!storedPath) return null;
  const filename = path.basename(storedPath);
  return filenamePattern.test(filename) ? filename : null;
}

export function staffManualMediaContentType(filename: string) {
  return contentTypes[path.extname(filename)] ?? "application/octet-stream";
}

function mediaAccessSecret() {
  const value = process.env.WAITER_SESSION_SECRET ?? process.env.ADMIN_SESSION_SECRET;
  if (!value) throw new Error("WAITER_SESSION_SECRET is not configured");
  return value;
}

function mediaAccessSignature(filename: string, expires: number) {
  return createHmac("sha256", mediaAccessSecret()).update(`staff-manual-media:${filename}:${expires}`).digest("base64url");
}

export function staffManualMediaAuthorizedPath(storedPath: string) {
  const filename = staffManualMediaFilename(storedPath);
  if (!filename) return storedPath;
  const expires = Math.floor(Date.now() / 1000) + MEDIA_ACCESS_SECONDS;
  const signature = mediaAccessSignature(filename, expires);
  return `/api/staff-manual-media/${filename}?expires=${expires}&signature=${signature}`;
}

export function validStaffManualMediaAccess(filename: string, expiresValue: string | null, received: string | null) {
  if (!filenamePattern.test(filename) || !expiresValue || !received) return false;
  const expires = Number(expiresValue);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expires) || expires < now || expires > now + MEDIA_ACCESS_SECONDS + 60) return false;
  try {
    const expected = mediaAccessSignature(filename, expires);
    const left = Buffer.from(received);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export async function importStaffManualMedia(productId: number, file: File): Promise<StaffManualMedia> {
  if (!file.size || file.size > MAX_VIDEO_SOURCE_BYTES) throw new Error("Plik jest pusty albo większy niż 95 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_VIDEO_SOURCE_BYTES) throw new Error("Plik jest pusty albo większy niż 95 MB.");
  const detected = detectMedia(bytes);
  if (!detected) throw new Error("Dozwolone są zdjęcia JPG, PNG, WebP, AVIF, HEIC, HEIF i GIF oraz filmy MOV, MP4 i WebM.");
  if (detected.type === "IMAGE" && bytes.length > MAX_IMAGE_BYTES) throw new Error("Zdjęcie lub animowany GIF może mieć maksymalnie 50 MB.");
  const prepared = detected.type === "VIDEO"
    ? await prepareUploadedVideo(bytes, detected.extension)
    : detected.extension !== "gif"
      ? await optimizeProductImage(await prepareUploadedImage(bytes))
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
