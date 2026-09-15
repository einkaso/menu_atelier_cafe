import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { menuCategories, menuGroupOrders, menuProducts, productContent } from "../../../../db/schema";
import { isAdmin } from "../../../../lib/admin-auth";
import { suggestProductGroup } from "../../../../lib/product-order";
import { hasTag } from "../../../../lib/menu-tags";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const categoryId = Number(new URL(request.url).searchParams.get("categoryId"));
    if (!Number.isInteger(categoryId)) return Response.json({ error: "Wybierz kategorię." }, { status: 400 });
    const [category] = await getDb().select({ id: menuCategories.id, dotykackaId: menuCategories.dotykackaId, name: menuCategories.name })
      .from(menuCategories).where(eq(menuCategories.id, categoryId)).limit(1);
    if (!category) return Response.json({ error: "Nie znaleziono kategorii." }, { status: 404 });
    const products = await getDb().select({
      id: menuProducts.id, name: menuProducts.name, sourceOrder: menuProducts.sourceSortOrder,
      menuOrder: menuProducts.menuSortOrder, menuGroup: menuProducts.menuGroup,
      tags: menuProducts.tags,
      display: menuProducts.display, deleted: menuProducts.deleted, menuTagged: menuProducts.menuTagged,
      stockDeduct: menuProducts.stockDeduct, stockOverdraft: menuProducts.stockOverdraft,
      stockQuantity: menuProducts.stockQuantity, manualHidden: productContent.manualHidden,
    }).from(menuProducts)
      .leftJoin(productContent, eq(menuProducts.id, productContent.productId))
      .where(and(eq(menuProducts.dotykackaCategoryId, category.dotykackaId), eq(menuProducts.menuTagged, true)))
      .orderBy(asc(menuProducts.menuSortOrder), asc(menuProducts.sourceSortOrder), asc(menuProducts.name));
    const visibleProducts = products.filter((product) => product.menuTagged && hasTag(product.tags, "MENU") && product.display && !product.deleted && !product.manualHidden
      && !(product.stockDeduct && product.stockOverdraft === "DISABLE" && Number(product.stockQuantity ?? 0) <= 0));
    const visibleWithSuggestions = visibleProducts.map((product) => {
      const suggestion = suggestProductGroup(category.name, product.name);
      return {
        ...product,
        menuGroup: suggestion?.pl === "Kawy alternatywne" ? suggestion.pl : product.menuGroup,
        suggestion,
      };
    });
    const savedGroupRows = await getDb().select({ name: menuGroupOrders.groupName, sortOrder: menuGroupOrders.sortOrder })
      .from(menuGroupOrders).where(eq(menuGroupOrders.categoryId, categoryId)).orderBy(asc(menuGroupOrders.sortOrder));
    const savedGroupOrder = new Map(savedGroupRows.map((group) => [group.name, group.sortOrder]));
    const groups = Array.from(visibleWithSuggestions.reduce((result, product, productIndex) => {
      const name = (product.menuGroup ?? product.suggestion?.pl ?? "").trim();
      const current = result.get(name) ?? { name, productCount: 0, fallbackOrder: Number.MAX_SAFE_INTEGER };
      current.productCount += 1;
      current.fallbackOrder = Math.min(current.fallbackOrder, product.menuOrder ?? product.suggestion?.rank ?? product.sourceOrder ?? productIndex);
      result.set(name, current);
      return result;
    }, new Map<string, { name: string; productCount: number; fallbackOrder: number }>()).values())
      .sort((a, b) => (savedGroupOrder.get(a.name) ?? a.fallbackOrder) - (savedGroupOrder.get(b.name) ?? b.fallbackOrder)
        || a.name.localeCompare(b.name, "pl"))
      .map((group, index) => ({ name: group.name, productCount: group.productCount, sortOrder: index }));
    return Response.json({ category, products: visibleWithSuggestions, groups });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się pobrać kolejności produktów." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { categoryId?: unknown; reset?: unknown; items?: unknown; groups?: unknown };
    const categoryId = Number(body.categoryId);
    if (!Number.isInteger(categoryId)) return Response.json({ error: "Nieprawidłowa kategoria." }, { status: 400 });
    const db = getDb();
    const [category] = await db.select({ dotykackaId: menuCategories.dotykackaId }).from(menuCategories).where(eq(menuCategories.id, categoryId)).limit(1);
    if (!category) return Response.json({ error: "Nie znaleziono kategorii." }, { status: 404 });
    if (body.reset === true) {
      await db.transaction(async (tx) => {
        await tx.update(menuProducts).set({ menuSortOrder: null, menuGroup: null }).where(eq(menuProducts.dotykackaCategoryId, category.dotykackaId));
        await tx.delete(menuGroupOrders).where(eq(menuGroupOrders.categoryId, categoryId));
      });
      return Response.json({ ok: true });
    }
    if (!Array.isArray(body.items) || !Array.isArray(body.groups)) return Response.json({ error: "Brak listy produktów lub podgrup." }, { status: 400 });
    const items = body.items as Array<{ id?: unknown; menuSortOrder?: unknown; menuGroup?: unknown }>;
    const groups = body.groups as Array<{ name?: unknown; sortOrder?: unknown }>;
    if (items.some((item) => !Number.isInteger(item.id) || !Number.isInteger(item.menuSortOrder) || (item.menuGroup != null && typeof item.menuGroup !== "string"))) {
      return Response.json({ error: "Nieprawidłowa kolejność produktów." }, { status: 400 });
    }
    const ids = items.map((item) => Number(item.id));
    if (new Set(ids).size !== ids.length) return Response.json({ error: "Produkt występuje więcej niż raz." }, { status: 400 });
    if (groups.some((group) => typeof group.name !== "string" || !Number.isInteger(group.sortOrder))) {
      return Response.json({ error: "Nieprawidłowa kolejność podgrup." }, { status: 400 });
    }
    const normalizedGroups = groups.map((group) => ({ name: String(group.name).trim(), sortOrder: Number(group.sortOrder) }));
    if (new Set(normalizedGroups.map((group) => group.name)).size !== normalizedGroups.length) {
      return Response.json({ error: "Podgrupa występuje więcej niż raz." }, { status: 400 });
    }
    const itemGroups = new Set(items.map((item) => typeof item.menuGroup === "string" ? item.menuGroup.trim() : ""));
    if (itemGroups.size !== normalizedGroups.length || normalizedGroups.some((group) => !itemGroups.has(group.name))) {
      return Response.json({ error: "Lista podgrup nie odpowiada produktom w tej kategorii." }, { status: 400 });
    }
    const owned = await db.select({ id: menuProducts.id }).from(menuProducts).where(eq(menuProducts.dotykackaCategoryId, category.dotykackaId));
    const ownedIds = new Set(owned.map((item) => item.id));
    if (ids.some((id) => !ownedIds.has(id))) return Response.json({ error: "Lista zawiera produkt z innej kategorii." }, { status: 400 });
    await db.transaction(async (tx) => {
      for (const item of items) await tx.update(menuProducts).set({
        menuSortOrder: Number(item.menuSortOrder), menuGroup: typeof item.menuGroup === "string" ? item.menuGroup.trim() || null : null,
      }).where(eq(menuProducts.id, Number(item.id)));
      await tx.delete(menuGroupOrders).where(eq(menuGroupOrders.categoryId, categoryId));
      if (normalizedGroups.length) await tx.insert(menuGroupOrders).values(normalizedGroups.map((group) => ({
        categoryId, groupName: group.name, sortOrder: group.sortOrder, updatedAt: new Date(),
      })));
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się zapisać kolejności produktów." }, { status: 503 });
  }
}
