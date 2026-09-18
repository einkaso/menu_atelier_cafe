import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../../../../db";
import { menuProducts, productContent, type StaffManualMedia } from "../../../../../../db/schema";
import { isAdmin } from "../../../../../../lib/admin-auth";
import { importStaffManualMedia, removeStaffManualMedia } from "../../../../../../lib/staff-manual-media";

export const dynamic = "force-dynamic";
const MAX_MEDIA_ITEMS = 8;
const deleteSchema = z.object({ mediaId: z.string().regex(/^[a-f0-9]{16}$/) });

async function productAndMedia(productId: number) {
  return (await getDb().select({
    id: menuProducts.id,
    staffMedia: productContent.staffMedia,
  }).from(menuProducts).leftJoin(productContent, eq(menuProducts.id, productContent.productId))
    .where(eq(menuProducts.id, productId)).limit(1))[0];
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const productId = Number((await context.params).id);
  if (!Number.isInteger(productId) || productId < 1) return Response.json({ error: "Nieprawidłowy produkt." }, { status: 400 });
  const product = await productAndMedia(productId);
  if (!product) return Response.json({ error: "Produkt nie istnieje." }, { status: 404 });
  const form = await request.formData().catch(() => null);
  const files = (form?.getAll("media") ?? []).filter((item): item is File => item instanceof File && item.size > 0);
  if (!files.length) return Response.json({ error: "Wybierz przynajmniej jedno zdjęcie lub film." }, { status: 400 });
  const current = product.staffMedia ?? [];
  if (current.length + files.length > MAX_MEDIA_ITEMS) return Response.json({ error: `Instrukcja może zawierać maksymalnie ${MAX_MEDIA_ITEMS} plików.` }, { status: 400 });
  try {
    const imported: StaffManualMedia[] = [];
    for (const file of files) imported.push(await importStaffManualMedia(productId, file));
    const next = [...current];
    for (const media of imported) if (!next.some((item) => item.id === media.id)) next.push(media);
    await getDb().insert(productContent).values({ productId, staffMedia: next, updatedAt: new Date() }).onConflictDoUpdate({
      target: productContent.productId,
      set: { staffMedia: next, updatedAt: new Date() },
    });
    return Response.json({ status: "ok", media: next });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się zapisać plików instrukcji." }, { status: 422 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const productId = Number((await context.params).id);
  if (!Number.isInteger(productId) || productId < 1) return Response.json({ error: "Nieprawidłowy produkt." }, { status: 400 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Nieprawidłowy plik." }, { status: 400 });
  const product = await productAndMedia(productId);
  if (!product) return Response.json({ error: "Produkt nie istnieje." }, { status: 404 });
  const current = product.staffMedia ?? [];
  const removed = current.find((item) => item.id === parsed.data.mediaId);
  if (!removed) return Response.json({ error: "Plik nie istnieje." }, { status: 404 });
  const next = current.filter((item) => item.id !== removed.id);
  await getDb().update(productContent).set({ staffMedia: next, updatedAt: new Date() }).where(eq(productContent.productId, productId));
  await removeStaffManualMedia(removed.path);
  return Response.json({ status: "ok", media: next });
}
