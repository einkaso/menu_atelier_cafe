import { createHmac, timingSafeEqual } from "node:crypto";
import { validDate, validTime, warsawDateTime } from "./workforce";

function secret() {
  const value = process.env.WORKFORCE_QR_SECRET ?? process.env.ADMIN_SESSION_SECRET;
  if (!value) throw new Error("ADMIN_SESSION_SECRET is not configured");
  return value;
}
export function reservationCalendarToken() { return createHmac("sha256", `reservation-calendar:${secret()}`).update("main").digest("base64url"); }
export function validReservationCalendarToken(token: string) { const expected = reservationCalendarToken(); const left = Buffer.from(token); const right = Buffer.from(expected); return left.length === right.length && timingSafeEqual(left, right); }

export function validateReservation(body: Record<string, unknown>, allowIncomplete = false) {
  const guestName = (typeof body.guestName === "string" ? body.guestName.trim().slice(0, 160) : "") || null;
  const guestContact = (typeof body.guestContact === "string" ? body.guestContact.trim().slice(0, 240) : "") || null;
  const location = (typeof body.location === "string" ? body.location.trim().slice(0, 240) : "") || null;
  const specialRequest = typeof body.specialRequest === "string" ? body.specialRequest.trim().slice(0, 2000) || null : null;
  const partySize = body.partySize === "" || body.partySize === null || body.partySize === undefined ? null : Number(body.partySize); const date = body.date; const from = body.from; const to = body.to;
  if (!allowIncomplete && (!guestName || !guestContact || !location)) throw new Error("Uzupełnij imię gościa, kontakt i miejsce rezerwacji.");
  if (!allowIncomplete && partySize === null) throw new Error("Uzupełnij liczbę gości.");
  if (partySize !== null && (!Number.isInteger(partySize) || partySize < 1 || partySize > 200)) throw new Error("Liczba gości musi mieścić się od 1 do 200.");
  if (!validDate(date) || !validTime(from) || !validTime(to)) throw new Error("Wybierz prawidłowy termin rezerwacji.");
  const startsAt = warsawDateTime(date, from); let endsAt = warsawDateTime(date, to); if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
  if ((endsAt.getTime() - startsAt.getTime()) / 3_600_000 > 12) throw new Error("Rezerwacja nie może trwać dłużej niż 12 godzin.");
  return { guestName, guestContact, location, specialRequest, partySize, startsAt, endsAt };
}

function esc(value: string) { return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
function dt(value: Date) { return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }
export function reservationsIcs(rows: Array<{ id: number; externalUid?: string | null; guestName: string | null; guestContact: string | null; partySize: number | null; startsAt: Date; endsAt: Date; location: string | null; specialRequest: string | null; updatedAt: Date }>) {
  const lastModified = rows.reduce((latest, item) => item.updatedAt > latest ? item.updatedAt : latest, new Date(0));
  const output = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Atelier Cafe//Rezerwacje//PL", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Rezerwacje Atelier Café", "X-WR-TIMEZONE:Europe/Warsaw", "REFRESH-INTERVAL;VALUE=DURATION:PT5M", "X-PUBLISHED-TTL:PT5M", `LAST-MODIFIED:${dt(lastModified)}`];
  for (const item of rows) { const description = [item.guestContact ? `Kontakt: ${item.guestContact}` : "", item.specialRequest ? `Życzenie: ${item.specialRequest}` : ""].filter(Boolean).join("\n"); const summary = ["Rezerwacja", item.guestName, item.partySize === null ? null : `${item.partySize} os.`].filter(Boolean).join(" · "); const event = ["BEGIN:VEVENT", `UID:${esc(item.externalUid || `atelier-reservation-${item.id}@atelier-cafe`)}`, `DTSTAMP:${dt(item.updatedAt)}`, `LAST-MODIFIED:${dt(item.updatedAt)}`, `SEQUENCE:${Math.floor(item.updatedAt.getTime() / 1000)}`, `DTSTART:${dt(item.startsAt)}`, `DTEND:${dt(item.endsAt)}`, "STATUS:CONFIRMED", "TRANSP:OPAQUE", `SUMMARY:${esc(summary)}`]; if (item.location) event.push(`LOCATION:${esc(item.location)}`); if (description) event.push(`DESCRIPTION:${esc(description)}`); output.push(...event, "END:VEVENT"); }
  output.push("END:VCALENDAR"); return `${output.join("\r\n")}\r\n`;
}

export function importedReservation(event: { uid: string; title: string; description: string; location: string; startsAt: string; endsAt: string | null }) {
  const combined = `${event.title}\n${event.description}`; const sizeMatch = combined.match(/(?:^|\D)(\d{1,3})\s*(?:os\.?|osób|persons?)/i)?.[1]; const size = sizeMatch ? Number(sizeMatch) : null;
  const phone = combined.match(/(?:\+?48[\s-]?)?(?:\d[\s-]?){9}/)?.[0]?.trim(); const email = combined.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0];
  const guestName = event.title.replace(/^\s*rezerwacj[ae]\s*[-:·]?\s*/i, "").replace(/\s*[·-]\s*\d+\s*(?:os\.?|osób).*$/i, "").trim() || null;
  const startsAt = new Date(event.startsAt); const endsAt = event.endsAt ? new Date(event.endsAt) : new Date(startsAt.getTime() + 2 * 3_600_000);
  const appEvent = /^atelier-reservation-\d+@atelier-cafe$/i.test(event.uid); const description = event.description.trim(); const specialRequest = appEvent ? description.split("\n").map((line) => line.trim()).filter((line) => line && !/^Kontakt\s*:/i.test(line)).map((line) => line.replace(/^Życzenie\s*:\s*/i, "")).join("\n") || null : description || null;
  return { externalUid: event.uid, source: "ICAL", guestName, guestContact: phone || email || null, partySize: size !== null && size >= 1 && size <= 200 ? size : null, startsAt, endsAt, location: event.location.trim() || null, specialRequest, addedByName: "Import z kalendarza" };
}
