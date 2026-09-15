export type SparklingType = "SPARKLING" | "NATURALLY_SPARKLING";

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pl")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectSparklingType(...values: Array<string | null | undefined>): SparklingType | null {
  const value = normalized(values.filter(Boolean).join(" "));
  if (!value) return null;
  if (/\b(naturalnie musuj\w*|pet[ -]?nat\w*|petillant naturel|methode ancestrale|metoda ancestrale|ancestral\w*)\b/.test(value)) {
    return "NATURALLY_SPARKLING";
  }
  if (/\b(musuj\w*|sparkling|prosecco|cava|frizzante|spumante|sekt|champagne|szampan\w*)\b/.test(value)) {
    return "SPARKLING";
  }
  return null;
}

export function wineColorWithoutSparkling(value: string | null | undefined) {
  if (!value) return null;
  const color = value.trim();
  return /^(musuj\w*|sparkling|wino musuj\w*)$/i.test(normalized(color)) ? null : color;
}

export function isZeroAlcoholValue(value: string | null | undefined) {
  const statedAlcohol = value?.match(/\d+(?:[.,]\d+)?/)?.[0];
  return statedAlcohol != null && Number(statedAlcohol.replace(",", ".")) === 0;
}
