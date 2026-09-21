import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../../db";
import { waiterEmployees, waiterEmployeeThankYouMedia } from "../../../../../../../db/schema";
import { isAdmin } from "../../../../../../../lib/admin-auth";
import { importEmployeeThankYouMedia, removeEmployeeThankYouMedia } from "../../../../../../../lib/employee-thank-you-media";
import { employeeThankYouMessage } from "../../../../../../../lib/employee-thank-you";

export const dynamic = "force-dynamic";

async function activeEmployee(dotykackaId: string) {
  return (await getDb().select({
    id: waiterEmployees.id,
    name: waiterEmployees.name,
  }).from(waiterEmployees).where(and(
    eq(waiterEmployees.dotykackaId, dotykackaId),
    eq(waiterEmployees.enabled, true),
    eq(waiterEmployees.deleted, false),
  )).limit(1))[0];
}

export async function PUT(request: Request, context: { params: Promise<{ dotykackaId: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const dotykackaId = (await context.params).dotykackaId;
  const employee = await activeEmployee(dotykackaId);
  if (!employee) return Response.json({ error: "Pracownik nie istnieje lub jest nieaktywny." }, { status: 404 });
  const form = await request.formData().catch(() => null);
  const media = form?.get("media");
  if (!(media instanceof File)) return Response.json({ error: "Wybierz animację MP4, WebM albo GIF." }, { status: 400 });
  const existingMedia = await getDb().select({ id: waiterEmployeeThankYouMedia.id, mediaPath: waiterEmployeeThankYouMedia.mediaPath })
    .from(waiterEmployeeThankYouMedia).where(eq(waiterEmployeeThankYouMedia.employeeDotykackaId, dotykackaId));
  if (existingMedia.length >= 3) return Response.json({ error: "Ten pracownik ma już przypisane trzy animacje. Usuń jedną, aby dodać kolejną." }, { status: 409 });
  try {
    const stored = await importEmployeeThankYouMedia(employee.id, media);
    if (existingMedia.some((item) => item.mediaPath === stored.path)) return Response.json({ error: "Ta animacja jest już przypisana do pracownika." }, { status: 409 });
    const [created] = await getDb().insert(waiterEmployeeThankYouMedia).values({
      employeeDotykackaId: dotykackaId,
      mediaPath: stored.path,
      mediaType: stored.mediaType,
    }).returning({ id: waiterEmployeeThankYouMedia.id });
    return Response.json({ status: "ok", id: created.id, mediaPath: stored.path, mediaType: stored.mediaType });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się zapisać animacji." }, { status: 422 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ dotykackaId: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const dotykackaId = (await context.params).dotykackaId;
  const employee = await activeEmployee(dotykackaId);
  if (!employee) return Response.json({ error: "Pracownik nie istnieje lub jest nieaktywny." }, { status: 404 });
  const body = await _request.json().catch(() => ({})) as { mediaId?: unknown };
  const mediaId = Number(body.mediaId);
  if (!Number.isSafeInteger(mediaId) || mediaId < 1) return Response.json({ error: "Nieprawidłowa animacja." }, { status: 400 });
  const [stored] = await getDb().select({ id: waiterEmployeeThankYouMedia.id, mediaPath: waiterEmployeeThankYouMedia.mediaPath })
    .from(waiterEmployeeThankYouMedia).where(and(
      eq(waiterEmployeeThankYouMedia.id, mediaId),
      eq(waiterEmployeeThankYouMedia.employeeDotykackaId, dotykackaId),
    )).limit(1);
  if (!stored) return Response.json({ error: "Animacja nie istnieje." }, { status: 404 });
  await getDb().delete(waiterEmployeeThankYouMedia).where(eq(waiterEmployeeThankYouMedia.id, stored.id));
  await removeEmployeeThankYouMedia(stored.mediaPath);
  return Response.json({ status: "ok" });
}

export async function PATCH(request: Request, context: { params: Promise<{ dotykackaId: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const dotykackaId = (await context.params).dotykackaId;
  const employee = await activeEmployee(dotykackaId);
  if (!employee) return Response.json({ error: "Pracownik nie istnieje lub jest nieaktywny." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { message?: unknown };
  try {
    const message = employeeThankYouMessage(body.message);
    await getDb().update(waiterEmployees).set({ thankYouMessage: message }).where(eq(waiterEmployees.dotykackaId, dotykackaId));
    return Response.json({ status: "ok", message });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się zapisać podziękowania." }, { status: 400 });
  }
}
