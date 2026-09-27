import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export function eventOsAuthorized(request: Request) {
  const configured = process.env.MENU_EVENT_OS_SECRET?.trim() || "";
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  if (configured.length < 32 || !provided) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(configured), digest(provided));
}
