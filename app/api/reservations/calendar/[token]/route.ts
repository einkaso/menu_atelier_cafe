import { createHash } from "node:crypto";
import { and, asc, eq, gte } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { reservations } from "../../../../../db/schema";
import { reservationsIcs, validReservationCalendarToken } from "../../../../../lib/reservations";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!validReservationCalendarToken(token)) return new Response("Unauthorized", { status: 401 });
  const rows = await getDb().select().from(reservations).where(and(eq(reservations.status, "BOOKED"), gte(reservations.endsAt, new Date(Date.now() - 30 * 24 * 3_600_000)))).orderBy(asc(reservations.startsAt));
  const body = reservationsIcs(rows);
  const etag = `"${createHash("sha256").update(body).digest("base64url")}"`;
  const lastModified = rows.reduce((latest, item) => item.updatedAt > latest ? item.updatedAt : latest, new Date(0)).toUTCString();
  const headers = {
    "content-type": "text/calendar; charset=utf-8",
    "content-disposition": "inline; filename=atelier-rezerwacje.ics",
    "cache-control": "private, no-cache, must-revalidate",
    etag,
    "last-modified": lastModified,
  };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { headers });
}
