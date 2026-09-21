import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { reservationCalendarSettings, reservations } from "../db/schema";
import { calendarEvents, decryptCalendarUrl } from "./workforce-calendar";
import { importedReservation } from "./reservations";
import { syncAppReservationsToIcloud } from "./icloud-caldav";

const importRange = () => ({
  from: new Date(Date.now() - 24 * 3_600_000),
  to: new Date(Date.now() + 180 * 24 * 3_600_000),
});

export async function syncReservationCalendar() {
  const db = getDb();
  const [setting] = await db.select().from(reservationCalendarSettings)
    .where(eq(reservationCalendarSettings.key, "main")).limit(1);
  if (!setting?.importIcalUrlEncrypted) return { status: "not-connected" as const, imported: 0 };

  const { from, to } = importRange();
  const events = await calendarEvents(decryptCalendarUrl(setting.importIcalUrlEncrypted), from, to);
  const now = new Date();
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
        updatedAt: now,
      }).where(and(eq(reservations.id, Number(appEvent[1])), eq(reservations.source, "APP")));
      continue;
    }
    await db.insert(reservations).values(value).onConflictDoUpdate({
      target: reservations.externalUid,
      set: {
        guestName: value.guestName,
        guestContact: value.guestContact,
        partySize: value.partySize,
        startsAt: value.startsAt,
        endsAt: value.endsAt,
        location: value.location,
        specialRequest: value.specialRequest,
        updatedAt: now,
      },
    });
  }
  const writeBack = await syncAppReservationsToIcloud().catch((error) => ({
    connected: true,
    exported: 0,
    failed: 1,
    error: error instanceof Error ? error.message : "Nie udało się zapisać rezerwacji do iCloud.",
  }));
  return { status: "ok" as const, imported: events.length, writeBack };
}
