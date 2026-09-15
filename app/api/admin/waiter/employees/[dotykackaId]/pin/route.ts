import { and, eq, isNotNull, ne } from "drizzle-orm";
import { getDb } from "../../../../../../../db";
import { waiterEmployees } from "../../../../../../../db/schema";
import { isAdmin } from "../../../../../../../lib/admin-auth";
import { hashWaiterPin, validWaiterPin, verifyWaiterPin } from "../../../../../../../lib/waiter-auth";

export async function PUT(request: Request, context: { params: Promise<{ dotykackaId: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { dotykackaId } = await context.params;
  const body = await request.json().catch(() => ({})) as { pin?: unknown };
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!validWaiterPin(pin)) return Response.json({ error: "PIN musi mieć od 4 do 8 cyfr." }, { status: 400 });
  const [employee] = await getDb().select({ id: waiterEmployees.id }).from(waiterEmployees).where(and(
    eq(waiterEmployees.dotykackaId, dotykackaId), eq(waiterEmployees.enabled, true), eq(waiterEmployees.deleted, false),
  )).limit(1);
  if (!employee) return Response.json({ error: "Pracownik nie istnieje lub jest nieaktywny w Dotykačce." }, { status: 404 });
  const others = await getDb().select({ pinHash: waiterEmployees.pinHash }).from(waiterEmployees).where(and(
    ne(waiterEmployees.dotykackaId, dotykackaId), isNotNull(waiterEmployees.pinHash),
  ));
  for (const item of others) {
    if (item.pinHash && await verifyWaiterPin(pin, item.pinHash)) return Response.json({ error: "Ten PIN jest już przypisany innemu pracownikowi." }, { status: 409 });
  }
  await getDb().update(waiterEmployees).set({ pinHash: await hashWaiterPin(pin) }).where(eq(waiterEmployees.dotykackaId, dotykackaId));
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ dotykackaId: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { dotykackaId } = await context.params;
  await getDb().update(waiterEmployees).set({ pinHash: null }).where(eq(waiterEmployees.dotykackaId, dotykackaId));
  return Response.json({ ok: true });
}
