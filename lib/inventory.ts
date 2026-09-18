export const INVENTORY_REASON_CODES = [
  "BRAK",
  "NADWYZKA",
  "ZEPSUCIE",
  "STLUCZENIE",
  "PRZETERMINOWANIE",
  "ZUZYCIE_WEWNETRZNE",
  "BLAD_DOSTAWY",
  "BLAD_EWIDENCJI",
  "INNE",
] as const;

export type InventoryReasonCode = typeof INVENTORY_REASON_CODES[number];

export function quantityToMillis(value: unknown) {
  const normalized = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim().replace(",", ".") : "";
  if (!/^\d{1,11}(?:\.\d{1,3})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const result = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}

export function nonNegativeWholeNumber(value: unknown) {
  const normalized = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,9}$/.test(normalized)) return null;
  const result = Number(normalized);
  return Number.isSafeInteger(result) ? result : null;
}

export function wineBottleQuantityMillis(wholeBottles: number, looseGlasses: number, glassesPerBottle: number) {
  if (!Number.isSafeInteger(wholeBottles) || wholeBottles < 0 || !Number.isSafeInteger(looseGlasses) || looseGlasses < 0) return null;
  if (!Number.isSafeInteger(glassesPerBottle) || glassesPerBottle < 2 || glassesPerBottle > 12) return null;
  return wholeBottles * 1000 + Math.round(looseGlasses * 1000 / glassesPerBottle);
}

export function millisToQuantity(value: number) {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute / 1000);
  const fraction = String(absolute % 1000).padStart(3, "0").replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function validInventoryReason(value: unknown): value is InventoryReasonCode {
  return typeof value === "string" && (INVENTORY_REASON_CODES as readonly string[]).includes(value);
}

export function cleanInventoryLocation(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 80) : "";
}

export function inventoryDifference(expected: string | number, counted: string | number | null) {
  if (counted == null) return null;
  return (quantityToMillis(counted) ?? 0) - (quantityToMillis(expected) ?? 0);
}

type InventoryProductCandidate = {
  dotykackaId: string;
  stockQuantity: string | number | null;
};

type ApprovedInventoryResult = {
  productDotykackaId: string;
  countedQuantity: string | number | null;
  approvedAt: Date | string | null;
};

type PositiveStockMovement = {
  dotykackaProductId: string | null;
  quantity: string | number | null;
  occurredAt: Date | string | null;
  receivedAt: Date | string;
};

function inventoryTimestamp(value: Date | string | null | undefined) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string" || !value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function selectInventoryProducts<T extends InventoryProductCandidate>(
  products: T[],
  approvedResults: ApprovedInventoryResult[],
  positiveMovements: PositiveStockMovement[],
) {
  const latestApprovedResult = new Map<string, { countedQuantity: number; approvedAt: number }>();
  for (const result of approvedResults) {
    const approvedAt = inventoryTimestamp(result.approvedAt);
    const countedQuantity = Number(result.countedQuantity);
    if (approvedAt == null || !Number.isFinite(countedQuantity)) continue;
    const previous = latestApprovedResult.get(result.productDotykackaId);
    if (!previous || approvedAt > previous.approvedAt) latestApprovedResult.set(result.productDotykackaId, { countedQuantity, approvedAt });
  }

  const latestPositiveMovement = new Map<string, number>();
  for (const movement of positiveMovements) {
    if (!movement.dotykackaProductId || Number(movement.quantity) <= 0) continue;
    const occurredAt = inventoryTimestamp(movement.occurredAt) ?? inventoryTimestamp(movement.receivedAt);
    if (occurredAt == null) continue;
    const previous = latestPositiveMovement.get(movement.dotykackaProductId);
    if (previous == null || occurredAt > previous) latestPositiveMovement.set(movement.dotykackaProductId, occurredAt);
  }

  const included: T[] = [];
  const skippedConfirmedZero: T[] = [];
  for (const product of products) {
    const currentQuantity = Number(product.stockQuantity);
    const previous = latestApprovedResult.get(product.dotykackaId);
    const positiveMovementAt = latestPositiveMovement.get(product.dotykackaId);
    const safelyStillZero = currentQuantity === 0
      && previous?.countedQuantity === 0
      && (positiveMovementAt == null || positiveMovementAt <= previous.approvedAt);
    if (safelyStillZero) skippedConfirmedZero.push(product);
    else included.push(product);
  }
  return { included, skippedConfirmedZero };
}
