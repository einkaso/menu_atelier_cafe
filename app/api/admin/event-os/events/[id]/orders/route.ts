import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../../../../db";
import { eventOsEvents, eventOsOrders } from "../../../../../../../db/schema";
import { currentAdmin } from "../../../../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await context.params).id;
  const db = getDb();
  const [event] = await db.select().from(eventOsEvents).where(eq(eventOsEvents.externalId, id)).limit(1);
  if (!event) return Response.json({ error: "Nie znaleziono wydarzenia." }, { status: 404 });
  const orders = await db.select().from(eventOsOrders).where(eq(eventOsOrders.eventExternalId, id)).orderBy(asc(eventOsOrders.guestName), asc(eventOsOrders.orderedAt));
  const productMap = new Map<string, { productId: string; name: string; category: string; quantity: number; regularValue: number; discountValue: number; forecastValue: number }>();
  for (const order of orders) for (const item of order.items) {
    const current = productMap.get(item.productId) ?? { productId: item.productId, name: item.name, category: item.category, quantity: 0, regularValue: 0, discountValue: 0, forecastValue: 0 };
    current.quantity += item.quantity;
    current.regularValue += item.quantity * item.unitPriceRegular;
    current.forecastValue += item.quantity * item.unitPriceAfterDiscount;
    current.discountValue = current.regularValue - current.forecastValue;
    productMap.set(item.productId, current);
  }
  const isArrived = (status: string) => ["ARRIVED", "SENT_TO_POS", "IN_SERVICE", "SETTLED"].includes(status);
  return Response.json({ event, orders, products: [...productMap.values()].sort((a, b) => a.category.localeCompare(b.category, "pl") || a.name.localeCompare(b.name, "pl")), totals: {
    regular: orders.reduce((sum, order) => sum + Number(order.regularTotal), 0),
    discount: orders.reduce((sum, order) => sum + Number(order.discountTotal), 0),
    forecast: orders.reduce((sum, order) => sum + Number(order.forecastTotal), 0),
    arrived: orders.filter((order) => isArrived(order.status)).reduce((sum, order) => sum + Number(order.forecastTotal), 0),
    sentToPos: orders.filter((order) => ["SENT_TO_POS", "IN_SERVICE", "SETTLED"].includes(order.status)).reduce((sum, order) => sum + Number(order.forecastTotal), 0),
    settled: orders.filter((order) => order.status === "SETTLED").reduce((sum, order) => sum + Number(order.forecastTotal), 0),
  } });
}
