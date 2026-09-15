import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { saveDotykackaConnection } from "../../../../lib/dotykacka/config";

export const dynamic = "force-dynamic";

function matches(left?: string | null, right?: string | null) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function finish(request: Request, result: "connected" | "error") {
  const response = Response.redirect(new URL(`/admin?dotykacka=${result}`, process.env.NEXT_PUBLIC_SITE_URL ?? request.url));
  response.headers.append("Set-Cookie", `mb_dotykacka_state=; Path=/api/dotykacka/callback; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const cloudId = url.searchParams.get("cloudid");
  const state = url.searchParams.get("state");
  const storedState = (await cookies()).get("mb_dotykacka_state")?.value;
  if (!token || !cloudId || !matches(state, storedState)) return finish(request, "error");
  try {
    await saveDotykackaConnection(token, cloudId);
    return finish(request, "connected");
  } catch {
    return finish(request, "error");
  }
}
