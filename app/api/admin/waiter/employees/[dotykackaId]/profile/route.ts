import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../../db";
import { waiterEmployees } from "../../../../../../../db/schema";
import { isAdmin } from "../../../../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

function optionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length > maxLength) throw new Error(`Wartość może mieć maksymalnie ${maxLength} znaków.`);
  return text || null;
}

function hourlyRate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).trim().replace(",", ".");
  if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(normalized)) throw new Error("Podaj prawidłową stawkę godzinową, maksymalnie z dwoma miejscami po przecinku.");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0 || amount > 10_000) throw new Error("Stawka godzinowa musi mieścić się w zakresie od 0 do 10 000 zł.");
  return amount.toFixed(2);
}

export async function PUT(request: Request, context: { params: Promise<{ dotykackaId: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { dotykackaId } = await context.params;
  const body = await request.json().catch(() => ({})) as {
    includeInSchedule?: unknown;
    hourlyRate?: unknown;
    contactPhone?: unknown;
    contactEmail?: unknown;
  };
  if (typeof body.includeInSchedule !== "boolean") return Response.json({ error: "Wybierz, czy pracownika uwzględniać w grafiku." }, { status: 400 });
  try {
    const rate = hourlyRate(body.hourlyRate);
    const phone = optionalText(body.contactPhone, 40);
    const email = optionalText(body.contactEmail, 254)?.toLocaleLowerCase() ?? null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Podaj prawidłowy adres e-mail.");
    const [employee] = await getDb().update(waiterEmployees).set({
      includeInSchedule: body.includeInSchedule,
      hourlyRate: rate,
      contactPhone: phone,
      contactEmail: email,
    }).where(and(
      eq(waiterEmployees.dotykackaId, dotykackaId),
      eq(waiterEmployees.enabled, true),
      eq(waiterEmployees.deleted, false),
    )).returning({ id: waiterEmployees.id });
    if (!employee) return Response.json({ error: "Pracownik nie istnieje lub jest nieaktywny." }, { status: 404 });
    return Response.json({ ok: true, profile: { includeInSchedule: body.includeInSchedule, hourlyRate: rate, contactPhone: phone, contactEmail: email } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się zapisać informacji o pracowniku." }, { status: 400 });
  }
}
