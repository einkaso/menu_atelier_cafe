import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { waiterTables } from "../../../../db/schema";
import { DotykackaClient } from "../../../../lib/dotykacka/client";
import { getDotykackaConfig } from "../../../../lib/dotykacka/config";
import { createGuestReceiptToken, guestReceiptCookie, httpOnlyCookie, requestUsesHttps } from "../../../../lib/guest-receipt-auth";
import { isClosedReceipt, receiptListItem } from "../../../../lib/guest-receipt";
import { loadGuestReceipt } from "../../../../lib/guest-receipt-server";
import { currentWaiter, waiterCookie } from "../../../../lib/waiter-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja kelnera wygasła." }, { status: 401 });
  try {
    const config = await getDotykackaConfig();
    const since = new Date(Date.now() - 12 * 60 * 60_000);
    const [orders, tables] = await Promise.all([
      new DotykackaClient(config).recentClosedOrders(since),
      getDb().select({ id: waiterTables.dotykackaId, name: waiterTables.name }).from(waiterTables).where(eq(waiterTables.deleted, false)),
    ]);
    const tableNames = new Map(tables.map((table) => [table.id, table.name]));
    const receipts = orders.filter((order) => isClosedReceipt(order, config.branchId)).slice(0, 50).map((order) => receiptListItem(order, tableNames));
    return Response.json({ receipts });
  } catch (error) {
    console.error("Guest receipt list failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Nie udało się pobrać zamkniętych rachunków z Dotykački." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja kelnera wygasła." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { orderId?: unknown };
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  if (!/^\d+$/.test(orderId)) return Response.json({ error: "Wybierz prawidłowy rachunek." }, { status: 400 });
  try {
    const receipt = await loadGuestReceipt(orderId, employee.dotykackaId);
    const token = createGuestReceiptToken({ orderId: receipt.orderId, documentNumber: receipt.documentNumber, tableId: receipt.tableId }, employee.dotykackaId);
    const response = Response.json({ receipt });
    const secureCookie = requestUsesHttps(request);
    response.headers.append("Set-Cookie", httpOnlyCookie(guestReceiptCookie.name, token, guestReceiptCookie.maxAge, secureCookie));
    response.headers.append("Set-Cookie", httpOnlyCookie(waiterCookie.name, "", 0, secureCookie));
    return response;
  } catch (error) {
    console.error("Guest receipt handoff failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Nie udało się przygotować tego rachunku. Odśwież listę i spróbuj ponownie." }, { status: 409 });
  }
}
