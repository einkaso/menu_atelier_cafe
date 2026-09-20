import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../../../../db";
import { menuCategories, menuProducts, suppliers, wineSources } from "../../../../../../db/schema";
import { isAdmin } from "../../../../../../lib/admin-auth";
import { sectionFor } from "../../../../../../lib/menu-categories";
import { discoverProductInformation, discoverProductInformationFromText, discoverProductInformationFromUrl, proposalHasContent } from "../../../../../../lib/product-enrichment";
import { proposalNeedsPolishTranslation, translateProductProposalToPolish, translationConfigured } from "../../../../../../lib/translation";

export const dynamic = "force-dynamic";

const discoverySchema = z.object({
  sourceUrl: z.string().url().max(2048).optional(),
  sourceText: z.string().trim().min(30).max(150_000).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Sesja administratora wygasła. Odśwież panel i zaloguj się ponownie." }, { status: 401 });
  const parsedBody = discoverySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsedBody.success) return Response.json({ error: "Podaj prawidłowy adres strony lub wklej co najmniej 30 znaków jej treści." }, { status: 400 });
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
    supplierId: suppliers.id,
    supplierName: suppliers.name,
    supplierWebsite: suppliers.websiteUrl,
  }).from(menuProducts)
    .leftJoin(menuCategories, eq(menuProducts.dotykackaCategoryId, menuCategories.dotykackaId))
    .leftJoin(suppliers, eq(menuProducts.dotykackaSupplierId, suppliers.dotykackaId))
    .where(eq(menuProducts.id, productId)).limit(1);
  if (!product) return Response.json({ error: "Produkt nie istnieje." }, { status: 404 });

  const section = product.wineCode ? "wine" : sectionFor(product.category);
  const discoveryKind = section === "wine" || section === "whisky" || section === "beer" || section === "cocktails" ? section : "product";

  const discoveryInput = {
    name: product.name,
    kind: discoveryKind,
    supplierName: product.supplierName,
    supplierWebsite: product.supplierWebsite,
    supplierProductCode: product.supplierProductCode,
    eanCodes: product.eanCodes,
    catalogCode: product.catalogCode,
  } as const;
  let result;
  try {
    result = parsedBody.data.sourceText
      ? discoverProductInformationFromText(discoveryInput, parsedBody.data.sourceText, parsedBody.data.sourceUrl)
      : parsedBody.data.sourceUrl
        ? await discoverProductInformationFromUrl(discoveryInput, parsedBody.data.sourceUrl)
        : await discoverProductInformation(discoveryInput);
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Nie udało się odczytać wskazanej strony produktu.",
    }, { status: 422 });
  }

  if (proposalNeedsPolishTranslation(result.proposal)) {
    if (!translationConfigured()) {
      result.warnings.push("Wykryto anglojęzyczne dane, ale DeepL nie jest skonfigurowany — propozycja wymaga ręcznego tłumaczenia na polski.");
    } else {
      try {
        result.proposal = (await translateProductProposalToPolish(result.proposal)) ?? result.proposal;
      } catch {
        result.warnings.push("Nie udało się teraz przetłumaczyć anglojęzycznej propozycji. Spróbuj ponownie przed jej zaakceptowaniem.");
      }
    }
  }

  if (!proposalHasContent(result.proposal)) {
    return Response.json({
      created: false,
      manualSearchUrl: result.manualSearchUrl,
      webSearchConfigured: result.webSearchConfigured,
      warnings: result.warnings,
      message: "Nie znaleziono danych, które można bezpiecznie zaproponować. Użyj wyszukiwania ręcznego.",
    });
  }

  const [source] = await db.insert(wineSources).values({
    productId: product.id,
    supplierId: product.supplierId,
    fingerprint: result.fingerprint,
    sourceUrl: result.sourceUrls[0] ?? product.supplierWebsite ?? null,
    sourceKind: result.sourceKind,
    ean: product.eanCodes[0] ?? null,
    supplierProductCode: product.supplierProductCode,
    proposedContent: result.proposal,
    status: "PENDING",
    decision: null,
    fetchedAt: new Date(),
    decidedAt: null,
  }).onConflictDoUpdate({
    target: [wineSources.productId, wineSources.fingerprint],
    set: {
      supplierId: product.supplierId,
      sourceUrl: result.sourceUrls[0] ?? product.supplierWebsite ?? null,
      sourceKind: result.sourceKind,
      ean: product.eanCodes[0] ?? null,
      supplierProductCode: product.supplierProductCode,
      proposedContent: result.proposal,
      status: "PENDING",
      decision: null,
      fetchedAt: new Date(),
      decidedAt: null,
    },
  }).returning({ id: wineSources.id });

  return Response.json({
    created: true,
    sourceId: source.id,
    sourceUrls: result.sourceUrls,
    sourceKind: result.sourceKind,
    manualSearchUrl: result.manualSearchUrl,
    webSearchConfigured: result.webSearchConfigured,
    warnings: result.warnings,
  });
}
