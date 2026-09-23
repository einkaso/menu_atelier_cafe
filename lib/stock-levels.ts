export type StockStateFilter = "all" | "zero" | "positive" | "negative" | "unknown";

export type StockLevelProduct = {
  id: number;
  dotykackaId: string;
  categoryId: string | null;
  name: string;
  category: string | null;
  stockQuantity: string | null;
  unit: string | null;
  tags: string[];
  stockDeduct: boolean;
  display: boolean;
  syncedAt: string;
};

export type UsedStockTag = { key: string; label: string; count: number };

export function normalizeStockText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").toLocaleLowerCase("pl").replace(/\s+/g, " ").trim();
}

export function stockQuantityValue(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const quantity = Number(value);
  return Number.isFinite(quantity) ? quantity : null;
}

export function usedStockTags(products: Pick<StockLevelProduct, "tags">[]): UsedStockTag[] {
  const tags = new Map<string, UsedStockTag>();
  for (const product of products) {
    const seen = new Set<string>();
    for (const rawTag of product.tags ?? []) {
      const label = rawTag.trim();
      const key = normalizeStockText(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const current = tags.get(key);
      tags.set(key, current ? { ...current, count: current.count + 1 } : { key, label, count: 1 });
    }
  }
  return Array.from(tags.values()).sort((left, right) => left.label.localeCompare(right.label, "pl"));
}

export function filterStockLevels(products: StockLevelProduct[], filters: {
  query: string;
  category: string;
  state: StockStateFilter;
  tags: Iterable<string>;
}) {
  const query = normalizeStockText(filters.query);
  const selectedTags = Array.from(filters.tags);
  return products.filter((product) => {
    const quantity = stockQuantityValue(product.stockQuantity);
    if (filters.category && (product.category ?? "Bez kategorii") !== filters.category) return false;
    if (filters.state === "zero" && quantity !== 0) return false;
    if (filters.state === "positive" && !(quantity !== null && quantity > 0)) return false;
    if (filters.state === "negative" && !(quantity !== null && quantity < 0)) return false;
    if (filters.state === "unknown" && quantity !== null) return false;
    const productTags = new Set((product.tags ?? []).map(normalizeStockText).filter(Boolean));
    if (selectedTags.some((tag) => !productTags.has(tag))) return false;
    return !query || normalizeStockText(`${product.name} ${product.category ?? ""} ${(product.tags ?? []).join(" ")}`).includes(query);
  });
}

export function formatStockQuantity(value: string | null) {
  const quantity = stockQuantityValue(value);
  if (quantity === null) return "—";
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 3 }).format(quantity);
}
