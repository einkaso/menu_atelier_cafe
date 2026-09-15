import "server-only";
import { eq } from "drizzle-orm";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getDb } from "../../db";
import { dotykackaConnections } from "../../db/schema";
import type { DotykackaConfig } from "./types";

const PROVIDER = "dotykacka";

function encryptionKey() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not configured");
  return createHash("sha256").update(secret).digest();
}

export function encryptDotykackaToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptDotykackaToken(value: string) {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !encrypted) throw new Error("Stored Dotykačka token is invalid");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export async function getStoredDotykackaConnection() {
  const [row] = await getDb().select().from(dotykackaConnections).where(eq(dotykackaConnections.provider, PROVIDER)).limit(1);
  return row ?? null;
}

export async function saveDotykackaConnection(refreshToken: string, cloudId: string) {
  const [row] = await getDb().insert(dotykackaConnections).values({
    provider: PROVIDER,
    refreshTokenEncrypted: encryptDotykackaToken(refreshToken),
    cloudId,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: dotykackaConnections.provider,
    set: { refreshTokenEncrypted: encryptDotykackaToken(refreshToken), cloudId, warehouseId: null, branchId: null, connectedAt: new Date(), updatedAt: new Date() },
  }).returning();
  return row;
}

export async function saveDotykackaSelection(warehouseId?: string | null, branchId?: string | null) {
  const [row] = await getDb().update(dotykackaConnections).set({
    warehouseId: warehouseId || null,
    branchId: branchId || null,
    updatedAt: new Date(),
  }).where(eq(dotykackaConnections.provider, PROVIDER)).returning();
  if (!row) throw new Error("Najpierw połącz aplikację z Dotykačką.");
  return row;
}

export async function getDotykackaConfig(): Promise<DotykackaConfig> {
  const stored = await getStoredDotykackaConnection();
  const refreshToken = stored ? decryptDotykackaToken(stored.refreshTokenEncrypted) : process.env.DOTYKACKA_REFRESH_TOKEN;
  const cloudId = stored?.cloudId ?? process.env.DOTYKACKA_CLOUD_ID;
  if (!refreshToken || !cloudId) {
    throw new Error("DOTYKACKA_REFRESH_TOKEN and DOTYKACKA_CLOUD_ID must be configured");
  }
  const timeoutSeconds = Number(process.env.DOTYKACKA_HTTP_TIMEOUT ?? 15);
  return {
    apiUrl: (process.env.DOTYKACKA_API_URL ?? "https://api.dotykacka.cz/v2").replace(/\/$/, ""),
    refreshToken,
    cloudId,
    warehouseId: stored?.warehouseId ?? (process.env.DOTYKACKA_WAREHOUSE_ID || undefined),
    branchId: stored?.branchId ?? (process.env.DOTYKACKA_BRANCH_ID || undefined),
    menuTag: (process.env.DOTYKACKA_MENU_TAG ?? "menu").trim().toLocaleLowerCase("pl"),
    timeoutMs: Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? timeoutSeconds * 1000 : 15000,
  };
}
