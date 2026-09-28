import { asc, and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { eventOsEventProducts, eventOsProductAccess, menuCategories, menuProducts } from "../../../../../db/schema";
import { eventOsAuthorized } from "../../../../../lib/event-os-auth";
import { regularProductStockIsAvailable, wineOfferHasStock } from "../../../../../lib/menu-tags";
import { sectionFor } from "../../../../../lib/menu-categories";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!eventOsAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const eventId = new URL(request.url).searchParams.get("eventId")?.trim() || null;
  const db = getDb();
  const rows = await db.select({ id: menuProducts.dotykackaId, name: menuProducts.name, wineCode: menuProducts.wineCode, category: menuCategories.name, price: menuProducts.priceWithVat, currency: menuProducts.currency, stockQuantity: menuProducts.stockQuantity, stockUnit: menuProducts.stockUnit, stockDeduct: menuProducts.stockDeduct, stockOverdraft: menuProducts.stockOverdraft })
    .from(eventOsProductAccess)
    .innerJoin(menuProducts, eq(eventOsProductAccess.productId, menuProducts.id))
    .leftJoin(menuCategories, eq(menuProducts.dotykackaCategoryId, menuCategories.dotykackaId))
    .leftJoin(eventOsEventProducts, and(eq(eventOsEventProducts.productId, menuProducts.id), eq(eventOsEventProducts.eventExternalId, eventId ?? "")))
    .where(and(eq(eventOsProductAccess.enabled, true), eq(menuProducts.display, true), eq(menuProducts.deleted, false), ...(eventId ? [eq(eventOsEventProducts.enabled, true)] : [])))
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name), asc(menuProducts.name));
  const wineRows = await db.select({ name: menuProducts.name, wineCode: menuProducts.wineCode, category: menuCategories.name, stockQuantity: menuProducts.stockQuantity })
    .from(menuProducts).leftJoin(menuCategories, eq(menuProducts.dotykackaCategoryId, menuCategories.dotykackaId)).where(eq(menuProducts.deleted, false));
  const glass = (name: string) => /(?:^|[\s_\-/])kielisz(?:ek|ki)(?:$|[\s_\-/])/i.test(name);
  const bottleCodes = new Set(wineRows.filter((row) => sectionFor(row.category) === "wine" && !glass(row.name) && row.wineCode && Number(row.stockQuantity ?? 0) > 0).map((row) => row.wineCode));
  return Response.json({ products: rows.filter((row) => regularProductStockIsAvailable(row.stockDeduct, row.stockOverdraft, row.stockQuantity)
    && wineOfferHasStock(sectionFor(row.category) === "wine", glass(row.name), row.wineCode, row.stockQuantity)
    && (sectionFor(row.category) !== "wine" || !glass(row.name) || Boolean(row.wineCode && bottleCodes.has(row.wineCode)))).map((row) => ({
    id: row.id, name: row.name, category: row.category || "Bez kategorii", price: Number(row.price ?? 0), currency: row.currency,
    stockQuantity: row.stockQuantity === null ? null : Number(row.stockQuantity), stockUnit: row.stockUnit, available: true,
  })), eventId, generatedAt: new Date().toISOString() });
}
