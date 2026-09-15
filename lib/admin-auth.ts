import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "../db";
import { adminUsers, waiterEmployees } from "../db/schema";

const COOKIE_NAME = "mb_menu_admin";
const SESSION_SECONDS = 60 * 60 * 12;

function secret() {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value) throw new Error("ADMIN_SESSION_SECRET is not configured");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export type AdminIdentity = {
  username: string;
  kind: "ENV" | "DATABASE";
  employeeDotykackaId: string | null;
  employeeName: string | null;
};

type AdminTokenPayload = { username?: string; kind?: "ENV" | "DATABASE"; expires?: number };

export function createAdminToken(username: string, kind: AdminIdentity["kind"] = "ENV") {
  const payload = Buffer.from(JSON.stringify({ username, kind, expires: Date.now() + SESSION_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyAdminToken(token?: string) {
  if (!token) return null;
  const [payload, received] = token.split(".");
  if (!payload || !received) return null;
  const expected = signature(payload);
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as AdminTokenPayload;
    if (!parsed.username || Number(parsed.expires) <= Date.now()) return null;
    // Tokens created before database administrators existed did not contain `kind`.
    return { username: parsed.username, kind: parsed.kind ?? "ENV" };
  } catch {
    return null;
  }
}

export async function currentAdmin(): Promise<AdminIdentity | null> {
  if (!process.env.ADMIN_SESSION_SECRET) return null;
  const store = await cookies();
  const token = verifyAdminToken(store.get(COOKIE_NAME)?.value);
  if (!token) return null;
  if (token.kind === "ENV") {
    if (token.username !== (process.env.ADMIN_USERNAME ?? "admin")) return null;
    return { username: token.username, kind: "ENV", employeeDotykackaId: null, employeeName: null };
  }
  const [administrator] = await getDb().select({
    username: adminUsers.username,
    employeeDotykackaId: adminUsers.employeeDotykackaId,
    employeeName: waiterEmployees.name,
  }).from(adminUsers).innerJoin(waiterEmployees, eq(adminUsers.employeeDotykackaId, waiterEmployees.dotykackaId)).where(and(
    eq(adminUsers.username, token.username),
    eq(adminUsers.enabled, true),
    eq(waiterEmployees.enabled, true),
    eq(waiterEmployees.deleted, false),
  )).limit(1);
  return administrator ? { ...administrator, kind: "DATABASE" } : null;
}

export async function isAdmin() {
  return Boolean(await currentAdmin());
}

export const adminCookie = { name: COOKIE_NAME, maxAge: SESSION_SECONDS };

export function constantTimeMatch(received: string, expected: string) {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
