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
