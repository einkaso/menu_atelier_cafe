import { createHash } from "node:crypto";
import { asc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { workSchedules, workShifts, workTimeEvents } from "../../../../../../db/schema";
import { teamScheduleIcs } from "../../../../../../lib/workforce";
import { validTeamCalendarToken } from "../../../../../../lib/workforce-secrets";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!validTeamCalendarToken(token)) return new Response("Unauthorized", { status: 401 });

  const db = getDb();
  const from = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
  const schedules = await db.select({ id: workSchedules.id, version: workSchedules.version, updatedAt: workSchedules.updatedAt })
    .from(workSchedules).where(eq(workSchedules.status, "PUBLISHED"));
  const shifts = schedules.length ? await db.select({
    id: workShifts.id,
    scheduleId: workShifts.scheduleId,
    employeeName: workShifts.employeeName,
    startsAt: workShifts.startsAt,
    endsAt: workShifts.endsAt,
    note: workShifts.note,
    updatedAt: workShifts.updatedAt,
  }).from(workShifts).where(inArray(workShifts.scheduleId, schedules.map((schedule) => schedule.id))).orderBy(asc(workShifts.startsAt)) : [];
  const punches = await db.select({
    id: workTimeEvents.id,
    employeeName: workTimeEvents.employeeName,
    action: workTimeEvents.action,
    kioskName: workTimeEvents.kioskName,
    occurredAt: workTimeEvents.occurredAt,
  }).from(workTimeEvents).where(gte(workTimeEvents.occurredAt, from)).orderBy(asc(workTimeEvents.occurredAt));
  const versionBySchedule = new Map(schedules.map((schedule) => [schedule.id, schedule.version]));
  const body = teamScheduleIcs({
    shifts: shifts.filter((shift) => shift.endsAt >= from).map((shift) => ({ ...shift, scheduleVersion: versionBySchedule.get(shift.scheduleId) ?? 1 })),
    punches,
  });
  const etag = `"${createHash("sha256").update(body).digest("base64url")}"`;
  const lastChanged = [...schedules.map((item) => item.updatedAt), ...shifts.map((item) => item.updatedAt), ...punches.map((item) => item.occurredAt)]
    .reduce((latest, value) => value > latest ? value : latest, new Date(0));
  const download = new URL(request.url).searchParams.get("download") === "1";
  const headers = {
    "content-type": "text/calendar; charset=utf-8",
    "content-disposition": `${download ? "attachment" : "inline"}; filename="atelier-zespol.ics"`,
    "cache-control": "private, no-cache, must-revalidate",
    etag,
    "last-modified": lastChanged.toUTCString(),
  };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { headers });
}
