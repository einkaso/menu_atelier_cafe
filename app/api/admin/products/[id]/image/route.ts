import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { menuCategories, menuProducts, productContent, suppliers } from "../../../../../../db/schema";
import { isAdmin } from "../../../../../../lib/admin-auth";
import { importProductImage, importUploadedProductImage, removeProductImageFile } from "../../../../../../lib/image-import";
import { sectionFor } from "../../../../../../lib/menu-categories";
import { findAlternativeProductImageUrls } from "../../../../../../lib/product-enrichment";

export const dynamic = "force-dynamic";

async function removeImageWhenUnused(storedPath: string | null | undefined) {
  if (!storedPath) return;
  const [reference] = await getDb().select({ productId: productContent.productId }).from(productContent)
    .where(eq(productContent.imagePath, storedPath)).limit(1);
  if (!reference) await removeProductImageFile(storedPath);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const productId = Number((await context.params).id);
  if (!Number.isInteger(productId) || productId < 1) return Response.json({ error: "Nieprawidłowy produkt." }, { status: 400 });

  const db = getDb();
  const [product] = await db.select({
    id: menuProducts.id,
    name: menuProducts.name,
    wineCode: menuProducts.wineCode,
    catalogCode: menuProducts.catalogCode,
    supplierProductCode: menuProducts.supplierProductCode,
    eanCodes: menuProducts.eanCodes,
    category: menuCategories.name,
    supplierName: suppliers.name,
    supplierWebsite: suppliers.websiteUrl,
  }).from(menuProducts)
    .leftJoin(menuCategories, eq(menuProducts.dotykackaCategoryId, menuCategories.dotykackaId))
    .leftJoin(suppliers, eq(menuProducts.dotykackaSupplierId, suppliers.dotykackaId))
    .where(eq(menuProducts.id, productId)).limit(1);
  if (!product) return Response.json({ error: "Produkt nie istnieje." }, { status: 404 });

  try {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    let imagePath: string;
    let imageSourceUrl: string | null = null;
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => null) as { imageSourceUrl?: unknown } | null;
      if (typeof body?.imageSourceUrl !== "string" || !body.imageSourceUrl.trim()) {
        return Response.json({ error: "Wklej publiczny adres zdjęcia." }, { status: 400 });
      }
      imageSourceUrl = body.imageSourceUrl.trim();
      try {
        imagePath = await importProductImage(productId, imageSourceUrl);
      } catch (directError) {
        const section = product.wineCode ? "wine" : sectionFor(product.category);
        const alternatives = await findAlternativeProductImageUrls({
          name: product.name,
          kind: section === "wine" || section === "beer" ? section : "product",
          supplierName: product.supplierName,
          supplierWebsite: product.supplierWebsite,
          supplierProductCode: product.supplierProductCode,
          eanCodes: product.eanCodes,
          catalogCode: product.catalogCode,
        }, imageSourceUrl).catch(() => []);
        let imported: { imagePath: string; sourceUrl: string } | null = null;
        for (const alternative of alternatives) {
          try {
            imported = { imagePath: await importProductImage(productId, alternative.url), sourceUrl: alternative.url };
            break;
          } catch { /* Try the next strongly matched public source. */ }
        }
        if (!imported) throw directError;
        imagePath = imported.imagePath;
        imageSourceUrl = imported.sourceUrl;
      }
    } else {
      const form = await request.formData().catch(() => null);
      const image = form?.get("image");
      if (!(image instanceof File)) return Response.json({ error: "Nie wybrano zdjęcia." }, { status: 400 });
      imagePath = await importUploadedProductImage(productId, image);
    }
    const related = product.wineCode ? await db.select({ id: menuProducts.id }).from(menuProducts)
      .where(and(eq(menuProducts.wineCode, product.wineCode), ne(menuProducts.id, productId))) : [];
    const targetIds = [productId, ...related.map((item) => item.id)];
    const previousImages = await db.select({ imagePath: productContent.imagePath }).from(productContent)
      .where(inArray(productContent.productId, targetIds));
    const values = { imagePath, imageSourceUrl, updatedAt: new Date() };
    for (const targetId of targetIds) {
      await db.insert(productContent).values({ productId: targetId, ...values }).onConflictDoUpdate({
        target: productContent.productId,
        set: values,
      });
    }
    for (const previous of new Set(previousImages.map((item) => item.imagePath).filter((value): value is string => Boolean(value) && value !== imagePath))) {
      await removeImageWhenUnused(previous);
    }
    return Response.json({ status: "ok", imagePath, imageSourceUrl, updatedAt: values.updatedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się zapisać zdjęcia.";
    return Response.json({ error: message }, { status: 422 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const productId = Number((await context.params).id);
  if (!Number.isInteger(productId) || productId < 1) return Response.json({ error: "Nieprawidłowy produkt." }, { status: 400 });
  const db = getDb();
  const [product] = await db.select({ id: menuProducts.id, wineCode: menuProducts.wineCode }).from(menuProducts)
    .where(eq(menuProducts.id, productId)).limit(1);
  if (!product) return Response.json({ error: "Produkt nie istnieje." }, { status: 404 });
  const related = product.wineCode ? await db.select({ id: menuProducts.id }).from(menuProducts)
    .where(and(eq(menuProducts.wineCode, product.wineCode), ne(menuProducts.id, productId))) : [];
  const targetIds = [productId, ...related.map((item) => item.id)];
  const previousImages = await db.select({ imagePath: productContent.imagePath }).from(productContent)
    .where(inArray(productContent.productId, targetIds));
  await db.update(productContent).set({ imagePath: null, imageSourceUrl: null, updatedAt: new Date() })
    .where(inArray(productContent.productId, targetIds));
  for (const previous of new Set(previousImages.map((item) => item.imagePath).filter((value): value is string => Boolean(value)))) {
    await removeImageWhenUnused(previous);
  }
  return Response.json({ status: "ok", affectedProducts: targetIds.length });
}
