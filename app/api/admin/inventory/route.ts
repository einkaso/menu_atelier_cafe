import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { dotykackaStockEvents, inventoryCatalogCategories, inventoryCatalogProducts, inventoryEvents, inventoryStageItems, inventoryStages, menuProducts, productContent, waiterEmployees } from "../../../../db/schema";
import { currentAdmin } from "../../../../lib/admin-auth";
import { cleanInventoryLocation, inventoryDifference, millisToQuantity, selectInventoryProducts } from "../../../../lib/inventory";
import { isIngredientInventoryCategory } from "../../../../lib/menu-tags";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const [categoryRows, catalogProducts, employees, stages, reportableStages, stageItems, approvedResults, positiveMovements] = await Promise.all([
    db.select().from(inventoryCatalogCategories).where(eq(inventoryCatalogCategories.deleted, false)).orderBy(asc(inventoryCatalogCategories.sortOrder), asc(inventoryCatalogCategories.name)),
    db.select({
      dotykackaId: inventoryCatalogProducts.dotykackaId,
      categoryId: inventoryCatalogProducts.categoryDotykackaId,
      name: inventoryCatalogProducts.name,
      stockDeduct: inventoryCatalogProducts.stockDeduct,
      inventoryTracked: inventoryCatalogProducts.inventoryTracked,
      inventoryCountingMode: inventoryCatalogProducts.inventoryCountingMode,
      servingsPerContainer: inventoryCatalogProducts.servingsPerContainer,
      stockQuantity: inventoryCatalogProducts.stockQuantity,
      unit: inventoryCatalogProducts.unit,
      imageSourceUrl: inventoryCatalogProducts.imageSourceUrl,
      deleted: inventoryCatalogProducts.deleted,
    }).from(inventoryCatalogProducts).orderBy(asc(inventoryCatalogProducts.name)),
    db.select({ dotykackaId: waiterEmployees.dotykackaId, name: waiterEmployees.name }).from(waiterEmployees).where(and(eq(waiterEmployees.enabled, true), eq(waiterEmployees.deleted, false))).orderBy(asc(waiterEmployees.name)),
    db.select().from(inventoryStages).orderBy(desc(inventoryStages.createdAt)).limit(100),
    db.select({ id: inventoryStages.id }).from(inventoryStages).where(inArray(inventoryStages.status, ["SUBMITTED", "APPROVED", "SENDING", "PROCESSING", "FINISHED", "FAILED", "UNKNOWN"])),
    db.select({
      stageId: inventoryStageItems.stageId,
      productDotykackaId: inventoryStageItems.productDotykackaId,
      productName: inventoryStageItems.productName,
      expectedQuantity: inventoryStageItems.expectedQuantity,
      countedQuantity: inventoryStageItems.countedQuantity,
      referencePrice: inventoryStageItems.referencePrice,
      countStatus: inventoryStageItems.countStatus,
      reasonCode: inventoryStageItems.reasonCode,
    }).from(inventoryStageItems).where(isNotNull(inventoryStageItems.countedQuantity)),
    db.select({
      productDotykackaId: inventoryStageItems.productDotykackaId,
      countedQuantity: inventoryStageItems.countedQuantity,
      approvedAt: inventoryStages.approvedAt,
    }).from(inventoryStageItems)
      .innerJoin(inventoryStages, eq(inventoryStageItems.stageId, inventoryStages.id))
      .where(and(isNotNull(inventoryStages.approvedAt), isNotNull(inventoryStageItems.countedQuantity)))
      .orderBy(desc(inventoryStages.approvedAt), desc(inventoryStageItems.id)),
    db.select({
      dotykackaProductId: dotykackaStockEvents.dotykackaProductId,
      quantity: dotykackaStockEvents.quantity,
      occurredAt: dotykackaStockEvents.occurredAt,
      receivedAt: dotykackaStockEvents.receivedAt,
    }).from(dotykackaStockEvents).where(and(isNotNull(dotykackaStockEvents.dotykackaProductId), gt(dotykackaStockEvents.quantity, "0"))),
  ]);
  const trackedProducts = catalogProducts.filter((product) => product.categoryId && !product.deleted && product.inventoryTracked && product.stockQuantity != null);
  const inventorySelection = selectInventoryProducts(trackedProducts, approvedResults, positiveMovements);
  const productCountByCategory = new Map<string, number>();
  const skippedZeroCountByCategory = new Map<string, number>();
  for (const product of inventorySelection.included) {
    if (!product.categoryId) continue;
    productCountByCategory.set(product.categoryId, (productCountByCategory.get(product.categoryId) ?? 0) + 1);
  }
  for (const product of inventorySelection.skippedConfirmedZero) {
    if (!product.categoryId) continue;
    skippedZeroCountByCategory.set(product.categoryId, (skippedZeroCountByCategory.get(product.categoryId) ?? 0) + 1);
  }
  const itemStatsByStage = new Map<number, { counted: number; differences: number; total: number }>();
  const stageTotals = new Map<number, number>();
  for (const item of stageItems) {
    const stats = itemStatsByStage.get(item.stageId) ?? { counted: 0, differences: 0, total: 0 };
    stats.counted += item.countStatus === "PENDING" ? 0 : 1;
    stats.differences += inventoryDifference(item.expectedQuantity, item.countedQuantity) ? 1 : 0;
    itemStatsByStage.set(item.stageId, stats);
  }
  const allStageItems = await db.select({ stageId: inventoryStageItems.stageId }).from(inventoryStageItems);
  for (const item of allStageItems) stageTotals.set(item.stageId, (stageTotals.get(item.stageId) ?? 0) + 1);
  const anomalyByProduct = new Map<string, { productDotykackaId: string; productName: string; occurrences: number; netDifferenceMillis: number; referenceLoss: number; reasons: Record<string, number> }>();
  const reportableStageIds = new Set(reportableStages.map((stage) => stage.id));
  for (const item of stageItems) {
    if (!reportableStageIds.has(item.stageId)) continue;
    const difference = inventoryDifference(item.expectedQuantity, item.countedQuantity);
    if (!difference) continue;
    const anomaly = anomalyByProduct.get(item.productDotykackaId) ?? { productDotykackaId: item.productDotykackaId, productName: item.productName, occurrences: 0, netDifferenceMillis: 0, referenceLoss: 0, reasons: {} };
    anomaly.occurrences += 1;
    anomaly.netDifferenceMillis += difference;
    if (difference < 0) anomaly.referenceLoss += Math.abs(difference / 1000) * Number(item.referencePrice ?? 0);
    if (item.reasonCode) anomaly.reasons[item.reasonCode] = (anomaly.reasons[item.reasonCode] ?? 0) + 1;
    anomalyByProduct.set(item.productDotykackaId, anomaly);
  }
  return Response.json({
    categories: categoryRows.map((category) => ({
      ...category,
      productCount: productCountByCategory.get(category.dotykackaId) ?? 0,
      skippedConfirmedZeroCount: skippedZeroCountByCategory.get(category.dotykackaId) ?? 0,
    })).filter((category) => category.productCount > 0),
    products: catalogProducts.filter((product) => !product.deleted && product.stockDeduct && product.stockQuantity != null).map((product) => ({
      dotykackaId: product.dotykackaId,
      categoryDotykackaId: product.categoryId,
      categoryName: categoryRows.find((category) => category.dotykackaId === product.categoryId)?.name ?? "Bez kategorii",
      name: product.name,
      inventoryTracked: product.inventoryTracked,
      inventoryCountingMode: product.inventoryCountingMode,
      servingsPerContainer: product.servingsPerContainer,
      stockQuantity: product.stockQuantity,
      unit: product.unit,
      imageSourceUrl: product.imageSourceUrl,
    })),
    employees,
    stages: stages.map((stage) => ({ ...stage, totalItems: stageTotals.get(stage.id) ?? 0, countedItems: itemStatsByStage.get(stage.id)?.counted ?? 0, differences: itemStatsByStage.get(stage.id)?.differences ?? 0 })),
    anomalies: [...anomalyByProduct.values()].sort((left, right) => right.occurrences - left.occurrences || right.referenceLoss - left.referenceLoss).slice(0, 20).map((item) => ({ ...item, netDifference: millisToQuantity(item.netDifferenceMillis), referenceLoss: item.referenceLoss.toFixed(2) })),
    inventoryWriteEnabled: process.env.DOTYKACKA_INVENTORY_WRITE_ENABLED === "true",
  });
}

export async function POST(request: Request) {
  const actor = await currentAdmin();
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { categoryDotykackaId?: unknown; assignedEmployeeDotykackaId?: unknown; title?: unknown; dueAt?: unknown; locations?: unknown };
  const categoryDotykackaId = typeof body.categoryDotykackaId === "string" ? body.categoryDotykackaId : "";
  const assignedEmployeeDotykackaId = typeof body.assignedEmployeeDotykackaId === "string" ? body.assignedEmployeeDotykackaId : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
  const rawLocations = Array.isArray(body.locations) ? body.locations : [];
  const locations = [...new Set(rawLocations.map(cleanInventoryLocation).filter(Boolean))].slice(0, 12);
  const dueAt = typeof body.dueAt === "string" && body.dueAt ? new Date(body.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) return Response.json({ error: "Nieprawidłowy termin etapu." }, { status: 400 });
  if (!categoryDotykackaId || !assignedEmployeeDotykackaId) return Response.json({ error: "Wybierz kategorię i pracownika." }, { status: 400 });

  const db = getDb();
  const [[category], [employee], products, localProducts, approvedResults, positiveMovements] = await Promise.all([
    db.select().from(inventoryCatalogCategories).where(and(eq(inventoryCatalogCategories.dotykackaId, categoryDotykackaId), eq(inventoryCatalogCategories.deleted, false))).limit(1),
    db.select({ dotykackaId: waiterEmployees.dotykackaId, name: waiterEmployees.name }).from(waiterEmployees).where(and(eq(waiterEmployees.dotykackaId, assignedEmployeeDotykackaId), eq(waiterEmployees.enabled, true), eq(waiterEmployees.deleted, false))).limit(1),
    db.select().from(inventoryCatalogProducts).where(and(eq(inventoryCatalogProducts.categoryDotykackaId, categoryDotykackaId), eq(inventoryCatalogProducts.deleted, false), eq(inventoryCatalogProducts.inventoryTracked, true), isNotNull(inventoryCatalogProducts.stockQuantity))).orderBy(asc(inventoryCatalogProducts.name)),
    db.select({ id: menuProducts.id, dotykackaId: menuProducts.dotykackaId, imagePath: productContent.imagePath }).from(menuProducts).leftJoin(productContent, eq(menuProducts.id, productContent.productId)),
    db.select({
      productDotykackaId: inventoryStageItems.productDotykackaId,
      countedQuantity: inventoryStageItems.countedQuantity,
      approvedAt: inventoryStages.approvedAt,
    }).from(inventoryStageItems)
      .innerJoin(inventoryStages, eq(inventoryStageItems.stageId, inventoryStages.id))
      .where(and(isNotNull(inventoryStages.approvedAt), isNotNull(inventoryStageItems.countedQuantity)))
      .orderBy(desc(inventoryStages.approvedAt), desc(inventoryStageItems.id)),
    db.select({
      dotykackaProductId: dotykackaStockEvents.dotykackaProductId,
      quantity: dotykackaStockEvents.quantity,
      occurredAt: dotykackaStockEvents.occurredAt,
      receivedAt: dotykackaStockEvents.receivedAt,
    }).from(dotykackaStockEvents).where(and(isNotNull(dotykackaStockEvents.dotykackaProductId), gt(dotykackaStockEvents.quantity, "0"))),
  ]);
  if (!category) return Response.json({ error: "Kategoria nie istnieje w katalogu magazynowym." }, { status: 404 });
  if (!employee) return Response.json({ error: "Pracownik nie istnieje lub jest nieaktywny w Dotykačce." }, { status: 404 });
  if (!products.length) return Response.json({ error: "Ta kategoria nie ma aktywnych produktów ze śledzeniem stanu." }, { status: 400 });
  const inventorySelection = selectInventoryProducts(products, approvedResults, positiveMovements);
  const productsToCount = inventorySelection.included;
  if (!productsToCount.length) return Response.json({ error: "Wszystkie śledzone produkty w tej kategorii mają wcześniej potwierdzony stan zero i od tamtej pory nie zarejestrowano przyjęcia. Nie ma pozycji do ponownego liczenia." }, { status: 409 });
  const localByDotykackaId = new Map(localProducts.map((product) => [product.dotykackaId, product]));
  const now = new Date();
  const expectedSnapshotAt = productsToCount.reduce((oldest, product) => product.syncedAt < oldest ? product.syncedAt : oldest, productsToCount[0].syncedAt);
  const [created] = await db.transaction(async (tx) => {
    const [stage] = await tx.insert(inventoryStages).values({
      externalId: randomUUID(),
      title: title || `Inwentaryzacja: ${category.name}`,
      categoryDotykackaId,
      categoryName: category.name,
      assignedEmployeeDotykackaId,
      assignedEmployeeName: employee.name,
      locations: locations.length ? locations : ["Główne miejsce"],
      dueAt,
      expectedSnapshotAt,
      createdBy: actor.username,
      updatedAt: now,
    }).returning();
    await tx.insert(inventoryStageItems).values(productsToCount.map((product) => {
      const local = localByDotykackaId.get(product.dotykackaId);
      return {
        stageId: stage.id,
        productLocalId: local?.id ?? null,
        productDotykackaId: product.dotykackaId,
        productName: product.name,
        imagePath: local?.imagePath ?? product.imageSourceUrl,
        eanCodes: product.eanCodes,
        pluCodes: product.pluCodes,
        wineCode: product.wineCode,
        catalogCode: product.catalogCode,
        unit: product.unit || "szt.",
        countingMode: product.inventoryCountingMode,
        servingsPerContainer: product.servingsPerContainer,
        expectedQuantity: product.stockQuantity ?? "0",
        referencePrice: product.priceWithVat,
      };
    }));
    await tx.insert(inventoryEvents).values({ stageId: stage.id, actorType: "ADMIN", actorId: actor.username, actorName: actor.employeeName ?? actor.username, action: "CREATED", details: { category: category.name, assignedTo: employee.name, productCount: productsToCount.length, skippedConfirmedZeroCount: inventorySelection.skippedConfirmedZero.length, locations: locations.length ? locations : ["Główne miejsce"] } });
    return [stage];
  });
  return Response.json({ ok: true, stageId: created.id, skippedConfirmedZeroCount: inventorySelection.skippedConfirmedZero.length }, { status: 201 });
}

export async function PATCH(request: Request) {
  const actor = await currentAdmin();
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { action?: unknown; productDotykackaId?: unknown; inventoryTracked?: unknown; servingsPerContainer?: unknown };
  if (typeof body.productDotykackaId !== "string") return Response.json({ error: "Nieprawidłowy produkt magazynowy." }, { status: 400 });
  let values: { inventoryTracked?: boolean; inventoryCountingMode?: string; servingsPerContainer?: number };
  if (body.action === "SET_PRODUCT_TRACKING" && typeof body.inventoryTracked === "boolean") {
    const [product] = await getDb().select({ categoryName: inventoryCatalogCategories.name })
      .from(inventoryCatalogProducts)
      .leftJoin(inventoryCatalogCategories, eq(inventoryCatalogProducts.categoryDotykackaId, inventoryCatalogCategories.dotykackaId))
      .where(eq(inventoryCatalogProducts.dotykackaId, body.productDotykackaId))
      .limit(1);
    if (isIngredientInventoryCategory(product?.categoryName)) {
      return Response.json({ error: "Dla kategorii Składniki wybór jest sterowany tagiem INWENT w Dotykačce." }, { status: 409 });
    }
    values = { inventoryTracked: body.inventoryTracked };
  } else if (body.action === "SET_WINE_SERVINGS" && (body.servingsPerContainer === 5 || body.servingsPerContainer === 6)) {
    values = { inventoryCountingMode: "WINE_BOTTLE", servingsPerContainer: body.servingsPerContainer };
  } else {
    return Response.json({ error: "Nieprawidłowa zmiana produktu magazynowego." }, { status: 400 });
  }
  const [updated] = await getDb().update(inventoryCatalogProducts).set(values).where(eq(inventoryCatalogProducts.dotykackaId, body.productDotykackaId)).returning({ id: inventoryCatalogProducts.id });
  if (!updated) return Response.json({ error: "Produkt nie istnieje w katalogu magazynowym." }, { status: 404 });
  return Response.json({ ok: true });
}
