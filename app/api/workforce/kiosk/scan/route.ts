import { and, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { waiterEmployees, workSchedules, workShifts, workTimeEntries, workTimeEvents } from "../../../../../db/schema";
import { currentAdmin } from "../../../../../lib/admin-auth";
import { workedMinutes } from "../../../../../lib/workforce";
import { parseEmployeeQrPayload } from "../../../../../lib/workforce-secrets";
import { currentWorkforceKiosk } from "../../../../../lib/workforce-kiosk-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const [administrator, kiosk] = await Promise.all([currentAdmin(), currentWorkforceKiosk()]);
  if (!administrator && !kiosk) return Response.json({ error: "Tablet ewidencji nie został aktywowany przez administratora." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { payload?: unknown; kioskName?: unknown };
  const payload = typeof body.payload === "string" ? parseEmployeeQrPayload(body.payload) : null;
  if (!payload) return Response.json({ error: "To nie jest prawidłowy kod pracownika Atelier Café." }, { status: 400 });
  const db = getDb(); const now = new Date();
  const [employee] = await db.select({ dotykackaId: waiterEmployees.dotykackaId, name: waiterEmployees.name, barcode: waiterEmployees.barcode }).from(waiterEmployees).where(and(eq(waiterEmployees.dotykackaId, payload.employeeDotykackaId), eq(waiterEmployees.enabled, true), eq(waiterEmployees.deleted, false))).limit(1);
  if (!employee || !employee.barcode || employee.barcode !== payload.barcode) return Response.json({ error: "Kod pracownika jest nieaktualny. Wygeneruj go ponownie po synchronizacji." }, { status: 409 });
  const [lastEvent] = await db.select().from(workTimeEvents).where(eq(workTimeEvents.employeeDotykackaId, employee.dotykackaId)).orderBy(desc(workTimeEvents.occurredAt)).limit(1);
  if (lastEvent && now.getTime() - lastEvent.occurredAt.getTime() < 20_000) return Response.json({ error: "Kod został już odczytany. Odczekaj chwilę przed kolejnym odbiciem." }, { status: 429 });
  const [open] = await db.select().from(workTimeEntries).where(and(eq(workTimeEntries.employeeDotykackaId, employee.dotykackaId), isNull(workTimeEntries.endedAt), eq(workTimeEntries.status, "OPEN"))).orderBy(desc(workTimeEntries.startedAt)).limit(1);
  const kioskName = kiosk?.name ?? (typeof body.kioskName === "string" ? body.kioskName.trim().slice(0, 100) || "Tablet wejściowy" : "Tablet wejściowy");
  if (open) {
    if (now.getTime() - open.startedAt.getTime() < 60_000) return Response.json({ error: "Wejście zapisano przed chwilą. Wyjście będzie możliwe po minucie." }, { status: 409 });
    const minutes = workedMinutes(open.startedAt, now);
    await db.transaction(async (tx) => { await tx.update(workTimeEntries).set({ endedAt: now, workedMinutes: minutes, status: "CLOSED", updatedAt: now }).where(eq(workTimeEntries.id, open.id)); await tx.insert(workTimeEvents).values({ entryId: open.id, employeeDotykackaId: employee.dotykackaId, employeeName: employee.name, action: "CLOCK_OUT", kioskName, occurredAt: now }); });
    return Response.json({ action: "CLOCK_OUT", employee: employee.name, occurredAt: now, workedMinutes: minutes });
  }
  const windowStart = new Date(now.getTime() - 6 * 60 * 60 * 1000); const windowEnd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const published = await db.select({ id: workSchedules.id }).from(workSchedules).where(eq(workSchedules.status, "PUBLISHED"));
  const [shift] = published.length ? await db.select().from(workShifts).where(and(eq(workShifts.employeeDotykackaId, employee.dotykackaId), gte(workShifts.startsAt, windowStart), lt(workShifts.startsAt, windowEnd))).orderBy(workShifts.startsAt).limit(1) : [];
  const [entry] = await db.transaction(async (tx) => { const [created] = await tx.insert(workTimeEntries).values({ employeeDotykackaId: employee.dotykackaId, employeeName: employee.name, shiftId: shift?.id ?? null, startedAt: now, source: "QR_KIOSK", status: "OPEN" }).returning(); await tx.insert(workTimeEvents).values({ entryId: created.id, employeeDotykackaId: employee.dotykackaId, employeeName: employee.name, action: "CLOCK_IN", kioskName, occurredAt: now }); return [created]; });
  return Response.json({ action: "CLOCK_IN", employee: employee.name, occurredAt: now, entryId: entry.id });
}
