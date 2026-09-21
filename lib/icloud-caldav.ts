import "server-only";
import { and, eq, gte } from "drizzle-orm";
import { getDb } from "../db";
import { reservationCalendarSettings, reservations } from "../db/schema";
import { decryptCalendarUrl, encryptCalendarUrl, parseCalendarEvents } from "./workforce-calendar";
import { reservationsIcs } from "./reservations";
import { caldavRequest, discoverIcloudCalendar, findIcloudEventUrl, readIcloudCalendarData } from "./caldav-client";

type Reservation = typeof reservations.$inferSelect;

export async function saveIcloudConnection(input: { username: string; password: string; calendarName: string; updatedBy: string }) {
  const connection = await discoverIcloudCalendar(input.username, input.password, input.calendarName);
  const now = new Date();
  await getDb().insert(reservationCalendarSettings).values({
    key: "main",
    caldavUsernameEncrypted: encryptCalendarUrl(connection.username),
    caldavPasswordEncrypted: encryptCalendarUrl(connection.password),
    caldavCalendarUrlEncrypted: encryptCalendarUrl(connection.calendarUrl),
    caldavCalendarName: connection.calendarName,
    caldavConnectedAt: now,
    updatedBy: input.updatedBy,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: reservationCalendarSettings.key,
    set: {
      caldavUsernameEncrypted: encryptCalendarUrl(connection.username),
      caldavPasswordEncrypted: encryptCalendarUrl(connection.password),
      caldavCalendarUrlEncrypted: encryptCalendarUrl(connection.calendarUrl),
      caldavCalendarName: connection.calendarName,
      caldavConnectedAt: now,
      updatedBy: input.updatedBy,
      updatedAt: now,
    },
  });
  return { calendarName: connection.calendarName };
}

async function storedConnection() {
  const [setting] = await getDb().select().from(reservationCalendarSettings).where(eq(reservationCalendarSettings.key, "main")).limit(1);
  if (!setting?.caldavUsernameEncrypted || !setting.caldavPasswordEncrypted || !setting.caldavCalendarUrlEncrypted) return null;
  return {
    credentials: { username: decryptCalendarUrl(setting.caldavUsernameEncrypted), password: decryptCalendarUrl(setting.caldavPasswordEncrypted) },
    calendarUrl: decryptCalendarUrl(setting.caldavCalendarUrlEncrypted),
  };
}

function eventUrl(calendarUrl: string, id: number) {
  const base = calendarUrl.endsWith("/") ? calendarUrl : `${calendarUrl}/`;
  return new URL(`atelier-reservation-${id}.ics`, base).toString();
}

export async function syncReservationToIcloud(reservation: Reservation) {
  const connection = await storedConnection();
  if (!connection) throw new Error("Zapis do wspólnego kalendarza iCloud nie jest jeszcze połączony.");
  const uid = reservation.externalUid || `atelier-reservation-${reservation.id}@atelier-cafe`;
  const url = reservation.externalUid ? await findIcloudEventUrl(connection.calendarUrl, connection.credentials, uid) : eventUrl(connection.calendarUrl, reservation.id);
  if (!url) throw new Error("Nie odnaleziono odpowiadającego wydarzenia w iCloud.");
  if (reservation.status !== "BOOKED") {
    const response = await caldavRequest(url, connection.credentials, { method: "DELETE" });
    if (response.status !== 404 && !response.ok) throw new Error(`iCloud nie usunął rezerwacji (błąd ${response.status}).`);
    await getDb().update(reservations).set({ calendarSyncedAt: new Date() }).where(eq(reservations.id, reservation.id));
    return { status: "deleted" as const };
  }
  const response = await caldavRequest(url, connection.credentials, {
    method: "PUT",
    headers: { "content-type": "text/calendar; charset=utf-8" },
    body: reservationsIcs([reservation]),
  });
  if (!response.ok) throw new Error(`iCloud nie zapisał rezerwacji (błąd ${response.status}).`);
  await getDb().update(reservations).set({ calendarSyncedAt: new Date() }).where(eq(reservations.id, reservation.id));
  return { status: "saved" as const };
}

export async function readIcloudReservationEvents(from: Date, to: Date) {
  const connection = await storedConnection();
  if (!connection) return null;
  const chunks = await readIcloudCalendarData(connection.calendarUrl, connection.credentials, from, to);
  return parseCalendarEvents(chunks.join("\n"), from, to, 2_000);
}

export async function syncAppReservationsToIcloud() {
  const connection = await storedConnection();
  if (!connection) return { connected: false, exported: 0, failed: 0 };
  const rows = await getDb().select().from(reservations).where(and(eq(reservations.source, "APP"), gte(reservations.endsAt, new Date(Date.now() - 30 * 24 * 3_600_000))));
  let exported = 0; let failed = 0;
  for (const reservation of rows) {
    if (reservation.calendarSyncedAt && reservation.updatedAt <= reservation.calendarSyncedAt) continue;
    try { await syncReservationToIcloud(reservation); exported += 1; } catch { failed += 1; }
  }
  return { connected: true, exported, failed };
}
