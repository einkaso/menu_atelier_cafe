import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "mb_workforce_kiosk"; const MAX_AGE = 180 * 24 * 60 * 60;
function secret() { const value = process.env.WORKFORCE_QR_SECRET ?? process.env.ADMIN_SESSION_SECRET; if (!value) throw new Error("WORKFORCE_QR_SECRET is not configured"); return value; }
function signature(payload: string) { return createHmac("sha256", `kiosk:${secret()}`).update(payload).digest("base64url"); }
export function createKioskToken(name = "Tablet wejściowy") { const payload = Buffer.from(JSON.stringify({ name, expires: Date.now() + MAX_AGE * 1000, nonce: randomBytes(16).toString("base64url") })).toString("base64url"); return `${payload}.${signature(payload)}`; }
export function verifyKioskToken(token?: string) { if (!token) return null; const [payload, received] = token.split("."); if (!payload || !received) return null; const expected = signature(payload); const left = Buffer.from(received); const right = Buffer.from(expected); if (left.length !== right.length || !timingSafeEqual(left, right)) return null; try { const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as { name?: string; expires?: number }; return parsed.name && Number(parsed.expires) > Date.now() ? { name: parsed.name } : null; } catch { return null; } }
export async function currentWorkforceKiosk() { const store = await cookies(); return verifyKioskToken(store.get(COOKIE_NAME)?.value); }
export const workforceKioskCookie = { name: COOKIE_NAME, maxAge: MAX_AGE };
