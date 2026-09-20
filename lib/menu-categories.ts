export const categoryRules: Array<[string, RegExp]> = [
  ["matcha", /matcha/],
  ["zero", /bezalk|0\s*%|alcohol.free/],
  ["coffee", /kaw|coffee/],
  ["tea", /herbat|tea/],
  ["cakes", /ciast|deser|cake/],
  ["wine", /win|wine/],
  ["whisky", /whisk|bourbon|koniak|cognac|brandy/],
  ["cocktails", /koktaj|drink|cocktail|^alkohol/],
  ["beer", /piw|beer/],
  ["cold", /napoj|lemoniad|sok|wod|drink/],
  ["food", /jedz|dani|sniadan|śniadan|kanap|salat|sałat|food/],
];

export function sectionFor(category: string | null) {
  const normalized = (category ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pl");
  return categoryRules.find(([, pattern]) => pattern.test(normalized))?.[0] ?? "food";
}

export function waiterCategoryName(category: string | null) {
  if (sectionFor(category) === "cakes") return "NA SŁODKO";
  return category?.trim() || "Pozostałe";
}

export const categoryTranslations: Record<string, string> = {
  food: "Food",
  coffee: "Coffee",
  tea: "Tea",
  matcha: "Matcha",
  cold: "Soft drinks",
  cakes: "Cakes & desserts",
  wine: "Wine",
  cocktails: "Alco Bar",
  zero: "Alcohol-free",
  beer: "Beer",
};

type SuggestionInput = {
  id: number;
  name: string;
  sourceOrder: number | null;
  promoProducts: number;
};

const seasonalPriority: Record<string, string[]> = {
  winter: ["coffee", "tea", "food", "cakes", "matcha", "wine", "whisky", "zero", "cocktails", "beer", "cold"],
  spring: ["food", "coffee", "cakes", "tea", "matcha", "cold", "zero", "wine", "cocktails", "whisky", "beer"],
  summer: ["cold", "zero", "beer", "wine", "cocktails", "whisky", "cakes", "food", "coffee", "tea", "matcha"],
  autumn: ["coffee", "tea", "food", "cakes", "matcha", "wine", "whisky", "zero", "cocktails", "beer", "cold"],
};

function contextInPoland(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw", month: "numeric", hour: "numeric", hourCycle: "h23",
  }).formatToParts(now);
  const month = Number(parts.find((part) => part.type === "month")?.value ?? 1);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 12);
  const season = month === 12 || month <= 2 ? "winter" : month <= 5 ? "spring" : month <= 8 ? "summer" : "autumn";
  const daypart = hour < 12 ? "morning" : hour >= 17 ? "evening" : "day";
  const seasonPl = { winter: "zima", spring: "wiosna", summer: "lato", autumn: "jesień" }[season];
  const daypartPl = { morning: "poranek", day: "dzień", evening: "wieczór" }[daypart];
  return { season, daypart, label: `${seasonPl} · ${daypartPl}` };
}

export function suggestCategoryOrder(items: SuggestionInput[], now = new Date()) {
  const context = contextInPoland(now);
  const priority = seasonalPriority[context.season];
  const score = (item: SuggestionInput) => {
    const kind = sectionFor(item.name);
    let value = priority.indexOf(kind);
    if (value < 0) value = priority.length;
    if (item.promoProducts > 0) value -= 1.5;
    if (context.daypart === "morning" && ["coffee", "food", "tea"].includes(kind)) value -= 1;
    if (context.daypart === "evening" && ["wine", "whisky", "cocktails", "beer", "zero"].includes(kind)) value -= 1;
    return value;
  };
  return {
    context: context.label,
    categoryIds: [...items].sort((a, b) => score(a) - score(b) || (a.sourceOrder ?? 9999) - (b.sourceOrder ?? 9999) || a.name.localeCompare(b.name, "pl")).map((item) => item.id),
    reason: "Uwzględniono porę roku, porę dnia oraz kategorie zawierające produkty z tagiem PROMO. Zmiana nie jest publikowana automatycznie.",
  };
}
