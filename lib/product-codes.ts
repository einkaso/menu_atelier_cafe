export const catalogPrefixes = {
  WIN: "wino",
  WHI: "whisky",
  GIN: "gin",
  RUM: "rum",
  VOD: "wódka",
  TEQ: "tequila",
  LIK: "likier",
  BRA: "brandy lub koniak",
} as const;

const licenseCodePattern = /^(?:A|B|C|0)$/;
// Three letters plus a number is our deliberately extensible catalogue format.
// The prefix dictionary documents today's conventions but does not block a future category.
const catalogCodePattern = /^[A-Z]{3}\d{1,5}$/;

export function normalizePluCodes(value?: string[] | string | null) {
  const rawValues = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const values = rawValues.flatMap((item) => String(item).split(/[,;\n\r]+/));
  return Array.from(new Set(values.map((item) => String(item).trim().toLocaleUpperCase("pl")).filter(Boolean)));
}

export function parseProductCodes(value?: string[] | string | null) {
  const pluCodes = normalizePluCodes(value);
  const licenseCodes = pluCodes.filter((code) => licenseCodePattern.test(code));
  const catalogCodes = pluCodes.filter((code) => catalogCodePattern.test(code));
  return { pluCodes, licenseCodes, catalogCodes, catalogCode: catalogCodes[0] ?? null };
}

export function legacyWineCode(name: string) {
  const number = name.match(/\bWIN\s*[-_]?\s*(\d+)\b/i)?.[1];
  return number ? `WIN${number}` : null;
}
