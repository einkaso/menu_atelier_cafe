import { processStockPayload, stockWebhookAuthorized } from "../../../../../lib/dotykacka/stock-events";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!stockWebhookAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1_000_000) return Response.json({ error: "Payload too large" }, { status: 413 });
  const payload = await request.json().catch(() => null);
  if (payload === null) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const results = await processStockPayload(payload);
  return Response.json({ status: "ok", received: results.length });
}
