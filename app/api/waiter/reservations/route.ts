import { and, asc, eq, gte, lt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { reservationEvents, reservationNotifications, reservations } from "../../../../db/schema";
import { currentWaiter } from "../../../../lib/waiter-auth";
import { validateReservation } from "../../../../lib/reservations";
import { syncReservationToIcloud } from "../../../../lib/icloud-caldav";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const employee = await currentWaiter(request); if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });
  const db = getDb(); const now = new Date(); const to = new Date(now.getTime() + 90 * 24 * 3_600_000); const start = new Date(now.getTime() - 6 * 3_600_000);
  const rows = await db.select().from(reservations).where(and(eq(reservations.status, "BOOKED"), gte(reservations.startsAt, start), lt(reservations.startsAt, to))).orderBy(asc(reservations.startsAt));
  const notifications = rows.length ? await db.select().from(reservationNotifications).where(eq(reservationNotifications.employeeDotykackaId, employee.dotykackaId)) : [];
  const notified = new Set(notifications.filter((item) => item.twoHourNotifiedAt).map((item) => item.reservationId)); const inTwoHours = new Date(now.getTime() + 2 * 3_600_000); const inOneHour = new Date(now.getTime() + 3_600_000);
  const notice = rows.find((item) => item.startsAt >= now && item.startsAt <= inTwoHours && !notified.has(item.id)) ?? null;
  const preparation = rows.find((item) => item.startsAt >= now && item.startsAt <= inOneHour && (!item.tableReadyAt || Boolean(item.specialRequest && !item.specialRequestReadyAt))) ?? null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return Response.json({ employee, reservations: rows, today, notice, preparation });
}

export async function POST(request: Request) {
  const employee = await currentWaiter(request); if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>; const action = typeof body.action === "string" ? body.action : ""; const db = getDb(); const now = new Date();
  try {
    if (action === "CREATE") { const value = validateReservation(body); const [created] = await db.insert(reservations).values({ ...value, source: "APP", addedByDotykackaId: employee.dotykackaId, addedByName: employee.name }).returning(); await db.insert(reservationEvents).values({ reservationId: created.id, action: "CREATED", actorType: "EMPLOYEE", actorId: employee.dotykackaId, actorName: employee.name }); const calendarWarning = await syncReservationToIcloud(created).then(() => null).catch((error) => error instanceof Error ? error.message : "Nie udało się zapisać rezerwacji w iCloud."); return Response.json({ reservation: created, calendarWarning }, { status: 201 }); }
    const id = Number(body.id); if (!Number.isInteger(id) || id < 1) throw new Error("Nieprawidłowa rezerwacja."); const [reservation] = await db.select().from(reservations).where(and(eq(reservations.id, id), eq(reservations.status, "BOOKED"))).limit(1); if (!reservation) throw new Error("Rezerwacja nie jest już aktywna.");
    if (action === "ACK_2H") { await db.insert(reservationNotifications).values({ reservationId: id, employeeDotykackaId: employee.dotykackaId, employeeName: employee.name, twoHourNotifiedAt: now }).onConflictDoUpdate({ target: [reservationNotifications.reservationId, reservationNotifications.employeeDotykackaId], set: { employeeName: employee.name, twoHourNotifiedAt: now, updatedAt: now } }); return Response.json({ ok: true }); }
    if (action === "TABLE_READY") { await db.transaction(async (tx) => { await tx.update(reservations).set({ tableReadyAt: now, tableReadyByDotykackaId: employee.dotykackaId, tableReadyByName: employee.name, updatedAt: now }).where(eq(reservations.id, id)); await tx.insert(reservationEvents).values({ reservationId: id, action: "TABLE_READY", actorType: "EMPLOYEE", actorId: employee.dotykackaId, actorName: employee.name }); }); return Response.json({ ok: true }); }
    if (action === "REQUEST_READY") { if (!reservation.specialRequest) throw new Error("Ta rezerwacja nie ma specjalnego życzenia."); await db.transaction(async (tx) => { await tx.update(reservations).set({ specialRequestReadyAt: now, specialRequestReadyByDotykackaId: employee.dotykackaId, specialRequestReadyByName: employee.name, updatedAt: now }).where(eq(reservations.id, id)); await tx.insert(reservationEvents).values({ reservationId: id, action: "SPECIAL_REQUEST_READY", actorType: "EMPLOYEE", actorId: employee.dotykackaId, actorName: employee.name }); }); return Response.json({ ok: true }); }
    if (action === "CANCEL") { const cancelled = await db.transaction(async (tx) => { const [row] = await tx.update(reservations).set({ status: "CANCELLED", cancelledAt: now, cancelledBy: employee.name, updatedAt: now }).where(eq(reservations.id, id)).returning(); await tx.insert(reservationEvents).values({ reservationId: id, action: "CANCELLED", actorType: "EMPLOYEE", actorId: employee.dotykackaId, actorName: employee.name }); return row; }); const calendarWarning = await syncReservationToIcloud(cancelled).then(() => null).catch((error) => error instanceof Error ? error.message : "Nie udało się usunąć rezerwacji z iCloud."); return Response.json({ ok: true, calendarWarning }); }
    throw new Error("Nieznana operacja.");
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Nie udało się zapisać rezerwacji." }, { status: 400 }); }
}
