import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";

function releaseBuildVersion() {
  try {
    const release = readFileSync(path.join(process.cwd(), "RELEASE"), "utf8").trim();
    return release || "menu-development";
  } catch {
    return "menu-development";
  }
}

// Next.js can evaluate the config in more than one build process. A timestamp
// generated here can differ between browser chunks and API routes, causing the
// PWA updater to reload forever. RELEASE is stable for the entire build.
const appBuildVersion = process.env.NEXT_PUBLIC_APP_BUILD_VERSION ?? releaseBuildVersion();

const nextConfig: NextConfig = {
  serverExternalPackages: ["heic-decode", "libheif-js"],
  env: {
    NEXT_PUBLIC_APP_BUILD_VERSION: appBuildVersion,
  },
  async headers() {
    return [
      {
        source: "/",
        headers: [{ key: "Cache-Control", value: "private, no-cache, no-store, max-age=0, must-revalidate" }],
      },
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, max-age=0, must-revalidate" }],
      },
      {
        source: "/admin/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-cache, no-store, max-age=0, must-revalidate" }],
      },
      {
        source: "/kelner/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-cache, no-store, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
