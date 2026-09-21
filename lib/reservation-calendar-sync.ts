import "server-only";
import { and, eq, gte, isNotNull, lt } from "drizzle-orm";
import { getDb } from "../db";
import { reservationCalendarSettings, reservationEvents, reservations } from "../db/schema";
import { calendarEvents, decryptCalendarUrl } from "./workforce-calendar";
import { importedReservation } from "./reservations";
import { readIcloudReservationEvents, syncAppReservationsToIcloud } from "./icloud-caldav";

const importRange = () => ({
  from: new Date(Date.now() - 24 * 3_600_000),
  to: new Date(Date.now() + 180 * 24 * 3_600_000),
});

export async function syncReservationCalendar() {
  const db = getDb();
  const [setting] = await db.select().from(reservationCalendarSettings)
    .where(eq(reservationCalendarSettings.key, "main")).limit(1);
  const caldavConnected = Boolean(setting?.caldavUsernameEncrypted && setting.caldavPasswordEncrypted && setting.caldavCalendarUrlEncrypted);
  if (!setting?.importIcalUrlEncrypted && !caldavConnected) return { status: "not-connected" as const, imported: 0 };

  const { from, to } = importRange();
  const caldavEvents = caldavConnected ? await readIcloudReservationEvents(from, to) : null;
  const events = caldavEvents ?? await calendarEvents(decryptCalendarUrl(setting!.importIcalUrlEncrypted!), from, to);
  const now = new Date();
  const remoteUids = new Set(events.map((event) => event.uid));
  for (const event of events) {
    const value = importedReservation(event);
    const appEvent = event.uid.match(/^atelier-reservation-(\d+)@atelier-cafe$/i);
    if (appEvent) {
      await db.update(reservations).set({
        guestName: value.guestName,
        guestContact: value.guestContact,
        partySize: value.partySize,
        startsAt: value.startsAt,
        endsAt: value.endsAt,
        location: value.location,
        specialRequest: value.specialRequest,
        calendarSyncedAt: now,
        updatedAt: now,
      }).where(and(eq(reservations.id, Number(appEvent[1])), eq(reservations.source, "APP")));
      continue;
    }
    await db.insert(reservations).values({ ...value, calendarSyncedAt: now }).onConflictDoUpdate({
      target: reservations.externalUid,
      set: {
        guestName: value.guestName,
        guestContact: value.guestContact,
        partySize: value.partySize,
        startsAt: value.startsAt,
        endsAt: value.endsAt,
        location: value.location,
        specialRequest: value.specialRequest,
        calendarSyncedAt: now,
        updatedAt: now,
      },
    });
  }
  let removed = 0;
  if (caldavEvents) {
    const syncedAppReservations = await db.select().from(reservations).where(and(
      eq(reservations.source, "APP"),
      eq(reservations.status, "BOOKED"),
      isNotNull(reservations.calendarSyncedAt),
      gte(reservations.endsAt, from),
      lt(reservations.startsAt, to),
    ));
    for (const reservation of syncedAppReservations) {
      const uid = `atelier-reservation-${reservation.id}@atelier-cafe`;
      if (remoteUids.has(uid)) continue;
      await db.transaction(async (tx) => {
        await tx.update(reservations).set({ status: "CANCELLED", cancelledAt: now, cancelledBy: "Usunięto w kalendarzu iCloud", calendarSyncedAt: now, updatedAt: now }).where(and(eq(reservations.id, reservation.id), eq(reservations.status, "BOOKED")));
        await tx.insert(reservationEvents).values({ reservationId: reservation.id, action: "CANCELLED_REMOTE", actorType: "CALENDAR", actorId: "icloud", actorName: "Kalendarz iCloud", details: { reason: "Wydarzenie usunięte z kalendarza" } });
      });
      removed += 1;
    }
  }
  const writeBack = await syncAppReservationsToIcloud().catch((error) => ({
    connected: true,
    exported: 0,
    failed: 1,
    error: error instanceof Error ? error.message : "Nie udało się zapisać rezerwacji do iCloud.",
  }));
  return { status: "ok" as const, imported: events.length, removed, writeBack };
}
