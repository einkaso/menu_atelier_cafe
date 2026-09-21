import "server-only";
import { createHash } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StaffInstructionAttachment } from "../db/schema";
import { optimizeProductImage } from "./image-background";
import { detectUploadedImageType, prepareUploadedImage } from "./uploaded-image";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const filenamePattern = /^\d+-[a-f0-9]{16}\.(?:jpg|png|webp|avif|pdf)$/;

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".pdf": "application/pdf",
};

function isPdf(bytes: Buffer) {
  return bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
}

function safeOriginalName(value: string, fallback: string) {
  const name = path.basename(value).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (name || fallback).slice(0, 180);
}

export function staffInstructionAttachmentDirectory() {
  return path.join(process.cwd(), "public", "uploads", "staff-instructions");
}

export function staffInstructionAttachmentFilename(storedPath: string | null | undefined) {
  if (!storedPath) return null;
  const filename = path.basename(storedPath);
  return filenamePattern.test(filename) ? filename : null;
}

export function staffInstructionAttachmentContentType(filename: string) {
  return contentTypes[path.extname(filename)] ?? "application/octet-stream";
}

export async function importStaffInstructionAttachment(instructionId: number, file: File): Promise<StaffInstructionAttachment> {
  if (!file.size || file.size > MAX_FILE_BYTES) throw new Error("Zdjęcie lub PDF może mieć maksymalnie 25 MB.");
  const source = Buffer.from(await file.arrayBuffer());
  if (!source.length || source.length > MAX_FILE_BYTES) throw new Error("Plik jest pusty albo większy niż 25 MB.");

  let prepared: Buffer;
  let extension: "jpg" | "png" | "webp" | "avif" | "pdf";
  let type: StaffInstructionAttachment["type"];
  if (isPdf(source)) {
    prepared = source;
    extension = "pdf";
    type = "PDF";
  } else {
    const detected = detectUploadedImageType(source);
    if (!detected) throw new Error("Dozwolone są zdjęcia JPG, PNG, WebP, AVIF, HEIC i HEIF oraz pliki PDF.");
    prepared = await optimizeProductImage(await prepareUploadedImage(source));
    const stored = detectUploadedImageType(prepared);
    if (!stored || stored.extension === "heic") throw new Error("Nie udało się przygotować zdjęcia do formatu obsługiwanego przez aplikację.");
    extension = stored.extension;
    type = "IMAGE";
  }

  const id = createHash("sha256").update(prepared).digest("hex").slice(0, 16);
  const filename = `${instructionId}-${id}.${extension}`;
  const directory = staffInstructionAttachmentDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), prepared, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  return {
    id,
    path: `/api/staff-instruction-files/${filename}`,
    type,
    name: safeOriginalName(file.name, filename),
    size: prepared.length,
  };
}

export async function removeStaffInstructionAttachment(storedPath: string | null | undefined) {
  const filename = staffInstructionAttachmentFilename(storedPath);
  if (!filename) return;
  await unlink(path.join(staffInstructionAttachmentDirectory(), filename)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}
