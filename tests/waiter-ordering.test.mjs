import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { reportPaymentTotals, snapshotDelta } from "../lib/cash-day.ts";
import { cleanInventoryLocation, inventoryDifference, millisToQuantity, nonNegativeWholeNumber, quantityToMillis, selectInventoryProducts, wineBottleQuantityMillis } from "../lib/inventory.ts";
import { moneyToCents, settlementTotals } from "../lib/waiter-settlement.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("opens the hidden waiter login only after three logo taps", async () => {
  const source = await read("app/menu-client.tsx");
  assert.match(source, /logoTaps>=2/);
  assert.match(source, /window\.location\.assign\("\/kelner"\)/);
  assert.match(source, /onClick=\{tapLogo\}/);
});

test("shows and authenticates only active Dotykacka employees", async () => {
  const [adminRoute, authRoute] = await Promise.all([
    read("app/api/admin/waiter/employees/route.ts"),
    read("app/api/waiter/session/route.ts"),
  ]);
  for (const source of [adminRoute, authRoute]) {
    assert.match(source, /eq\(waiterEmployees\.enabled, true\)/);
    assert.match(source, /eq\(waiterEmployees\.deleted, false\)/);
  }
});

test("keeps the waiter route and session compatible with an iPad PWA", async () => {
  const [updater, client, fallback, auth, session, catalog, settlements] = await Promise.all([
    read("app/pwa-updater.tsx"), read("app/kelner/waiter-client.tsx"),
    read("app/kelner/waiter-session-client.ts"), read("lib/waiter-auth.ts"),
    read("app/api/waiter/session/route.ts"), read("app/api/waiter/catalog/route.ts"),
    read("app/api/waiter/settlements/route.ts"),
  ]);
  assert.match(updater, /new URL\(window\.location\.href\)/);
  assert.match(updater, /next\.pathname/);
  assert.doesNotMatch(updater, /window\.location\.replace\(`\/\?menu-update=/);
  assert.match(client, /credentials: "same-origin"/);
  assert.match(client, /saveWaiterSessionToken\(body\.token\)/);
  assert.match(client, /headers: waiterSessionHeaders\(\)/);
  assert.doesNotMatch(client, /aria-label="PIN pracownika" autoFocus/);
  assert.match(fallback, /window\.sessionStorage\.setItem\(STORAGE_KEY, token\)/);
  assert.match(fallback, /token && !headers\.has\("authorization"\)/);
  assert.match(fallback, /headers\.set\("authorization", `Bearer \$\{token\}`\)/);
  assert.match(auth, /function bearerToken\(request\?: Request\)/);
  assert.match(auth, /parseWaiterToken\(bearerToken\(request\) \?\? store\.get\(COOKIE_NAME\)\?\.value\)/);
  assert.match(session, /SameSite=Lax/);
  assert.match(session, /Response\.json\(\{ employee: \{ dotykackaId: match\.dotykackaId, name: match\.name \}, token \}\)/);
  assert.match(catalog, /currentWaiter\(request\)/);
  assert.match(settlements, /currentWaiter\(request\)/);
});

test("uses one stable release id across browser, API, and service-worker builds", async () => {
  const config = await read("next.config.ts");
  assert.match(config, /readFileSync\(path\.join\(process\.cwd\(\), "RELEASE"\)/);
  assert.doesNotMatch(config, /menu-\$\{Date\.now\(\)\}/);
});

test("stores only a scrypt waiter PIN hash and sends orders only through the gated POS adapter", async () => {
  const [schema, auth, orders, client, waiter] = await Promise.all([
    read("db/schema.ts"), read("lib/waiter-auth.ts"), read("app/api/waiter/orders/route.ts"), read("lib/dotykacka/client.ts"), read("app/kelner/waiter-client.tsx"),
  ]);
  assert.match(schema, /pinHash: text\("pin_hash"\)/);
  assert.doesNotMatch(schema, /pin: text\("pin"\)/);
  assert.match(auth, /scrypt\$/);
  assert.match(orders, /WAITER_POS_ACTIONS_ENABLED !== "true"/);
  assert.match(orders, /action: "order\/create"/);
  assert.match(orders, /"idempotency-key": externalId/);
  assert.match(orders, /client\)\.posAction|DotykackaClient\(config\)\.posAction/);
  assert.match(orders, /status: "UNKNOWN"/);
  assert.doesNotMatch(orders, /status: 501/);
  assert.match(client, /posAction\(input: Record<string, unknown>\)/);
  assert.match(waiter, /clearWaiterSessionToken\(\); window\.location\.assign\("\/"\)/);
});

test("grants menu admin access only to active Dotykacka employees with hashed passwords", async () => {
  const [schema, migration, password, auth, session, accessRoute, employeesRoute, screen] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0025_admin_users.sql"),
    read("lib/admin-password.ts"),
    read("lib/admin-auth.ts"),
    read("app/api/admin/session/route.ts"),
    read("app/api/admin/waiter/employees/[dotykackaId]/admin/route.ts"),
    read("app/api/admin/waiter/employees/route.ts"),
    read("app/admin/waiters/waiter-admin-client.tsx"),
  ]);
  assert.match(schema, /adminUsers = pgTable\("admin_users"/);
  assert.doesNotMatch(schema, /password: text\("password"\)/);
  assert.match(migration, /UNIQUE\("employee_dotykacka_id"\)/);
  assert.match(migration, /UNIQUE\("username"\)/);
  assert.match(password, /scrypt\$/);
  assert.match(password, /password\.length >= 10/);
  for (const source of [auth, session, accessRoute]) {
    assert.match(source, /eq\(waiterEmployees\.enabled, true\)/);
    assert.match(source, /eq\(waiterEmployees\.deleted, false\)/);
  }
  assert.match(auth, /kind: "ENV" \| "DATABASE"/);
  assert.match(session, /verifyAdminPassword/);
  assert.match(accessRoute, /Nie możesz wyłączyć własnego konta/);
  assert.match(employeesRoute, /adminConfigured/);
  assert.match(screen, /Administrator menu/);
});

test("implements independently approved inventory stages with a gated Dotykacka export", async () => {
  const [docs, client, panel, schema, migration, sync, adminRoute, adminStageRoute, workerRoute, workerScreen, workerStyles, inventoryData, adminScreen] = await Promise.all([
    read("docs/DOTYKACKA_INVENTORY_INTEGRATION.md"),
    read("lib/dotykacka/client.ts"),
    read("app/admin/admin-panel.tsx"),
    read("db/schema.ts"),
    read("drizzle/0026_inventory_workflow.sql"),
    read("lib/dotykacka/sync.ts"),
    read("app/api/admin/inventory/route.ts"),
    read("app/api/admin/inventory/[id]/route.ts"),
    read("app/api/waiter/inventory/[id]/route.ts"),
    read("app/kelner/inventory/inventory-worker-client.tsx"),
    read("app/kelner/inventory/inventory-worker-enhancements.css"),
    read("lib/inventory-data.ts"),
    read("app/admin/inventory/inventory-admin-client.tsx"),
  ]);
  assert.match(docs, /zatwierdzamy etapy, nie cały magazyn/i);
  assert.match(docs, /Wina — lodówka barowa/);
  assert.match(docs, /powtarzalność odchyleń/);
  assert.match(docs, /ZEPSUCIE/);
  assert.match(schema, /inventoryStages = pgTable\("inventory_stages"/);
  assert.match(schema, /inventoryCountEntries = pgTable\("inventory_count_entries"/);
  assert.match(migration, /CREATE TABLE "inventory_exports"/);
  assert.match(sync, /await tx\.delete\(inventoryCatalogProducts\)/);
  assert.match(adminRoute, /eq\(inventoryCatalogProducts\.inventoryTracked, true\)/);
  assert.match(adminRoute, /SET_PRODUCT_TRACKING/);
  assert.match(adminRoute, /selectInventoryProducts/);
  assert.match(adminRoute, /skippedConfirmedZeroCount/);
  assert.match(adminStageRoute, /process\.env\.DOTYKACKA_INVENTORY_WRITE_ENABLED !== "true"/);
  assert.ok(adminStageRoute.indexOf("DOTYKACKA_INVENTORY_WRITE_ENABLED") < adminStageRoute.indexOf("createStockTaking(payload)"));
  assert.match(adminStageRoute, /stage\.status !== "APPROVED"/);
  assert.match(adminStageRoute, /ADMIN_EDITABLE_STATUSES\.includes\(stage\.status\)/);
  assert.match(adminStageRoute, /acceptedExpectedCount/);
  assert.match(adminStageRoute, /countedQuantity: sql`\$\{inventoryStageItems\.expectedQuantity\}`/);
  assert.doesNotMatch(adminStageRoute, /for \(const item of pendingItems\)/);
  assert.match(adminStageRoute, /stockTakingDates/);
  assert.match(client, /createStockTaking/);
  assert.match(client, /\/stock-takings/);
  assert.match(workerRoute, /countStatus === "NOT_FOUND"/);
  assert.match(workerRoute, /Potwierdź stan każdej pozycji/);
  assert.match(inventoryData, /when \$\{inventoryStageItems\.expectedQuantity\} > 0 then 0/);
  assert.match(inventoryData, /orderBy\(asc\(expectedStockPriority\), asc\(inventoryStageItems\.productName\)\)/);
  assert.match(workerStyles, /\.inventory-count-item > header \{[\s\S]*height: auto;[\s\S]*color: var\(--i-navy\)/);
  assert.match(workerStyles, /\.inventory-worker-layout \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(workerStyles, /\.inventory-worker-stages \{[\s\S]*display: flex;[\s\S]*overflow-x: auto/);
  assert.match(workerStyles, /\.inventory-count-photo img \{[\s\S]*width: auto;[\s\S]*max-height: 100%;[\s\S]*object-fit: scale-down;[\s\S]*object-position: center/);
  assert.match(workerScreen, /Dodaj inne miejsce/);
  assert.match(workerScreen, /Pełne butelki/);
  assert.match(workerScreen, /Dostępne kieliszki/);
  assert.match(workerScreen, /Sprzedaż wyłącznie całych butelek/);
  assert.match(workerScreen, /EAN:/);
  assert.match(workerScreen, /waiterSessionHeaders/);
  assert.match(workerScreen, /4 \* 60 \* 1000/);
  assert.match(workerScreen, /function InventorySearch/);
  assert.match(workerScreen, /field\.addEventListener\("keydown", onKeyDown\)/);
  assert.match(workerScreen, /field\.addEventListener\("beforeinput", onBeforeInput\)/);
  assert.match(workerScreen, /event\.inputType !== "deleteContentBackward"/);
  assert.match(workerScreen, /field\.setRangeText\("", start === end \? start - 1 : start, end, "end"\)/);
  assert.doesNotMatch(workerScreen, /value=\{search\} onChange=/);
  assert.match(workerScreen, /Zakończenie tego etapu nie wymaga przeliczenia innych kategorii/);
  assert.match(adminScreen, /Cofnij do poprawy/);
  assert.match(adminScreen, /Zatwierdź bez czekania na zakończenie przez pracownika/);
  assert.match(adminScreen, /REQUEST_TIMEOUT_MS = 30_000/);
  assert.match(adminScreen, /controller\.abort\(\)/);
  assert.match(adminScreen, /finally \{[\s\S]*?setBusy\(""\)/);
  assert.match(adminScreen, /Wpisz notatkę, aby aktywować przycisk zatwierdzania/);
  assert.match(adminScreen, /zer pominiętych/);
  assert.match(adminScreen, /Powtarzające się odchylenia/);
  assert.match(panel, /href="\/admin\/inventory"/);
});

test("omits a repeatedly confirmed zero until a positive stock movement occurs", () => {
  const products = [
    { dotykackaId: "still-zero", stockQuantity: "0" },
    { dotykackaId: "received", stockQuantity: "0" },
    { dotykackaId: "positive", stockQuantity: "4" },
    { dotykackaId: "latest-was-positive", stockQuantity: "0" },
    { dotykackaId: "never-counted", stockQuantity: "0" },
  ];
  const approvedResults = [
    { productDotykackaId: "still-zero", countedQuantity: "0", approvedAt: "2026-09-10T10:00:00Z" },
    { productDotykackaId: "received", countedQuantity: "0", approvedAt: "2026-09-10T10:00:00Z" },
    { productDotykackaId: "latest-was-positive", countedQuantity: "0", approvedAt: "2026-09-09T10:00:00Z" },
    { productDotykackaId: "latest-was-positive", countedQuantity: "2", approvedAt: "2026-09-11T10:00:00Z" },
  ];
  const movements = [
    { dotykackaProductId: "still-zero", quantity: "3", occurredAt: "2026-09-09T12:00:00Z", receivedAt: "2026-09-09T12:01:00Z" },
    { dotykackaProductId: "received", quantity: "6", occurredAt: "2026-09-12T12:00:00Z", receivedAt: "2026-09-12T12:01:00Z" },
  ];
  const selection = selectInventoryProducts(products, approvedResults, movements);
  assert.deepEqual(selection.skippedConfirmedZero.map((product) => product.dotykackaId), ["still-zero"]);
  assert.deepEqual(selection.included.map((product) => product.dotykackaId), ["received", "positive", "latest-was-positive", "never-counted"]);
});

test("normalizes inventory quantities and location labels without floating point drift", () => {
  assert.equal(quantityToMillis("4,25"), 4250);
  assert.equal(quantityToMillis("0.001"), 1);
  assert.equal(quantityToMillis("-1"), null);
  assert.equal(quantityToMillis("1.2345"), null);
  assert.equal(millisToQuantity(4250), "4.25");
  assert.equal(millisToQuantity(-1001), "-1.001");
  assert.equal(inventoryDifference("5", "4.25"), -750);
  assert.equal(cleanInventoryLocation("  Lodówka   barowa  "), "Lodówka barowa");
  assert.equal(nonNegativeWholeNumber("7"), 7);
  assert.equal(nonNegativeWholeNumber("1.5"), null);
  assert.equal(wineBottleQuantityMillis(3, 2, 5), 3400);
  assert.equal(wineBottleQuantityMillis(1, 1, 6), 1167);
});

test("guards the one-shot wine migration and preserves the agreed bottle and glass rules", async () => {
  const source = await read("scripts/migrate-wine-glasses.mjs");
  assert.match(source, /DOTYKACKA_WINE_MIGRATION_WRITE_ENABLED === "true"/);
  assert.match(source, /process\.argv\.includes\("--apply"\)/);
  assert.ok(source.indexOf("backupSnapshot(config") < source.indexOf('method: "POST", body: toCreate'));
  assert.match(source, /new Set\(\["WIN14", "WIN64", "WIN65"\]\)/);
  assert.match(source, /new Set\(\["WIN02", "WIN19", "WIN44", "WIN46"\]\)/);
  assert.match(source, /\["wave bianco", 110\]/);
  assert.match(source, /\["yellow tail sauvignon blanc", 110\]/);
  assert.match(source, /const divisor = sparkling \? 5 : 4/);
  assert.match(source, /sparkling \? 1 \/ 6 : 0\.2/);
  assert.match(source, /przed migracją/);
  assert.match(source, /externalId: marker/);
  assert.doesNotMatch(source, /externalIds: \[marker\]/);
  assert.doesNotMatch(source, /"externalId",\s*\n\s*"externalIds"/);
});

test("places configurable survey answers before order submission", async () => {
  const [client, schema] = await Promise.all([read("app/kelner/waiter-client.tsx"), read("db/schema.ts")]);
  assert.match(client, /Dalej: krótka ankieta/);
  assert.match(client, /surveyAnswers/);
  assert.match(schema, /waiterSurveyQuestions/);
  assert.match(schema, /surveyAnswers: jsonb\("survey_answers"\)/);
});

test("keeps separately configured coffees as distinct order lines", async () => {
  const [client, catalog, orders] = await Promise.all([
    read("app/kelner/waiter-client.tsx"), read("app/api/waiter/catalog/route.ts"), read("app/api/waiter/orders/route.ts"),
  ]);
  assert.match(client, /customizations\.map\(\(addon\) => addon\.id\)\.sort\(\)\.join/);
  assert.match(client, /Object\.values\(addonSelections\)\.flat\(\)/);
  assert.match(client, /group\.multiple \? \(previous\.includes\(addon\.id\)/);
  assert.match(client, /możesz wybrać kilka/);
  assert.match(catalog, /multiple: isCoffeeAddonGroup\(groupName\)/);
  assert.match(orders, /Wybierz ziarno do kawy alternatywnej/);
  assert.match(orders, /selectedGroups\.filter\(\(group\) => !isCoffeeAddonGroup\(group\)\)/);
  assert.match(orders, /W tej grupie można wybrać tylko jeden wariant/);
});

test("documents the complete waiter, coffee, wine, and whiskey rules in admin", async () => {
  const source = await read("app/admin/admin-panel.tsx");
  assert.match(source, /Strefa kelnera i zamówienia/);
  assert.match(source, /Trzy szybkie dotknięcia logotypu/);
  assert.match(source, /nieodwracalny, losowo solony skrót scrypt/);
  assert.match(source, /Każda konfiguracja jest osobną linią zamówienia/);
  assert.match(source, /Kolor wina i musowanie są niezależnymi cechami/);
  assert.match(source, /tagu BUTELKA oznacza porcję 50 ml/);
  assert.match(source, /Produkt z tagiem PÓŁKA można dodać tylko przy stanie większym od zera/);
  assert.match(source, /Osobny widok „Poza menu” zawiera aktywne, nieusunięte produkty/);
  assert.match(source, /Wysyłanie do POS jest obecnie technicznie zablokowane/);
  assert.match(source, /Ostatnia aktualizacja zasad: 14 września 2026/);
});

test("keeps active Dotykacka products outside the guest menu in a separate waiter view", async () => {
  const [schema, sync, catalog, client, orders] = await Promise.all([
    read("db/schema.ts"), read("lib/dotykacka/sync.ts"), read("app/api/waiter/catalog/route.ts"),
    read("app/kelner/waiter-client.tsx"), read("app/api/waiter/orders/route.ts"),
  ]);
  assert.match(schema, /waiterExtraProducts = pgTable\("waiter_extra_products"/);
  assert.match(sync, /product\.display && !product\.deleted && !shouldSyncMenuProduct/);
  assert.match(sync, /await tx\.delete\(waiterExtraProducts\)/);
  assert.match(catalog, /outsideMenu: true/);
  assert.match(client, /const OUTSIDE_MENU = "Poza menu"/);
  assert.match(client, /category === OUTSIDE_MENU \? product\.outsideMenu : !product\.outsideMenu/);
  assert.match(orders, /from\(waiterExtraProducts\)\.where/);
});

test("links cake provenance to the exact Dotykacka supplier and presents the menu chef", async () => {
  const [menuRoute, client, admin] = await Promise.all([
    read("app/api/menu/route.ts"), read("app/menu-client.tsx"), read("app/admin/admin-panel.tsx"),
  ]);
  assert.match(menuRoute, /FONTANNA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ/);
  assert.match(menuRoute, /cakePartner: visualKind === "cakes"/);
  assert.match(client, /\/capuccino-cafe-logo\.png/);
  assert.match(client, /cakeLayout&&p\.cakePartner==="capuccino-cafe"/);
  assert.doesNotMatch(client, /<CakeShowcase/);
  assert.doesNotMatch(client, /Wypiek od|Sopocka pracownia cukiernicza/);
  assert.match(client, /Andrzej Andrzejczak, znany jako Dr Meat/);
  assert.match(client, /andrzej-z-miesem\.jpg/);
  assert.match(client, /isChefCategory\(cat\)/);
  const chefCategorySource = client.match(/function isChefCategory\(category:Category\|undefined\)\{return ([^}]+)\}/);
  assert.ok(chefCategorySource);
  const isChefCategory = new Function("category", `return ${chefCategorySource[1]}`);
  assert.equal(isChefCategory({ pl: "NA SŁONO" }), true);
  assert.equal(isChefCategory({ pl: "ALKOHOLE" }), false);
  assert.doesNotMatch(client, /activeKind==="food"&&<ChefIntro/);
  assert.match(client, /Mentor kulinarny Atelier/);
  assert.match(client, /Autor receptur i opiekun naszej karty/);
  assert.doesNotMatch(client, /Poznaj naszego szefa kuchni/);
  assert.match(client, /function WorkshopDialog/);
  assert.match(client, /<iframe src="https:\/\/www\.top-grille\.pl\/category\/akademia-grillowania"/);
  assert.doesNotMatch(client, /href="https:\/\/www\.top-grille\.pl[^>]+target="_blank"/);
  assert.match(client, /www\.top-grille\.pl\/category\/akademia-grillowania/);
  assert.match(admin, /Portret oraz rozwijana opowieść dotyczą całej karty/);
});

test("gives waiters the guest drink filters and operational serving information", async () => {
  const [catalog, client, css] = await Promise.all([
    read("app/api/waiter/catalog/route.ts"), read("app/kelner/waiter-client.tsx"), read("app/kelner/waiter.css"),
  ]);
  assert.match(catalog, /wineColor: productContent\.wineColor/);
  assert.match(catalog, /sparklingType: productContent\.sparklingType/);
  assert.match(catalog, /attributes: productContent\.attributes/);
  assert.match(catalog, /const kind = sectionFor\(product\.category\)/);
  assert.match(catalog, /isByGlass\(product\.tags, product\.name\)/);
  assert.match(catalog, /wineDetailsByCode/);
  assert.match(catalog, /product\.wineColor \?\? pairedWine\?\.wineColor/);
  assert.match(catalog, /isDraughtBeer\(product\.name\)/);
  assert.match(client, /function matchesDrinkFilters/);
  assert.match(client, /TAKI SAM WYBÓR JAK W MENU GOŚCIA/);
  assert.match(client, /\["glass", "Na kieliszki"\]/);
  assert.match(client, /\["draught", "Z nalewaka"\]/);
  assert.match(client, /activeDrinkKind/);
  assert.match(client, /servingLabel\(product\)/);
  assert.match(css, /\.waiter-drink-filters/);
  assert.match(css, /\.waiter-filter-chips button\.is-selected/);
});

test("keeps a staff-only preparation manual behind three product-photo taps", async () => {
  const [schema, migration, admin, catalog, client, css, uploadRoute, mediaRoute] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0032_overjoyed_newton_destine.sql"),
    read("app/admin/admin-panel.tsx"),
    read("app/api/waiter/catalog/route.ts"),
    read("app/kelner/waiter-client.tsx"),
    read("app/kelner/waiter.css"),
    read("app/api/admin/products/[id]/staff-media/route.ts"),
    read("app/api/staff-manual-media/[filename]/route.ts"),
  ]);
  assert.match(schema, /staffInstructions: text\("staff_instructions"\)/);
  assert.match(schema, /staffMedia: jsonb\("staff_media"\)/);
  assert.match(migration, /ADD COLUMN "staff_instructions" text/);
  assert.match(migration, /ADD COLUMN "staff_media" jsonb DEFAULT '\[\]'::jsonb NOT NULL/);
  assert.match(admin, /Instrukcja przygotowania/);
  assert.match(admin, /name="staffInstructions"/);
  assert.match(admin, /name="staffMediaFiles"/);
  assert.match(admin, /product\.staffMedia\?\.length \?\? 0\) >= 8/);
  assert.match(catalog, /staffManual:/);
  assert.match(catalog, /instructions: product\.staffInstructions/);
  assert.match(client, /function StaffManualDialog/);
  assert.match(client, /manualTaps\.current/);
  assert.match(client, /if \(count < 3\) return/);
  assert.match(client, /className="waiter-product-manual-hotspot"/);
  assert.match(client, /onPointerUp=\{\(\) => openProductManual\(product, Date\.now\(\)\)\}/);
  assert.match(client, /at - previous\.at <= 1100/);
  assert.match(css, /\.waiter-manual-backdrop/);
  assert.match(css, /\.waiter-manual-media img,\.waiter-manual-media video/);
  assert.match(uploadRoute, /isAdmin\(\)/);
  assert.match(uploadRoute, /MAX_MEDIA_ITEMS = 8/);
  assert.match(mediaRoute, /isAdmin\(\)/);
  assert.match(mediaRoute, /currentWaiter\(request\)/);
  assert.match(mediaRoute, /Content-Range/);
});

test("lets admins remove product images and optimizes oversized files", async () => {
  const [admin, imageRoute, imageImport, imageBackground] = await Promise.all([
    read("app/admin/admin-panel.tsx"),
    read("app/api/admin/products/[id]/image/route.ts"),
    read("lib/image-import.ts"),
    read("lib/image-background.ts"),
  ]);
  assert.match(admin, /async function removeProductImage\(\)/);
  assert.match(admin, /method: "DELETE"/);
  assert.match(admin, />Usuń zdjęcie<\/button>/);
  assert.match(imageRoute, /export async function DELETE/);
  assert.match(imageRoute, /imagePath: null, imageSourceUrl: null/);
  assert.match(imageRoute, /removeImageWhenUnused/);
  assert.match(imageImport, /optimizeProductImage\(prepared\.bytes\)/);
  assert.match(imageImport, /removeProductImageFile/);
  assert.match(imageBackground, /MAX_STORED_BYTES = 2_400_000/);
  assert.match(imageBackground, /maxSide: 1_600, quality: 86/);
  assert.match(imageBackground, /maxSide: 1_000, quality: 62/);
});

test("keeps waiter search responsive on the POS tablet", async () => {
  const [client, css] = await Promise.all([
    read("app/kelner/waiter-client.tsx"), read("app/kelner/waiter.css"),
  ]);
  assert.match(client, /const SEARCH_DELAY_MS = 350/);
  assert.match(client, /function WaiterSearch/);
  assert.match(client, /field\.addEventListener\("keydown", onKeyDown\)/);
  assert.match(client, /field\.addEventListener\("beforeinput", onBeforeInput\)/);
  assert.match(client, /event\.inputType !== "deleteContentBackward"/);
  assert.match(client, /field\.setRangeText\("", start === end \? start - 1 : start, end, "end"\)/);
  assert.match(client, />Wyczyść<\/button>/);
  assert.doesNotMatch(client, /type="search"/);
  assert.doesNotMatch(client, /value=\{value\} onChange=/);
  assert.match(client, /const RESULT_PAGE_SIZE = 36/);
  assert.match(client, /matchingProducts\.slice\(0, visibleLimit\)/);
  assert.match(client, /setSearchQuery\(value\);\s+setVisibleLimit\(RESULT_PAGE_SIZE\)/);
  assert.match(client, /setVisibleLimit\(\(current\) => current \+ RESULT_PAGE_SIZE\)/);
  assert.match(client, /loading="lazy" decoding="async"/);
  assert.doesNotMatch(client, /onChange=\{\(event\) => setQuery\(event\.target\.value\)\}/);
  assert.match(css, /content-visibility:auto/);
});

test("shows the guest tea-detail photos directly in the waiter tea list", async () => {
  const [guest, waiter] = await Promise.all([
    read("app/menu-client.tsx"), read("app/kelner/waiter-client.tsx"),
  ]);
  for (const image of [
    "english-breakfast.jpg", "ctc-assam.jpg", "earl-grey.jpg", "japanese-sencha.jpg",
    "tropical-green.jpg", "peppermint.jpg", "spiced-plum.jpg", "orange-passion-fruit.jpg",
    "peach-fruit.jpg", "strawberry-kiwi.jpg", "paris.jpg", "hot-cinnamon-spice.jpg",
    "jasmine.jpg", "mango-fruit.jpg", "rooibos-chai.jpg",
  ]) {
    assert.match(guest, new RegExp(`/tea/${image.replaceAll(".", "\\.")}`));
    assert.match(waiter, new RegExp(`/tea/${image.replaceAll(".", "\\.")}`));
  }
  assert.match(waiter, /if \(product\.kind !== "tea"\) return product\.image/);
  assert.match(waiter, /const image = waiterProductImage\(product\)/);
});

test("records an auditable cash day with opening, handover, closing, and live POS checkpoints", async () => {
  const [schema, calculations, waiterRoute, adminRoute, form, admin, snapshot, waiterClient, tipsRoute] = await Promise.all([
    read("db/schema.ts"), read("lib/waiter-settlement.ts"), read("app/api/waiter/settlements/route.ts"),
    read("app/api/admin/waiter/settlements/route.ts"), read("app/kelner/settlement-form.tsx"), read("app/admin/settlements/settlements-admin-client.tsx"),
    read("lib/dotykacka/cash-snapshot.ts"), read("app/kelner/waiter-client.tsx"), read("app/api/waiter/tips/route.ts"),
  ]);
  assert.match(schema, /waiterCashDays = pgTable\("waiter_cash_days"/);
  assert.match(schema, /waiterSettlements = pgTable\("waiter_settlements"/);
  assert.match(schema, /waiterTipAllocations = pgTable\("waiter_tip_allocations"/);
  assert.match(schema, /waiterSettlementEvents = pgTable\("waiter_settlement_events"/);
  assert.match(calculations, /openingCash \+ input\.posCash \+ cardToCash - cashToCard \+ cashTips - expensesTotal/);
  assert.match(calculations, /input\.posCard - cardToCash \+ cashToCard \+ cardTips/);
  assert.match(waiterRoute, /splitDifference !== 0/);
  assert.match(waiterRoute, /action === "CLOSE" && !envelopeNumber/);
  assert.match(waiterRoute, /wydrukiem z kasy fiskalnej i terminala jest obowiązkowa także przy 0 zł/);
  assert.match(waiterRoute, /Każdy napiwek musi mieć prawidłowy sposób płatności i pełny podział kwoty/);
  assert.match(waiterRoute, /\["OPEN", "HANDOVER", "CLOSE"\]/);
  assert.match(waiterRoute, /fetchCashSnapshot\(businessDate\)/);
  assert.match(waiterRoute, /for update/);
  assert.match(waiterRoute, /openedByDotykackaId: employee\.dotykackaId/);
  assert.match(waiterRoute, /closedByDotykackaId: employee\.dotykackaId/);
  assert.match(snapshot, /salesReport\(periodFrom, capturedAt\)/);
  assert.match(adminRoute, /MARK_TIPS_PAID/);
  assert.match(adminRoute, /waiterCashDays/);
  assert.match(adminRoute, /settlementStatus !== "VERIFIED"/);
  assert.match(adminRoute, /NEEDS_CORRECTION/);
  assert.match(adminRoute, /latestCheckpointIds\.has\(item\.id\)/);
  assert.match(form, /Numer bezpiecznej koperty/);
  assert.match(form, /wydruk z kasy fiskalnej i wydruk z terminala/);
  assert.match(form, /Boolean\(envelopeNumber\.trim\(\)\)/);
  assert.match(form, /Przekazanie zmiany/);
  assert.match(form, /Tożsamość potwierdzona PIN-em/);
  assert.match(form, /snapshotCashCents: workflow\?\.snapshot\?\.cash/);
  assert.match(form, /2 \* 60 \* 1000/);
  assert.match(waiterRoute, /W Dotykačce pojawiła się nowa sprzedaż/);
  assert.match(waiterRoute, /openingCash: baselineCash, posCash: posDelta\.cash, posCard: posDelta\.card/);
  assert.match(waiterRoute, /const totals = \{ \.\.\.intervalTotals, terminalDifference: 0 \}/);
  assert.doesNotMatch(waiterRoute, /fullDayTotals/);
  assert.match(waiterRoute, /carryoverDeclaredByDotykackaId: previousClose\[0\]\?\.closedByDotykackaId/);
  assert.match(form, /Pełna kwota w kasie teraz/);
  assert.match(form, /Ostatnio policzona gotówka/);
  assert.match(form, /Dotykačka · gotówka od ostatniego przeliczenia/);
  assert.match(form, /Dotykačka · karta od ostatniego przeliczenia/);
  assert.match(form, /Napiwki gotówkowe/);
  assert.match(form, /Wydatki z kasy/);
  assert.match(form, /Etap 1/);
  assert.match(form, /Etap 2/);
  assert.match(form, /Etap 3/);
  assert.ok(form.indexOf("<h2>Napiwki</h2>") < form.indexOf("<span>KROK 1</span>"));
  assert.match(admin, /Dni kasowe/);
  assert.match(admin, /Napiwki według pracownika/);
  assert.match(admin, /Stan oczekiwany teraz/);
  assert.match(admin, /Migawka Dotykački/);
  assert.match(admin, /Pobierz CSV/);
  assert.match(waiterClient, /Zatwierdzone napiwki do wypłaty/);
  assert.match(waiterClient, /fetch\("\/api\/waiter\/tips"/);
  assert.match(tipsRoute, /payoutStatus, "DUE"/);
  assert.match(tipsRoute, /waiterSettlements\.status, "VERIFIED"/);
});

test("keeps each cash checkpoint on the last physical count instead of recounting earlier sales", () => {
  const opening = 10_000;
  // Sales already present when the drawer is opened belong to the POS snapshot,
  // not to the next employee checkpoint.
  const openingSnapshot = { cash: 5_000, card: 2_000 };

  const firstSnapshot = { cash: 10_000, card: 4_000 };
  const firstDelta = snapshotDelta(firstSnapshot, openingSnapshot);
  const handover = settlementTotals({
    openingCash: opening,
    posCash: firstDelta.cash,
    posCard: firstDelta.card,
    terminalCard: firstDelta.card,
    countedCash: 14_900,
    cashLeft: 14_900,
    envelopeCash: 0,
    corrections: [], expenses: [], tips: [],
  });
  assert.equal(firstDelta.cash, 5_000);
  assert.equal(handover.expectedCash, 15_000);
  assert.equal(handover.cashDifference, -100);

  const secondSnapshot = { cash: 12_000, card: 5_000 };
  const secondDelta = snapshotDelta(secondSnapshot, firstSnapshot);
  const closing = settlementTotals({
    openingCash: 14_900,
    posCash: secondDelta.cash,
    posCard: secondDelta.card,
    terminalCard: secondDelta.card,
    countedCash: 16_900,
    cashLeft: 10_000,
    envelopeCash: 6_900,
    corrections: [], expenses: [], tips: [],
  });
  assert.equal(secondDelta.cash, 2_000);
  assert.equal(closing.expectedCash, 16_900);
  assert.equal(closing.cashDifference, 0);
  assert.equal(closing.splitDifference, 0);
});

test("handles no sales, opening discrepancy, and multiple handovers exactly in cents", () => {
  const declaredCarryover = 10_000;
  const physicallyOpened = 9_999;
  assert.equal(physicallyOpened - declaredCarryover, -1);

  const noSale = settlementTotals({
    openingCash: physicallyOpened, posCash: 0, posCard: 0, terminalCard: 0,
    countedCash: physicallyOpened, cashLeft: physicallyOpened, envelopeCash: 0,
    corrections: [], expenses: [], tips: [],
  });
  assert.equal(noSale.expectedCash, 9_999);
  assert.equal(noSale.cashDifference, 0);

  let baseline = physicallyOpened;
  let previousSnapshot = { cash: 0, card: 0 };
  for (const [cash, card, counted] of [[101, 50, 10_100], [303, 75, 10_302], [404, 100, 10_403]]) {
    const currentSnapshot = { cash, card };
    const delta = snapshotDelta(currentSnapshot, previousSnapshot);
    const checkpoint = settlementTotals({
      openingCash: baseline, posCash: delta.cash, posCard: delta.card, terminalCard: delta.card,
      countedCash: counted, cashLeft: counted, envelopeCash: 0,
      corrections: [], expenses: [], tips: [],
    });
    assert.equal(checkpoint.expectedCash, counted);
    assert.equal(checkpoint.cashDifference, 0);
    baseline = counted;
    previousSnapshot = currentSnapshot;
  }
});

test("maps Dotykacka cash and card methods and computes checkpoint increments", () => {
  const totals = reportPaymentTotals({ revenue: { paymentTypeInfo: [
    { typeId: 900000001, count: 4, total: 123.45, currency: "PLN" },
    { typeId: 900000002, count: 2, total: 80, currency: "PLN" },
    { typeId: 900000099, count: 1, total: 10, currency: "PLN" },
  ] } });
  assert.equal(totals.cash, 12_345);
  assert.equal(totals.card, 8_000);
  assert.deepEqual(snapshotDelta({ cash: 20_100, card: 11_000 }, { cash: 12_345, card: 8_000 }), { cash: 7_755, card: 3_000 });
});

test("calculates a mixed cash, card, correction, expense, envelope, and tip settlement in cents", () => {
  assert.equal(moneyToCents("1 234,56"), 123456);
  assert.equal(moneyToCents("12.345"), null);
  assert.equal(moneyToCents("-1"), null);

  const totals = settlementTotals({
    openingCash: 10_000,
    posCash: 50_000,
    posCard: 80_000,
    terminalCard: 78_500,
    countedCash: 60_500,
    cashLeft: 10_000,
    envelopeCash: 50_500,
    corrections: [
      { direction: "CARD_TO_CASH", amount: 5_000 },
      { direction: "CASH_TO_CARD", amount: 2_500 },
    ],
    expenses: [{ amount: 4_000 }],
    tips: [
      { paymentMethod: "CASH", amount: 2_000 },
      { paymentMethod: "CARD", amount: 1_000 },
    ],
  });

  assert.deepEqual(totals, {
    cardToCash: 5_000,
    cashToCard: 2_500,
    expensesTotal: 4_000,
    cashTips: 2_000,
    cardTips: 1_000,
    tipsTotal: 3_000,
    expectedCash: 60_500,
    expectedTerminal: 78_500,
    cashDifference: 0,
    terminalDifference: 0,
    splitDifference: 0,
  });
});
