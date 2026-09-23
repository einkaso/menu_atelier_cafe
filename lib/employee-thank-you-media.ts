import "server-only";
import { createHash } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_MEDIA_BYTES = 15 * 1024 * 1024;
const filenamePattern = /^\d+-[a-f0-9]{16}\.(?:gif|mp4|webm)$/;

function detectMedia(bytes: Buffer) {
  const gifHeader = bytes.subarray(0, 6).toString("ascii");
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") return { extension: "gif", mediaType: "GIF" as const };
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return { extension: "webm", mediaType: "VIDEO" as const };
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") return { extension: "mp4", mediaType: "VIDEO" as const };
  return null;
}

export function employeeThankYouMediaDirectory() {
  const managedRoot = process.env.MENU_UPLOADS_DIRECTORY?.replace(/\/+$/, "");
  return managedRoot ? `${managedRoot}/employee-thanks` : path.join(process.cwd(), "public", "uploads", "employee-thanks");
}

export function employeeThankYouMediaFilename(storedPath: string | null | undefined) {
  if (!storedPath) return null;
  const filename = path.basename(storedPath);
  return filenamePattern.test(filename) ? filename : null;
}

export async function importEmployeeThankYouMedia(employeeId: number, file: File) {
  if (!file.size || file.size > MAX_MEDIA_BYTES) throw new Error("Animacja może mieć maksymalnie 15 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) throw new Error("Plik jest pusty albo większy niż 15 MB.");
  const detected = detectMedia(bytes);
  if (!detected) throw new Error("Wybierz przygotowany plik MP4, WebM albo GIF.");
  const fingerprint = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const filename = `${employeeId}-${fingerprint}.${detected.extension}`;
  const directory = employeeThankYouMediaDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), bytes, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  return { path: `/api/employee-thanks/${filename}`, mediaType: detected.mediaType };
}

export async function removeEmployeeThankYouMedia(storedPath: string | null | undefined) {
  const filename = employeeThankYouMediaFilename(storedPath);
  if (!filename) return;
  await unlink(path.join(employeeThankYouMediaDirectory(), filename)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}
