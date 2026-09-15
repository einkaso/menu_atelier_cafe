import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { menuCategories, menuProducts, productContent } from "../../../../db/schema";
import { isAdmin } from "../../../../lib/admin-auth";
import { hasTag } from "../../../../lib/menu-tags";

export const dynamic = "force-dynamic";

function hasPromo(tags: string[]) {
  return tags.some((tag) => tag.trim().toLocaleLowerCase("pl") === "promo");
}

function isVisible(product: {
  menuTagged: boolean; display: boolean; deleted: boolean; manualHidden: boolean | null;
  stockDeduct: boolean; stockOverdraft: string; stockQuantity: string | null;
}) {
  if (!product.menuTagged || !product.display || product.deleted || product.manualHidden) return false;
  return !(product.stockDeduct && product.stockOverdraft === "DISABLE" && Number(product.stockQuantity ?? 0) <= 0);
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rows = await getDb().select({
      id: menuProducts.id,
      name: menuProducts.name,
      category: menuCategories.name,
      tags: menuProducts.tags,
      menuTagged: menuProducts.menuTagged,
      display: menuProducts.display,
      deleted: menuProducts.deleted,
      stockDeduct: menuProducts.stockDeduct,
      stockOverdraft: menuProducts.stockOverdraft,
      stockQuantity: menuProducts.stockQuantity,
      featured: productContent.featured,
      featuredSortOrder: productContent.featuredSortOrder,
      manualHidden: productContent.manualHidden,
    }).from(menuProducts)
      .leftJoin(menuCategories, eq(menuProducts.dotykackaCategoryId, menuCategories.dotykackaId))
      .leftJoin(productContent, eq(menuProducts.id, productContent.productId))
      .orderBy(sql`coalesce(${productContent.featuredSortOrder}, 2147483647)`, asc(menuProducts.name));
    return Response.json({ products: rows.filter((row) => isVisible(row) && hasTag(row.tags, "MENU") && (row.featured || hasPromo(row.tags))).map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      source: hasPromo(row.tags) ? "PROMO w Dotykačce" : "Polecana w panelu",
      order: row.featuredSortOrder,
    })) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się pobrać polecanych produktów." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { productIds?: unknown };
    if (!Array.isArray(body.productIds) || body.productIds.some((id) => !Number.isInteger(id))) {
      return Response.json({ error: "Nieprawidłowa kolejność polecanych produktów." }, { status: 400 });
    }
    const ids = body.productIds.map(Number);
    if (new Set(ids).size !== ids.length) return Response.json({ error: "Produkt występuje na liście więcej niż raz." }, { status: 400 });
    const db = getDb();
    await db.transaction(async (tx) => {
      for (const [index, productId] of ids.entries()) {
        await tx.insert(productContent).values({ productId, featuredSortOrder: index }).onConflictDoUpdate({
          target: productContent.productId,
          set: { featuredSortOrder: index, updatedAt: new Date() },
        });
      }
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się zapisać kolejności polecanych produktów." }, { status: 503 });
  }
}
