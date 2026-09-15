import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { dotykackaStockEvents, menuProducts, suppliers, wineSources } from "../../db/schema";

type JsonRecord = Record<string, unknown>;

const PRODUCT_KEYS = ["_productId", "productId", "product_id"];
const SUPPLIER_KEYS = ["_supplierId", "supplierId", "supplier_id"];
const WAREHOUSE_KEYS = ["_warehouseId", "warehouseId", "warehouse_id"];
const CLOUD_KEYS = ["_cloudId", "cloudId", "cloud_id"];
const QUANTITY_KEYS = ["quantity", "amount", "stockDifference", "difference", "change"];
const TYPE_KEYS = ["type", "operation", "action", "stockOperation", "stockMovementType"];
const DATE_KEYS = ["created", "createdDate", "date", "versionDate", "timestamp"];

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function findValue(value: unknown, keys: string[]): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValue(item, keys);
      if (found !== undefined && found !== null && found !== "") return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    const found = value[key];
    if (found !== undefined && found !== null && found !== "") return found;
  }
  for (const child of Object.values(value)) {
    if (!isRecord(child) && !Array.isArray(child)) continue;
    const found = findValue(child, keys);
    if (found !== undefined && found !== null && found !== "") return found;
  }
  return undefined;
}

function textValue(value: unknown, keys: string[]) {
  const found = findValue(value, keys);
  return typeof found === "string" || typeof found === "number" ? String(found) : null;
}

function entityId(value: unknown, directKeys: string[], containerNames: string[]) {
  const direct = textValue(value, directKeys);
  if (direct) return direct;
  const visit = (candidate: unknown): string | null => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) { const found = visit(item); if (found) return found; }
      return null;
    }
    if (!isRecord(candidate)) return null;
    for (const [key, child] of Object.entries(candidate)) {
      if (containerNames.includes(key.toLocaleLowerCase("en"))) {
        if (typeof child === "string" || typeof child === "number") return String(child);
        if (isRecord(child)) {
          const nested = child.id ?? child._id;
          if (typeof nested === "string" || typeof nested === "number") return String(nested);
        }
      }
    }
    for (const child of Object.values(candidate)) {
      if (!isRecord(child) && !Array.isArray(child)) continue;
      const found = visit(child); if (found) return found;
    }
    return null;
  };
  return visit(value);
}

function numberValue(value: unknown, keys: string[]) {
  const found = findValue(value, keys);
  const number = typeof found === "number" ? found : typeof found === "string" && found.trim() ? Number(found) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function dateValue(value: unknown) {
  const found = textValue(value, DATE_KEYS);
  return found && !Number.isNaN(Date.parse(found)) ? new Date(found) : null;
}

function recordsFromPayload(payload: unknown): unknown[] {
  const roots = Array.isArray(payload) ? payload : [payload];
  return roots.flatMap((root) => {
    if (!isRecord(root) || !Array.isArray(root.items) || root.items.length === 0) return [root];
    return root.items.map((item) => isRecord(item) ? { ...root, items: undefined, item } : root);
  });
}

export function stockWebhookAuthorized(request: Request) {
  const expected = process.env.DOTYKACKA_WEBHOOK_SECRET || process.env.SYNC_SECRET;
  const url = new URL(request.url);
  const provided = url.searchParams.get("secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function stockWebhookUrl() {
  const secret = process.env.DOTYKACKA_WEBHOOK_SECRET || process.env.SYNC_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!secret || !siteUrl) throw new Error("Brakuje NEXT_PUBLIC_SITE_URL lub sekretu synchronizacji.");
  const url = new URL("/api/webhooks/dotykacka/stocklog", siteUrl);
  url.searchParams.set("secret", secret);
  return url.toString();
}

export async function processStockPayload(payload: unknown) {
  const db = getDb();
  const results: Array<{ status: string; productId: string | null; supplierId: string | null }> = [];

  for (const record of recordsFromPayload(payload)) {
    const productId = entityId(record, PRODUCT_KEYS, ["product", "itemproduct"]);
    const supplierId = entityId(record, SUPPLIER_KEYS, ["supplier", "vendor"]);
    const warehouseId = textValue(record, WAREHOUSE_KEYS);
    const cloudId = textValue(record, CLOUD_KEYS);
    const quantity = numberValue(record, QUANTITY_KEYS);
    const eventType = textValue(record, TYPE_KEYS);
    const occurredAt = dateValue(record);
    const fingerprint = createHash("sha256").update(stable(record)).digest("hex");
    let status = "RECEIVED";
    let error: string | null = null;

    try {
      if (!productId) status = "MISSING_PRODUCT";
      else if (!supplierId) status = "MISSING_SUPPLIER";
      else if (quantity !== null && quantity <= 0) status = "IGNORED_NON_RECEIPT";
      else {
        const [product] = await db.select({ id: menuProducts.id, wineCode: menuProducts.wineCode, supplierDetectedAt: menuProducts.supplierDetectedAt })
          .from(menuProducts).where(eq(menuProducts.dotykackaId, productId)).limit(1);
        if (!product) status = "UNMATCHED_PRODUCT";
        else {
          const eventDate = occurredAt ?? new Date();
          const relatedProducts = product.wineCode
            ? await db.select({ id: menuProducts.id, supplierDetectedAt: menuProducts.supplierDetectedAt }).from(menuProducts).where(eq(menuProducts.wineCode, product.wineCode))
            : [product];
          const [supplier] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.dotykackaId, supplierId)).limit(1);
          for (const target of relatedProducts) {
            if (target.supplierDetectedAt && eventDate < target.supplierDetectedAt) continue;
            await db.update(menuProducts).set({ dotykackaSupplierId: supplierId, supplierDetectedAt: eventDate }).where(eq(menuProducts.id, target.id));
            await db.insert(wineSources).values({
              productId: target.id,
              supplierId: supplier?.id ?? null,
              fingerprint: `stocklog:${fingerprint}`,
              sourceKind: "STOCKLOG",
              status: "APPLIED",
              decision: "AUTOMATIC",
              fetchedAt: eventDate,
              decidedAt: new Date(),
            }).onConflictDoNothing({ target: [wineSources.productId, wineSources.fingerprint] });
          }
          status = "ASSIGNED";
        }
      }
    } catch (processingError) {
      status = "FAILED";
      error = processingError instanceof Error ? processingError.message : "Nieznany błąd przetwarzania";
    }

    await db.insert(dotykackaStockEvents).values({
      fingerprint, cloudId, warehouseId, dotykackaProductId: productId, dotykackaSupplierId: supplierId,
      quantity: quantity === null ? null : String(quantity), eventType, status, rawPayload: record,
      occurredAt, processedAt: new Date(), error,
    }).onConflictDoNothing({ target: dotykackaStockEvents.fingerprint });
    results.push({ status, productId, supplierId });
  }

  return results;
}
