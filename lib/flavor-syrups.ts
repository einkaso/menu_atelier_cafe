export const FLAVOR_SYRUP_GROUP = "SYROP SMAKOWY";

function normalized(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pl")
    .replace(/\s+/g, " ");
}

export function isForestLifeSyrupCategory(category: string | null | undefined) {
  const value = normalized(category);
  return value.includes("syrop") && value.includes("lesne zycie");
}

export function isGenericFlavorSyrupOption(name: string | null | undefined) {
  const value = normalized(name);
  return value === "syrop" || value === "syrop smakowy";
}

export function acceptsFlavorSyrup(category: string | null | undefined, productName: string | null | undefined) {
  const categoryName = normalized(category);
  return /matcha|kaw|coffee|herbat|tea/.test(categoryName) || /lemoniad/.test(normalized(productName));
}
