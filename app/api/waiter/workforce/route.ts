import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { workAvailabilityWeeks, workScheduleReceipts, workSchedules, workShifts, workTimeCorrectionRequests, workTimeEntries } from "../../../../db/schema";
import { currentWaiter } from "../../../../lib/waiter-auth";
import { mondayFor, nextAvailabilityWeek, validateAvailability, validDate, warsawDateTime, weekDates } from "../../../../lib/workforce";
import { calendarToken } from "../../../../lib/workforce-secrets";

export const dynamic = "force-dynamic";

function appOrigin(request: Request) {
  const url = new URL(request.url);
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  return configured || url.origin;
}

export async function GET(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });
  const url = new URL(request.url); const requestedWeek = url.searchParams.get("weekStart");
  const weekStart = validDate(requestedWeek) ? requestedWeek : mondayFor();
  if (weekDates(weekStart)[0] !== weekStart) return Response.json({ error: "Nieprawidłowy tydzień." }, { status: 400 });
  const db = getDb();
  const [availability] = await db.select().from(workAvailabilityWeeks).where(and(eq(workAvailabilityWeeks.employeeDotykackaId, employee.dotykackaId), eq(workAvailabilityWeeks.weekStart, weekStart))).limit(1);
  const [weekSchedule] = await db.select().from(workSchedules).where(eq(workSchedules.weekStart, weekStart)).limit(1);
  const schedule = weekSchedule?.status === "PUBLISHED" ? weekSchedule : null;
  const ownShifts = schedule ? await db.select().from(workShifts).where(and(eq(workShifts.scheduleId, schedule.id), eq(workShifts.employeeDotykackaId, employee.dotykackaId))).orderBy(asc(workShifts.startsAt)) : [];
  const coworkers = schedule && url.searchParams.get("coworkers") === "1" && ownShifts.length ? await db.select().from(workShifts).where(and(eq(workShifts.scheduleId, schedule.id), inArray(workShifts.workDate, [...new Set(ownShifts.map((shift) => shift.workDate))]))).orderBy(asc(workShifts.startsAt)) : [];
  const [receipt] = schedule ? await db.select().from(workScheduleReceipts).where(and(eq(workScheduleReceipts.scheduleId, schedule.id), eq(workScheduleReceipts.scheduleVersion, schedule.version), eq(workScheduleReceipts.employeeDotykackaId, employee.dotykackaId))).limit(1) : [];
  const month = url.searchParams.get("month") ?? weekStart.slice(0, 7); const monthStart = /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : `${weekStart.slice(0, 7)}-01`;
  const monthEnd = new Date(`${monthStart}T00:00:00Z`); monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  const entries = await db.select().from(workTimeEntries).where(and(eq(workTimeEntries.employeeDotykackaId, employee.dotykackaId), gte(workTimeEntries.startedAt, new Date(`${monthStart}T00:00:00Z`)), lt(workTimeEntries.startedAt, monthEnd))).orderBy(asc(workTimeEntries.startedAt));
  const corrections = await db.select().from(workTimeCorrectionRequests).where(and(eq(workTimeCorrectionRequests.employeeDotykackaId, employee.dotykackaId), gte(workTimeCorrectionRequests.requestedStart, new Date(`${monthStart}T00:00:00Z`)), lt(workTimeCorrectionRequests.requestedStart, monthEnd))).orderBy(asc(workTimeCorrectionRequests.requestedStart));
  const now = new Date(); const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const overdueOpen = entries.filter((entry) => !entry.endedAt && entry.startedAt < twelveHoursAgo);
  const recentFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentSchedules = await db.select({ id: workSchedules.id }).from(workSchedules).where(eq(workSchedules.status, "PUBLISHED"));
  const recentShifts = recentSchedules.length ? await db.select().from(workShifts).where(and(eq(workShifts.employeeDotykackaId, employee.dotykackaId), inArray(workShifts.scheduleId, recentSchedules.map((item) => item.id)), gte(workShifts.endsAt, recentFrom), lt(workShifts.endsAt, new Date(now.getTime() - 60 * 60 * 1000)))) : [];
  const recentEntries = await db.select().from(workTimeEntries).where(and(eq(workTimeEntries.employeeDotykackaId, employee.dotykackaId), gte(workTimeEntries.startedAt, recentFrom)));
  const missedShifts = recentShifts.filter((shift) => !recentEntries.some((entry) => entry.startedAt < shift.endsAt && (entry.endedAt ?? now) > shift.startsAt));
  const calendarUrl = `${appOrigin(request)}/api/workforce/calendar/${encodeURIComponent(employee.dotykackaId)}/${calendarToken(employee.dotykackaId)}`;
  return Response.json({ employee, weekStart, earliestAvailabilityWeek: nextAvailabilityWeek(), availabilityLocked: Boolean(weekSchedule?.availabilityLocked), availability: schedule ? null : availability ?? null, schedule, shifts: ownShifts, coworkers, entries, corrections, monthlyMinutes: entries.reduce((sum, entry) => sum + (entry.workedMinutes ?? (!entry.endedAt ? Math.max(0, Math.round((now.getTime() - entry.startedAt.getTime()) / 60_000)) : 0)), 0), calendarUrl, calendarNeedsUpdate: Boolean(schedule && !receipt?.calendarUpdatedAt), alerts: { overdueOpen, missedShifts } });
}

export async function POST(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>; const action = typeof body.action === "string" ? body.action : "";
  const db = getDb(); const now = new Date();
  try {
    if (action === "SAVE_AVAILABILITY") {
      if (!employee.includeInSchedule) throw new Error("Nie jesteś obecnie uwzględniany/a przy planowaniu grafiku. Skontaktuj się z administratorem.");
      const input = validateAvailability({ weekStart: body.weekStart, minShifts: body.minShifts, maxShifts: body.maxShifts, days: body.days });
      const [schedule] = await db.select().from(workSchedules).where(eq(workSchedules.weekStart, input.weekStart)).limit(1);
      if (schedule?.availabilityLocked) throw new Error("Administrator zablokował już dyspozycje na ten tydzień.");
      if (schedule?.status === "PUBLISHED") throw new Error("Grafik na ten tydzień został już opublikowany.");
      await db.insert(workAvailabilityWeeks).values({ employeeDotykackaId: employee.dotykackaId, employeeName: employee.name, ...input, updatedAt: now }).onConflictDoUpdate({ target: [workAvailabilityWeeks.employeeDotykackaId, workAvailabilityWeeks.weekStart], set: { employeeName: employee.name, minShifts: input.minShifts, maxShifts: input.maxShifts, days: input.days, updatedAt: now } });
      return Response.json({ ok: true });
    }
    if (action === "REQUEST_CORRECTION") {
      const workDate = typeof body.workDate === "string" ? body.workDate : ""; const from = typeof body.from === "string" ? body.from : ""; const to = typeof body.to === "string" ? body.to : ""; const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
      const requestedStart = warsawDateTime(workDate, from); let requestedEnd = warsawDateTime(workDate, to); if (requestedEnd <= requestedStart) requestedEnd = new Date(requestedEnd.getTime() + 24 * 60 * 60 * 1000);
      const hours = (requestedEnd.getTime() - requestedStart.getTime()) / 3_600_000;
      if (!reason || hours <= 0 || hours > 16 || requestedStart > now) throw new Error("Sprawdź godziny i podaj powód korekty.");
      await db.insert(workTimeCorrectionRequests).values({ employeeDotykackaId: employee.dotykackaId, employeeName: employee.name, workDate, requestedStart, requestedEnd, reason });
      return Response.json({ ok: true });
    }
    if (action === "CALENDAR_UPDATED" || action === "SEEN") {
      const scheduleId = Number(body.scheduleId); const scheduleVersion = Number(body.scheduleVersion);
      const [schedule] = await db.select().from(workSchedules).where(and(eq(workSchedules.id, scheduleId), eq(workSchedules.version, scheduleVersion), eq(workSchedules.status, "PUBLISHED"))).limit(1);
      if (!schedule) throw new Error("Grafik został w międzyczasie zmieniony. Odśwież widok.");
      const values = { scheduleId, scheduleVersion, employeeDotykackaId: employee.dotykackaId, seenAt: now, ...(action === "CALENDAR_UPDATED" ? { calendarUpdatedAt: now } : {}) };
      await db.insert(workScheduleReceipts).values(values).onConflictDoUpdate({ target: [workScheduleReceipts.scheduleId, workScheduleReceipts.scheduleVersion, workScheduleReceipts.employeeDotykackaId], set: { seenAt: now, ...(action === "CALENDAR_UPDATED" ? { calendarUpdatedAt: now } : {}), updatedAt: now } });
      return Response.json({ ok: true });
    }
    throw new Error("Nieznana operacja.");
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Nie udało się zapisać danych." }, { status: 400 }); }
}
