import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { menuCategories, menuProducts, productContent } from "../../../../../../db/schema";
import { isAdmin } from "../../../../../../lib/admin-auth";
import { importProductBackdrop, importUploadedProductBackdrop, productImageUrl, removeProductImageFile } from "../../../../../../lib/image-import";
import { isForestLifeSyrupCategory } from "../../../../../../lib/flavor-syrups";

export const dynamic = "force-dynamic";

async function forestLifeProduct(productId: number) {
  const [product] = await getDb().select({
    id: menuProducts.id,
    category: menuCategories.name,
  }).from(menuProducts)
    .leftJoin(menuCategories, eq(menuProducts.dotykackaCategoryId, menuCategories.dotykackaId))
    .where(eq(menuProducts.id, productId)).limit(1);
  if (!product) return { error: Response.json({ error: "Produkt nie istnieje." }, { status: 404 }) };
  if (!isForestLifeSyrupCategory(product.category)) {
    return { error: Response.json({ error: "Tło składnika jest dostępne dla syropów Leśne Życie." }, { status: 422 }) };
  }
  return { product };
}

async function removeBackdropWhenUnused(storedPath: string | null | undefined) {
  if (!storedPath) return;
  const references = await getDb().select({
    imagePath: productContent.imagePath,
    galleryPaths: productContent.galleryPaths,
    detailBackdropPath: productContent.detailBackdropPath,
  }).from(productContent);
  if (!references.some((reference) => reference.imagePath === storedPath
    || reference.detailBackdropPath === storedPath
    || (reference.galleryPaths ?? []).includes(storedPath))) {
    await removeProductImageFile(storedPath);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const productId = Number((await context.params).id);
  if (!Number.isInteger(productId) || productId < 1) return Response.json({ error: "Nieprawidłowy produkt." }, { status: 400 });
  const productResult = await forestLifeProduct(productId);
  if (productResult.error) return productResult.error;

  const db = getDb();
  const [current] = await db.select({
    path: productContent.detailBackdropPath,
    sourceUrl: productContent.detailBackdropSourceUrl,
  }).from(productContent).where(eq(productContent.productId, productId)).limit(1);

  try {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    let detailBackdropPath: string;
    let detailBackdropSourceUrl: string | null = null;
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => null) as { imageSourceUrl?: unknown } | null;
      if (typeof body?.imageSourceUrl !== "string" || !body.imageSourceUrl.trim()) {
        return Response.json({ error: "Wklej publiczny adres zdjęcia tła." }, { status: 400 });
      }
      detailBackdropSourceUrl = body.imageSourceUrl.trim();
      detailBackdropPath = await importProductBackdrop(productId, detailBackdropSourceUrl);
    } else {
      const form = await request.formData().catch(() => null);
      const image = form?.get("image");
      if (!(image instanceof File)) return Response.json({ error: "Nie wybrano zdjęcia tła." }, { status: 400 });
      detailBackdropPath = await importUploadedProductBackdrop(productId, image);
    }
    const values = { detailBackdropPath, detailBackdropSourceUrl, updatedAt: new Date() };
    await db.insert(productContent).values({ productId, ...values }).onConflictDoUpdate({
      target: productContent.productId,
      set: values,
    });
    await removeBackdropWhenUnused(current?.path);
    return Response.json({
      status: "ok",
      detailBackdropPath: productImageUrl(detailBackdropPath),
      detailBackdropSourceUrl,
      updatedAt: values.updatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się zapisać tła podglądu.";
    return Response.json({ error: message }, { status: 422 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const productId = Number((await context.params).id);
  if (!Number.isInteger(productId) || productId < 1) return Response.json({ error: "Nieprawidłowy produkt." }, { status: 400 });
  const productResult = await forestLifeProduct(productId);
  if (productResult.error) return productResult.error;
  const db = getDb();
  const [current] = await db.select({ path: productContent.detailBackdropPath }).from(productContent)
    .where(eq(productContent.productId, productId)).limit(1);
  await db.update(productContent).set({
    detailBackdropPath: null,
    detailBackdropSourceUrl: null,
    updatedAt: new Date(),
  }).where(eq(productContent.productId, productId));
  await removeBackdropWhenUnused(current?.path);
  return Response.json({ status: "ok" });
}
