import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { menuCategories, menuProducts, productContent, suppliers } from "../../../../db/schema";
import { isAdmin } from "../../../../lib/admin-auth";
import { parseProductCodes } from "../../../../lib/product-codes";
import { productImageUrl } from "../../../../lib/image-import";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rows = await getDb().select({
      id: menuProducts.id,
      dotykackaId: menuProducts.dotykackaId,
      name: menuProducts.name,
      wineCode: menuProducts.wineCode,
      catalogCode: menuProducts.catalogCode,
      pluCodes: menuProducts.pluCodes,
      licenseCodes: menuProducts.licenseCodes,
      dotykackaSupplierId: menuProducts.dotykackaSupplierId,
      supplierName: suppliers.name,
      supplierProductCode: menuProducts.supplierProductCode,
      eanCodes: menuProducts.eanCodes,
      sourceDescription: menuProducts.sourceDescription,
      category: menuCategories.name,
      price: menuProducts.priceWithVat,
      currency: menuProducts.currency,
      display: menuProducts.display,
      deleted: menuProducts.deleted,
      stockDeduct: menuProducts.stockDeduct,
      stockOverdraft: menuProducts.stockOverdraft,
      stockQuantity: menuProducts.stockQuantity,
      salesCount30d: menuProducts.salesCount30d,
      salesSyncedAt: menuProducts.salesSyncedAt,
      tags: menuProducts.tags,
      allergens: menuProducts.allergens,
      features: menuProducts.features,
      menuTagged: menuProducts.menuTagged,
      syncedAt: menuProducts.syncedAt,
      contentUpdatedAt: productContent.updatedAt,
      nameEn: productContent.nameEn,
      descriptionPl: productContent.descriptionPl,
      descriptionEn: productContent.descriptionEn,
      countryEn: productContent.countryEn,
      regionEn: productContent.regionEn,
      wineStyleEn: productContent.wineStyleEn,
      tastingNotesEn: productContent.tastingNotesEn,
      autoTranslate: productContent.autoTranslate,
      translationSourceHash: productContent.translationSourceHash,
      imageSourceUrl: productContent.imageSourceUrl,
      imagePath: productContent.imagePath,
      galleryPaths: productContent.galleryPaths,
      detailBackdropPath: productContent.detailBackdropPath,
      detailBackdropSourceUrl: productContent.detailBackdropSourceUrl,
      featured: productContent.featured,
      featuredSortOrder: productContent.featuredSortOrder,
      contentApproved: productContent.contentApproved,
      hideWhenOutOfStock: productContent.hideWhenOutOfStock,
      manualHidden: productContent.manualHidden,
      waiterVisibilityOverride: productContent.waiterVisibilityOverride,
      country: productContent.country,
      region: productContent.region,
      grapes: productContent.grapes,
      wineStyle: productContent.wineStyle,
      wineColor: productContent.wineColor,
      sparklingType: productContent.sparklingType,
      sweetness: productContent.sweetness,
      veganStatus: productContent.veganStatus,
      tastingNotes: productContent.tastingNotes,
      drinkVesselId: productContent.drinkVesselId,
      espressoShots: productContent.espressoShots,
      alcoholMarker: productContent.alcoholMarker,
      attributes: productContent.attributes,
      staffInstructions: productContent.staffInstructions,
      staffMedia: productContent.staffMedia,
    }).from(menuProducts)
      .leftJoin(menuCategories, eq(menuProducts.dotykackaCategoryId, menuCategories.dotykackaId))
      .leftJoin(productContent, eq(menuProducts.id, productContent.productId))
      .leftJoin(suppliers, eq(menuProducts.dotykackaSupplierId, suppliers.dotykackaId))
      .orderBy(asc(menuCategories.sortOrder), asc(menuProducts.name));
    return Response.json({ products: rows.map((row) => ({
      ...row,
      imagePath: productImageUrl(row.imagePath),
      galleryPaths: (row.galleryPaths ?? []).map((imagePath) => productImageUrl(imagePath)).filter((imagePath): imagePath is string => Boolean(imagePath)),
      detailBackdropPath: productImageUrl(row.detailBackdropPath),
      catalogCodeCandidates: parseProductCodes(row.pluCodes).catalogCodes,
    })) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się odczytać produktów.";
    return Response.json({ error: message }, { status: 503 });
  }
}
