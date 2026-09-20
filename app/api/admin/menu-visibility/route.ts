import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { menuVisibilityEvents, productContent } from "../../../../db/schema";
import { isAdmin } from "../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const events = await getDb().select({
      id: menuVisibilityEvents.id,
      productId: menuVisibilityEvents.productId,
      productDotykackaId: menuVisibilityEvents.productDotykackaId,
      productName: menuVisibilityEvents.productName,
      categoryName: menuVisibilityEvents.categoryName,
      previousVisible: menuVisibilityEvents.previousVisible,
      visible: menuVisibilityEvents.visible,
      reason: menuVisibilityEvents.reason,
      employeeDotykackaId: menuVisibilityEvents.employeeDotykackaId,
      employeeName: menuVisibilityEvents.employeeName,
      createdAt: menuVisibilityEvents.createdAt,
    }).from(menuVisibilityEvents)
      .orderBy(desc(menuVisibilityEvents.createdAt))
      .limit(500);
    return Response.json({ events }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się pobrać historii zmian widoczności." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { productId?: unknown };
  const productId = Number(body.productId);
  if (!Number.isInteger(productId) || productId < 1) return Response.json({ error: "Nieprawidłowy produkt." }, { status: 400 });
  try {
    await getDb().update(productContent)
      .set({ waiterVisibilityOverride: null, updatedAt: new Date() })
      .where(eq(productContent.productId, productId));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się przywrócić ustawienia z Dotykački." }, { status: 503 });
  }
}
