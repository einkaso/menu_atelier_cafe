import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { inventoryCatalogCategories, inventoryCatalogProducts } from "../../../../db/schema";
import { isAdmin } from "../../../../lib/admin-auth";
import { syncDotykackaStockCategory } from "../../../../lib/dotykacka/stock-group-sync";
import { usedStockTags } from "../../../../lib/stock-levels";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rows = await getDb().select({
      id: inventoryCatalogProducts.id,
      dotykackaId: inventoryCatalogProducts.dotykackaId,
      categoryId: inventoryCatalogProducts.categoryDotykackaId,
      name: inventoryCatalogProducts.name,
      category: inventoryCatalogCategories.name,
      stockQuantity: inventoryCatalogProducts.stockQuantity,
      unit: inventoryCatalogProducts.unit,
      tags: inventoryCatalogProducts.tags,
      stockDeduct: inventoryCatalogProducts.stockDeduct,
      display: inventoryCatalogProducts.display,
      syncedAt: inventoryCatalogProducts.syncedAt,
    }).from(inventoryCatalogProducts)
      .leftJoin(inventoryCatalogCategories, eq(inventoryCatalogProducts.categoryDotykackaId, inventoryCatalogCategories.dotykackaId))
      .where(eq(inventoryCatalogProducts.deleted, false))
      .orderBy(asc(inventoryCatalogCategories.sortOrder), asc(inventoryCatalogProducts.name));
    const products = rows.map((row) => ({ ...row, tags: row.tags ?? [], syncedAt: row.syncedAt.toISOString() }));
    const categoryCounts = new Map<string, { id: string; name: string; count: number }>();
    for (const product of products) {
      if (!product.categoryId || !product.category) continue;
      const current = categoryCounts.get(product.categoryId);
      categoryCounts.set(product.categoryId, { id: product.categoryId, name: product.category, count: (current?.count ?? 0) + 1 });
    }
    const categories = Array.from(categoryCounts.values());
    const syncedAt = products.reduce<string | null>((latest, product) => !latest || product.syncedAt > latest ? product.syncedAt : latest, null);
    return Response.json({ products, categories, tags: usedStockTags(products), syncedAt });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się pobrać stanów magazynowych." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { categoryId?: unknown };
  const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
  if (!/^\d{1,30}$/.test(categoryId)) return Response.json({ error: "Wybierz jedną grupę produktów." }, { status: 400 });
  try {
    return Response.json({ status: "ok", ...(await syncDotykackaStockCategory(categoryId)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się odświeżyć wybranej grupy.";
    const status = message === "Wybrana grupa produktów nie istnieje." ? 404 : 502;
    return Response.json({ error: message }, { status });
  }
}
