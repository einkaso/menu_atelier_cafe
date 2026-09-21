import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { warsawDateTime } from "./workforce";

function key() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not configured");
  return createHash("sha256").update(`workforce-calendar:${secret}`).digest();
}

export function encryptCalendarUrl(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptCalendarUrl(value: string) {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !encrypted) throw new Error("Nieprawidłowy zapis kalendarza.");
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function safeCalendarUrl(value: string) {
  // WHATWG URL does not allow changing a non-special `webcal:` URL to the
  // special `https:` scheme through `url.protocol = ...`. Normalize the raw
  // value first so links copied directly from Apple Calendar remain usable.
  const url = new URL(value.trim().replace(/^webcal:/i, "https:"));
  if (url.protocol !== "https:") throw new Error("Kalendarz musi używać bezpiecznego adresu HTTPS.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host === "[::1]" || host.endsWith(".local") || host.endsWith(".internal") || /^10\./.test(host) || /^127\./.test(host) || /^169\.254\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^\[(?:fc|fd|fe8|fe9|fea|feb)/i.test(host)) throw new Error("Ten adres kalendarza nie jest dozwolony.");
  return url;
}

function unfold(value: string) { return value.replace(/\r?\n[ \t]/g, ""); }
function clean(value: string) { return value.replace(/\\n/g, "\n").replace(/\\([,;\\])/g, "$1").trim(); }

function parseIcsDate(value: string) {
  const normalized = value.trim();
  if (/^\d{8}$/.test(normalized)) return new Date(`${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}T00:00:00Z`);
  if (/^\d{8}T\d{6}Z$/.test(normalized)) return new Date(`${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}T${normalized.slice(9, 11)}:${normalized.slice(11, 13)}:${normalized.slice(13, 15)}Z`);
  if (/^\d{8}T\d{6}$/.test(normalized)) return warsawDateTime(`${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`, `${normalized.slice(9, 11)}:${normalized.slice(11, 13)}`);
  return new Date(normalized);
}

export type WorkforceCalendarEvent = { uid: string; title: string; description: string; location: string; startsAt: string; endsAt: string | null; allDay: boolean };

export async function calendarEvents(feedUrl: string, from: Date, to: Date) {
  const url = safeCalendarUrl(feedUrl);
  const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000), headers: { accept: "text/calendar,text/plain" } });
  if (!response.ok) throw new Error(`Kalendarz zwrócił błąd ${response.status}.`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 2_000_000) throw new Error("Kalendarz jest zbyt duży.");
  const body = await response.text();
  if (body.length > 2_000_000) throw new Error("Kalendarz jest zbyt duży.");
  const events: WorkforceCalendarEvent[] = [];
  for (const block of unfold(body).split("BEGIN:VEVENT").slice(1)) {
    const content = block.split("END:VEVENT")[0] ?? "";
    const property = (name: string) => content.match(new RegExp(`(?:^|\\n)${name}(?:;[^:]*)?:(.*)`, "i"))?.[1]?.trim() ?? "";
    const startRaw = property("DTSTART");
    if (!startRaw) continue;
    const startsAt = parseIcsDate(startRaw); const endRaw = property("DTEND"); const endsAt = endRaw ? parseIcsDate(endRaw) : null;
    if (Number.isNaN(startsAt.getTime()) || startsAt >= to || (endsAt ?? startsAt) < from) continue;
    events.push({ uid: clean(property("UID")) || `${startsAt.toISOString()}-${events.length}`, title: clean(property("SUMMARY")), description: clean(property("DESCRIPTION")), location: clean(property("LOCATION")), startsAt: startsAt.toISOString(), endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt.toISOString() : null, allDay: /^\d{8}$/.test(startRaw) });
  }
  return events.sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 100);
}
