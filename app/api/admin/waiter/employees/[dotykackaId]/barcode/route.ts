import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb } from "../../../../../../../db";
import { waiterEmployees } from "../../../../../../../db/schema";
import { isAdmin } from "../../../../../../../lib/admin-auth";
import { DotykackaClient } from "../../../../../../../lib/dotykacka/client";
import { getDotykackaConfig } from "../../../../../../../lib/dotykacka/config";

export const dynamic = "force-dynamic";

function generatedBarcode() {
  return `MBE-${randomBytes(10).toString("hex").toUpperCase()}`;
}

export async function POST(_request: Request, context: { params: Promise<{ dotykackaId: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { dotykackaId } = await context.params;
  if (!/^\d+$/.test(dotykackaId)) return Response.json({ error: "Nieprawidłowy identyfikator pracownika." }, { status: 400 });
  const db = getDb();
  const [employee] = await db.select({
    dotykackaId: waiterEmployees.dotykackaId,
    name: waiterEmployees.name,
    barcode: waiterEmployees.barcode,
  }).from(waiterEmployees).where(and(
    eq(waiterEmployees.dotykackaId, dotykackaId),
    eq(waiterEmployees.enabled, true),
    eq(waiterEmployees.deleted, false),
  )).limit(1);
  if (!employee) return Response.json({ error: "Pracownik nie istnieje lub jest nieaktywny." }, { status: 404 });
  if (employee.barcode) return Response.json({ error: "Ten pracownik ma już kod. Odśwież listę pracowników." }, { status: 409 });

  try {
    let barcode = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generatedBarcode();
      const [collision] = await db.select({ id: waiterEmployees.id }).from(waiterEmployees).where(eq(waiterEmployees.barcode, candidate)).limit(1);
      if (!collision) { barcode = candidate; break; }
    }
    if (!barcode) throw new Error("Nie udało się wygenerować unikalnego kodu. Spróbuj ponownie.");
    const result = await new DotykackaClient(await getDotykackaConfig()).assignEmployeeBarcode(dotykackaId, barcode);
    await db.update(waiterEmployees).set({ barcode: result.barcode, syncedAt: new Date() }).where(eq(waiterEmployees.dotykackaId, dotykackaId));
    return Response.json({ ok: true, barcode: result.barcode, created: result.created, employeeName: employee.name });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się zapisać kodu pracownika w Dotykačce." }, { status: 502 });
  }
}
