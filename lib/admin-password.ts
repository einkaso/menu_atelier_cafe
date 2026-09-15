import "server-only";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export function normalizeAdminUsername(username: string) {
  return username.trim().toLocaleLowerCase("pl-PL");
}

export function validAdminUsername(username: string) {
  return /^[a-z0-9._-]{3,50}$/.test(username);
}

export function validAdminPassword(password: string) {
  return password.length >= 10 && password.length <= 128;
}

export async function hashAdminPassword(password: string) {
  if (!validAdminPassword(password)) throw new Error("Hasło musi mieć od 10 do 128 znaków.");
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyAdminPassword(password: string, stored: string) {
  const [method, saltEncoded, hashEncoded] = stored.split("$");
  if (method !== "scrypt" || !saltEncoded || !hashEncoded || !validAdminPassword(password)) return false;
  try {
    const expected = Buffer.from(hashEncoded, "base64url");
    const received = await scrypt(password, Buffer.from(saltEncoded, "base64url"), expected.length) as Buffer;
    return received.length === expected.length && timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}
