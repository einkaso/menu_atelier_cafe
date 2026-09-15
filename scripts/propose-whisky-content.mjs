import { createHash } from "node:crypto";
import postgres from "postgres";

const apply = process.argv.includes("--apply");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

const chivas12 = {
  sourceUrl: "https://wecommerce.pernod-ricard.com/products/product?id=PRPECOM000588&market=en_US",
  imageUrls: ["https://assets.pernod-ricard.io/pim/production/v2/Chivas_Regal_Scotch_Whisky_Scotland_12_Yo_Blended_1L_Bottle_en_US-generic_1_original.jpg"],
  descriptionPl: "12-letnia szkocka whisky blended o gładkim, kremowym charakterze. Łączy nuty owoców z sadu, wrzosu i miodu z wanilią, orzechem laskowym i karmelem.",
  attributes: { spiritType: "Szkocka whisky", spiritStyle: "Blended", origin: "Szkocja", ageStatement: "12 lat", alcoholPercentage: "40%", tasteProfile: "Łagodny i miodowy" },
};

const proposals = new Map([
  [36744, { sourceUrl: "https://www.diffordsguide.com/beer-wine-spirits/675/ballantines-12-year-old", descriptionPl: "12-letnia szkocka whisky blended o kremowym, miodowym charakterze, z nutami wanilii, pieczonego jabłka, gruszki, tostowanego dębu i delikatnych przypraw.", attributes: { spiritType: "Szkocka whisky", spiritStyle: "Blended", origin: "Szkocja", ageStatement: "12 lat", alcoholPercentage: "40%", tasteProfile: "Łagodny i miodowy" } }],
  [36745, { sourceUrl: "https://www.alkospotgdansk.pl/produkt/whisky-ballantine-s-finest-lennon-40-700ml-wyborowa/", imageUrls: ["https://www.alkospotgdansk.pl/wp-content/uploads/2025/01/Ballantines-John-Lennon.jpg"], descriptionPl: "Ballantine’s Finest w kolekcjonerskiej edycji John Lennon. Łagodna szkocka whisky blended z nutami wanilii, miodu, czerwonego jabłka, kremowego dębu i lekkiej kwiatowej świeżości.", attributes: { spiritType: "Szkocka whisky", spiritStyle: "Blended", origin: "Szkocja", ageStatement: "Bez oznaczenia wieku", alcoholPercentage: "40%", tasteProfile: "Łagodny i miodowy" } }],
  [36746, chivas12],
  [36747, chivas12],
  [36748, { sourceUrl: "https://www.auchan.fr/glen-turner-scotch-whisky-single-malt-heritage-double-cask-40/pr-C944744", descriptionPl: "Szkocka whisky single malt Glen Turner Heritage Double Cask, finiszowana w beczkach po porto. Łączy słodkie owoce i wanilię z delikatnie korzennym, beczkowym charakterem.", attributes: { spiritType: "Szkocka whisky", spiritStyle: "Single malt", origin: "Szkocja", ageStatement: "Bez oznaczenia wieku", alcoholPercentage: "40%", tasteProfile: "Owocowy", caskType: "Dąb · finisz w beczce po porto" } }],
  [36750, { sourceUrl: "https://www.buycott.com/upc/5010327202105", descriptionPl: "Klasyczna szkocka whisky blended Grant’s o łagodnym, zbalansowanym charakterze, z nutami słodu, wanilii, miodu, dojrzałych owoców i delikatnych przypraw.", attributes: { spiritType: "Szkocka whisky", spiritStyle: "Blended", origin: "Szkocja", ageStatement: "Bez oznaczenia wieku", alcoholPercentage: "40%", tasteProfile: "Łagodny i miodowy" } }],
  [36751, { sourceUrl: "https://shop.klauss.de/products/hennessy-vs-0-7-liter", imageUrls: ["https://shop.klauss.de/cdn/shop/files/hennessy-vs-0-7l-spirituosen-cognac-armagnac.jpg?crop=center&height=1200&v=1747734335&width=1200"], descriptionPl: "Hennessy V.S to francuski koniak o żywym, wyrazistym charakterze. W aromacie i smaku pojawiają się nuty prażonych migdałów, świeżych winogron, wanilii, czerwonych owoców i dębu.", attributes: { spiritType: "Koniak", spiritStyle: "VS", origin: "Francja · Cognac", ageStatement: "VS", alcoholPercentage: "40%", tasteProfile: "Owocowy", caskType: "Dąb francuski" } }],
  [36754, { sourceUrl: "https://foczkaalkohole.pl/produkt/jim-beam-1l/", descriptionPl: "Kentucky Straight Bourbon dojrzewający w nowych, mocno wypalanych beczkach z amerykańskiego dębu. Łagodny i lekko słodki, z nutami wanilii, karmelu, kukurydzy, tostowanego dębu i subtelnych przypraw.", attributes: { spiritType: "Bourbon", spiritStyle: "Kentucky Straight Bourbon", origin: "USA · Kentucky", ageStatement: "4 lata", alcoholPercentage: "40%", tasteProfile: "Waniliowo-karmelowy", caskType: "Nowy wypalany dąb amerykański" } }],
  [36753, { sourceUrl: "https://www.thecru.ie/p/jameson-irish-whiskey-1l-40/5011007003227", imageUrls: ["https://abclive1.s3.amazonaws.com/463824a7-c6b4-46ff-93b0-27c3310000de/productimage/5011007003227___XL.jpg"], descriptionPl: "Irlandzka whiskey Jameson, trzykrotnie destylowana dla uzyskania łagodnego i zaokrąglonego smaku. Nuty kwiatowe, drewno, przyprawy, orzechy, wanilia i słodkie sherry tworzą harmonijny profil.", attributes: { spiritType: "Irlandzka whiskey", spiritStyle: "Blended", origin: "Irlandia", ageStatement: "Bez oznaczenia wieku", alcoholPercentage: "40%", tasteProfile: "Łagodny i miodowy" } }],
  [36759, { sourceUrl: "https://www.diffordsguide.com/beer-wine-spirits/828/metaxa-12-stars", descriptionPl: "Grecki trunek z dojrzewających destylatów winnych, muskatowego wina z Samos oraz śródziemnomorskich ziół. Owocowy i korzenny, z nutami moreli, brzoskwini, rodzynek, miodu, róży i tostowanego dębu.", attributes: { spiritType: "Brandy", spiritStyle: "Metaxa 12 Stars", origin: "Grecja", ageStatement: "12 Stars", alcoholPercentage: "40%", tasteProfile: "Owocowy", caskType: "Dąb Limousin" } }],
  [36757, { sourceUrl: "https://www.diffordsguide.com/beer-wine-spirits/1420/martell-vs", descriptionPl: "Francuski koniak Martell V.S o owocowym i lekko miodowym charakterze. Nuty gruszki, jabłka, moreli i brzoskwini łączą się z wanilią, karmelem, cynamonem i delikatnym akcentem dębu.", attributes: { spiritType: "Koniak", spiritStyle: "VS", origin: "Francja · Cognac", ageStatement: "VS", alcoholPercentage: "40%", tasteProfile: "Owocowy", caskType: "Dąb francuski" } }],
  [36760, { sourceUrl: "https://www.comptoir-irlandais.com/en/scotland/2439-singleton-of-dufftown-15-years-old.html", imageUrls: ["https://www.comptoir-irlandais.com/37769-product_main_2x/singleton-of-dufftown-15-years-old.jpg"], descriptionPl: "15-letnia szkocka whisky single malt The Singleton of Dufftown. Bogata i owocowa, z nutami dojrzałych owoców, czekolady i delikatnych przypraw, dojrzewająca m.in. w beczkach po bourbonie i sherry.", attributes: { spiritType: "Szkocka whisky", spiritStyle: "Single malt", origin: "Szkocja · Speyside", ageStatement: "15 lat", alcoholPercentage: "40%", tasteProfile: "Owocowy", caskType: "Bourbon · Pedro Ximénez · Oloroso" } }],
  [36761, { sourceUrl: "https://www.abbeywhisky.com/products/springbank-10-year-old", descriptionPl: "10-letnia szkocka whisky single malt z Campbeltown, dojrzewająca w beczkach po bourbonie i sherry. Nuty gruszki, wanilii, słodu, miodu wrzosowego, toffi i przypraw kończy morska słoność oraz lekki dym torfowy.", attributes: { spiritType: "Szkocka whisky", spiritStyle: "Single malt", origin: "Szkocja · Campbeltown", ageStatement: "10 lat", alcoholPercentage: "46%", tasteProfile: "Dymny i torfowy", caskType: "Bourbon · sherry" } }],
  [36762, { sourceUrl: "https://provino.ua/ua/krepkie-napitki/viski/teachers-40-0-5-l-5010093501235", descriptionPl: "Szkocka whisky blended Teacher’s Highland Cream o wyraźnie słodowym charakterze. Nuty miodu, orzechów i kremowej słodyczy przechodzą w lukrecję, toffi, dąb i subtelny torfowy dym.", attributes: { spiritType: "Szkocka whisky", spiritStyle: "Blended", origin: "Szkocja · Highlands", ageStatement: "Bez oznaczenia wieku", alcoholPercentage: "40%", tasteProfile: "Dymny i torfowy" } }],
  [36763, { sourceUrl: "https://www.carryout.ie/p/teeling-small-batch-irish-whiskey-700ml-bottle/5391523270021", imageUrls: ["https://abclive1.s3.amazonaws.com/b00f448b-9858-41e1-99df-c75d61432bf0/productimage/5391523270021___XL.jpg"], descriptionPl: "Irlandzka whiskey Teeling Small Batch, finiszowana w beczkach po rumie. Słodka i korzenna, z nutami wanilii, toffi, suszonych owoców, gorzkiej czekolady, cynamonu i goździków.", attributes: { spiritType: "Irlandzka whiskey", spiritStyle: "Blended · Small Batch", origin: "Irlandia", ageStatement: "Bez oznaczenia wieku", alcoholPercentage: "46%", tasteProfile: "Waniliowo-karmelowy", caskType: "Finisz w beczce po rumie" } }],
  [36766, { sourceUrl: "https://winezja.pl/brandy-pliska-xo-0-70l-40", imageUrls: ["https://winezja.pl/media/catalog/product/cache/7e8a95f76021adfb139e8e0ac818cc96/b/r/brandy-pliska-xo-gift-box_t_z_1.webp"], descriptionPl: "Bułgarska brandy Pliska XO dojrzewająca co najmniej 10 lat w małych dębowych beczkach. Harmonijna i rozgrzewająca, z nutami drewna, wanilii, rodzynek i orzechów.", attributes: { spiritType: "Brandy", spiritStyle: "XO", origin: "Bułgaria · Wielki Presław", ageStatement: "10 lat · XO", alcoholPercentage: "40%", tasteProfile: "Waniliowo-karmelowy", caskType: "Dąb" } }],
]);

function decodeHtml(value) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

async function imageCandidates(sourceUrl, label, preferredUrls = []) {
  try {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(15_000), headers: { "user-agent": "Mozilla/5.0", accept: "text/html" } });
    if (!response.ok) return [];
    const html = await response.text();
    const urls = [...preferredUrls];
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
      if (!/(?:property|name)=["'](?:og:image|twitter:image)["']/i.test(tag)) continue;
      const value = tag.match(/content=["']([^"']+)["']/i)?.[1];
      if (value) urls.push(new URL(decodeHtml(value), sourceUrl).toString());
    }
    return Array.from(new Set(urls)).slice(0, 4).map((url) => ({ url, sourceUrl, label }));
  } catch {
    return preferredUrls.map((url) => ({ url, sourceUrl, label }));
  }
}

const sql = postgres(databaseUrl, { max: 2, prepare: false });
const rows = await sql`
  select p.id, p.name, p.ean_codes as "eanCodes", s.id as "supplierId", p.supplier_product_code as "supplierProductCode"
  from menu_products p
  left join menu_categories c on c.dotykacka_id = p.dotykacka_category_id
  left join suppliers s on s.dotykacka_id = p.dotykacka_supplier_id
  where c.name = 'WHISKEY' and p.deleted = false
  order by p.name
`;
const summary = { curated: 0, saved: 0, skippedAmbiguous: 0, images: 0 };

for (const row of rows) {
  const curated = proposals.get(row.id);
  if (!curated) {
    summary.skippedAmbiguous += 1;
    console.log(`SKIP\t${row.id}\t${row.name}\tbrak jednoznacznego modelu lub zgodnego EAN`);
    continue;
  }
  summary.curated += 1;
  const images = await imageCandidates(curated.sourceUrl, row.name, curated.imageUrls);
  summary.images += images.length ? 1 : 0;
  const proposal = { descriptionPl: curated.descriptionPl, imageSourceUrl: images[0]?.url ?? null, imageCandidates: images, attributes: curated.attributes, sourceUrls: [curated.sourceUrl] };
  const fingerprint = createHash("sha256").update(`curated-whisky-v2:${row.id}:${JSON.stringify(proposal)}`).digest("hex");
  if (apply) {
    await sql`
      insert into wine_sources (product_id, supplier_id, fingerprint, source_url, source_kind, ean, supplier_product_code, proposed_content, status, decision, fetched_at, decided_at)
      values (${row.id}, ${row.supplierId}, ${fingerprint}, ${curated.sourceUrl}, 'WEB_SEARCH', ${(row.eanCodes ?? [])[0] ?? null}, ${row.supplierProductCode}, ${sql.json(proposal)}, 'PENDING', null, now(), null)
      on conflict (product_id, fingerprint) do update set proposed_content = excluded.proposed_content, status = 'PENDING', decision = null, fetched_at = now(), decided_at = null
    `;
    summary.saved += 1;
  }
  console.log(`${apply ? "SAVED" : "DRY"}\t${row.id}\t${row.name}\t${Object.values(curated.attributes).join(" · ")}\timages=${images.length}`);
}

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", products: rows.length, ...summary }));
await sql.end();
