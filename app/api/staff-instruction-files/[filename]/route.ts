import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDb } from "../../../../db";
import { staffInstructions } from "../../../../db/schema";
import { isAdmin } from "../../../../lib/admin-auth";
import { currentWaiter } from "../../../../lib/waiter-auth";
import {
  staffInstructionAttachmentContentType,
  staffInstructionAttachmentDirectory,
  staffInstructionAttachmentFilename,
} from "../../../../lib/staff-instruction-attachments";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ filename: string }> }) {
  const administrator = await isAdmin();
  const employee = administrator ? null : await currentWaiter(request);
  if (!administrator && !employee) return new Response("Not found", { status: 404 });
  const { filename: rawFilename } = await context.params;
  const filename = staffInstructionAttachmentFilename(rawFilename);
  if (!filename || filename !== rawFilename) return new Response("Not found", { status: 404 });
  const expectedPath = `/api/staff-instruction-files/${filename}`;
  const catalogue = await getDb().select({
    attachments: staffInstructions.attachments,
    status: staffInstructions.status,
  }).from(staffInstructions);
  const referenced = catalogue.some((instruction) =>
    (administrator || instruction.status === "PUBLISHED" || instruction.status === "ARCHIVED")
    && instruction.attachments.some((attachment) => attachment.path === expectedPath));
  if (!referenced) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(path.join(staffInstructionAttachmentDirectory(), filename));
    const headers = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
      "Content-Type": staffInstructionAttachmentContentType(filename),
      "X-Content-Type-Options": "nosniff",
    };
    const range = request.headers.get("range")?.match(/^bytes=(\d+)-(\d*)$/);
    if (!range) return new Response(bytes, { headers: { ...headers, "Content-Length": String(bytes.length) } });
    const start = Number(range[1]);
    const requestedEnd = range[2] ? Number(range[2]) : bytes.length - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= bytes.length || requestedEnd < start) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
    }
    const end = Math.min(requestedEnd, bytes.length - 1);
    return new Response(bytes.subarray(start, end + 1), {
      status: 206,
      headers: { ...headers, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${bytes.length}` },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
