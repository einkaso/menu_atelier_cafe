function normalized(...values: Array<string | null | undefined>) {
  return values.join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").toLocaleLowerCase("pl");
}

export function inferredAlcoBarAttributes(name: string, description?: string | null, group?: string | null) {
  const value = normalized(name, description, group);
  const attributes: Record<string, string> = {};

  if (/spritz/.test(value)) attributes.cocktailType = "Spritz";
  else if (/\bsour\b/.test(value)) attributes.cocktailType = "Sour";
  else if (/highball|long drink/.test(value)) attributes.cocktailType = "Highball";
  else if (/shot|50\s*ml|kieliszek/.test(value)) attributes.cocktailType = "Shot";
  else if (/wodka na butelk|alkohol na butelk|\bbutelka\b/.test(value)) attributes.cocktailType = "Alkohol na butelkę";
  else if (/koktajl|cocktail|drink|martini|negroni|mojito|margarita|daiquiri|boulevardier/.test(value)) attributes.cocktailType = "Koktajl klasyczny";

  const bases: Array<[string, RegExp]> = [
    ["Wódka", /\b(wodk\w*|vodka)\b/], ["Gin", /\bgin\b/], ["Rum", /\brum\b/],
    ["Whisky", /\b(whisk\w*|scotch)\b/], ["Bourbon", /\bbourbon\b/], ["Tequila", /\btequil\w*\b/],
    ["Mezcal", /\bmezcal\w*\b/], ["Prosecco", /\bprosecco\b/], ["Wermut", /\b(wermut\w*|vermouth)\b/],
    ["Aperitif / bitter", /\b(aperol|campari|bitter|amaro|sarti|aperitif|aperitivo)\b/], ["Likier", /\b(likier\w*|liqueur)\b/],
  ];
  const foundBases = bases.filter(([, pattern]) => pattern.test(value)).map(([label]) => label);
  if (foundBases.length) attributes.cocktailBase = foundBases.slice(0, 4).join(" · ");

  const tastes: Array<[string, RegExp]> = [
    ["Wytrawny", /\b(wytrawn\w*|dry)\b/], ["Słodki", /\b(slod\w*|sweet|syrop\w*|syrup)\b/],
    ["Gorzki", /\b(gorzk\w*|bitter|amaro)\b/], ["Cytrusowy i kwaśny", /\b(cytrus\w*|citrus|limonk\w*|lime|cytryn\w*|lemon|kwasn\w*|sour)\b/],
    ["Owocowy", /\b(owoc\w*|fruit\w*|malin\w*|raspberr\w*|marakuj\w*|passion fruit|brzoskwin\w*|peach)\b/],
    ["Kremowy", /\b(krem\w*|cream\w*|mlecz\w*|milk|coconut)\b/], ["Korzenny", /\b(korzenn\w*|spic\w*|cynamon\w*|cinnamon|imbir\w*|ginger)\b/],
  ];
  const foundTastes = tastes.filter(([, pattern]) => pattern.test(value)).map(([label]) => label);
  if (foundTastes.length) attributes.tasteProfile = foundTastes.slice(0, 3).join(" · ");

  if (attributes.cocktailType === "Shot") attributes.servingStyle = "Shot";
  else if (attributes.cocktailType === "Alkohol na butelkę") attributes.servingStyle = "Butelka";
  else if (attributes.cocktailType === "Spritz") attributes.servingStyle = "Kieliszek do wina";
  else if (attributes.cocktailType === "Highball") attributes.servingStyle = "Highball";
  else if (attributes.cocktailType) attributes.servingStyle = "Szkło koktajlowe";

  return attributes;
}

const alcoAttributeTranslations: Record<string, Record<string, string>> = {
  cocktailType: {
    "alkohol na butelke": "Bottled spirit",
    "koktajl klasyczny": "Classic cocktail",
  },
  cocktailBase: {
    "wodka": "Vodka",
    "wermut": "Vermouth",
    "likier": "Liqueur",
  },
  tasteProfile: {
    "wytrawny": "Dry",
    "slodki": "Sweet",
    "gorzki": "Bitter",
    "cytrusowy i kwasny": "Citrus & tart",
    "owocowy": "Fruity",
    "kremowy": "Creamy",
    "korzenny": "Spiced",
  },
  servingStyle: {
    "butelka": "Bottle",
    "kieliszek do wina": "Wine glass",
    "szklo koktajlowe": "Cocktail glass",
  },
};

export function translatedAlcoAttributeValue(key: string, value: string) {
  return value.split(/\s*([·,;])\s*/).map((part) => {
    if (/^[·,;]$/.test(part)) return ` ${part} `;
    return alcoAttributeTranslations[key]?.[normalized(part).trim()] ?? part.trim();
  }).join("").trim();
}

export function inferredAlcoBarAttributesEn(name: string, description?: string | null, group?: string | null) {
  return Object.fromEntries(Object.entries(inferredAlcoBarAttributes(name, description, group))
    .map(([key, value]) => [key, translatedAlcoAttributeValue(key, value)]));
}
