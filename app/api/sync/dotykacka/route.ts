import { timingSafeEqual } from "node:crypto";
import { syncDotykackaMenu } from "../../../../lib/dotykacka/sync";
import { syncReservationCalendar } from "../../../../lib/reservation-calendar-sync";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.SYNC_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const menu = await syncDotykackaMenu();
    const reservationCalendar = await syncReservationCalendar().catch((error) => ({
      status: "error" as const,
      imported: 0,
      error: error instanceof Error ? error.message : "Nie udało się odświeżyć kalendarza rezerwacji.",
    }));
    return Response.json({ status: "ok", ...menu, reservationCalendar });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synchronization failed";
    return Response.json({ status: "error", error: message }, { status: 502 });
  }
}
