export type ProductGroupSuggestion = { pl: string; en: string; rank: number };

function normalized(...values: Array<string | null | undefined>) {
  return values.join(" ").toLocaleLowerCase("pl").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function suggestProductGroup(category: string | null, product: string): ProductGroupSuggestion | null {
  const categoryText = normalized(category);
  const text = normalized(product);

  if (/win/.test(categoryText)) return null;
  if (/napoj|zimn|cold|soft/.test(categoryText)) {
    if (/wod|water/.test(text)) return { pl: "Wody", en: "Water", rank: 10 };
    if (/coca|cola|fanta|sprite|tonic|oran|soda|ginger/.test(text)) return { pl: "Napoje gazowane", en: "Soft drinks", rank: 20 };
    if (/lemoniad/.test(text)) return { pl: "Lemoniady własne", en: "House lemonades", rank: 30 };
    if (/sok|juice|nektar/.test(text)) return { pl: "Soki", en: "Juices", rank: 40 };
  }
  if (/kaw|coffee/.test(categoryText)) {
    if (/chemex|aeropress|aero press|drip|v60|kalita|przelew/.test(text)) return { pl: "Kawy alternatywne", en: "Alternative coffee", rank: 30 };
    if (/tonic|orange|freddo|affogato|mroz|iced/.test(text)) return { pl: "Kawy specjalne", en: "Specialty coffee", rank: 40 };
    if (/cappuccino|latte|flat white|macchiato|mlecz/.test(text)) return { pl: "Kawy mleczne", en: "Milk coffee", rank: 20 };
    if (/espresso|americano/.test(text)) return { pl: "Klasyczne", en: "Classics", rank: 10 };
  }
  if (/herbat|tea/.test(categoryText)) {
    if (/czarn|assam|earl|english|black/.test(text)) return { pl: "Czarne", en: "Black tea", rank: 10 };
    if (/ziel|sencha|green/.test(text)) return { pl: "Zielone", en: "Green tea", rank: 20 };
    if (/bial|white/.test(text)) return { pl: "Białe", en: "White tea", rank: 30 };
    if (/ziol|mint|miet|herbal/.test(text)) return { pl: "Ziołowe", en: "Herbal tea", rank: 40 };
    if (/owoc|fruit|hibiscus/.test(text)) return { pl: "Owocowe", en: "Fruit tea", rank: 50 };
  }
  if (/piw|beer/.test(categoryText)) {
    if (/bezalkohol|alcohol.?free|\b0[,.]?0?%/.test(text)) return { pl: "Bezalkoholowe", en: "Alcohol-free", rank: 30 };
    if (/nalew|kran|tap/.test(text)) return { pl: "Z nalewaka", en: "On tap", rank: 10 };
    return { pl: "Butelkowe", en: "Bottled", rank: 20 };
  }
  if (/slon|jedz|dani|food|kuchni|sniadan/.test(categoryText)) {
    if (/salat|salad/.test(text)) return { pl: "Sałaty", en: "Salads", rank: 10 };
    if (/kanap|toast|bagiet|focacci|sandwich/.test(text)) return { pl: "Kanapki", en: "Sandwiches", rank: 20 };
    if (/talerz|deska|burrat|plate|platter/.test(text)) return { pl: "Talerzyki", en: "Small plates", rank: 30 };
  }
  return null;
}

const groupTranslations = new Map([
  ["Wody", "Water"], ["Napoje gazowane", "Soft drinks"], ["Lemoniady własne", "House lemonades"],
  ["Soki", "Juices"], ["Kawy specjalne", "Specialty coffee"], ["Kawy mleczne", "Milk coffee"],
  ["Kawy alternatywne", "Alternative coffee"],
  ["Klasyczne", "Classics"], ["Czarne", "Black tea"], ["Zielone", "Green tea"],
  ["Białe", "White tea"], ["Ziołowe", "Herbal tea"], ["Owocowe", "Fruit tea"],
  ["Bezalkoholowe", "Alcohol-free"], ["Z nalewaka", "On tap"], ["Butelkowe", "Bottled"],
  ["Sałaty", "Salads"], ["Kanapki", "Sandwiches"], ["Talerzyki", "Small plates"],
]);

export function translateProductGroup(group: string) {
  return groupTranslations.get(group) ?? group;
}

export const allergenNames: Record<number, { pl: string; en: string }> = {
  1: { pl: "Zboża zawierające gluten", en: "Cereals containing gluten" },
  2: { pl: "Skorupiaki", en: "Crustaceans" },
  3: { pl: "Jaja", en: "Eggs" },
  4: { pl: "Ryby", en: "Fish" },
  5: { pl: "Orzeszki ziemne", en: "Peanuts" },
  6: { pl: "Soja", en: "Soybeans" },
  7: { pl: "Mleko", en: "Milk" },
  8: { pl: "Orzechy", en: "Nuts" },
  9: { pl: "Seler", en: "Celery" },
  10: { pl: "Gorczyca", en: "Mustard" },
  11: { pl: "Sezam", en: "Sesame" },
  12: { pl: "Dwutlenek siarki i siarczyny", en: "Sulphur dioxide and sulphites" },
  13: { pl: "Łubin", en: "Lupin" },
  14: { pl: "Mięczaki", en: "Molluscs" },
};
