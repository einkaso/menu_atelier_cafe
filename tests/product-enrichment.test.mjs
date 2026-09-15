import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  plugins: [{
    name: "server-only-test-shim",
    resolveId(id) { return id === "server-only" ? "\0server-only" : null; },
    load(id) { return id === "\0server-only" ? "export {};" : null; },
  }],
  server: { middlewareMode: true },
});
after(async () => vite.close());

test("extracts PrestaShop wine features, descriptions and distinct product images", async () => {
  const { extractProductPageProposal } = await vite.ssrLoadModule("/lib/product-enrichment.ts");
  const product = {
    name: "Gran Sasso Montepulciano D’Abruzzo DOC",
    description_short: "<p>Pełne czerwone wino z Abruzji, doskonałe do mięs z grilla.</p>",
    description: "<h2>Opis smakowy</h2><p>Intensywna czerwień, aromaty jeżyn, wiśni i śliwek. Soczyste, z miękkimi garbnikami.</p><h2>Proces produkcji</h2><p>Dojrzewa w beczkach.</p>",
    features: [
      { name: "Kraj", value: "Włochy" },
      { name: "Region", value: "Abruzja" },
      { name: "Rodzaj wina", value: "czerwone" },
      { name: "Smak", value: "wytrawne" },
      { name: "Styl", value: "średnie" },
      { name: "Grona", value: "Montepulciano" },
      { name: "Pojemność", value: "750 ml" },
      { name: "Zawartość alkoholu", value: "13%" },
    ],
    images: [
      { large: { url: "https://example.com/5645-large_default/gran-sasso.jpg" }, small: { url: "https://example.com/5645-small_default/gran-sasso.jpg" } },
      { large: { url: "https://example.com/5764-large_default/gran-sasso.jpg" } },
    ],
  };
  const encoded = JSON.stringify(product).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const html = `<html><head><title>${product.name}</title></head><body><main data-product="${encoded}"><h1>${product.name}</h1></main></body></html>`;
  const proposal = extractProductPageProposal(html, "https://example.com/gran-sasso.html", {
    name: product.name,
    kind: "wine",
  });

  assert.equal(proposal.country, "Włochy");
  assert.equal(proposal.region, "Abruzja");
  assert.equal(proposal.grapes, "Montepulciano");
  assert.equal(proposal.wineColor, "Czerwone");
  assert.equal(proposal.sweetness, "Wytrawne");
  assert.equal(proposal.wineStyle, "średnie");
  assert.equal(proposal.attributes.alcoholPercentage, "13%");
  assert.equal(proposal.attributes.volume, "750 ml");
  assert.match(proposal.descriptionPl, /Pełne czerwone wino/);
  assert.match(proposal.tastingNotes, /aromaty jeżyn/);
  assert.equal(proposal.imageCandidates.length, 2);
});

test("extracts definition-list facts when a shop does not expose embedded product JSON", async () => {
  const { extractProductPageProposal } = await vite.ssrLoadModule("/lib/product-enrichment.ts");
  const html = `<html><head><title>Przykładowe Rosso</title><meta property="og:description" content="Czerwone wino o aromacie wiśni i śliwek."></head><body>
    <section class="product-features"><dl>
      <dt>Kraj</dt><dd>Włochy</dd><dt>Region</dt><dd>Toskania</dd><dt>Grona</dt><dd>Sangiovese</dd>
      <dt>Rodzaj wina</dt><dd>czerwone</dd><dt>Smak</dt><dd>wytrawne</dd><dt>Zawartość alkoholu</dt><dd>12,5%</dd>
    </dl></section>
  </body></html>`;
  const proposal = extractProductPageProposal(html, "https://example.com/rosso.html", { name: "Przykładowe Rosso", kind: "wine" });

  assert.equal(proposal.country, "Włochy");
  assert.equal(proposal.region, "Toskania");
  assert.equal(proposal.grapes, "Sangiovese");
  assert.equal(proposal.wineColor, "Czerwone");
  assert.equal(proposal.sweetness, "Wytrawne");
  assert.equal(proposal.attributes.alcoholPercentage, "12,5%");
});

test("extracts filterable whisky characteristics without treating bottle size as menu serving", async () => {
  const { extractProductPageProposal } = await vite.ssrLoadModule("/lib/product-enrichment.ts");
  const html = `<html><head><title>Springbank 10 Year Old</title><meta property="og:description" content="Campbeltown single malt Scotch whisky with orchard fruit, vanilla and gentle peat smoke."><meta property="og:image" content="https://example.com/springbank-10.jpg"></head><body><dl><dt>Country</dt><dd>Scotland</dd><dt>Age</dt><dd>10 years</dd><dt>Alcohol</dt><dd>46%</dd><dt>Cask</dt><dd>Bourbon and sherry</dd><dt>Volume</dt><dd>700 ml</dd></dl></body></html>`;
  const proposal = extractProductPageProposal(html, "https://example.com/springbank-10", { name: "Springbank 10 yo 46% 50ml", kind: "whisky" });
  assert.equal(proposal.attributes.spiritType, "Szkocka whisky");
  assert.equal(proposal.attributes.spiritStyle, "Single malt");
  assert.equal(proposal.attributes.origin, "Szkocja");
  assert.equal(proposal.attributes.ageStatement, "10 lat");
  assert.equal(proposal.attributes.alcoholPercentage, "46%");
  assert.equal(proposal.attributes.caskType, "Bourbon and sherry");
  assert.equal(proposal.attributes.volume, "700 ml");
  assert.equal(proposal.attributes.tasteProfile, "Dymny i torfowy");
});

test("extracts WooCommerce product properties without treating navigation labels as wine facts", async () => {
  const { extractProductPageProposal } = await vite.ssrLoadModule("/lib/product-enrichment.ts");
  const product = {
    "@type": "Product",
    name: "MARIETA ALBARINO 2024 RIAS BAIXAS DO",
    description: "Białe hiszpańskie wino półwytrawne o aromatach brzoskwiń i jabłek. Marieta jest winem z apelacji Rías Baixas opatrzonym świeżą etykietą.",
    image: ["https://sklep.example.pl/uploads/marieta-800x800.png"],
    additionalProperty: [
      { "@type": "PropertyValue", name: "pa_kolor", value: "Białe" },
      { "@type": "PropertyValue", name: "pa_smak", value: "Półwytrawne" },
      { "@type": "PropertyValue", name: "pa_kraj_pochodzenia", value: "Hiszpania" },
      { "@type": "PropertyValue", name: "szczep", value: "albariño" },
      { "@type": "PropertyValue", name: "pa_alkohol", value: "11.5%" },
    ],
  };
  const html = `<html><head><title>${product.name}</title><script type="application/ld+json">${JSON.stringify(product)}</script></head><body>
    <nav>Styl\nBezglutenowe\nKraj pochodzenia\nPolska</nav>
    <main><h1>${product.name}</h1><table><tr><th>Pojemność</th><td>Butelka 0.75L</td></tr></table></main>
  </body></html>`;
  const proposal = extractProductPageProposal(html, "https://sklep.example.pl/produkt/marieta", { name: product.name, kind: "wine" });

  assert.equal(proposal.country, "Hiszpania");
  assert.equal(proposal.region, "Rías Baixas");
  assert.equal(proposal.grapes, "albariño");
  assert.equal(proposal.wineColor, "Białe");
  assert.equal(proposal.sweetness, "Półwytrawne");
  assert.equal(proposal.wineStyle, null);
  assert.equal(proposal.attributes.alcoholPercentage, "11,5%");
  assert.equal(proposal.attributes.volume, "Butelka 0.75L");
  assert.equal(proposal.imageSourceUrl, "https://sklep.example.pl/uploads/marieta-800x800.png");
});

test("prefers the explicit country of wine and never reads France from Francesco", async () => {
  const { extractProductPageProposal } = await vite.ssrLoadModule("/lib/product-enrichment.ts");
  const html = `<html><head><title>CHIANTI GUICCIARDINI STROZZI 0,75L</title></head><body>
    <nav><a href="/wina-francuskie">WINA FRANCUSKIE</a></nav>
    <main><div itemprop="description">
      <p>Chianti z etykietą przedstawiającą historyka Francesco Guicciardini.</p>
      <p>Toskańska posiadłość leży we Włoszech.</p>
    </div><table>
      <tr><td>REGION WINA</td><td>TOSKANIA</td></tr>
      <tr><td>SZCZEP WINOROŚLI</td><td>SANGIOVESE</td></tr>
      <tr><td>KRAJ WINA</td><td>WŁOCHY</td></tr>
    </table></main>
  </body></html>`;
  const proposal = extractProductPageProposal(html, "https://propaganda24h.pl/pl/p/chianti/1064", {
    name: "CHIANTI GUICCIARDINI STROZZI 0,75L",
    kind: "wine",
  });

  assert.equal(proposal.country, "Włochy");
  assert.equal(proposal.region, "TOSKANIA");
  assert.equal(proposal.grapes, "SANGIOVESE");
});

test("extracts Darwina wine data from text copied from a Cloudflare-protected page", async () => {
  const { discoverProductInformationFromText } = await vite.ssrLoadModule("/lib/product-enrichment.ts");
  const text = `Pfitscher Gewurztraminer Stoas 750ml
Opis produktu
Włoskie, wytrawne, białe wino z Alto Adige, stworzone w 100% ze szczepu Gewurztraminer.
Szczep i region
Winogrona pochodzą z winnic położonych w regionie Trentino-Alto Adige/Südtirol.
Profil sensoryczny
W aromacie cytrusy, zielone jabłko, liczi i róża. Wino świeże, harmonijne, z długim finiszem.
Cechy produktu
Kolor
Białe
Poziom wytrawności
Wytrawne
Charakter
Spokojne
Pojemność
750 ml
Apelacja
Alto Adige DOC (Trentino)
Region
Trentino-Alto Adige/Südtirol, IT
Kraj
Włochy
Typ
Jednoszczepowe
Szczepy
Gewurztraminer
Zawartość alkoholu %
13,5`;
  const result = discoverProductInformationFromText({ name: "Pfitscher Gewurztraminer Stoas 750ml", kind: "wine" }, text, "https://darwina.pl/pfitscher-gewurztraminer-stoas-750ml,id62263.html");
  const proposal = result.proposal;

  assert.equal(result.sourceKind, "MANUAL_TEXT");
  assert.equal(proposal.country, "Włochy");
  assert.equal(proposal.region, "Trentino-Alto Adige/Südtirol, IT");
  assert.equal(proposal.grapes, "Gewurztraminer");
  assert.equal(proposal.wineColor, "Białe");
  assert.equal(proposal.sweetness, "Wytrawne");
  assert.equal(proposal.wineStyle, "Spokojne");
  assert.equal(proposal.sparklingType, null);
  assert.equal(proposal.attributes.alcoholPercentage, "13,5%");
  assert.equal(proposal.attributes.volume, "750 ml");
  assert.match(proposal.descriptionPl, /Włoskie, wytrawne, białe wino/);
  assert.match(proposal.tastingNotes, /cytrusy, zielone jabłko/);
});

test("keeps colour separate from sparkling and recognises natural pet-nat", async () => {
  const { discoverProductInformationFromText } = await vite.ssrLoadModule("/lib/product-enrichment.ts");
  const text = `Vida Amarantina Branco Pet Nat
Kolor
Białe
Smak
Wytrawne
Styl
Frizzante - naturalnie musujące
Opis
Naturalne wino musujące pet-nat produkowane metodą ancestrale.`;
  const result = discoverProductInformationFromText({ name: "Vida Amarantina Branco Pet Nat", kind: "wine" }, text, "https://example.com/vida-pet-nat");

  assert.equal(result.proposal.wineColor, "Białe");
  assert.equal(result.proposal.sparklingType, "NATURALLY_SPARKLING");
});

test("recognises prosecco as sparkling without using sparkling as its colour", async () => {
  const { discoverProductInformationFromText } = await vite.ssrLoadModule("/lib/product-enrichment.ts");
  const text = `Mionetto Prosecco DOC
Opis
Wysokiej jakości wino musujące wytrawne.`;
  const result = discoverProductInformationFromText({ name: "Mionetto Prosecco DOC", kind: "wine" }, text, "https://example.com/mionetto-prosecco");

  assert.equal(result.proposal.wineColor, null);
  assert.equal(result.proposal.sparklingType, "SPARKLING");
});

test("recognises only an actual zero alcohol value as alcohol-free", async () => {
  const { isZeroAlcoholValue } = await vite.ssrLoadModule("/lib/wine-characteristics.ts");

  assert.equal(isZeroAlcoholValue("0%"), true);
  assert.equal(isZeroAlcoholValue("0,0%"), true);
  assert.equal(isZeroAlcoholValue("11,0%"), false);
  assert.equal(isZeroAlcoholValue("10%"), false);
});

test("extracts a protected product candidate from public Brave search results", async () => {
  const { extractBraveSearchCandidates } = await vite.ssrLoadModule("/lib/product-enrichment.ts");
  const html = String.raw`results:[{title:"Pfitscher Gewurztraminer Stoas 750ml",url:"https://darwina.pl/pfitscher-gewurztraminer-stoas-750ml,id62263.html",full_title:"Pfitscher Gewurztraminer Stoas 750ml - Darwina",description:"Pfitscher Stoas to \u003Cstrong>Włoskie, wytrawne, białe wino\u003C/strong> z regionu Górnej Adygi. Powstaje w 100% ze szczepu Gewurztraminer.",page_age:void 0,profile:{name:"Darwina.pl"},thumbnail:{src:"https://imgs.search.brave.com/proxy",original:"https://darwina.pl/img/products/62/26/3/1_org.jpg",logo:false}}]`;
  const [candidate] = extractBraveSearchCandidates(html);

  assert.equal(candidate.url, "https://darwina.pl/pfitscher-gewurztraminer-stoas-750ml,id62263.html");
  assert.match(candidate.description, /Włoskie, wytrawne, białe wino/);
  assert.equal(candidate.imageUrl, "https://darwina.pl/img/products/62/26/3/1_org.jpg");
});

test("extracts ordinary results from the Bing fallback", async () => {
  const { extractBingSearchCandidates } = await vite.ssrLoadModule("/lib/product-enrichment.ts");
  const html = `<ol id="b_results"><li class="b_algo"><h2><a href="https://karkonoska-tlocznia.pl/produkt/migdaly-premium-delikatnie-prazone/">Migdały <strong>premium</strong> delikatnie prażone</a></h2><div class="b_caption"><p>Naturalna przekąska bez soli ze sklepu producenta.</p></div></li></ol>`;
  const [candidate] = extractBingSearchCandidates(html);

  assert.equal(candidate.url, "https://karkonoska-tlocznia.pl/produkt/migdaly-premium-delikatnie-prazone/");
  assert.equal(candidate.title, "Migdały premium delikatnie prażone");
  assert.match(candidate.description, /Naturalna przekąska bez soli/);
});

test("keeps a longer editable description and image for a regular producer product", async () => {
  const { extractProductPageProposal } = await vite.ssrLoadModule("/lib/product-enrichment.ts");
  const description = "Krótki opis produktu do wyników wyszukiwania.";
  const fullDescription = `Migdały premium są delikatnie prażone bez dodatku soli. ${"Pełny opis producenta przeznaczony do późniejszej ręcznej korekty. ".repeat(20)}`;
  const html = `<html><head><title>Migdały premiumolf</title><script type="application/ld+json">${JSON.stringify({
    "@type": "Product",
    name: "Migdały premium delikatnie prażone",
    description,
    image: "https://karkonoska-tlocznia.pl/wp-content/uploads/migdaly-premium.webp",
  })}</script></head><body><h1>Migdały premium delikatnie prażone</h1><div class="woocommerce-product-details__short-description"><p>${description}</p></div><div class="panel entry-content woocommerce-Tabs-panel--description" id="tab-description"><div><section><p>${fullDescription}</p></section></div></div></body></html>`;
  const proposal = extractProductPageProposal(html, "https://karkonoska-tlocznia.pl/produkt/migdaly-premium-delikatnie-prazone/", {
    name: "Migdały premium delikatnie prażone",
    kind: "product",
  });

  assert.ok(proposal.descriptionPl.length > 700);
  assert.match(proposal.descriptionPl, /Pełny opis producenta/);
  assert.doesNotMatch(proposal.descriptionPl, /Krótki opis produktu/);
  assert.equal(proposal.imageSourceUrl, "https://karkonoska-tlocznia.pl/wp-content/uploads/migdaly-premium.webp");
  assert.deepEqual(proposal.attributes, {});
});

test("places Polish product sources before foreign results", async () => {
  const { preferPolishSearchCandidates } = await vite.ssrLoadModule("/lib/product-enrichment.ts");
  const results = preferPolishSearchCandidates([
    { url: "https://producer.example.com/wines/chianti", title: "Chianti wine", description: "Italian red wine" },
    { url: "https://sklep.example.pl/wino/chianti", title: "Chianti – polski sklep", description: "Wino czerwone, wytrawne. Szczep Sangiovese." },
    { url: "https://merchant.example.com/pl/chianti", title: "Chianti", description: "Wino, kraj Włochy, region Toskania" },
  ]);

  assert.equal(new URL(results[0].url).hostname, "sklep.example.pl");
  assert.equal(results[1].url, "https://merchant.example.com/pl/chianti");
  assert.equal(results[2].url, "https://producer.example.com/wines/chianti");
});
