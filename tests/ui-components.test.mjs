import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

test("accepts only the dedicated Dotykacka coffee add-ons group", async () => {
  const { isCoffeeAddonGroup } = await vite.ssrLoadModule(
    "/lib/coffee-addons.ts",
  );

  assert.equal(isCoffeeAddonGroup("DODATKI DO KAWY"), true);
  assert.equal(isCoffeeAddonGroup("  Dodatki   do kawy "), true);
  assert.equal(isCoffeeAddonGroup("KAWY"), false);
  assert.equal(isCoffeeAddonGroup(null), false);
});

test("extracts only upcoming events from the Atelier calendar", async () => {
  const { parseUpcomingEvents } = await vite.ssrLoadModule(
    "/lib/upcoming-events.ts",
  );
  const html = `
    <div>Nadchodzące</div>
    <div class="self-stretch p-4 md:p-2 event-card">
      <div class="text-gray-200 text-3xl lg:text-6xl">03</div>
      <div class="text-xs lg:text-xl">PAŹ</div>
      <div class="text-xs lg:text-xl">19:00</div>
      <div class="text-orange-300">koncert</div>
      <div class="text-gray-200 text-xl lg:text-2xl">Julia &#8211; na żywo</div>
      <a href="https://martabanaszek.pl/sklep/julia-na-zywo/">kup bilet</a>
    </div>
    <div>Minione</div>
    <div class="self-stretch p-4 md:p-2 event-card">
      <div class="text-gray-200 text-3xl lg:text-6xl">01</div>
      <div class="text-xs lg:text-xl">STY</div>
      <div class="text-gray-200 text-xl lg:text-2xl">Stare wydarzenie</div>
      <a href="https://martabanaszek.pl/sklep/stare/">kup bilet</a>
    </div>`;

  assert.deepEqual(parseUpcomingEvents(html), [
    {
      id: "julia-na-zywo",
      title: "Julia – na żywo",
      kind: "koncert",
      day: "03",
      month: "PAŹ",
      time: "19:00",
      sourceUrl: "https://martabanaszek.pl/sklep/julia-na-zywo/",
    },
  ]);
});

test("reads the event description and safe artwork from product structured data", async () => {
  const { parseEventDetails } = await vite.ssrLoadModule(
    "/lib/event-details.ts",
  );
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@type": "Product",
    description: "Pierwszy akapit.\r\n\r\nDrugi akapit.",
    image: "https://martabanaszek.pl/wp-content/uploads/event.png",
  })}</script>`;

  assert.deepEqual(parseEventDetails(html), {
    description: "Pierwszy akapit.\n\nDrugi akapit.",
    image: "https://martabanaszek.pl/wp-content/uploads/event.png",
  });
});

test("starts product-page analysis on paste and always clears the busy state", async () => {
  const source = await readFile(path.join(root, "app/admin/admin-panel.tsx"), "utf8");

  assert.match(source, /onPaste=\{\(event\) => \{/);
  assert.match(source, /analyzeManualSourceUrl\(pastedUrl\)/);
  assert.match(source, /credentials: "same-origin"/);
  assert.match(source, /finally \{\s*setEnriching\(false\)/);
  assert.match(source, /Sesja administratora wygasła/);
});

test("keeps long wine names inside a responsive detail dialog", async () => {
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");

  assert.match(css, /\.wine-detail-copy h2\{[^}]*overflow-wrap:anywhere[^}]*text-wrap:balance/);
  assert.match(css, /@media\(max-width:760px\)\{[^}]*\.wine-detail-dialog\{display:flex/);
  assert.match(css, /\.wine-detail-copy h2\{max-width:calc\(100% - 46px\)/);
  assert.match(css, /\.wine-detail-close\{z-index:10/);
  assert.match(css, /@media\(max-height:680px\) and \(min-width:761px\)/);
});

test("shows wine style before the description and aligns detail rows", async () => {
  const source = await readFile(path.join(root, "app/menu-client.tsx"), "utf8");
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");

  assert.match(source, /wineStyle\?:string;wineStyleEn\?:string/);
  assert.match(source, /\{style&&<div><dt>\{L\("Styl","Style"\)\}<\/dt><dd>\{style\}<\/dd><\/div>\}/);
  assert.ok(source.indexOf("<dl>{country") < source.indexOf("{description&&<DialogDescription>"));
  assert.match(css, /\.wine-detail-copy dl>div\{[^}]*align-items:first baseline/);
  assert.match(css, /\.wine-detail-copy dt\{align-self:baseline/);
  assert.match(css, /\.wine-detail-copy dd\{align-self:baseline/);
});

test("opens savoury dishes with their description, price and allergens", async () => {
  const source = await readFile(path.join(root, "app/menu-client.tsx"), "utf8");
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");
  const api = await readFile(path.join(root, "app/api/menu/route.ts"), "utf8");

  assert.match(source, /const\[savoryProduct,setSavoryProduct\]=useState<Product\|null>\(null\)/);
  assert.match(source, /if\(kind==="food"\)\{setSavoryProduct\(product\)/);
  assert.match(source, /<SavoryDetailDialog product=\{savoryProduct\}/);
  assert.match(source, /function SavoryDetailDialog/);
  assert.match(source, /L\("Poznaj naszą kuchnię","Discover our kitchen"\)/);
  assert.match(source, /onAllergens\(product\)/);
  assert.match(source, /product\?\.gallery\?\?\[\]/);
  assert.match(source, /slice\(0,5\)/);
  assert.match(source, /onTouchStart=/);
  assert.match(source, /savory-gallery-dots/);
  assert.match(source, /Poprzednie zdjęcie/);
  assert.match(source, /Następne zdjęcie/);
  assert.match(api, /galleryPaths: productContent\.galleryPaths/);
  assert.match(api, /gallery: visualKind === "food"/);
  assert.match(css, /\.savory-detail-dialog \.wine-detail-visual\{overflow:hidden;padding:0\}/);
  assert.match(css, /\.savory-detail-dialog \.wine-detail-visual>img\{width:100%;height:100%;object-fit:cover/);
  assert.match(css, /\.savory-gallery-dots\{/);
  assert.match(css, /\.savory-gallery-arrow\{/);
});

test("lets admins manage up to five optimized savoury gallery images", async () => {
  const [admin, adminApi, galleryRoute, imageRoute, schema, migration] = await Promise.all([
    readFile(path.join(root, "app/admin/admin-panel.tsx"), "utf8"),
    readFile(path.join(root, "app/api/admin/products/route.ts"), "utf8"),
    readFile(path.join(root, "app/api/admin/products/[id]/gallery/route.ts"), "utf8"),
    readFile(path.join(root, "app/api/admin/products/[id]/image/route.ts"), "utf8"),
    readFile(path.join(root, "db/schema.ts"), "utf8"),
    readFile(path.join(root, "drizzle/0033_gray_zuras.sql"), "utf8"),
  ]);

  assert.match(schema, /galleryPaths: jsonb\("gallery_paths"\).*default\(\[\]\)/);
  assert.match(migration, /ADD COLUMN "gallery_paths" jsonb DEFAULT '\[\]'::jsonb NOT NULL/);
  assert.match(adminApi, /galleryPaths: productContent\.galleryPaths/);
  assert.match(admin, /name="galleryFiles" type="file" multiple/);
  assert.match(admin, /Galeria „Na słono”/);
  assert.match(admin, /async function removeGalleryImage/);
  assert.match(admin, /async function setPrimaryGalleryImage/);
  assert.match(admin, /Ustaw jako pierwsze/);
  assert.match(galleryRoute, /MAX_GALLERY_IMAGES = 5/);
  assert.match(galleryRoute, /sectionFor\(product\.category\) !== "food"/);
  assert.match(galleryRoute, /importUploadedProductImage/);
  assert.match(galleryRoute, /galleryPaths: combined\.slice\(1\)/);
  assert.match(galleryRoute, /export async function PATCH/);
  assert.match(galleryRoute, /const reordered = \[selectedPath,/);
  assert.match(galleryRoute, /export async function DELETE/);
  assert.match(imageRoute, /reference\.galleryPaths/);
});

test("opens drinks with managed photos, descriptions and allergens", async () => {
  const source = await readFile(path.join(root, "app/menu-client.tsx"), "utf8");
  const admin = await readFile(path.join(root, "app/admin/admin-panel.tsx"), "utf8");
  const api = await readFile(path.join(root, "app/api/menu/route.ts"), "utf8");
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");

  assert.match(source, /const\[drinkProduct,setDrinkProduct\]=useState<Product\|null>\(null\)/);
  assert.match(source, /if\(kind==="cold"\|\|kind==="cocktails"\)\{setDrinkProduct\(product\)/);
  assert.match(source, /<DrinkDetailDialog product=\{drinkProduct\}/);
  assert.match(source, /function DrinkDetailDialog/);
  assert.match(source, /Zobacz napój i pełny opis/);
  assert.match(source, /Wróć do napojów/);
  assert.match(source, /const previewDetails=activeKind==="cold"\|\|activeKind==="zero"\|\|activeKind==="cocktails"/);
  assert.match(source, /previewDetails=\{previewDetails\}/);
  assert.match(source, /const kind=product\.visualKind\?\?activeKind/);
  assert.match(source, /p\.image\|\|cakeLayout\|\|previewDetails\?"product product-visual"/);
  assert.match(source, /previewDetails\?L\("… Czytaj dalej","… Read more"\)/);
  assert.match(source, /p\.wine&&!previewDetails/);
  assert.match(css, /\.product\.is-compact-detail \.product-info>p\{[^}]*-webkit-line-clamp:7/);
  assert.match(admin, /Usuń zdjęcie/);
  assert.match(admin, /Albo wybierz zdjęcie z dysku/);
  assert.match(api, /productImageUrl\(item\.imagePath\)/);
  assert.match(api, /isArabicaBagProduct\(item\.name\) \? ARABICA_BAG_IMAGE/);
});

test("merges drinks and spirits into a visual Alko Bar", async () => {
  const source = await readFile(path.join(root, "app/menu-client.tsx"), "utf8");
  const admin = await readFile(path.join(root, "app/admin/admin-panel.tsx"), "utf8");
  const api = await readFile(path.join(root, "app/api/menu/route.ts"), "utf8");
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");

  assert.ok(api.includes('if (visualKind === "cocktails") return { id: "alco-bar", pl: "ALKO BAR", en: "ALKO BAR" };'));
  assert.ok(source.includes('{id:"alco-bar",pl:"ALKO BAR",en:"ALKO BAR",visualKind:"cocktails"}'));
  assert.ok(source.includes('activeKind==="cocktails"?"ALKO BAR":cat?.[lang]'));
  assert.match(api, /inferredAlcoBarAttributes/);
  assert.match(source, /if\(kind==="cold"\|\|kind==="cocktails"\)\{setDrinkProduct\(product\)/);
  assert.match(source, /isAlcoBar\?L\("Wróć do Alko Baru","Back to the Alco Bar"\)/);
  assert.match(source, /function AlcoBarFinder/);
  assert.match(source, /matchesAlcoAttribute\(p,"cocktailType",alcoType\)/);
  assert.match(source, /matchesAlcoAttribute\(p,"cocktailBase",alcoBase\)/);
  assert.match(source, /matchesAlcoAttribute\(p,"tasteProfile",alcoTaste\)/);
  assert.match(source, /matchesAlcoAttribute\(p,"servingStyle",alcoServing\)/);
  assert.match(source, /className="alco-card-attributes"/);
  assert.match(source, /cocktailType:\["Rodzaj","Type"\]/);
  assert.match(source, /servingStyle:\["Podanie","Serving style"\]/);
  assert.match(admin, /input\("cocktailType", "Rodzaj pozycji"/);
  assert.match(admin, /input\("servingStyle", "Sposób podania"/);
  assert.match(admin, /Dla pozycji Alko Baru szukamy rodzaju, alkoholu bazowego/);
  assert.match(css, /\.alco-card-attributes\{/);
  assert.match(css, /\.drink-detail-dialog\.is-alco-bar \.wine-detail-visual>img\{width:100%;height:100%;object-fit:cover/);
});

test("separates wine colour, bubbles, serving and independent features", async () => {
  const source = await readFile(path.join(root, "app/menu-client.tsx"), "utf8");
  const admin = await readFile(path.join(root, "app/admin/admin-panel.tsx"), "utf8");
  const api = await readFile(path.join(root, "app/api/menu/route.ts"), "utf8");

  assert.match(source, /L\("Kolor","Colour"\)/);
  assert.match(source, /L\("Musowanie","Bubbles"\)/);
  assert.match(source, /onSparkling\("NATURALLY_SPARKLING"\)/);
  assert.match(source, /L\("Podanie","Serving"\)/);
  assert.match(source, /L\("Cechy","Features"\)/);
  assert.match(source, /!zeroOnly\|\|p\.alcoholFree/);
  assert.doesNotMatch(admin, /<option>Musujące<\/option>/);
  assert.match(admin, /name="sparklingType"/);
  assert.match(source, /const bottleOnly=offers\.some\(offer=>offer\.kind==="bottle"\)&&!offers\.some\(offer=>offer\.kind==="glass"\)&&!glassEligible/);
  assert.match(source, /L\("tylko butelka","bottle only"\)/);
  assert.doesNotMatch(source, /na życzenie/i);
  assert.match(api, /const glassEligibleBottleKeys = new Set\(rows/);
  assert.match(api, /glassEligible: visualKind === "wine"/);
  assert.match(api, /glassEligible: current\.glassEligible \|\| product\.glassEligible/);
  assert.match(admin, /bez obietnicy otwarcia na życzenie/);
  assert.match(admin, /Dopiero całkowity brak wariantu kieliszkowego/);
});

test("uses the available shelf-card height before pinning the details link to the image bottom", async () => {
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");

  assert.match(css, /\.product\.is-compact-detail \.product-info>p\{[^}]*flex:1 1 auto[^}]*overflow:hidden/);
  assert.match(css, /\.product\.is-compact-detail\.product-visual \.product-info\{[^}]*display:flex[^}]*height:215px[^}]*flex-direction:column/);
  assert.match(css, /\.product\.is-compact-detail \.product-detail-link\{[^}]*margin-top:auto/);
  assert.match(css, /\.product\.is-compact-detail\.product-visual\{height:auto\}/);
  assert.match(css, /\.product\.is-compact-detail\.product-visual \.product-info\{height:185px\}/);
  assert.match(css, /\.product\.is-compact-detail\.product-visual \.product-info\{height:150px\}/);
});

test("keeps beer descriptions short in the menu and opens a full product preview", async () => {
  const source = await readFile(path.join(root, "app/menu-client.tsx"), "utf8");
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");

  assert.match(source, /const\[beerProduct,setBeerProduct\]=useState<Product\|null>\(null\)/);
  assert.match(source, /if\(kind==="beer"\)\{setBeerProduct\(product\);return\}/);
  assert.match(source, /onOpen=\{openProductDetails\}/);
  assert.match(source, /<BeerDetailDialog product=\{beerProduct\}/);
  assert.match(source, /compactDetails=\{activeKind==="shelf"\|\|activeKind==="beer"\|\|showChef\|\|previewDetails\}/);
  assert.match(css, /\.motif-beer \.product\.is-compact-detail \.product-info>p\{[^}]*flex:0 0 auto;[^}]*max-height:2\.65em;[^}]*-webkit-line-clamp:2/);
});

test("offers useful beer filters even when some Dotykacka attributes are incomplete", async () => {
  const source = await readFile(path.join(root, "app/menu-client.tsx"), "utf8");
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");

  assert.match(source, /type BeerStyleFilter="all"\|"lager"\|"wheat"\|"ipa"\|"stout"\|"ale"\|"flavoured"\|"other"/);
  assert.match(source, /type BeerServingFilter="all"\|"bottle"\|"draught"/);
  assert.match(source, /function beerStyleKey\(product:Product\)/);
  assert.match(source, /function isZeroBeer\(product:Product\)/);
  assert.match(source, /function isDraughtBeer\(product:Product\)/);
  assert.match(source, /\(\?:bosman\|guin\+ess\).*duże.*małe/);
  assert.match(source, /bezalkohol\|\(\?:\^\|\\s\)0/);
  assert.match(source, /activeKind!=="beer"/);
  assert.match(source, /beerAlcohol==="zero"\?isZeroBeer\(p\):!isZeroBeer\(p\)/);
  assert.match(source, /beerServing==="draught"\?isDraughtBeer\(p\):!isDraughtBeer\(p\)/);
  assert.match(source, /activeKind==="beer"&&<BeerFinder/);
  assert.match(source, /beerLayout=\{activeKind==="beer"\}/);
  assert.match(source, /L\("Z nalewaka","Draught"\)/);
  assert.match(source, /L\("Butelka","Bottle"\)/);
  assert.match(source, /Na jakie piwo masz dziś ochotę\?/);
  assert.match(source, /Wyczyść wybór/);
  assert.match(css, /\.beer-serving-mark\{/);
  assert.match(css, /\.beer-serving-badge\{/);
});

test("shows live Dotykacka descriptions for tea products", async () => {
  const api = await readFile(path.join(root, "app/api/menu/route.ts"), "utf8");

  assert.match(api, /descPl: visualKind === "tea" \? item\.sourceDescription \|\| item\.descriptionPl/);
  assert.match(api, /descEn: item\.descriptionEn \|\| \(visualKind === "tea" \? item\.sourceDescription : item\.descriptionPl\)/);
});

test("promotes the Harney and Sons tea selection with official brand artwork", async () => {
  const source = await readFile(path.join(root, "app/menu-client.tsx"), "utf8");
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");
  const photo = await readFile(path.join(root, "public/harney-teas.jpg"));
  const logo = await readFile(path.join(root, "public/harney-sons-logo.png"));

  assert.match(source, /className="tea-maker-banner"/);
  assert.match(source, /W Atelier serwujemy wyłącznie gorące herbaty Harney & Sons\./);
  assert.match(source, /założona przez Johna Harneya w 1983 roku/);
  assert.match(source, /src="\/harney-sons-logo\.png"/);
  assert.match(source, /src="\/harney-teas\.jpg"/);
  assert.doesNotMatch(source, /Przy każdej pozycji podajemy rodzaj herbaty/);
  assert.doesNotMatch(css, /\.tea-intro/);
  assert.match(css, /\.tea-maker-banner\{display:grid;grid-template-columns:/);
  assert.ok(photo.length > 20_000);
  assert.ok(logo.length > 5_000);
});

test("opens Harney teas with official cup-and-leaf photography and the full Dotykacka description", async () => {
  const source = await readFile(path.join(root, "app/menu-client.tsx"), "utf8");
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");
  const teaPhotos = await readdir(path.join(root, "public/tea"));

  assert.equal(teaPhotos.filter(name => name.endsWith(".jpg")).length, 15);
  assert.match(source, /const teaImageByName:Record<string,string>/);
  assert.match(source, /if\(kind==="tea"\)\{setTeaProduct\(product\);return\}/);
  assert.match(source, /onOpen=\{openProductDetails\}/);
  assert.match(source, /<TeaDetailDialog product=\{teaProduct\}/);
  assert.match(source, /className="wine-detail-dialog tea-detail-dialog"/);
  assert.match(source, /Napar i liście herbaty/);
  assert.match(source, /Zobacz herbatę i pełny opis/);
  assert.match(css, /\.tea-detail-visual>img\{[^}]*object-fit:cover[^}]*filter:none/);
  assert.match(css, /\.motif-tea \.product\.is-openable/);
  for (const name of teaPhotos) {
    if (!name.endsWith(".jpg")) continue;
    const photo = await readFile(path.join(root, "public/tea", name));
    assert.ok(photo.length > 20_000, `${name} should contain a production-quality tea photo`);
  }
});

test("uses exact cake photos in image-led cards with a company-story intro", async () => {
  const source = await readFile(path.join(root, "app/menu-client.tsx"), "utf8");
  const api = await readFile(path.join(root, "app/api/menu/route.ts"), "utf8");
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");

  assert.match(source, /\{id:"cakes",pl:"NA SŁODKO",en:"SWEET"\}/);
  assert.match(api, /visualKind === "cakes"/);
  assert.match(api, /\{ id: "cakes", pl: "NA SŁODKO", en: "SWEET" \}/);
  assert.match(api, /category: standardMenuProduct \? publicCategory\(visualKind, item\.categoryId\)\.id : "shelf"/);
  assert.match(source, /cakeLayout=\{activeKind==="cakes"\}/);
  assert.match(source, /if\(kind==="cakes"\)\{setCakeProduct\(product\)/);
  assert.match(source, /<CakeDetailDialog product=\{cakeProduct\}/);
  assert.match(source, /activeKind==="cakes"&&isCapuccinoBannerCategory\(cat\)&&<CakePartnerIntro lang=\{lang\}/);
  assert.match(source, /function isCapuccinoBannerCategory\(category:Category\|undefined\)/);
  assert.match(source, /category\?\.visualKind==="cakes"\|\|category\?\.id==="cakes"/);
  assert.match(source, /<CakePartnerDialog open=\{capuccinoOpen\}/);
  assert.match(source, /\/capuccino-wedding-cakes\.jpg/);
  assert.match(source, /\/capuccino-occasion-cakes\.jpg/);
  assert.doesNotMatch(source, /className="capuccino-story-footer"/);
  assert.doesNotMatch(source, /Rodzinna firma · od 2006 roku/);
  assert.doesNotMatch(source, /W karcie Atelier logo Capuccino Cafe oznacza/);
  assert.doesNotMatch(source, /Autorska pracownia tortów/);
  assert.doesNotMatch(source, /<figcaption>/);
  assert.doesNotMatch(source, /href="https:\/\/capuccinocafe\.pl/);
  assert.doesNotMatch(source, /<CakeShowcase/);
  assert.doesNotMatch(source, /cakeShowcase=/);
  assert.match(source, /cakeLayout&&!p\.image&&<div className="product-image cake-image-placeholder"/);
  assert.match(source, /cakeLayout&&p\.cakePartner==="capuccino-cafe"&&<img className="cake-card-logo"/);
  assert.match(source, /product\.cakePartner==="capuccino-cafe"&&<img className="featured-cake-logo"/);
  assert.match(source, /function cakePresentation\(/);
  assert.match(source, /className="cake-taste-line"/);
  assert.match(source, /className="cake-read-more"/);
  assert.doesNotMatch(source, /Wypiek od/);
  assert.doesNotMatch(source, /Sopocka pracownia cukiernicza/);
  assert.doesNotMatch(source, /Słodkości z sopockiej pracowni/);
  assert.match(css, /\.motif-cakes \.product\.is-cake-card\{height:245px;min-height:245px/);
  assert.match(css, /\.motif-cakes \.product\.is-cake-card \.product-info>p\{[^}]*min-height:2\.8em;[^}]*max-height:2\.8em;[^}]*-webkit-line-clamp:2/);
  assert.match(css, /\.cake-card-footer\{[^}]*align-items:flex-start[^}]*margin-top:auto/);
  assert.match(css, /\.cake-card-logo\{[^}]*width:78px[^}]*object-position:left center/);
  assert.match(css, /\.featured-cake-logo\{[^}]*width:128px[^}]*object-position:left center/);
  assert.match(css, /\.cake-taste-line\{[^}]*color:var\(--pink\)[^}]*text-transform:uppercase/);
  assert.match(css, /\.cake-detail-logo\{[^}]*width:135px[^}]*object-position:left center/);
  assert.match(css, /\.cake-partner-intro\{[^}]*grid-template-columns:[^}]*border-top:5px solid var\(--pink\)/);
  assert.doesNotMatch(css, /\.cake-partner-copy \.cake-partner-link/);
  assert.match(css, /\.capuccino-story-banners\{[^}]*grid-template-columns:1fr 1fr;[^}]*gap:0/);
  assert.match(css, /\.capuccino-story-banners img\{[^}]*width:100%;[^}]*height:auto;[^}]*object-fit:contain/);
});

test("places the featured marker over the left side of product photos", async () => {
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");

  assert.match(css, /\.product-visual \.guest-choice-mark,\.product-visual \.featured-mark\{[^}]*left:20px[^}]*right:auto[^}]*background:#fff/);
  assert.match(css, /\.product-visual \.guest-choice-mark\+\.featured-mark\{top:44px\}/);
  assert.match(css, /\.product:not\(\.product-visual\)>\.featured-mark\{position:static/);
});

test("opens every Atelier selection with the same product detail routing as the regular menu card", async () => {
  const [source, css] = await Promise.all([
    readFile(path.join(root, "app/menu-client.tsx"), "utf8"),
    readFile(path.join(root, "app/globals.css"), "utf8"),
  ]);
  assert.match(source, /const openProductDetails=\(product:Product\)=>/);
  assert.match(source, /<Featured key=\{product\.id\?\?product\.pl\} product=\{product\} lang=\{lang\} onOpen=\{openProductDetails\}/);
  assert.match(source, /<ProductCard product=\{p\}[\s\S]*onOpen=\{openProductDetails\}/);
  assert.match(source, /function Featured\(\{product,lang,onOpen\}/);
  assert.match(source, /role="button" tabIndex=\{0\} onClick=\{\(\)=>onOpen\(product\)\}/);
  assert.match(source, /if\(product\.whisky\|\|kind==="whisky"\)\{setSpiritProduct\(product\)/);
  assert.match(source, /<GenericProductDetailDialog product=\{genericProduct\}/);
  assert.match(css, /\.featured\.is-openable\{cursor:pointer/);
});

test("uses a whisky tumbler and keeps 50 ml independent from bottle source data", async () => {
  const source = await readFile(path.join(root, "app/menu-client.tsx"), "utf8");
  const api = await readFile(path.join(root, "app/api/menu/route.ts"), "utf8");

  assert.match(source, /className="whisky-glass-icon"/);
  assert.match(source, /offer\.kind==="serving"\?"50 ml"/);
  assert.match(source, /activeKind==="whisky"&&<WhiskyFinder/);
  assert.match(api, /function hasBottleTag/);
  assert.match(api, /whiskyBottle \? "bottle" : "serving"/);
  assert.match(api, /delete publicAttributes\.volume/);
});

test("guides alternative coffee through beans, brewing method and product details", async () => {
  const source = await readFile(path.join(root, "app/menu-client.tsx"), "utf8");
  const api = await readFile(path.join(root, "app/api/menu/route.ts"), "utf8");
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");

  assert.match(source, /const\[coffeeProduct,setCoffeeProduct\]=useState<Product\|null>\(null\)/);
  assert.match(source, /if\(kind==="coffee"\)\{setCoffeeProduct\(product\)/);
  assert.match(source, /<CoffeeDetailDialog product=\{coffeeProduct\}/);
  assert.match(source, /function CoffeeDetailDialog/);
  assert.match(source, /const alternativeCoffeeMethods=activeKind==="coffee"\?regularVisible\.filter\(isAlternativeCoffeeProduct\):\[\]/);
  assert.match(source, /const displayedProducts=activeKind==="coffee"\?\[\.\.\.regularVisible\.filter\(product=>!isAlternativeCoffeeProduct\(product\)\),\.\.\.alternativeCoffeeMethods\]:regularVisible/);
  assert.match(source, /coffeeOptions\.length>0&&<Options[^]*<AlternativeCoffeeBeans lang=\{lang\} beans=\{alternativeCoffeeBeans\} methods=\{alternativeCoffeeMethods\}/);
  assert.match(source, /Wybierz ziarno/);
  assert.match(source, /Wybierz metodę parzenia/);
  const alternativeFlow = source.slice(source.indexOf("function AlternativeCoffeeBeans"), source.indexOf("function TakeHomeCoffee"));
  assert.ok(alternativeFlow.indexOf("Wybierz metodę parzenia") < alternativeFlow.indexOf("Wybierz ziarno"));
  assert.match(source, /selected&&selectedMethod&&<p className="alternative-selection-summary"/);
  assert.match(source, /function isAeropressMethod/);
  assert.match(source, /function isChemexMethod/);
  assert.match(source, /function coffeeMethodImage/);
  assert.match(source, /function coffeeMethodImageClass/);
  assert.match(source, /function isDripMethod/);
  assert.match(source, /coffee-methods\/chemex\.jpg/);
  assert.match(source, /coffee-methods\/aeropress\.jpg/);
  assert.match(source, /coffee-methods\/drip\.jpg/);
  assert.match(source, /coffeeMethodImage\(method\)&&<img/);
  assert.match(source, /setSelectedMethodId\(methodKey\(method\)\)/);
  assert.match(source, /setMethodPreview\(method\)/);
  assert.match(source, /className="alternative-method-step is-ready"/);
  assert.match(source, /className="alternative-bean-step is-ready"/);
  assert.doesNotMatch(source, /disabled=\{!selectedMethod\}/);
  assert.doesNotMatch(source, /disabled=\{!selected\}/);
  assert.doesNotMatch(source, /Najpierw wybierz ziarno powyżej/);
  assert.doesNotMatch(source, /setSelectedMethodId\(""\)/);
  assert.doesNotMatch(source, /Wybierz \$\{methodPreview\.pl\}/);
  assert.doesNotMatch(source, /Wróć bez wyboru/);
  assert.match(source, /ponad 30 prototypach/);
  assert.match(source, /Chemex zaprojektował i opatentował w 1941 roku/);
  assert.match(source, /V60 to stożkowy dripper HARIO/);
  assert.match(source, /"\/drip-demo\.mp4":chemexPreview\?"\/chemex-demo\.mp4":"\/aeropress-demo\.mp4"/);
  assert.match(source, /"\/drip-demo-poster\.jpg":chemexPreview\?"\/chemex-demo-poster\.jpg":"\/aeropress-demo-poster\.jpg"/);
  assert.match(source, /autoPlay muted loop playsInline/);
  assert.match(api, /inventoryCatalogProducts\.imageSourceUrl/);
  assert.match(api, /image: beanImages\.get\(item\.addonDotykackaId\)/);
  assert.match(css, /\.alternative-beans-picker\{display:grid/);
  assert.match(css, /\.alternative-method-step,\.alternative-bean-step\{grid-column:1\/-1/);
  assert.match(css, /\.options\{display:grid;grid-column:1\/-1/);
  assert.match(css, /\.alternative-method-picker\{display:grid/);
  assert.match(css, /\.alternative-method-picker button\.has-image/);
  assert.match(css, /button\.has-image:after/);
  assert.match(css, /button\.has-image img\{position:absolute/);
  assert.match(css, /\.alternative-method-video\{display:block/);
  assert.match(css, /\.coffee-detail-visual>img\{[^}]*object-fit:contain/);
  assert.match(css, /\.alternative-bean-placeholder\{font-size:0;background:#fff url\(\/coffee-methods\/churchill-sapphire-mug\.webp\)/);
  assert.doesNotMatch(source, /Kubek Churchill|Churchill Monochrome|alternative-serving-cup/);
});

test("shows WARM and COLD serving graphics in the guest menu", async () => {
  const [source, api, css] = await Promise.all([
    readFile(path.join(root, "app/menu-client.tsx"), "utf8"),
    readFile(path.join(root, "app/api/menu/route.ts"), "utf8"),
    readFile(path.join(root, "app/globals.css"), "utf8"),
  ]);
  assert.match(source, /function TemperatureChoice/);
  assert.match(source, /<TemperatureChoice temperatures=\{p\.temperatures\?\?\[\]\}/);
  assert.match(source, /M10 5a2 2 0 0 1 4 0v8\.4a4 4 0 1 1-4 0V5/);
  assert.match(api, /temperatures: productTemperatures\(item\.tags\)/);
  assert.match(css, /\.temperature-pill\.is-warm/);
  assert.match(css, /\.temperature-pill\.is-cold/);
});

test("uses the transparent product photo for the Arabica coffee bag", async () => {
  const api = await readFile(path.join(root, "app/api/menu/route.ts"), "utf8");

  assert.match(api, /const ARABICA_BAG_IMAGE = "\/coffee-arabica-transparent\.png"/);
  assert.match(api, /function isArabicaBagProduct/);
  assert.match(api, /isArabicaBagProduct\(item\.name\) \? ARABICA_BAG_IMAGE/);
});
