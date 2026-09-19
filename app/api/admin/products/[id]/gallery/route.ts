import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { menuCategories, menuProducts, productContent } from "../../../../../../db/schema";
import { isAdmin } from "../../../../../../lib/admin-auth";
import { importUploadedProductImage, productImageUrl, removeProductImageFile } from "../../../../../../lib/image-import";
import { sectionFor } from "../../../../../../lib/menu-categories";

export const dynamic = "force-dynamic";

const MAX_GALLERY_IMAGES = 5;

function uniqueImages(imagePath: string | null, galleryPaths: string[] | null | undefined) {
  return Array.from(new Set([imagePath, ...(galleryPaths ?? [])].filter((value): value is string => Boolean(value))));
}

async function removeImageWhenUnused(storedPath: string | null | undefined) {
  if (!storedPath) return;
  const references = await getDb().select({ imagePath: productContent.imagePath, galleryPaths: productContent.galleryPaths }).from(productContent);
  if (!references.some((reference) => reference.imagePath === storedPath || (reference.galleryPaths ?? []).includes(storedPath))) {
    await removeProductImageFile(storedPath);
  }
}

async function savoryProduct(productId: number) {
  const [product] = await getDb().select({
    id: menuProducts.id,
    category: menuCategories.name,
  }).from(menuProducts)
    .leftJoin(menuCategories, eq(menuProducts.dotykackaCategoryId, menuCategories.dotykackaId))
    .where(eq(menuProducts.id, productId)).limit(1);
  if (!product) return { error: Response.json({ error: "Produkt nie istnieje." }, { status: 404 }) };
  if (sectionFor(product.category) !== "food") {
    return { error: Response.json({ error: "Galeria do pięciu zdjęć jest dostępna wyłącznie w dziale Na słono." }, { status: 422 }) };
  }
  return { product };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const productId = Number((await context.params).id);
  if (!Number.isInteger(productId) || productId < 1) return Response.json({ error: "Nieprawidłowy produkt." }, { status: 400 });
  const productResult = await savoryProduct(productId);
  if (productResult.error) return productResult.error;

  const form = await request.formData().catch(() => null);
  const files = (form?.getAll("images") ?? []).filter((item): item is File => item instanceof File && item.size > 0);
  if (!files.length) return Response.json({ error: "Nie wybrano zdjęć." }, { status: 400 });

  const db = getDb();
  const [content] = await db.select({ imagePath: productContent.imagePath, galleryPaths: productContent.galleryPaths }).from(productContent)
    .where(eq(productContent.productId, productId)).limit(1);
  const currentImages = uniqueImages(content?.imagePath ?? null, content?.galleryPaths);
  if (currentImages.length + files.length > MAX_GALLERY_IMAGES) {
    return Response.json({ error: `Galeria może zawierać maksymalnie ${MAX_GALLERY_IMAGES} zdjęć. Możesz dodać jeszcze ${Math.max(0, MAX_GALLERY_IMAGES - currentImages.length)}.` }, { status: 422 });
  }

  const imported: string[] = [];
  try {
    for (const file of files) imported.push(await importUploadedProductImage(productId, file));
    const combined = Array.from(new Set([...currentImages, ...imported])).slice(0, MAX_GALLERY_IMAGES);
    const values = {
      imagePath: combined[0] ?? null,
      galleryPaths: combined.slice(1),
      updatedAt: new Date(),
    };
    await db.insert(productContent).values({ productId, ...values }).onConflictDoUpdate({
      target: productContent.productId,
      set: values,
    });
    return Response.json({
      status: "ok",
      gallery: combined.map((imagePath) => productImageUrl(imagePath)).filter((imagePath): imagePath is string => Boolean(imagePath)),
      updatedAt: values.updatedAt,
    });
  } catch (error) {
    for (const imagePath of imported) await removeImageWhenUnused(imagePath);
    const message = error instanceof Error ? error.message : "Nie udało się zapisać zdjęć galerii.";
    return Response.json({ error: message }, { status: 422 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const productId = Number((await context.params).id);
  if (!Number.isInteger(productId) || productId < 1) return Response.json({ error: "Nieprawidłowy produkt." }, { status: 400 });
  const productResult = await savoryProduct(productId);
  if (productResult.error) return productResult.error;
  const body = await request.json().catch(() => null) as { imagePath?: unknown } | null;
  if (typeof body?.imagePath !== "string" || !body.imagePath.trim()) {
    return Response.json({ error: "Nie wskazano zdjęcia do usunięcia." }, { status: 400 });
  }

  const db = getDb();
  const [content] = await db.select({ imagePath: productContent.imagePath, galleryPaths: productContent.galleryPaths }).from(productContent)
    .where(eq(productContent.productId, productId)).limit(1);
  const currentImages = uniqueImages(content?.imagePath ?? null, content?.galleryPaths);
  const requestedUrl = productImageUrl(body.imagePath);
  const removedPath = currentImages.find((imagePath) => productImageUrl(imagePath) === requestedUrl);
  if (!removedPath) return Response.json({ error: "Zdjęcie nie należy do tej galerii." }, { status: 404 });

  const remaining = currentImages.filter((imagePath) => imagePath !== removedPath);
  const values = {
    imagePath: remaining[0] ?? null,
    galleryPaths: remaining.slice(1),
    updatedAt: new Date(),
    ...(content?.imagePath === removedPath || !remaining.length ? { imageSourceUrl: null } : {}),
  };
  await db.update(productContent).set(values).where(eq(productContent.productId, productId));
  await removeImageWhenUnused(removedPath);
  return Response.json({
    status: "ok",
    gallery: remaining.map((imagePath) => productImageUrl(imagePath)).filter((imagePath): imagePath is string => Boolean(imagePath)),
  });
}
