export type GlasswareCatalogItem = {
  id: string;
  namePl: string;
  nameEn: string;
  kind: "whisky" | "highball" | "cocktail" | "wine" | "beer" | "shot" | "carafe" | "mug" | "other";
  capacityMl: number;
  imageUrl: string;
  aliases: readonly string[];
};

export const glasswareCatalog = [
  {
    id: "elysia-whisky-350",
    namePl: "Szklanka do whisky Elysia",
    nameEn: "Elysia whisky tumbler",
    kind: "whisky",
    capacityMl: 350,
    imageUrl: "/drink-vessels/elysia-whisky-350.webp",
    aliases: ["whisky", "tumbler", "rocks", "old fashioned"],
  },
  {
    id: "elysia-highball-360",
    namePl: "Szklanka wysoka Elysia",
    nameEn: "Elysia highball glass",
    kind: "highball",
    capacityMl: 360,
    imageUrl: "/drink-vessels/elysia-highball-360.webp",
    aliases: ["highball", "long drink", "szklanka wysoka"],
  },
  {
    id: "elysia-highball-280",
    namePl: "Szklanka wysoka Elysia 280 ml",
    nameEn: "Elysia slim highball glass",
    kind: "highball",
    capacityMl: 280,
    imageUrl: "/drink-vessels/elysia-highball-280.webp",
    aliases: ["highball", "slim highball", "long drink", "szklanka wysoka wąska"],
  },
  {
    id: "elysia-carafe-1000",
    namePl: "Karafka Elysia 1 l",
    nameEn: "Elysia 1 l carafe",
    kind: "carafe",
    capacityMl: 1000,
    imageUrl: "/drink-vessels/elysia-carafe-1000.webp",
    aliases: ["karafka", "carafe", "dzbanek", "1 l"],
  },
  {
    id: "elysia-cocktail-500",
    namePl: "Kieliszek koktajlowy Elysia",
    nameEn: "Elysia cocktail glass",
    kind: "cocktail",
    capacityMl: 500,
    imageUrl: "/drink-vessels/elysia-cocktail-500.webp",
    aliases: ["kieliszek koktajlowy", "cocktail glass", "goblet", "500 ml"],
  },
  {
    id: "elysia-champagne-coupe-260",
    namePl: "Kieliszek koktajlowy do szampana Elysia",
    nameEn: "Elysia champagne coupe",
    kind: "cocktail",
    capacityMl: 260,
    imageUrl: "/drink-vessels/elysia-champagne-coupe-260.webp",
    aliases: ["kieliszek do szampana", "champagne coupe", "coupe", "260 ml"],
  },
  {
    id: "luminarc-new-morning-320",
    namePl: "Kubek szklany Luminarc New Morning",
    nameEn: "Luminarc New Morning glass mug",
    kind: "mug",
    capacityMl: 320,
    imageUrl: "/drink-vessels/luminarc-new-morning-320ml.webp",
    aliases: ["kubek szklany", "glass mug", "Luminarc", "New Morning", "320 ml"],
  },
  {
    id: "faja-stemmed-glass-200",
    namePl: "Kieliszek FAJA",
    nameEn: "FAJA stemmed drinking glass",
    kind: "wine",
    capacityMl: 200,
    imageUrl: "/drink-vessels/faja-glass-200ml.webp",
    aliases: ["Trinkglas FAJA", "kieliszek na nóżce", "stemmed glass", "goblet", "200 ml"],
  },
] as const satisfies readonly GlasswareCatalogItem[];

export function glasswareById(id: string) {
  return glasswareCatalog.find((item) => item.id === id) ?? null;
}
