import { and, asc, eq, gte, lt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { reservationCalendarSettings, reservationEvents, reservations } from "../../../../db/schema";
import { currentAdmin } from "../../../../lib/admin-auth";
import { encryptCalendarUrl } from "../../../../lib/workforce-calendar";
import { reservationCalendarToken, validateReservation } from "../../../../lib/reservations";
import { syncReservationCalendar } from "../../../../lib/reservation-calendar-sync";
import { saveIcloudConnection, syncAppReservationsToIcloud, syncReservationToIcloud } from "../../../../lib/icloud-caldav";

export const dynamic = "force-dynamic";
const range = () => ({ from: new Date(Date.now() - 24 * 3_600_000), to: new Date(Date.now() + 180 * 24 * 3_600_000) });

export async function GET(request: Request) {
  if (!await currentAdmin()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb(); const { from, to } = range();
  const [rows, setting] = await Promise.all([db.select().from(reservations).where(and(gte(reservations.startsAt, from), lt(reservations.startsAt, to))).orderBy(asc(reservations.startsAt)), db.select().from(reservationCalendarSettings).where(eq(reservationCalendarSettings.key, "main")).limit(1).then((items) => items[0] ?? null)]);
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
  return Response.json({ reservations: rows, calendar: { connected: Boolean(setting?.importIcalUrlEncrypted), name: setting?.name ?? "Rezerwacje Atelier Café", subscriptionUrl: `${origin}/api/reservations/calendar/${reservationCalendarToken()}`, writeBackConnected: Boolean(setting?.caldavCalendarUrlEncrypted), writeCalendarName: setting?.caldavCalendarName ?? "Rezerwacje stoliki CAFE" } });
}

export async function POST(request: Request) {
  const admin = await currentAdmin(); if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>; const action = typeof body.action === "string" ? body.action : ""; const db = getDb(); const now = new Date();
  try {
    if (action === "SAVE_CALENDAR") { const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) || "Rezerwacje Atelier Café" : "Rezerwacje Atelier Café"; const url = typeof body.url === "string" ? body.url.trim() : ""; if (url) new URL(url); const [existing] = await db.select().from(reservationCalendarSettings).where(eq(reservationCalendarSettings.key, "main")).limit(1); const encrypted = url ? encryptCalendarUrl(url) : existing?.importIcalUrlEncrypted ?? null; await db.insert(reservationCalendarSettings).values({ key: "main", name, importIcalUrlEncrypted: encrypted, updatedBy: admin.username, updatedAt: now }).onConflictDoUpdate({ target: reservationCalendarSettings.key, set: { name, importIcalUrlEncrypted: encrypted, updatedBy: admin.username, updatedAt: now } }); return Response.json({ ok: true }); }
    if (action === "CONNECT_ICLOUD") { const username = typeof body.username === "string" ? body.username.trim() : ""; const password = typeof body.password === "string" ? body.password.trim() : ""; const calendarName = typeof body.calendarName === "string" ? body.calendarName.trim() : ""; const connection = await saveIcloudConnection({ username, password, calendarName, updatedBy: admin.username }); const writeBack = await syncAppReservationsToIcloud(); return Response.json({ ok: true, calendarName: connection.calendarName, exported: writeBack.exported, failed: writeBack.failed }); }
    if (action === "SYNC_CALENDAR") { const result = await syncReservationCalendar(); if (result.status === "not-connected") throw new Error("Najpierw połącz kalendarz rezerwacji."); return Response.json({ ok: true, imported: result.imported, removed: result.removed }); }
    if (action === "CREATE") { const value = validateReservation(body); const [created] = await db.insert(reservations).values({ ...value, source: "APP", addedByDotykackaId: admin.employeeDotykackaId, addedByName: admin.employeeName || admin.username }).returning(); await db.insert(reservationEvents).values({ reservationId: created.id, action: "CREATED", actorType: "ADMIN", actorId: admin.username, actorName: admin.employeeName || admin.username }); const calendarWarning = await syncReservationToIcloud(created).then(() => null).catch((error) => error instanceof Error ? error.message : "Nie udało się zapisać rezerwacji w iCloud."); return Response.json({ reservation: created, calendarWarning }, { status: 201 }); }
    const id = Number(body.id); if (!Number.isInteger(id) || id < 1) throw new Error("Nieprawidłowa rezerwacja."); const [current] = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1); if (!current) throw new Error("Rezerwacja nie istnieje.");
    if (action === "UPDATE") { const value = validateReservation(body, true); const updated = await db.transaction(async (tx) => { const [row] = await tx.update(reservations).set({ ...value, tableReadyAt: null, tableReadyByDotykackaId: null, tableReadyByName: null, specialRequestReadyAt: null, specialRequestReadyByDotykackaId: null, specialRequestReadyByName: null, updatedAt: now }).where(eq(reservations.id, id)).returning(); await tx.insert(reservationEvents).values({ reservationId: id, action: "UPDATED", actorType: "ADMIN", actorId: admin.username, actorName: admin.employeeName || admin.username }); return row; }); const calendarWarning = await syncReservationToIcloud(updated).then(() => null).catch((error) => error instanceof Error ? error.message : "Nie udało się zaktualizować rezerwacji w iCloud."); return Response.json({ ok: true, calendarWarning }); }
    if (action === "CANCEL") { const cancelled = await db.transaction(async (tx) => { const [row] = await tx.update(reservations).set({ status: "CANCELLED", cancelledAt: now, cancelledBy: admin.username, updatedAt: now }).where(eq(reservations.id, id)).returning(); await tx.insert(reservationEvents).values({ reservationId: id, action: "CANCELLED", actorType: "ADMIN", actorId: admin.username, actorName: admin.employeeName || admin.username }); return row; }); const calendarWarning = await syncReservationToIcloud(cancelled).then(() => null).catch((error) => error instanceof Error ? error.message : "Nie udało się usunąć rezerwacji z iCloud."); return Response.json({ ok: true, calendarWarning }); }
    throw new Error("Nieznana operacja.");
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Nie udało się zapisać rezerwacji." }, { status: 400 }); }
}
