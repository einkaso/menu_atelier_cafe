import { asc } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { eventOsEvents, eventOsOrders } from "../../../../../db/schema";
import { currentAdmin } from "../../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const [events, orders] = await Promise.all([db.select().from(eventOsEvents).orderBy(asc(eventOsEvents.startsAt)), db.select().from(eventOsOrders)]);
  return Response.json({ events: events.map((event) => {
    const rows = orders.filter((order) => order.eventExternalId === event.externalId);
    return {
      ...event,
      orderCount: rows.length,
      expectedGuests: new Set(rows.map((order) => order.ticketCode)).size,
      arrivedGuests: rows.filter((order) => ["ARRIVED", "SENT_TO_POS", "IN_SERVICE", "SETTLED"].includes(order.status)).length,
      forecastRevenue: rows.reduce((sum, order) => sum + Number(order.forecastTotal), 0),
      sentToPosRevenue: rows.filter((order) => ["SENT_TO_POS", "IN_SERVICE", "SETTLED"].includes(order.status)).reduce((sum, order) => sum + Number(order.forecastTotal), 0),
    };
  }) });
}
