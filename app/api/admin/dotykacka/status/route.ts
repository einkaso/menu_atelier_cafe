import { desc, sql } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { dotykackaStockEvents } from "../../../../../db/schema";
import { isAdmin } from "../../../../../lib/admin-auth";
import { DotykackaClient } from "../../../../../lib/dotykacka/client";
import { getDotykackaConfig, getStoredDotykackaConnection, saveDotykackaSelection } from "../../../../../lib/dotykacka/config";
import { stockWebhookUrl } from "../../../../../lib/dotykacka/stock-events";

export const dynamic = "force-dynamic";

async function stockEventStatus() {
  const db = getDb();
  const [[counts], [latest]] = await Promise.all([
    db.select({
      received: sql<number>`count(*)::int`,
      assigned: sql<number>`count(*) filter (where ${dotykackaStockEvents.status} = 'ASSIGNED')::int`,
      unresolved: sql<number>`count(*) filter (where ${dotykackaStockEvents.status} in ('MISSING_PRODUCT', 'MISSING_SUPPLIER', 'UNMATCHED_PRODUCT', 'FAILED'))::int`,
    }).from(dotykackaStockEvents),
    db.select({ receivedAt: dotykackaStockEvents.receivedAt, status: dotykackaStockEvents.status })
      .from(dotykackaStockEvents).orderBy(desc(dotykackaStockEvents.receivedAt)).limit(1),
  ]);
  return { received: counts?.received ?? 0, assigned: counts?.assigned ?? 0, unresolved: counts?.unresolved ?? 0, lastEventAt: latest?.receivedAt?.toISOString() ?? null, lastEventStatus: latest?.status ?? null };
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const connectorConfigured = Boolean(process.env.DOTYKACKA_CONNECTOR_CLIENT_ID && process.env.DOTYKACKA_CONNECTOR_CLIENT_SECRET);
  const stored = await getStoredDotykackaConnection();
  const envConnected = Boolean(process.env.DOTYKACKA_REFRESH_TOKEN && process.env.DOTYKACKA_CLOUD_ID);
  if (!stored && !envConnected) return Response.json({ connectorConfigured, connected: false, warehouses: [], branches: [] });
  try {
    const config = await getDotykackaConfig();
    const client = new DotykackaClient(config);
    const [warehouses, branches, webhooks, stockEvents] = await Promise.all([client.warehouses(), client.branches(), client.webhooks().catch(() => []), stockEventStatus()]);
    const expectedWebhookUrl = stockWebhookUrl();
    const stockWebhookRegistered = webhooks.some((webhook) => {
      try {
        const actual = new URL(webhook.url);
        const expected = new URL(expectedWebhookUrl);
        return webhook.payloadEntity === "STOCKLOG"
          && String(webhook._warehouseId ?? "") === String(config.warehouseId ?? "")
          && actual.origin === expected.origin && actual.pathname === expected.pathname
          && actual.searchParams.get("secret") === expected.searchParams.get("secret");
      } catch {
        return false;
      }
    });
    return Response.json({
      connectorConfigured,
      connected: true,
      cloudId: config.cloudId,
      warehouseId: config.warehouseId ?? null,
      branchId: config.branchId ?? null,
      stockWebhookRegistered,
      stockEvents,
      warehouses: warehouses.filter((item) => item.display !== false && !item.deleted).map(({ id, name }) => ({ id: String(id), name })),
      branches: branches.filter((item) => item.display !== false && !item.deleted).map(({ id, name }) => ({ id: String(id), name })),
    });
  } catch (error) {
    return Response.json({ connectorConfigured, connected: true, connectionError: error instanceof Error ? error.message : "Nie udało się sprawdzić połączenia.", warehouses: [], branches: [] });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { warehouseId?: string | null; branchId?: string | null };
  try {
    await saveDotykackaSelection(body.warehouseId, body.branchId);
    return Response.json({ status: "ok" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się zapisać ustawień." }, { status: 400 });
  }
}
