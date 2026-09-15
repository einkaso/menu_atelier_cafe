import { readFile } from "node:fs/promises";
import path from "node:path";
import { productImageDirectory, productImageFilename } from "../../../../lib/image-import";

export const dynamic = "force-dynamic";

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const { filename: rawFilename } = await context.params;
  const filename = productImageFilename(rawFilename);
  if (!filename || filename !== rawFilename) return new Response("Not found", { status: 404 });

  try {
    const bytes = await readFile(path.join(productImageDirectory(), filename));
    return new Response(bytes, {
      headers: {
        "Content-Type": contentTypes[path.extname(filename)] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
