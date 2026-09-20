export type ManualSearchKind = "wine" | "whisky" | "beer" | "cocktails" | "product";

export function manualProductSearchTerms(kind: ManualSearchKind) {
  if (kind === "wine") return "wino";
  if (kind === "whisky") return "whisky koniak brandy";
  if (kind === "beer") return "piwo";
  if (kind === "cocktails") return "alkohol drink koktajl skład profil smakowy zdjęcie";
  return "produkt";
}

export function productSearchTitle(name: string) {
  return name
    .replace(/\b(?:WIN|WHI|GIN|VOD)\s*[-_]?\s*\d+\b/gi, " ")
    .replace(/\s*[-—_/]?\s*\b(?:(?:na\s+)?kielisz(?:ek|ki)|butelka|glass|bottle)\b.*$/i, "")
    .replace(/\s+\d{2,4}\s*(?:ml|cl|l)\b.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function manualProductSearchUrl(name: string, kind: ManualSearchKind) {
  const title = productSearchTitle(name) || name.trim();
  const query = `"${title}" ${manualProductSearchTerms(kind)}`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
