import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  let version = process.env.NEXT_PUBLIC_APP_BUILD_VERSION ?? "development";

  if (version === "development") {
    try {
      version = (await readFile(path.join(process.cwd(), "RELEASE"), "utf8")).trim();
    } catch {
      try {
        version = (await readFile(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8")).trim();
      } catch {
        // Keep a harmless fallback in development or an incomplete package.
      }
    }
  }

  return Response.json(
    { version },
    { headers: { "cache-control": "no-store, no-cache, must-revalidate" } },
  );
}
