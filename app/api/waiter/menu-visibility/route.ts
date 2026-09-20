import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { menuCategories, menuProducts, menuVisibilityEvents, productContent } from "../../../../db/schema";
import { MENU_VISIBILITY_REASONS, menuProductVisibleForGuest } from "../../../../lib/menu-visibility";
import { currentWaiter } from "../../../../lib/waiter-auth";

export async function POST(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja kelnera wygasła." }, { status: 401 });
  if (!employee.canManageMenuVisibility) return Response.json({ error: "Nie masz uprawnienia do zmiany widoczności menu." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { productId?: unknown; visible?: unknown; reason?: unknown };
  const productId = Number(body.productId);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!Number.isInteger(productId) || productId < 1 || typeof body.visible !== "boolean" || !MENU_VISIBILITY_REASONS.includes(reason as (typeof MENU_VISIBILITY_REASONS)[number])) {
    return Response.json({ error: "Wybierz produkt, nowy stan i powód zmiany." }, { status: 400 });
  }
  const visible = body.visible;
  const db = getDb();
  const [product] = await db.select({
    id: menuProducts.id,
    dotykackaId: menuProducts.dotykackaId,
    name: menuProducts.name,
    categoryName: menuCategories.name,
    display: menuProducts.display,
    deleted: menuProducts.deleted,
    menuTagged: menuProducts.menuTagged,
    manualHidden: productContent.manualHidden,
    waiterVisibilityOverride: productContent.waiterVisibilityOverride,
  }).from(menuProducts)
    .innerJoin(menuCategories, eq(menuProducts.dotykackaCategoryId, menuCategories.dotykackaId))
    .leftJoin(productContent, eq(menuProducts.id, productContent.productId))
    .where(and(eq(menuProducts.id, productId), eq(menuProducts.deleted, false), eq(menuProducts.menuTagged, true)))
    .limit(1);
  if (!product) return Response.json({ error: "Produkt z tagiem MENU nie istnieje lub został usunięty." }, { status: 404 });
  if (visible && product.manualHidden) return Response.json({ error: "Produkt został ukryty przez administratora. Tylko administrator może go ponownie włączyć." }, { status: 409 });
  const previousVisible = menuProductVisibleForGuest(product.display, product.manualHidden, product.waiterVisibilityOverride);
  if (previousVisible === visible) return Response.json({ ok: true, visible, unchanged: true });
  await db.transaction(async (tx) => {
    await tx.insert(productContent).values({ productId, waiterVisibilityOverride: visible, updatedAt: new Date() }).onConflictDoUpdate({
      target: productContent.productId,
      set: { waiterVisibilityOverride: visible, updatedAt: new Date() },
    });
    await tx.insert(menuVisibilityEvents).values({
      productId,
      productDotykackaId: product.dotykackaId,
      productName: product.name,
      categoryName: product.categoryName,
      previousVisible,
      visible,
      reason,
      employeeDotykackaId: employee.dotykackaId,
      employeeName: employee.name,
    });
  });
  return Response.json({ ok: true, visible });
}
