import { and, asc, eq, gte } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { waiterEmployees, workSchedules, workShifts } from "../../../../../../db/schema";
import { scheduleIcs } from "../../../../../../lib/workforce";
import { validCalendarToken } from "../../../../../../lib/workforce-secrets";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ employeeId: string; token: string }> }) {
  const { employeeId, token } = await context.params;
  if (!validCalendarToken(employeeId, token)) return new Response("Unauthorized", { status: 401 });
  const db = getDb();
  const [employee] = await db.select({ dotykackaId: waiterEmployees.dotykackaId, name: waiterEmployees.name }).from(waiterEmployees).where(and(eq(waiterEmployees.dotykackaId, employeeId), eq(waiterEmployees.enabled, true), eq(waiterEmployees.deleted, false))).limit(1);
  if (!employee) return new Response("Not found", { status: 404 });
  const schedules = await db.select().from(workSchedules).where(eq(workSchedules.status, "PUBLISHED"));
  const futureSchedules = schedules.filter((schedule) => schedule.weekStart >= new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10));
  const shifts = futureSchedules.length ? await db.select().from(workShifts).where(and(eq(workShifts.employeeDotykackaId, employeeId), inArrayCompat(workShifts.scheduleId, futureSchedules.map((schedule) => schedule.id)), gte(workShifts.endsAt, new Date(Date.now() - 14 * 86400000)))).orderBy(asc(workShifts.startsAt)) : [];
  const versionBySchedule = new Map(futureSchedules.map((schedule) => [schedule.id, schedule.version]));
  const content = scheduleIcs({ employeeId, employeeName: employee.name, scheduleVersion: Math.max(1, ...futureSchedules.map((schedule) => schedule.version)), shifts: shifts.map((shift) => ({ id: shift.id, startsAt: shift.startsAt, endsAt: shift.endsAt, note: shift.note })) });
  void versionBySchedule;
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(content, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `${download ? "attachment" : "inline"}; filename="grafik-atelier.ics"`, "cache-control": "no-store" } });
}

// Kept local to avoid widening the public calendar token query.
import { inArray as inArrayCompat } from "drizzle-orm";
