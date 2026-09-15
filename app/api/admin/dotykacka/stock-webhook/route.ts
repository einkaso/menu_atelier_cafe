import { isAdmin } from "../../../../../lib/admin-auth";
import { DotykackaClient } from "../../../../../lib/dotykacka/client";
import { getDotykackaConfig } from "../../../../../lib/dotykacka/config";
import { stockWebhookUrl } from "../../../../../lib/dotykacka/stock-events";

export const dynamic = "force-dynamic";

function sameReceiver(left: string, right: string) {
  try {
    const a = new URL(left);
    const b = new URL(right);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch {
    return false;
  }
}

export async function POST() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const config = await getDotykackaConfig();
    if (!config.warehouseId) return Response.json({ error: "Najpierw wybierz magazyn Dotykački." }, { status: 400 });
    const client = new DotykackaClient(config);
    const receiverUrl = stockWebhookUrl();
    const existing = (await client.webhooks()).find((webhook) =>
      webhook.payloadEntity === "STOCKLOG"
      && String(webhook._warehouseId ?? "") === String(config.warehouseId)
      && sameReceiver(webhook.url, receiverUrl)
    );
    if (existing?.url === receiverUrl) return Response.json({ status: "ok", registered: true, alreadyExisted: true });
    await client.registerStockWebhook(receiverUrl);
    return Response.json({ status: "ok", registered: true, alreadyExisted: false });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się włączyć odbioru operacji magazynowych." }, { status: 502 });
  }
}
