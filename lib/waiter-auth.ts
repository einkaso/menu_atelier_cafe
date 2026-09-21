import "server-only";
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "../db";
import { waiterEmployees } from "../db/schema";

const COOKIE_NAME = "mb_waiter_session";
const SESSION_SECONDS = 10 * 60;
const scrypt = promisify(scryptCallback);

function secret() {
  const value = process.env.WAITER_SESSION_SECRET ?? process.env.ADMIN_SESSION_SECRET;
  if (!value) throw new Error("WAITER_SESSION_SECRET is not configured");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function validWaiterPin(pin: string) {
  return /^\d{4,8}$/.test(pin);
}

export async function hashWaiterPin(pin: string) {
  if (!validWaiterPin(pin)) throw new Error("PIN musi mieć od 4 do 8 cyfr.");
  const salt = randomBytes(16);
  const derived = await scrypt(pin, salt, 32) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyWaiterPin(pin: string, stored: string) {
  const [method, saltEncoded, hashEncoded] = stored.split("$");
  if (method !== "scrypt" || !saltEncoded || !hashEncoded || !validWaiterPin(pin)) return false;
  try {
    const expected = Buffer.from(hashEncoded, "base64url");
    const received = await scrypt(pin, Buffer.from(saltEncoded, "base64url"), expected.length) as Buffer;
    return received.length === expected.length && timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}

export function createWaiterToken(employeeDotykackaId: string) {
  const payload = Buffer.from(JSON.stringify({
    employeeDotykackaId,
    expires: Date.now() + SESSION_SECONDS * 1000,
    nonce: randomBytes(12).toString("base64url"),
  })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

function parseWaiterToken(token?: string) {
  if (!token) return null;
  const [payload, received] = token.split(".");
  if (!payload || !received) return null;
  const expected = signature(payload);
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as { employeeDotykackaId?: string; expires?: number };
    if (!parsed.employeeDotykackaId || Number(parsed.expires) <= Date.now()) return null;
    return parsed.employeeDotykackaId;
  } catch {
    return null;
  }
}

function bearerToken(request?: Request) {
  const authorization = request?.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  return match?.[1];
}

export async function currentWaiter(request?: Request) {
  if (!process.env.WAITER_SESSION_SECRET && !process.env.ADMIN_SESSION_SECRET) return null;
  const store = await cookies();
  const dotykackaId = parseWaiterToken(bearerToken(request) ?? store.get(COOKIE_NAME)?.value);
  if (!dotykackaId) return null;
  const [employee] = await getDb().select({
    dotykackaId: waiterEmployees.dotykackaId,
    name: waiterEmployees.name,
    canManageMenuVisibility: waiterEmployees.canManageMenuVisibility,
    includeInSchedule: waiterEmployees.includeInSchedule,
  }).from(waiterEmployees).where(and(
    eq(waiterEmployees.dotykackaId, dotykackaId),
    eq(waiterEmployees.enabled, true),
    eq(waiterEmployees.deleted, false),
  )).limit(1);
  return employee ?? null;
}

export const waiterCookie = { name: COOKIE_NAME, maxAge: SESSION_SECONDS };
