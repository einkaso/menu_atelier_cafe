import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { menuCategories, menuProducts, productContent } from "../../../../db/schema";
import { isAdmin } from "../../../../lib/admin-auth";
import { sectionFor, suggestCategoryOrder } from "../../../../lib/menu-categories";
import { hasTag, isShelfProduct, shelfHasPositiveStock } from "../../../../lib/menu-tags";
import { menuProductVisibleForGuest } from "../../../../lib/menu-visibility";

export const dynamic = "force-dynamic";

function isPromo(tags: string[]) {
  return tags.some((tag) => tag.trim().toLocaleLowerCase("pl") === "promo");
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = getDb();
    const [categories, products] = await Promise.all([
      db.select({
        id: menuCategories.id,
        name: menuCategories.name,
        display: menuCategories.display,
        sourceOrder: menuCategories.sortOrder,
        menuOrder: menuCategories.menuSortOrder,
        shelfOrder: menuCategories.shelfSortOrder,
        showCatalogCodes: menuCategories.showCatalogCodes,
      }).from(menuCategories).orderBy(sql`coalesce(${menuCategories.menuSortOrder}, ${menuCategories.sortOrder}, 2147483647)`, asc(menuCategories.name)),
      db.select({
        categoryId: menuCategories.id,
        display: menuProducts.display,
        deleted: menuProducts.deleted,
        stockDeduct: menuProducts.stockDeduct,
        stockOverdraft: menuProducts.stockOverdraft,
        stockQuantity: menuProducts.stockQuantity,
        tags: menuProducts.tags,
        menuTagged: menuProducts.menuTagged,
        manualHidden: productContent.manualHidden,
        waiterVisibilityOverride: productContent.waiterVisibilityOverride,
        hideWhenOutOfStock: productContent.hideWhenOutOfStock,
      }).from(menuProducts)
        .leftJoin(menuCategories, eq(menuProducts.dotykackaCategoryId, menuCategories.dotykackaId))
        .leftJoin(productContent, eq(menuProducts.id, productContent.productId)),
    ]);

    const rows = categories.map((category) => {
      const visible = products.filter((product) => product.categoryId === category.id
        && product.menuTagged && hasTag(product.tags, "MENU") && !product.deleted
        && menuProductVisibleForGuest(product.display, product.manualHidden, product.waiterVisibilityOverride)
        && !(product.stockDeduct && product.stockOverdraft === "DISABLE" && Number(product.stockQuantity ?? 0) <= 0));
      return {
        ...category,
        showCatalogCodes: category.showCatalogCodes ?? sectionFor(category.name) === "wine",
        visibleProducts: visible.length,
        promoProducts: visible.filter((product) => isPromo(product.tags)).length,
      };
    }).filter((category) => category.display && category.visibleProducts > 0);

    const shelfGroups = categories.map((category) => {
      const taggedProducts = products.filter((product) => product.categoryId === category.id
        && product.menuTagged && isShelfProduct(product.tags) && !product.deleted);
      const visibleProducts = taggedProducts.filter((product) => shelfHasPositiveStock(product.stockQuantity)
        && category.display && product.display && !product.manualHidden);
      return {
        id: category.id,
        name: category.name,
        sourceOrder: category.sourceOrder,
        shelfOrder: category.shelfOrder,
        taggedProducts: taggedProducts.length,
        visibleProducts: visibleProducts.length,
      };
    }).filter((category) => category.taggedProducts > 0)
      .sort((a, b) => (a.shelfOrder ?? a.sourceOrder ?? 2147483647) - (b.shelfOrder ?? b.sourceOrder ?? 2147483647)
        || a.name.localeCompare(b.name, "pl"));

    return Response.json({ categories: rows, shelfGroups, suggestion: suggestCategoryOrder(rows) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się odczytać kategorii.";
    return Response.json({ error: message }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { categoryIds?: unknown; shelfCategoryIds?: unknown; showCodeCategoryIds?: unknown; reset?: unknown; resetShelf?: unknown };
    const db = getDb();
    if (body.resetShelf === true) {
      await db.update(menuCategories).set({ shelfSortOrder: null });
      return Response.json({ ok: true });
    }
    if (body.shelfCategoryIds != null) {
      if (!Array.isArray(body.shelfCategoryIds) || body.shelfCategoryIds.some((id) => !Number.isInteger(id))) {
        return Response.json({ error: "Nieprawidłowa kolejność grup Z PÓŁKI." }, { status: 400 });
      }
      const ids = body.shelfCategoryIds as number[];
      if (new Set(ids).size !== ids.length) return Response.json({ error: "Grupa Z PÓŁKI występuje więcej niż raz." }, { status: 400 });
      await db.transaction(async (tx) => {
        for (const [index, id] of ids.entries()) await tx.update(menuCategories).set({ shelfSortOrder: index }).where(eq(menuCategories.id, id));
      });
      return Response.json({ ok: true });
    }
    if (body.reset === true) {
      await db.update(menuCategories).set({ menuSortOrder: null });
      return Response.json({ ok: true });
    }
    if (!Array.isArray(body.categoryIds) || body.categoryIds.some((id) => !Number.isInteger(id))) {
      return Response.json({ error: "Nieprawidłowa kolejność kategorii." }, { status: 400 });
    }
    const ids = body.categoryIds as number[];
    if (new Set(ids).size !== ids.length) return Response.json({ error: "Kategoria występuje więcej niż raz." }, { status: 400 });
    if (body.showCodeCategoryIds != null && (!Array.isArray(body.showCodeCategoryIds) || body.showCodeCategoryIds.some((id) => !Number.isInteger(id)))) {
      return Response.json({ error: "Nieprawidłowe ustawienia kodów PLU." }, { status: 400 });
    }
    const showCodeIds = Array.isArray(body.showCodeCategoryIds) ? new Set(body.showCodeCategoryIds as number[]) : null;
    await db.transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx.update(menuCategories).set({ menuSortOrder: index, ...(showCodeIds ? { showCatalogCodes: showCodeIds.has(id) } : {}) }).where(eq(menuCategories.id, id));
      }
    });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się zapisać kolejności.";
    return Response.json({ error: message }, { status: 503 });
  }
}
