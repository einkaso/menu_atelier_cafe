import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { reservations, waiterEmployees, workAvailabilityWeeks, workforceCalendarSettings, workSchedules, workShifts, workTimeCorrectionRequests, workTimeEntries } from "../../../../db/schema";
import { currentAdmin } from "../../../../lib/admin-auth";
import { calendarEvents, decryptCalendarUrl, encryptCalendarUrl } from "../../../../lib/workforce-calendar";
import { addDays, validDate, validateShift, weekDates, type ShiftInput } from "../../../../lib/workforce";

export const dynamic = "force-dynamic";

async function readWeek(weekStart: string) {
  const db = getDb();
  const [allEmployees, allAvailability, schedule, corrections] = await Promise.all([
    db.select({ dotykackaId: waiterEmployees.dotykackaId, name: waiterEmployees.name, includeInSchedule: waiterEmployees.includeInSchedule }).from(waiterEmployees).where(and(eq(waiterEmployees.enabled, true), eq(waiterEmployees.deleted, false))).orderBy(asc(waiterEmployees.name)),
    db.select().from(workAvailabilityWeeks).where(eq(workAvailabilityWeeks.weekStart, weekStart)).orderBy(asc(workAvailabilityWeeks.employeeName)),
    db.select().from(workSchedules).where(eq(workSchedules.weekStart, weekStart)).limit(1).then((rows) => rows[0] ?? null),
    db.select().from(workTimeCorrectionRequests).where(eq(workTimeCorrectionRequests.status, "PENDING")).orderBy(asc(workTimeCorrectionRequests.createdAt)),
  ]);
  const employees = allEmployees.filter((employee) => employee.includeInSchedule);
  const planningEmployeeIds = new Set(employees.map((employee) => employee.dotykackaId));
  const availability = allAvailability.filter((row) => planningEmployeeIds.has(row.employeeDotykackaId));
  const shifts = schedule ? await db.select().from(workShifts).where(eq(workShifts.scheduleId, schedule.id)).orderBy(asc(workShifts.startsAt)) : [];
  const monthStart = `${weekStart.slice(0, 7)}-01`;
  const monthEndDate = new Date(`${monthStart}T00:00:00Z`); monthEndDate.setUTCMonth(monthEndDate.getUTCMonth() + 1);
  const entries = await db.select().from(workTimeEntries).where(and(gte(workTimeEntries.startedAt, new Date(`${monthStart}T00:00:00Z`)), lt(workTimeEntries.startedAt, monthEndDate))).orderBy(asc(workTimeEntries.startedAt));
  const weekReservations = await db.select({ id: reservations.id, guestName: reservations.guestName, partySize: reservations.partySize, startsAt: reservations.startsAt, endsAt: reservations.endsAt, location: reservations.location, specialRequest: reservations.specialRequest }).from(reservations).where(and(eq(reservations.status, "BOOKED"), gte(reservations.startsAt, new Date(`${weekStart}T00:00:00Z`)), lt(reservations.startsAt, new Date(`${addDays(weekStart, 7)}T00:00:00Z`)))).orderBy(asc(reservations.startsAt));
  const [calendarSetting] = await db.select().from(workforceCalendarSettings).where(eq(workforceCalendarSettings.key, "main")).limit(1);
  let events: Awaited<ReturnType<typeof calendarEvents>> = []; let calendarError: string | null = null;
  const encryptedUrl = calendarSetting?.icalUrlEncrypted;
  if (encryptedUrl) try { events = await calendarEvents(decryptCalendarUrl(encryptedUrl), new Date(`${weekStart}T00:00:00Z`), new Date(`${addDays(weekStart, 7)}T00:00:00Z`)); } catch (error) { calendarError = error instanceof Error ? error.message : "Nie udało się pobrać wydarzeń."; }
  return { employees, settlementEmployees: allEmployees, availability, schedule, shifts, corrections, entries, events, reservations: weekReservations, calendar: { connected: Boolean(encryptedUrl), name: calendarSetting?.name ?? "Kalendarz wydarzeń", error: calendarError } };
}

export async function GET(request: Request) {
  if (!await currentAdmin()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const weekStart = new URL(request.url).searchParams.get("weekStart") ?? "";
  if (!validDate(weekStart) || weekDates(weekStart)[0] !== weekStart) return Response.json({ error: "Nieprawidłowy tydzień." }, { status: 400 });
  return Response.json(await readWeek(weekStart));
}

export async function POST(request: Request) {
  const administrator = await currentAdmin();
  if (!administrator) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  const db = getDb(); const now = new Date();
  try {
    if (action === "SAVE_CALENDAR") {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) || "Kalendarz wydarzeń" : "Kalendarz wydarzeń";
      const url = typeof body.url === "string" ? body.url.trim() : "";
      if (url) new URL(url);
      const [existing] = await db.select().from(workforceCalendarSettings).where(eq(workforceCalendarSettings.key, "main")).limit(1);
      const encrypted = url ? encryptCalendarUrl(url) : existing?.icalUrlEncrypted ?? null;
      await db.insert(workforceCalendarSettings).values({ key: "main", name, icalUrlEncrypted: encrypted, updatedBy: administrator.username, updatedAt: now }).onConflictDoUpdate({ target: workforceCalendarSettings.key, set: { name, icalUrlEncrypted: encrypted, updatedBy: administrator.username, updatedAt: now } });
      return Response.json({ ok: true });
    }
    if (action === "REVIEW_CORRECTION") {
      const id = Number(body.id); const decision = body.decision === "APPROVE" ? "APPROVED" : body.decision === "REJECT" ? "REJECTED" : "";
      if (!Number.isInteger(id) || !decision) throw new Error("Nieprawidłowa decyzja.");
      const [correction] = await db.select().from(workTimeCorrectionRequests).where(and(eq(workTimeCorrectionRequests.id, id), eq(workTimeCorrectionRequests.status, "PENDING"))).limit(1);
      if (!correction) throw new Error("Wniosek został już rozpatrzony.");
      await db.transaction(async (tx) => { if (decision === "APPROVED") await tx.insert(workTimeEntries).values({ employeeDotykackaId: correction.employeeDotykackaId, employeeName: correction.employeeName, startedAt: correction.requestedStart, endedAt: correction.requestedEnd, workedMinutes: Math.round((correction.requestedEnd.getTime() - correction.requestedStart.getTime()) / 60_000), source: "CORRECTION", status: "CORRECTED", approvedBy: administrator.username }); await tx.update(workTimeCorrectionRequests).set({ status: decision, reviewedBy: administrator.username, reviewNote: typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null, reviewedAt: now, updatedAt: now }).where(eq(workTimeCorrectionRequests.id, correction.id)); });
      return Response.json({ ok: true });
    }
    const weekStart = typeof body.weekStart === "string" ? body.weekStart : "";
    if (!validDate(weekStart) || weekDates(weekStart)[0] !== weekStart) throw new Error("Nieprawidłowy tydzień.");
    let [schedule] = await db.select().from(workSchedules).where(eq(workSchedules.weekStart, weekStart)).limit(1);
    if (!schedule) [schedule] = await db.insert(workSchedules).values({ weekStart, createdBy: administrator.username, updatedBy: administrator.username }).returning();
    if (action === "SAVE_PLAN") {
      const openingHours = Array.isArray(body.openingHours) ? body.openingHours : [];
      const dates = new Set(weekDates(weekStart));
      const normalizedOpening = openingHours.map((row) => { const value = row as { date?: unknown; closed?: unknown; from?: unknown; to?: unknown }; if (typeof value.date !== "string" || !dates.has(value.date)) throw new Error("Godziny lokalu zawierają dzień spoza tygodnia."); const closed = value.closed === true; const from = typeof value.from === "string" ? value.from : null; const to = typeof value.to === "string" ? value.to : null; if (!closed && (!/^\d{2}:\d{2}$/.test(from ?? "") || !/^\d{2}:\d{2}$/.test(to ?? ""))) throw new Error("Uzupełnij godziny otwarcia lokalu."); return { date: value.date, closed, from: closed ? null : from, to: closed ? null : to }; });
      const rawShifts = Array.isArray(body.shifts) ? body.shifts : [];
      const employees = await db.select({ dotykackaId: waiterEmployees.dotykackaId, name: waiterEmployees.name }).from(waiterEmployees).where(and(eq(waiterEmployees.enabled, true), eq(waiterEmployees.deleted, false), eq(waiterEmployees.includeInSchedule, true)));
      const employeeById = new Map(employees.map((employee) => [employee.dotykackaId, employee]));
      const shifts = rawShifts.map((raw) => validateShift(raw as ShiftInput, weekStart)).map((shift) => { const employee = employeeById.get(shift.employeeDotykackaId); if (!employee) throw new Error("Grafik zawiera pracownika wyłączonego z planowania albo nieaktywnego."); return { scheduleId: schedule.id, employeeDotykackaId: employee.dotykackaId, employeeName: employee.name, workDate: shift.workDate, startsAt: shift.startsAt, endsAt: shift.endsAt, note: shift.note }; });
      await db.transaction(async (tx) => { await tx.delete(workShifts).where(eq(workShifts.scheduleId, schedule.id)); if (shifts.length) await tx.insert(workShifts).values(shifts); await tx.update(workSchedules).set({ openingHours: normalizedOpening, status: "DRAFT", updatedBy: administrator.username, updatedAt: now }).where(eq(workSchedules.id, schedule.id)); });
      return Response.json({ ok: true });
    }
    if (action === "PUBLISH") {
      const shiftCount = await db.select({ id: workShifts.id, employeeDotykackaId: workShifts.employeeDotykackaId }).from(workShifts).where(eq(workShifts.scheduleId, schedule.id));
      if (!shiftCount.length) throw new Error("Nie można opublikować pustego grafiku.");
      const scheduledEmployeeIds = [...new Set(shiftCount.map((shift) => shift.employeeDotykackaId))];
      const allowedEmployees = await db.select({ dotykackaId: waiterEmployees.dotykackaId }).from(waiterEmployees).where(and(
        inArray(waiterEmployees.dotykackaId, scheduledEmployeeIds),
        eq(waiterEmployees.enabled, true),
        eq(waiterEmployees.deleted, false),
        eq(waiterEmployees.includeInSchedule, true),
      ));
      if (allowedEmployees.length !== scheduledEmployeeIds.length) throw new Error("Grafik zawiera pracownika wyłączonego z planowania. Usuń jego przyszłe zmiany przed publikacją.");
      const nextVersion = schedule.publishedAt ? schedule.version + 1 : schedule.version;
      await db.update(workSchedules).set({ status: "PUBLISHED", version: nextVersion, publishedAt: now, updatedBy: administrator.username, updatedAt: now }).where(eq(workSchedules.id, schedule.id));
      return Response.json({ ok: true, version: nextVersion });
    }
    throw new Error("Nieznana operacja.");
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Nie udało się zapisać danych." }, { status: 400 }); }
}
