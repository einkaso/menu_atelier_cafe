import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "mb_guest_receipt";
const SESSION_SECONDS = 30 * 60;

type GuestReceiptSession = { orderId: string; documentNumber: string; tableId: string | null; presentedBy: string; expires: number };

function secret() {
  const value = process.env.WAITER_SESSION_SECRET ?? process.env.ADMIN_SESSION_SECRET;
  if (!value) throw new Error("WAITER_SESSION_SECRET is not configured");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(`guest-receipt:${payload}`).digest("base64url");
}

export function createGuestReceiptToken(receipt: { orderId: string; documentNumber: string; tableId: string | null }, presentedBy: string) {
  const payload = Buffer.from(JSON.stringify({ ...receipt, presentedBy, expires: Date.now() + SESSION_SECONDS * 1000, nonce: randomBytes(12).toString("base64url") })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

function parseGuestReceiptToken(token?: string): GuestReceiptSession | null {
  if (!token) return null;
  const [payload, received] = token.split(".");
  if (!payload || !received) return null;
  const expected = signature(payload);
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as Partial<GuestReceiptSession>;
    if (!parsed.orderId || !/^\d+$/.test(parsed.orderId) || !parsed.documentNumber || !parsed.presentedBy || Number(parsed.expires) <= Date.now()) return null;
    return parsed as GuestReceiptSession;
  } catch {
    return null;
  }
}

export async function currentGuestReceipt() {
  if (!process.env.WAITER_SESSION_SECRET && !process.env.ADMIN_SESSION_SECRET) return null;
  const store = await cookies();
  return parseGuestReceiptToken(store.get(COOKIE_NAME)?.value);
}

export const guestReceiptCookie = { name: COOKIE_NAME, maxAge: SESSION_SECONDS };

export function requestUsesHttps(request: Request) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProtocol) return forwardedProtocol === "https";
  return new URL(request.url).protocol === "https:";
}

export function httpOnlyCookie(name: string, value: string, maxAge: number, secure = process.env.NODE_ENV === "production") {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
