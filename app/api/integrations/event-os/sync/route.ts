import { z } from "zod";
import { getDb } from "../../../../../db";
import { eventOsEvents, eventOsOrders } from "../../../../../db/schema";
import { eventOsAuthorized } from "../../../../../lib/event-os-auth";

const itemSchema = z.object({ productId: z.string().regex(/^\d+$/), name: z.string().min(1).max(240), category: z.string().min(1).max(160), quantity: z.number().int().min(1).max(99), unitPriceRegular: z.number().min(0).max(100000), discountPercent: z.number().min(0).max(100), unitPriceAfterDiscount: z.number().min(0).max(100000) }).strict();
const orderSchema = z.object({ id: z.string().min(1).max(160), ticketCode: z.string().min(1).max(160), guestName: z.string().min(1).max(240), guestEmail: z.string().email().nullable().optional(), guestPhone: z.string().max(80).nullable().optional(), tableLabel: z.string().max(120).nullable().optional(), status: z.enum(["RESERVED", "ARRIVED", "SENT_TO_POS", "IN_SERVICE", "SETTLED", "CANCELLED", "NO_SHOW"]), specialRequest: z.string().max(2000).nullable().optional(), items: z.array(itemSchema).min(1).max(100), orderedAt: z.string().datetime(), arrivedAt: z.string().datetime().nullable().optional(), sentToPosAt: z.string().datetime().nullable().optional(), dotykackaOrderId: z.string().max(100).nullable().optional() }).strict();
const payloadSchema = z.object({ event: z.object({ id: z.string().min(1).max(160), title: z.string().min(1).max(240), startsAt: z.string().datetime(), endsAt: z.string().datetime().nullable(), discountPercent: z.number().min(0).max(100), orderCutoffAt: z.string().datetime().nullable() }).strict(), orders: z.array(orderSchema).max(5000).optional() }).strict();

export async function POST(request: Request) {
  if (!eventOsAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || "Nieprawidłowe dane EVENT OS." }, { status: 400 });
  const { event, orders = [] } = parsed.data; const now = new Date(); const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(eventOsEvents).values({ externalId: event.id, title: event.title, startsAt: new Date(event.startsAt), endsAt: event.endsAt ? new Date(event.endsAt) : null, discountPercent: String(event.discountPercent), orderCutoffAt: event.orderCutoffAt ? new Date(event.orderCutoffAt) : null, syncedAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: eventOsEvents.externalId, set: { title: event.title, startsAt: new Date(event.startsAt), endsAt: event.endsAt ? new Date(event.endsAt) : null, discountPercent: String(event.discountPercent), orderCutoffAt: event.orderCutoffAt ? new Date(event.orderCutoffAt) : null, syncedAt: now, updatedAt: now } });
    for (const order of orders) {
      const regularTotal = order.items.reduce((sum, item) => sum + item.quantity * item.unitPriceRegular, 0); const forecastTotal = order.items.reduce((sum, item) => sum + item.quantity * item.unitPriceAfterDiscount, 0);
      const values = { externalId: order.id, eventExternalId: event.id, ticketCode: order.ticketCode, guestName: order.guestName, guestEmail: order.guestEmail ?? null, guestPhone: order.guestPhone ?? null, tableLabel: order.tableLabel ?? null, status: order.status, specialRequest: order.specialRequest ?? null, items: order.items, regularTotal: String(regularTotal), discountTotal: String(regularTotal - forecastTotal), forecastTotal: String(forecastTotal), dotykackaOrderId: order.dotykackaOrderId ?? null, orderedAt: new Date(order.orderedAt), arrivedAt: order.arrivedAt ? new Date(order.arrivedAt) : null, sentToPosAt: order.sentToPosAt ? new Date(order.sentToPosAt) : null, updatedAt: now };
      await tx.insert(eventOsOrders).values(values).onConflictDoUpdate({ target: eventOsOrders.externalId, set: values });
    }
  });
  return Response.json({ status: "ok", eventId: event.id, ordersReceived: orders.length, syncedAt: now });
}
