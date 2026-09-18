import { readFile } from "node:fs/promises";
import path from "node:path";
import { isAdmin } from "../../../../lib/admin-auth";
import { employeeThankYouMediaDirectory, employeeThankYouMediaFilename } from "../../../../lib/employee-thank-you-media";
import { currentGuestReceipt } from "../../../../lib/guest-receipt-auth";

export const dynamic = "force-dynamic";

const contentTypes: Record<string, string> = {
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

export async function GET(request: Request, context: { params: Promise<{ filename: string }> }) {
  if (!(await isAdmin()) && !(await currentGuestReceipt())) return new Response("Not found", { status: 404 });
  const { filename: rawFilename } = await context.params;
  const filename = employeeThankYouMediaFilename(rawFilename);
  if (!filename || filename !== rawFilename) return new Response("Not found", { status: 404 });

  try {
    const bytes = await readFile(path.join(employeeThankYouMediaDirectory(), filename));
    const headers = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
      "Content-Type": contentTypes[path.extname(filename)] ?? "application/octet-stream",
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
