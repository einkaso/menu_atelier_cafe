import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../../../../db";
import { menuProducts, productContent, suppliers, wineSources, type WineSourceProposal } from "../../../../../../db/schema";
import { isAdmin } from "../../../../../../lib/admin-auth";
import { importProductImage } from "../../../../../../lib/image-import";
import { detectSparklingType, wineColorWithoutSparkling } from "../../../../../../lib/wine-characteristics";

export const dynamic = "force-dynamic";

const decisionSchema = z.object({
  sourceId: z.number().int().positive(),
  decision: z.enum(["KEEP_CURRENT", "FILL_MISSING", "REPLACE"]),
  imageSourceUrl: z.union([z.string().url(), z.null()]).optional(),
});

const populated = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

async function relatedProductIds(productId: number) {
  const db = getDb();
  const [product] = await db.select({ wineCode: menuProducts.wineCode })
    .from(menuProducts).where(eq(menuProducts.id, productId)).limit(1);
  if (!product) return [];
  if (!product.wineCode) return [productId];
  const related = await db.select({ id: menuProducts.id })
    .from(menuProducts).where(eq(menuProducts.wineCode, product.wineCode));
  return related.map((item) => item.id);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const productId = Number((await context.params).id);
  if (!Number.isInteger(productId) || productId < 1) return Response.json({ error: "Nieprawidłowy produkt." }, { status: 400 });
  const productIds = await relatedProductIds(productId);
  if (!productIds.length) return Response.json({ error: "Produkt nie istnieje." }, { status: 404 });
  const rawRows = await getDb().select({
    id: wineSources.id,
    supplierName: suppliers.name,
    supplierWebsite: suppliers.websiteUrl,
    sourceUrl: wineSources.sourceUrl,
    sourceKind: wineSources.sourceKind,
    ean: wineSources.ean,
    supplierProductCode: wineSources.supplierProductCode,
    proposedContent: wineSources.proposedContent,
    status: wineSources.status,
    decision: wineSources.decision,
    fetchedAt: wineSources.fetchedAt,
    decidedAt: wineSources.decidedAt,
  }).from(wineSources)
    .leftJoin(suppliers, eq(wineSources.supplierId, suppliers.id))
    .where(inArray(wineSources.productId, productIds))
    .orderBy(desc(wineSources.fetchedAt));
  const rows = rawRows.filter((row, index) =>
    rawRows.findIndex((candidate) =>
      candidate.supplierName === row.supplierName
      && candidate.ean === row.ean
      && candidate.supplierProductCode === row.supplierProductCode
      && candidate.status === row.status
    ) === index
  );
  return Response.json({ sources: rows });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const productId = Number((await context.params).id);
  if (!Number.isInteger(productId) || productId < 1) return Response.json({ error: "Nieprawidłowy produkt." }, { status: 400 });
  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Nieprawidłowa decyzja." }, { status: 400 });
  const db = getDb();
  const productIds = await relatedProductIds(productId);
  if (!productIds.length) return Response.json({ error: "Produkt nie istnieje." }, { status: 404 });
  const [source] = await db.select({
    id: wineSources.id,
    fingerprint: wineSources.fingerprint,
    proposedContent: wineSources.proposedContent,
  }).from(wineSources).where(and(
    eq(wineSources.id, parsed.data.sourceId),
    inArray(wineSources.productId, productIds),
  )).limit(1);
  if (!source) return Response.json({ error: "Źródło nie istnieje." }, { status: 404 });

  if (parsed.data.decision !== "KEEP_CURRENT") {
    const proposal = (source.proposedContent ?? {}) as WineSourceProposal;
    const imageCandidates = proposal.imageCandidates ?? [];
    if (imageCandidates.length > 1 && !parsed.data.imageSourceUrl) {
      return Response.json({ error: "Wybierz jedno ze znalezionych zdjęć przed zastosowaniem propozycji." }, { status: 400 });
    }
    if (parsed.data.imageSourceUrl && imageCandidates.length
      && !imageCandidates.some((candidate) => candidate.url === parsed.data.imageSourceUrl)) {
      return Response.json({ error: "Wybrane zdjęcie nie należy do tej propozycji." }, { status: 400 });
    }
    const choose = (candidate: string | null | undefined, existing: string | null | undefined) => {
      if (!populated(candidate)) return existing ?? null;
      if (parsed.data.decision === "FILL_MISSING" && populated(existing)) return existing;
      return candidate.trim();
    };
    for (const targetProductId of productIds) {
      const [current] = await db.select().from(productContent).where(eq(productContent.productId, targetProductId)).limit(1);
      const proposedSparklingType = proposal.sparklingType
        ?? detectSparklingType(proposal.wineColor, proposal.wineStyle, proposal.descriptionPl, proposal.tastingNotes);
      const proposedImage = parsed.data.imageSourceUrl ?? proposal.imageSourceUrl;
      const imageSourceUrl = choose(proposedImage, current?.imageSourceUrl);
      let imagePath = current?.imagePath ?? null;
      if (imageSourceUrl && imageSourceUrl !== current?.imageSourceUrl) {
        try {
          imagePath = await importProductImage(targetProductId, imageSourceUrl);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Nie udało się pobrać zdjęcia z nowego źródła.";
          return Response.json({ error: message }, { status: 422 });
        }
      }
      const values = {
        descriptionPl: choose(proposal.descriptionPl, current?.descriptionPl),
        imageSourceUrl,
        imagePath,
        country: choose(proposal.country, current?.country),
        region: choose(proposal.region, current?.region),
        grapes: choose(proposal.grapes, current?.grapes),
        wineStyle: choose(proposal.wineStyle, current?.wineStyle),
        wineColor: choose(wineColorWithoutSparkling(proposal.wineColor), current?.wineColor),
        sparklingType: parsed.data.decision === "FILL_MISSING" && current?.sparklingType
          ? current.sparklingType
          : proposedSparklingType ?? current?.sparklingType ?? null,
        sweetness: choose(proposal.sweetness, current?.sweetness),
        veganStatus: proposal.veganStatus && proposal.veganStatus !== "UNKNOWN"
          ? (parsed.data.decision === "FILL_MISSING" && current?.veganStatus !== "UNKNOWN" ? current.veganStatus : proposal.veganStatus)
          : current?.veganStatus ?? "UNKNOWN",
        tastingNotes: choose(proposal.tastingNotes, current?.tastingNotes),
        attributes: Object.fromEntries(Array.from(new Set([
          ...Object.keys(current?.attributes ?? {}),
          ...Object.keys(proposal.attributes ?? {}),
        ])).flatMap((key) => {
          const value = choose(proposal.attributes?.[key], current?.attributes?.[key]);
          return value ? [[key, value]] : [];
        })),
        updatedAt: new Date(),
      };
      await db.insert(productContent).values({ productId: targetProductId, ...values }).onConflictDoUpdate({
        target: productContent.productId,
        set: values,
      });
    }
  }

  await db.update(wineSources).set({
    status: parsed.data.decision === "KEEP_CURRENT" ? "KEPT" : "APPLIED",
    decision: parsed.data.decision,
    decidedAt: new Date(),
  }).where(and(
    inArray(wineSources.productId, productIds),
    eq(wineSources.fingerprint, source.fingerprint),
  ));
  return Response.json({ status: "ok" });
}
