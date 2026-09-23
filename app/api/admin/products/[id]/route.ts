import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../../../db";
import { drinkVessels, menuProducts, productContent } from "../../../../../db/schema";
import { isAdmin } from "../../../../../lib/admin-auth";
import { preserveProductAttributeTranslations, productAttributesNeedTranslation, productAttributesPl, translateMenuContent, translateProductAttributes, translationSourceHash } from "../../../../../lib/translation";

export const dynamic = "force-dynamic";

const contentSchema = z.object({
  nameEn: z.string().max(400).nullable().optional(),
  descriptionPl: z.string().max(4000).nullable().optional(),
  descriptionEn: z.string().max(4000).nullable().optional(),
  autoTranslate: z.boolean().optional(),
  imageSourceUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  featured: z.boolean().optional(),
  featuredSortOrder: z.number().int().min(0).nullable().optional(),
  contentApproved: z.boolean().optional(),
  hideWhenOutOfStock: z.boolean().optional(),
  manualHidden: z.boolean().optional(),
  country: z.string().max(200).nullable().optional(),
  region: z.string().max(200).nullable().optional(),
  grapes: z.string().max(500).nullable().optional(),
  wineStyle: z.string().max(200).nullable().optional(),
  wineColor: z.string().max(100).nullable().optional(),
  sparklingType: z.enum(["SPARKLING", "NATURALLY_SPARKLING"]).nullable().optional(),
  sweetness: z.string().max(100).nullable().optional(),
  veganStatus: z.enum(["YES", "NO", "UNKNOWN"]).nullable().optional(),
  tastingNotes: z.string().max(2000).nullable().optional(),
  drinkVesselId: z.number().int().positive().nullable().optional(),
  espressoShots: z.union([z.literal(0), z.literal(1), z.literal(2)]).nullable().optional(),
  alcoholMarker: z.boolean().optional(),
  staffInstructions: z.string().max(12000).nullable().optional(),
  attributes: z.record(z.string(), z.string().max(1000)).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id: rawId } = await context.params;
  const productId = Number(rawId);
  if (!Number.isInteger(productId) || productId < 1) return Response.json({ error: "Nieprawidłowy produkt." }, { status: 400 });
  const parsed = contentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const fields = Array.from(new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "formularz"))));
    return Response.json({ error: `Nieprawidłowe dane formularza: ${fields.join(", ")}.` }, { status: 400 });
  }
  const db = getDb();
  const [product] = await db.select({
    id: menuProducts.id,
    wineCode: menuProducts.wineCode,
    name: menuProducts.name,
    sourceDescription: menuProducts.sourceDescription,
    imageSourceUrl: productContent.imageSourceUrl,
    imagePath: productContent.imagePath,
    nameEn: productContent.nameEn,
    descriptionPl: productContent.descriptionPl,
    descriptionEn: productContent.descriptionEn,
    countryEn: productContent.countryEn,
    regionEn: productContent.regionEn,
    wineStyleEn: productContent.wineStyleEn,
    tastingNotesEn: productContent.tastingNotesEn,
    featuredSortOrder: productContent.featuredSortOrder,
    autoTranslate: productContent.autoTranslate,
    translationSourceHash: productContent.translationSourceHash,
    sparklingType: productContent.sparklingType,
    veganStatus: productContent.veganStatus,
    attributes: productContent.attributes,
  }).from(menuProducts)
    .leftJoin(productContent, eq(menuProducts.id, productContent.productId))
    .where(eq(menuProducts.id, productId)).limit(1);
  if (!product) return Response.json({ error: "Produkt nie istnieje." }, { status: 404 });
  if (parsed.data.drinkVesselId != null) {
    const [vessel] = await db.select({ id: drinkVessels.id }).from(drinkVessels)
      .where(and(eq(drinkVessels.id, parsed.data.drinkVesselId), eq(drinkVessels.active, true))).limit(1);
    if (!vessel) return Response.json({ error: "Wybrane naczynie nie istnieje lub jest nieaktywne." }, { status: 400 });
  }
  // Zapis opisu i parametrów nie może zmieniać zdjęcia. Import, zastąpienie i
  // usunięcie obrazu obsługuje wyłącznie dedykowany endpoint /image, dzięki
  // czemu zdjęcie pozostaje do czasu świadomego kliknięcia „Usuń zdjęcie”.
  const imageSourceUrl = product.imageSourceUrl;
  const imagePath = product.imagePath;
  const autoTranslate = parsed.data.autoTranslate ?? product.autoTranslate ?? true;
  const sourceAttributes = productAttributesPl(parsed.data.attributes ?? product.attributes);
  const translateAttributes = productAttributesNeedTranslation(sourceAttributes, product.attributes);
  const translationSource = {
    id: productId,
    name: product.name,
    description: parsed.data.descriptionPl ?? product.descriptionPl,
    country: parsed.data.country,
    region: parsed.data.region,
    wineStyle: parsed.data.wineStyle,
    tastingNotes: parsed.data.tastingNotes,
    preserveName: false,
  };
  const sourceHash = translationSourceHash(translationSource);
  let translated = null;
  let translatedAttributes: Record<string, string> | null = null;
  let translationWarning: string | null = null;
  if (autoTranslate && (sourceHash !== product.translationSourceHash || translateAttributes)) {
    try {
      if (sourceHash !== product.translationSourceHash) translated = (await translateMenuContent([translationSource]))?.[0] ?? null;
      if (translateAttributes) translatedAttributes = await translateProductAttributes(sourceAttributes);
      if ((sourceHash !== product.translationSourceHash && !translated) || (translateAttributes && !translatedAttributes)) translationWarning = "Tłumaczenie automatyczne czeka na konfigurację DeepL API.";
    } catch {
      translated = null;
      translatedAttributes = null;
      translationWarning = "Zapisano produkt, ale automatyczne tłumaczenie chwilowo się nie powiodło.";
    }
  }
  const values = {
    ...parsed.data,
    // Saving the editor is the administrator's explicit confirmation. Keeping
    // a second approval checkbox would duplicate the same action.
    contentApproved: true,
    autoTranslate,
    nameEn: translated?.nameEn ?? parsed.data.nameEn ?? product.nameEn,
    descriptionEn: translated?.descriptionEn ?? parsed.data.descriptionEn ?? product.descriptionEn,
    countryEn: translated?.countryEn ?? product.countryEn,
    regionEn: translated?.regionEn ?? product.regionEn,
    wineStyleEn: translated?.wineStyleEn ?? product.wineStyleEn,
    tastingNotesEn: translated?.tastingNotesEn ?? product.tastingNotesEn,
    translationSourceHash: translated?.sourceHash ?? product.translationSourceHash,
    attributes: translatedAttributes ?? preserveProductAttributeTranslations(sourceAttributes, product.attributes),
    sparklingType: parsed.data.sparklingType === undefined ? product.sparklingType : parsed.data.sparklingType,
    veganStatus: parsed.data.veganStatus ?? product.veganStatus ?? "UNKNOWN",
    imageSourceUrl,
    imagePath,
    updatedAt: new Date(),
  };
  const [savedContent] = await db.insert(productContent).values({ productId, ...values }).onConflictDoUpdate({
    target: productContent.productId,
    set: values,
  }).returning({
    descriptionPl: productContent.descriptionPl,
    descriptionEn: productContent.descriptionEn,
    imagePath: productContent.imagePath,
    contentApproved: productContent.contentApproved,
    updatedAt: productContent.updatedAt,
  });
  if (product.wineCode) {
    const related = await db.select({ id: menuProducts.id }).from(menuProducts)
      .where(and(eq(menuProducts.wineCode, product.wineCode), ne(menuProducts.id, productId)));
    const sharedValues = {
      descriptionPl: values.descriptionPl,
      descriptionEn: values.descriptionEn,
      countryEn: values.countryEn,
      regionEn: values.regionEn,
      wineStyleEn: values.wineStyleEn,
      tastingNotesEn: values.tastingNotesEn,
      autoTranslate: values.autoTranslate,
      translationSourceHash: values.translationSourceHash,
      country: values.country,
      region: values.region,
      grapes: values.grapes,
      wineStyle: values.wineStyle,
      wineColor: values.wineColor,
      sparklingType: values.sparklingType,
      sweetness: values.sweetness,
      veganStatus: values.veganStatus,
      tastingNotes: values.tastingNotes,
      attributes: values.attributes,
      contentApproved: values.contentApproved,
      updatedAt: values.updatedAt,
    };
    for (const relatedProduct of related) {
      await db.insert(productContent).values({ productId: relatedProduct.id, ...sharedValues }).onConflictDoUpdate({
        target: productContent.productId,
        set: sharedValues,
      });
    }
  }
  return Response.json({ status: "ok", warning: translationWarning, saved: savedContent });
}
