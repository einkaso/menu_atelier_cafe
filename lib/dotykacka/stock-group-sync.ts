import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { inventoryCatalogCategories, inventoryCatalogProducts, menuProducts, waiterExtraProducts } from "../../db/schema";
import { DotykackaClient } from "./client";
import { getDotykackaConfig } from "./config";

export async function syncDotykackaStockCategory(categoryId: string) {
  const db = getDb();
  const [category] = await db.select({
    dotykackaId: inventoryCatalogCategories.dotykackaId,
    name: inventoryCatalogCategories.name,
  }).from(inventoryCatalogCategories).where(and(
    eq(inventoryCatalogCategories.dotykackaId, categoryId),
    eq(inventoryCatalogCategories.deleted, false),
  )).limit(1);
  if (!category) throw new Error("Wybrana grupa produktów nie istnieje.");

  const products = await db.select({
    dotykackaId: inventoryCatalogProducts.dotykackaId,
    unit: inventoryCatalogProducts.unit,
  }).from(inventoryCatalogProducts).where(and(
    eq(inventoryCatalogProducts.categoryDotykackaId, category.dotykackaId),
    eq(inventoryCatalogProducts.deleted, false),
  ));
  if (!products.length) return { category, updatedCount: 0, syncedAt: new Date().toISOString() };

  const config = await getDotykackaConfig();
  if (!config.warehouseId) throw new Error("Najpierw wybierz magazyn Dotykački w zakładce Połączenie.");
  const remoteStocks = await new DotykackaClient(config).stockProducts();
  const remoteByProduct = new Map(remoteStocks.map((stock) => [String(stock.id), stock]));
  const syncedAt = new Date();

  await db.transaction(async (tx) => {
    for (const product of products) {
      const remote = remoteByProduct.get(product.dotykackaId);
      const stockQuantity = remote?.stockQuantityStatus == null ? null : String(remote.stockQuantityStatus);
      const unit = remote?.unit ?? product.unit;
      await tx.update(inventoryCatalogProducts).set({ stockQuantity, unit, syncedAt })
        .where(eq(inventoryCatalogProducts.dotykackaId, product.dotykackaId));
      await tx.update(menuProducts).set({ stockQuantity, stockUnit: unit, syncedAt })
        .where(eq(menuProducts.dotykackaId, product.dotykackaId));
      await tx.update(waiterExtraProducts).set({ stockQuantity, syncedAt })
        .where(eq(waiterExtraProducts.dotykackaId, product.dotykackaId));
    }
  });

  return { category, updatedCount: products.length, syncedAt: syncedAt.toISOString() };
}
