function normalizedTag(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").toLocaleLowerCase("pl");
}

function normalizedCategory(value: string | null | undefined) {
  return normalizedTag(value ?? "");
}

export function hasTag(tags: string[], expected: string) {
  const normalizedExpected = normalizedTag(expected);
  return tags.some((tag) => normalizedTag(tag) === normalizedExpected);
}

export function isShelfProduct(tags: string[]) {
  return hasTag(tags, "PÓŁKA");
}

export type ServingTemperature = "warm" | "cold";

function hasServingTemperatureTag(tags: string[], expected: "warm" | "cold") {
  const warmTags = new Set(["warm", "cieplo"]);
  const coldTags = new Set(["cold", "zimno"]);
  const expectedTags = expected === "warm" ? warmTags : coldTags;
  return tags.some((tag) => {
    const tokens = normalizedTag(tag).replace(/[+/|,_-]+/g, " ").split(/\s+/).filter(Boolean);
    return tokens.length > 0
      && tokens.every((token) => warmTags.has(token) || coldTags.has(token))
      && tokens.some((token) => expectedTags.has(token));
  });
}

export function productTemperatures(tags: string[]): ServingTemperature[] {
  return [
    ...(hasServingTemperatureTag(tags, "warm") ? ["warm" as const] : []),
    ...(hasServingTemperatureTag(tags, "cold") ? ["cold" as const] : []),
  ];
}

export function productTakeawayAvailable(tags: string[]) {
  return hasTag(tags, "TOGO");
}

export function shouldSyncMenuProduct(tags: string[], menuTag: string) {
  return hasTag(tags, menuTag) || isShelfProduct(tags);
}

export function shouldManageMenuProduct(tags: string[], menuTag: string, inventoryTracked: boolean) {
  return inventoryTracked || shouldSyncMenuProduct(tags, menuTag);
}

export function isIngredientInventoryCategory(categoryName: string | null | undefined) {
  return normalizedCategory(categoryName) === "skladniki";
}

export function isInventoryTaggedIngredient(categoryName: string | null | undefined, tags: string[]) {
  return isIngredientInventoryCategory(categoryName) && hasTag(tags, "INWENT");
}

export function shelfHasPositiveStock(stockQuantity: string | number | null | undefined) {
  return Number(stockQuantity ?? 0) > 0;
}

export function menuProductDestinations(
  tags: string[],
  menuTag: string,
  stockQuantity: string | number | null | undefined,
) {
  return {
    regular: hasTag(tags, menuTag),
    shelf: isShelfProduct(tags) && shelfHasPositiveStock(stockQuantity),
  };
}

export function menuProductIsAvailable(
  tags: string[],
  menuTag: string,
  stockDeduct: boolean,
  stockOverdraft: string | null | undefined,
  stockQuantity: string | number | null | undefined,
) {
  const destinations = menuProductDestinations(tags, menuTag, stockQuantity);
  const regularStockVisible = !(stockDeduct && stockOverdraft === "DISABLE" && Number(stockQuantity ?? 0) <= 0);
  return (destinations.regular && regularStockVisible) || destinations.shelf;
}

export function regularProductStockIsAvailable(
  stockDeduct: boolean,
  stockOverdraft: string | null | undefined,
  stockQuantity: string | number | null | undefined,
) {
  return !(stockDeduct && stockOverdraft === "DISABLE" && Number(stockQuantity ?? 0) <= 0);
}
