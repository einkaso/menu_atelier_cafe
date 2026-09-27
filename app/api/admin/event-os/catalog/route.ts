import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { eventOsProductAccess, menuCategories, menuProducts } from "../../../../../db/schema";
import { currentAdmin } from "../../../../../lib/admin-auth";
import { regularProductStockIsAvailable, wineOfferHasStock } from "../../../../../lib/menu-tags";
import { sectionFor } from "../../../../../lib/menu-categories";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await getDb().select({
    id: menuProducts.id, dotykackaId: menuProducts.dotykackaId, name: menuProducts.name, wineCode: menuProducts.wineCode,
    category: menuCategories.name, price: menuProducts.priceWithVat, currency: menuProducts.currency,
    display: menuProducts.display, deleted: menuProducts.deleted, stockDeduct: menuProducts.stockDeduct,
    stockOverdraft: menuProducts.stockOverdraft, stockQuantity: menuProducts.stockQuantity, stockUnit: menuProducts.stockUnit,
    eventEnabled: eventOsProductAccess.enabled,
  }).from(menuProducts)
    .leftJoin(menuCategories, eq(menuProducts.dotykackaCategoryId, menuCategories.dotykackaId))
    .leftJoin(eventOsProductAccess, eq(menuProducts.id, eventOsProductAccess.productId))
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name), asc(menuProducts.name));
  const glass = (name: string) => /(?:^|[\s_\-/])kielisz(?:ek|ki)(?:$|[\s_\-/])/i.test(name);
  const bottleCodes = new Set(rows.filter((row) => sectionFor(row.category) === "wine" && !glass(row.name) && row.wineCode && Number(row.stockQuantity ?? 0) > 0).map((row) => row.wineCode));
  return Response.json({ products: rows.filter((row) => !row.deleted).map((row) => ({
    ...row,
    category: row.category || "Bez kategorii",
    eventEnabled: row.eventEnabled ?? false,
    available: row.display && regularProductStockIsAvailable(row.stockDeduct, row.stockOverdraft, row.stockQuantity)
      && wineOfferHasStock(sectionFor(row.category) === "wine", glass(row.name), row.wineCode, row.stockQuantity)
      && (sectionFor(row.category) !== "wine" || !glass(row.name) || Boolean(row.wineCode && bottleCodes.has(row.wineCode))),
  })) });
}

export async function PATCH(request: Request) {
  const administrator = await currentAdmin();
  if (!administrator) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { productIds?: unknown; enabled?: unknown };
  const productIds = Array.isArray(body.productIds) ? [...new Set(body.productIds.map(Number))] : [];
  if (typeof body.enabled !== "boolean" || !productIds.length || productIds.length > 5000 || productIds.some((id) => !Number.isSafeInteger(id) || id < 1)) return Response.json({ error: "Wybierz prawidłowe produkty." }, { status: 400 });
  const db = getDb();
  const existing = await db.select({ id: menuProducts.id }).from(menuProducts).where(inArray(menuProducts.id, productIds));
  if (existing.length !== productIds.length) return Response.json({ error: "Część produktów nie istnieje. Odśwież listę." }, { status: 409 });
  const now = new Date();
  const actor = administrator.employeeName ?? administrator.username;
  await db.transaction(async (tx) => {
    for (let offset = 0; offset < productIds.length; offset += 500) {
      const values = productIds.slice(offset, offset + 500).map((productId) => ({ productId, enabled: body.enabled as boolean, updatedBy: actor, updatedAt: now }));
      await tx.insert(eventOsProductAccess).values(values).onConflictDoUpdate({ target: eventOsProductAccess.productId, set: { enabled: body.enabled as boolean, updatedBy: actor, updatedAt: now } });
    }
  });
  return Response.json({ status: "ok", productIds, enabled: body.enabled, updatedAt: now });
}
