export type GlasswareCatalogItem = {
  id: string;
  namePl: string;
  nameEn: string;
  kind: "whisky" | "highball" | "cocktail" | "wine" | "beer" | "shot" | "carafe" | "other";
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
    imageUrl: "https://b.assecobs.com/_img/dajarhoreca/c6f602fd-c246-479b-8d88-8250452107a1/elysia-szklanka-do-whisky-poj-355-ml-sr-84-mm-wys-98-mm-camrack-285845.jpg",
    aliases: ["whisky", "tumbler", "rocks", "old fashioned"],
  },
  {
    id: "elysia-highball-360",
    namePl: "Szklanka wysoka Elysia",
    nameEn: "Elysia highball glass",
    kind: "highball",
    capacityMl: 360,
    imageUrl: "https://b.assecobs.com/_img/dajarhoreca/7c7cab2b-a743-4e26-90d8-fd24696a60a6/elysia-szklanka-wysoka-poj-365-ml-ps-520445.jpg",
    aliases: ["highball", "long drink", "szklanka wysoka"],
  },
  {
    id: "elysia-highball-280",
    namePl: "Szklanka wysoka Elysia 280 ml",
    nameEn: "Elysia slim highball glass",
    kind: "highball",
    capacityMl: 280,
    imageUrl: "https://b.assecobs.com/_img/dajarhoreca/ab51d7ce-8ecc-4ef2-ba21-95c97ea5d683/elysia-szklanka-wysoka-poj-280-ml-sr-66-mm-wys-140-mm-ps-520125.jpg",
    aliases: ["highball", "slim highball", "long drink", "szklanka wysoka wąska"],
  },
  {
    id: "elysia-carafe-1000",
    namePl: "Karafka Elysia 1 l",
    nameEn: "Elysia 1 l carafe",
    kind: "carafe",
    capacityMl: 1000,
    imageUrl: "https://b.assecobs.com/_img/dajarhoreca/2148d092-2107-444c-b124-8915409ed8c1/elysia-karafka-poj-940-ml-ps-80403.jpg?w=1300&org_if_sml=0",
    aliases: ["karafka", "carafe", "dzbanek", "1 l"],
  },
  {
    id: "elysia-cocktail-500",
    namePl: "Kieliszek koktajlowy Elysia",
    nameEn: "Elysia cocktail glass",
    kind: "cocktail",
    capacityMl: 500,
    imageUrl: "https://b.assecobs.com/_img/dajarhoreca/7aa8ec6c-3f86-4853-9db0-cf646cb3bfb0/elysia-elysia-kieliszek-koktailowy-poj-500-ml-sr-101-mm-wys-198-mm-.jpg?w=1300&org_if_sml=0",
    aliases: ["kieliszek koktajlowy", "cocktail glass", "goblet", "500 ml"],
  },
  {
    id: "elysia-champagne-coupe-260",
    namePl: "Kieliszek koktajlowy do szampana Elysia",
    nameEn: "Elysia champagne coupe",
    kind: "cocktail",
    capacityMl: 260,
    imageUrl: "https://b.assecobs.com/_img/dajarhoreca/469535fb-4d29-4a26-b3e4-5c084d44ec9c/elysia-kieliszek-koktajlowy-do-szampana-poj-260-ml-sr-101-mm-wys-164-mm-.jpg?w=1300&org_if_sml=0",
    aliases: ["kieliszek do szampana", "champagne coupe", "coupe", "260 ml"],
  },
] as const satisfies readonly GlasswareCatalogItem[];

export function glasswareById(id: string) {
  return glasswareCatalog.find((item) => item.id === id) ?? null;
}
