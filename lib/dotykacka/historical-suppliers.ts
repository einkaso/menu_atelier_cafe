import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { menuProducts, suppliers, wineSources } from "../../db/schema";
import { analyzeHistoricalReports, parsePurchaseMovements, parseReceiptHeaders, type HistoricalAssignment } from "./historical-reports";

type CatalogProduct = {
  id: number;
  name: string;
  wineCode: string | null;
  pluCodes: string[];
  eanCodes: string[];
  supplierDetectedAt: Date | null;
};

const catalogCode = /^[A-Z]{3}\d+$/i;

function normalized(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/\b[A-Z]{3}\d+\b/gi, " ").replace(/\bbutelka\b/gi, " ").replace(/[_–—-]+/g, " ")
    .replace(/[^a-z0-9%]+/gi, " ").trim().replace(/\s+/g, " ").toLocaleLowerCase("pl");
}

function addIndex(map: Map<string, CatalogProduct[]>, key: string, product: CatalogProduct) {
  if (!key) return;
  map.set(key, [...(map.get(key) ?? []), product]);
}

function unique(rows: CatalogProduct[] | undefined) { return rows?.length === 1 ? rows[0] : null; }

export type HistoricalImportResult = {
  receiptDocuments: number;
  purchaseGroups: number;
  purchaseLines: number;
  linkedPurchaseLines: number;
  unresolvedReportLines: number;
  suppliersFound: number;
  catalogProductsMatched: number;
  catalogProductsUnmatched: number;
  productsToUpdate: number;
  multipleSupplierProducts: number;
  applied: boolean;
  warnings: string[];
};

export async function importHistoricalSuppliers(receiptFile: Uint8Array, movementFile: Uint8Array, apply: boolean): Promise<HistoricalImportResult> {
  const receiptRows = parseReceiptHeaders(receiptFile);
  const movementRows = parsePurchaseMovements(movementFile);
  const analysis = analyzeHistoricalReports(receiptRows, movementRows);
  if (apply && analysis.unresolvedMovements.length > 0) {
    throw new Error(`Import zatrzymany: ${analysis.unresolvedMovements.length} pozycji raportu nie ma jednoznacznego dokumentu dostawy.`);
  }
  const db = getDb();
  const products = await db.select({
    id: menuProducts.id, name: menuProducts.name, wineCode: menuProducts.wineCode, pluCodes: menuProducts.pluCodes,
    eanCodes: menuProducts.eanCodes, supplierDetectedAt: menuProducts.supplierDetectedAt,
  }).from(menuProducts) as CatalogProduct[];
  const byEan = new Map<string, CatalogProduct[]>();
  const byPlu = new Map<string, CatalogProduct[]>();
  const byName = new Map<string, CatalogProduct[]>();
  const byWineCode = new Map<string, CatalogProduct[]>();
  for (const product of products) {
    for (const ean of product.eanCodes ?? []) addIndex(byEan, ean.trim(), product);
    for (const plu of product.pluCodes ?? []) if (catalogCode.test(plu.trim())) addIndex(byPlu, plu.trim().toUpperCase(), product);
    addIndex(byName, normalized(product.name), product);
    if (product.wineCode) addIndex(byWineCode, product.wineCode, product);
  }
  const matchProduct = (assignment: HistoricalAssignment) => {
    const { movement } = assignment;
    const direct = unique(byEan.get(movement.ean))
      ?? (catalogCode.test(movement.plu) ? unique(byPlu.get(movement.plu.toUpperCase())) : null)
      ?? unique(byName.get(normalized(movement.productName)));
    return direct ? (direct.wineCode ? byWineCode.get(direct.wineCode) ?? [direct] : [direct]) : [];
  };
  const resolved = analysis.assignments.map((assignment) => ({ assignment, products: matchProduct(assignment) }));
  const matchedCatalogIds = new Set(resolved.flatMap((item) => item.products.map((product) => product.id)));
  const unmatchedCatalogNames = Array.from(new Set(resolved.filter((item) => !item.products.length).map((item) => item.assignment.movement.productName))).sort((a, b) => a.localeCompare(b, "pl"));
  const productSuppliers = new Map<number, Set<string>>();
  for (const item of resolved) for (const product of item.products) {
    const values = productSuppliers.get(product.id) ?? new Set<string>();
    values.add(item.assignment.receipt.supplierId); productSuppliers.set(product.id, values);
  }

  if (apply) {
    const supplierDatabaseIds = new Map<string, number>();
    for (const receipt of receiptRows) {
      if (supplierDatabaseIds.has(receipt.supplierId)) continue;
      const [saved] = await db.insert(suppliers).values({ dotykackaId: receipt.supplierId, name: receipt.supplierName, syncedAt: new Date() }).onConflictDoUpdate({
        target: suppliers.dotykackaId, set: { name: receipt.supplierName, syncedAt: new Date() },
      }).returning({ id: suppliers.id });
      supplierDatabaseIds.set(receipt.supplierId, saved.id);
    }
    for (const item of resolved.sort((a, b) => a.assignment.movement.occurredAt.getTime() - b.assignment.movement.occurredAt.getTime())) {
      const { assignment } = item;
      for (const product of item.products) {
        const supplierId = supplierDatabaseIds.get(assignment.receipt.supplierId) ?? null;
        const fingerprint = `historical:${assignment.receipt.supplierId}:${assignment.receipt.documentNumber}:${assignment.receipt.occurredAt.toISOString()}`;
        await db.insert(wineSources).values({
          productId: product.id, supplierId, fingerprint, sourceKind: "HISTORICAL_STOCKUP", ean: assignment.movement.ean || null,
          status: "APPLIED", decision: "AUTOMATIC", fetchedAt: assignment.movement.occurredAt, decidedAt: new Date(),
        }).onConflictDoNothing({ target: [wineSources.productId, wineSources.fingerprint] });
        if (!product.supplierDetectedAt || assignment.movement.occurredAt >= product.supplierDetectedAt) {
          await db.update(menuProducts).set({ dotykackaSupplierId: assignment.receipt.supplierId, supplierDetectedAt: assignment.movement.occurredAt }).where(eq(menuProducts.id, product.id));
          product.supplierDetectedAt = assignment.movement.occurredAt;
        }
      }
    }
  }

  return {
    receiptDocuments: analysis.receiptCount,
    purchaseGroups: analysis.purchaseGroupCount,
    purchaseLines: analysis.purchaseLineCount,
    linkedPurchaseLines: analysis.assignments.length,
    unresolvedReportLines: analysis.unresolvedMovements.length,
    suppliersFound: analysis.supplierCount,
    catalogProductsMatched: matchedCatalogIds.size,
    catalogProductsUnmatched: unmatchedCatalogNames.length,
    productsToUpdate: matchedCatalogIds.size,
    multipleSupplierProducts: Array.from(productSuppliers.values()).filter((values) => values.size > 1).length,
    applied: apply,
    warnings: unmatchedCatalogNames.slice(0, 20),
  };
}
