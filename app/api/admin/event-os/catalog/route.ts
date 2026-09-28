import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { eventOsEventProducts, eventOsEvents, eventOsProductAccess, menuCategories, menuProducts } from "../../../../../db/schema";
import { currentAdmin } from "../../../../../lib/admin-auth";
import { regularProductStockIsAvailable, wineOfferHasStock } from "../../../../../lib/menu-tags";
import { sectionFor } from "../../../../../lib/menu-categories";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await currentAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const eventId = new URL(request.url).searchParams.get("eventId")?.trim();
  if (!eventId) return Response.json({ error: "Wybierz wydarzenie." }, { status: 400 });
  const db = getDb();
  const [event] = await db.select({ id: eventOsEvents.externalId }).from(eventOsEvents).where(eq(eventOsEvents.externalId, eventId)).limit(1);
  if (!event) return Response.json({ error: "Nie znaleziono wydarzenia." }, { status: 404 });
  const rows = await db.select({
    id: menuProducts.id, dotykackaId: menuProducts.dotykackaId, name: menuProducts.name, wineCode: menuProducts.wineCode,
    category: menuCategories.name, price: menuProducts.priceWithVat, currency: menuProducts.currency,
    display: menuProducts.display, deleted: menuProducts.deleted, stockDeduct: menuProducts.stockDeduct,
    stockOverdraft: menuProducts.stockOverdraft, stockQuantity: menuProducts.stockQuantity, stockUnit: menuProducts.stockUnit,
    eventEnabled: eventOsEventProducts.enabled,
    catalogEnabled: eventOsProductAccess.enabled,
  }).from(menuProducts)
    .leftJoin(menuCategories, eq(menuProducts.dotykackaCategoryId, menuCategories.dotykackaId))
    .leftJoin(eventOsProductAccess, eq(menuProducts.id, eventOsProductAccess.productId))
    .leftJoin(eventOsEventProducts, and(eq(menuProducts.id, eventOsEventProducts.productId), eq(eventOsEventProducts.eventExternalId, eventId)))
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
  const body = await request.json().catch(() => ({})) as { eventId?: unknown; productIds?: unknown; enabled?: unknown };
  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const productIds = Array.isArray(body.productIds) ? [...new Set(body.productIds.map(Number))] : [];
  if (!eventId || typeof body.enabled !== "boolean" || !productIds.length || productIds.length > 5000 || productIds.some((id) => !Number.isSafeInteger(id) || id < 1)) return Response.json({ error: "Wybierz wydarzenie i prawidłowe produkty." }, { status: 400 });
  const db = getDb();
  const [event, existing] = await Promise.all([
    db.select({ id: eventOsEvents.externalId }).from(eventOsEvents).where(eq(eventOsEvents.externalId, eventId)).limit(1),
    db.select({ id: menuProducts.id }).from(menuProducts).where(inArray(menuProducts.id, productIds)),
  ]);
  if (!event[0]) return Response.json({ error: "Nie znaleziono wydarzenia." }, { status: 404 });
  if (existing.length !== productIds.length) return Response.json({ error: "Część produktów nie istnieje. Odśwież listę." }, { status: 409 });
  const now = new Date();
  const actor = administrator.employeeName ?? administrator.username;
  await db.transaction(async (tx) => {
    for (let offset = 0; offset < productIds.length; offset += 500) {
      const ids = productIds.slice(offset, offset + 500);
      const values = ids.map((productId) => ({ eventExternalId: eventId, productId, enabled: body.enabled as boolean, updatedBy: actor, updatedAt: now }));
      await tx.insert(eventOsEventProducts).values(values).onConflictDoUpdate({ target: [eventOsEventProducts.eventExternalId, eventOsEventProducts.productId], set: { enabled: body.enabled as boolean, updatedBy: actor, updatedAt: now } });
      if (body.enabled) {
        const access = ids.map((productId) => ({ productId, enabled: true, updatedBy: actor, updatedAt: now }));
        await tx.insert(eventOsProductAccess).values(access).onConflictDoUpdate({ target: eventOsProductAccess.productId, set: { enabled: true, updatedBy: actor, updatedAt: now } });
      }
    }
  });
  return Response.json({ status: "ok", eventId, productIds, enabled: body.enabled, updatedAt: now });
}
