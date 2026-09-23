import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../../db";
import { waiterEmployees } from "../../../../../../../db/schema";
import { isAdmin } from "../../../../../../../lib/admin-auth";

export async function PUT(request: Request, context: { params: Promise<{ dotykackaId: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { dotykackaId } = await context.params;
  const body = await request.json().catch(() => ({})) as { enabled?: unknown };
  if (typeof body.enabled !== "boolean") return Response.json({ error: "Nieprawidłowe uprawnienie." }, { status: 400 });
  const [employee] = await getDb().update(waiterEmployees)
    .set({ canControlLighting: body.enabled })
    .where(and(
      eq(waiterEmployees.dotykackaId, dotykackaId),
      eq(waiterEmployees.enabled, true),
      eq(waiterEmployees.deleted, false),
    ))
    .returning({ id: waiterEmployees.id });
  if (!employee) return Response.json({ error: "Pracownik nie istnieje lub jest nieaktywny." }, { status: 404 });
  return Response.json({ ok: true, canControlLighting: body.enabled });
}
