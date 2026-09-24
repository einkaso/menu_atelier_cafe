import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { reportPaymentTotals, snapshotDelta } from "../lib/cash-day.ts";
import { cleanInventoryLocation, inventoryDifference, millisToQuantity, nonNegativeWholeNumber, quantityToMillis, selectInventoryProducts, wineBottleQuantityMillis } from "../lib/inventory.ts";
import { moneyToCents, settlementTotals } from "../lib/waiter-settlement.ts";
import { isAlcoholTakeawayRestrictionTime, isWholeVodkaBottleName, shouldShowAlcoholSaleWarning } from "../lib/alcohol-sale-warning.ts";
import { menuProductVisibleForGuest } from "../lib/menu-visibility.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("opens the hidden waiter login only after three logo taps", async () => {
  const [source, waiter, layout, loginStyles] = await Promise.all([
    read("app/menu-client.tsx"),
    read("app/kelner/waiter-client.tsx"),
    read("app/kelner/layout.tsx"),
    read("app/kelner/login-redesign.css"),
  ]);
  assert.match(source, /logoTaps>=2/);
  assert.match(source, /window\.location\.assign\("\/kelner"\)/);
  assert.match(source, /onClick=\{tapLogo\}/);
  assert.match(waiter, /waiter-login-shell" role="dialog" aria-modal="true"[\s\S]*waiter-login-close[\s\S]*waiter-login-brand[\s\S]*logo-cafe\.png[\s\S]*STREFA PRACOWNIKA[\s\S]*Podaj swój PIN/);
  assert.match(waiter, /if \(loading\) return <main className="waiter-loading" aria-busy="true"[\s\S]*logo-cafe\.png[\s\S]*Przygotowuję strefę pracownika/);
  assert.doesNotMatch(waiter, /STREFA KELNERA/);
  assert.match(waiter, /matchLoginLogoBackground[\s\S]*--waiter-login-brand-bg/);
  assert.match(layout, /login-redesign\.css/);
  assert.match(layout, /Strefa pracownika — Atelier Café/);
  assert.match(loginStyles, /\.waiter-login > \.waiter-login-shell \{[\s\S]*width: min\(680px,[\s\S]*max-height: calc\(100dvh - 48px\);[\s\S]*min-height: 0/);
  assert.match(loginStyles, /\.waiter-login \.waiter-login-close \{/);
  assert.match(loginStyles, /\.waiter-loading \{[\s\S]*min-height: 100dvh;[\s\S]*place-items: center;[\s\S]*background: #050505;/);
});

test("merges cakes and desserts into one NA SŁODKO waiter category", async () => {
  const catalog = await read("app/api/waiter/catalog/route.ts");
  assert.match(catalog, /category: waiterCategoryName\(product\.category\)/);
});

test("warns about whole-bottle alcohol sales during the Warsaw restriction window", async () => {
  assert.equal(isAlcoholTakeawayRestrictionTime(new Date("2026-09-19T19:57:00Z")), false);
  assert.equal(isAlcoholTakeawayRestrictionTime(new Date("2026-09-19T19:58:00Z")), true);
  assert.equal(isAlcoholTakeawayRestrictionTime(new Date("2026-09-20T04:02:00Z")), true);
  assert.equal(isAlcoholTakeawayRestrictionTime(new Date("2026-09-20T04:03:00Z")), false);
  assert.equal(isWholeVodkaBottleName("WÓDKA Absolut 40% 0,7l"), true);
  assert.equal(isWholeVodkaBottleName("WÓDKA Absolut 40% 50ml"), false);
  const restrictedTime = new Date("2026-09-19T20:30:00Z");
  assert.equal(shouldShowAlcoholSaleWarning({ name: "Wino", kind: "wine", serving: "bottle", alcoholFree: false }, restrictedTime), true);
  assert.equal(shouldShowAlcoholSaleWarning({ name: "Piwo 0%", kind: "beer", serving: "bottle", alcoholFree: true }, restrictedTime), false);
  assert.equal(shouldShowAlcoholSaleWarning({ name: "Wino na kieliszki", kind: "wine", serving: "glass", alcoholFree: false }, restrictedTime), false);
  const [client, catalog, css] = await Promise.all([read("app/kelner/waiter-client.tsx"), read("app/api/waiter/catalog/route.ts"), read("app/kelner/waiter.css")]);
  assert.match(catalog, /kind === "cocktails" && isWholeVodkaBottleName\(product\.name\) \? "bottle"/);
  assert.match(client, /shouldShowAlcoholSaleWarning\(product\)/);
  assert.match(client, /role="alertdialog"/);
  assert.match(client, /OK - rozumiem/);
  assert.match(css, /\.waiter-prohibition-backdrop/);
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

test("limits waiter menu visibility changes to individually authorized and audited employees", async () => {
  assert.equal(menuProductVisibleForGuest(true, false, null), true);
  assert.equal(menuProductVisibleForGuest(false, false, null), false);
  assert.equal(menuProductVisibleForGuest(true, false, false), false);
  assert.equal(menuProductVisibleForGuest(false, false, true), true);
  assert.equal(menuProductVisibleForGuest(false, true, true), false);

  const [schema, migration, endpoint, permission, adminScreen, waiterScreen, historyApi, docs] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0034_waiter_menu_visibility.sql"),
    read("app/api/waiter/menu-visibility/route.ts"),
    read("app/api/admin/waiter/employees/[dotykackaId]/visibility/route.ts"),
    read("app/admin/waiters/waiter-admin-client.tsx"),
    read("app/kelner/waiter-client.tsx"),
    read("app/api/admin/menu-visibility/route.ts"),
    read("docs/MENU_CONFIGURATION.md"),
  ]);
  assert.match(schema, /canManageMenuVisibility: boolean\("can_manage_menu_visibility"\)\.notNull\(\)\.default\(false\)/);
  assert.match(schema, /menuVisibilityEvents = pgTable\("menu_visibility_events"/);
  assert.match(migration, /"can_manage_menu_visibility" boolean DEFAULT false NOT NULL/);
  assert.match(endpoint, /if \(!employee\.canManageMenuVisibility\)/);
  assert.match(endpoint, /MENU_VISIBILITY_REASONS\.includes/);
  assert.match(endpoint, /Produkt został ukryty przez administratora/);
  assert.match(endpoint, /tx\.insert\(menuVisibilityEvents\)/);
  assert.match(permission, /typeof body\.enabled !== "boolean"/);
  assert.match(adminScreen, /Uprawnienie jest domyślnie wyłączone/);
  assert.match(waiterScreen, /Pokaż ukryte/);
  assert.match(waiterScreen, /Operacja zostanie zapisana w historii administratora/);
  assert.match(historyApi, /limit\(500\)/);
  assert.match(docs, /Każda zmiana wymaga wyboru przyczyny/);
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
  assert.match(orders, /action: "order\/list"/);
  assert.match(orders, /action: "order\/add-item"/);
  assert.match(orders, /action: "order\/create"/);
  assert.match(orders, /pg_advisory_xact_lock/);
  assert.match(orders, /openOrderIds\.length > 1/);
  assert.match(orders, /"idempotency-key": externalId/);
  assert.match(orders, /client\.posAction/);
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
  assert.match(sync, /const inventoryTracked = isIngredientInventoryCategory\(categoryName\)[\s\S]*inventorySettingsByProduct\.get\(String\(product\.id\)\)\?\.inventoryTracked === true/);
  assert.match(sync, /ingredientCategory \? inventoryTaggedIngredient : previousSettings\?\.inventoryTracked/);
  assert.match(adminRoute, /Dla kategorii Składniki wybór jest sterowany tagiem INWENT/);
  assert.match(sync, /const menuTagged = shouldSyncMenuProduct\(product\.tags \?\? \[\], config\.menuTag\)/);
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
  assert.match(panel, /useState<VisibilityFilter>\(""\)/);
  assert.match(panel, /Wybierz widoczność/);
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
  const [client, catalog, orders, coffeeRules, css] = await Promise.all([
    read("app/kelner/waiter-client.tsx"), read("app/api/waiter/catalog/route.ts"), read("app/api/waiter/orders/route.ts"), read("lib/coffee-addons.ts"), read("app/kelner/waiter.css"),
  ]);
  assert.match(client, /customizations\.map\(\(addon\) => addon\.id\)\.sort\(\)\.join/);
  assert.match(client, /Object\.values\(addonSelections\)\.flat\(\)/);
  assert.match(client, /group\.multiple \? \(previous\.includes\(addon\.id\)/);
  assert.match(client, /możesz wybrać kilka/);
  assert.match(catalog, /multiple: isCoffeeAddonGroup\(groupName\)/);
  assert.match(orders, /Wybierz ziarno do kawy alternatywnej/);
  assert.match(orders, /selectedGroups\.filter\(\(group\) => !isCoffeeAddonGroup\(group\)\)/);
  assert.match(orders, /W tej grupie można wybrać tylko jeden wariant/);
  assert.match(coffeeRules, /function isAlternativeCoffeeMethod/);
  assert.match(catalog, /sharedBeanOptions/);
  assert.match(catalog, /sharedCoffeeAddons/);
  assert.match(catalog, /addonGroups: addonGroupsFor\(product\)/);
  assert.match(client, /className="waiter-alternative-coffee"/);
  assert.match(client, /KROK 2 · ZIARNO I DODATKI/);
  assert.match(css, /\.waiter-alternative-coffee>div\{display:grid;grid-template-columns:repeat\(3/);
  assert.match(orders, /fallback: "bean"/);
  assert.match(orders, /standaloneAddons/);
  assert.match(orders, /const posItems = normalizedItems\.flatMap/);
});

test("supports WARM and COLD serving choices throughout waiter ordering", async () => {
  const [catalog, client, orders, admin, css] = await Promise.all([
    read("app/api/waiter/catalog/route.ts"), read("app/kelner/waiter-client.tsx"), read("app/api/waiter/orders/route.ts"), read("app/admin/admin-panel.tsx"), read("app/kelner/waiter.css"),
  ]);
  assert.match(catalog, /temperatures: productTemperatures\(product\.tags\)/);
  assert.match(client, /function WaiterTemperatureChoice/);
  assert.match(client, /temperature: item\.temperature/);
  assert.match(client, /configuring\.temperatures\.length>1/);
  assert.match(client, /<legend>Sposób przygotowania<small>wymagany wybór<\/small><\/legend>/);
  assert.match(client, /M10 5a2 2 0 0 1 4 0v8\.4a4 4 0 1 1-4 0V5/);
  assert.match(orders, /productTemperatures\(tags\)/);
  assert.match(orders, /Sposób przygotowania:/);
  assert.match(admin, /tag: "WARM"/);
  assert.match(admin, /tag: "COLD"/);
  assert.match(admin, /CIEPŁO · WARM COLD · CIEPŁO ZIMNO/);
  assert.match(admin, /ZIMNO · WARM COLD · CIEPŁO ZIMNO/);
  assert.match(admin, /kategoriach ALKOHOLE i DRINKI/);
  assert.match(css, /\.waiter-temperature-choice/);
  assert.match(css, /\.waiter-temperature-fieldset button\.is-selected/);
});

test("uses the blue mug only as a fallback icon without advertising it", async () => {
  const [client, css] = await Promise.all([
    read("app/kelner/waiter-client.tsx"), read("app/kelner/waiter.css"),
  ]);
  assert.match(client, /\/coffee-methods\/churchill-sapphire-mug\.webp/);
  assert.doesNotMatch(client, /Podajemy w kubku Churchill|waiter-alternative-serving-cup/);
  assert.doesNotMatch(css, /\.waiter-alternative-serving-cup\{/);
});

test("keeps TOGO optional, defaults to dine-in, and sends takeaway as an order note", async () => {
  const [guestApi, guestClient, catalog, client, orders, admin, css] = await Promise.all([
    read("app/api/menu/route.ts"), read("app/menu-client.tsx"), read("app/api/waiter/catalog/route.ts"), read("app/kelner/waiter-client.tsx"), read("app/api/waiter/orders/route.ts"), read("app/admin/admin-panel.tsx"), read("app/kelner/waiter.css"),
  ]);
  assert.doesNotMatch(guestApi, /productTakeawayAvailable/);
  assert.doesNotMatch(guestClient, /TakeawayIcon|TakeawayChoice/);
  assert.match(catalog, /takeaway: productTakeawayAvailable\(product\.tags\)/);
  assert.match(client, /function addProduct\(product: Product, fulfillment: FulfillmentChoice = "dine-in"\)/);
  assert.match(client, />Zapakuj na wynos<\/button>/);
  assert.doesNotMatch(client, /function TakeawayIcon/);
  assert.match(client, /takeaway: item\.takeaway/);
  assert.match(orders, /Sposób wydania: na wynos/);
  assert.match(admin, /tag: "TOGO"/);
  assert.match(css, /\.waiter-takeaway-action/);
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
  assert.match(source, /Ostatnia aktualizacja zasad: 20 września 2026/);
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
  assert.match(client, /category === OUTSIDE_MENU[\s\S]*\? product\.outsideMenu/);
  assert.match(client, /!product\.outsideMenu && product\.hiddenFromGuest === showHiddenMenuItems/);
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
  assert.match(client, /function CakePartnerIntro/);
  assert.match(client, /function CakePartnerDialog/);
  assert.match(client, /Poznaj legendę ciast Capuccino Cafe/);
  assert.match(client, /Rodzinna firma z historią sięgającą 2006 roku/);
  assert.match(client, /Od 2015 roku tworzy we własnej pracowni torty i słodkości/);
  assert.doesNotMatch(client, /href="https:\/\/capuccinocafe\.pl\/o-nas\/"/);
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
  assert.match(catalog, /inferredAlcoBarAttributes\(product\.name, product\.descriptionPl \|\| product\.sourceDescription, product\.category\)/);
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
  assert.match(client, /\["wine", "beer", "whisky", "cocktails"\]/);
  assert.match(client, /waiterAlcoTokens\(product, "cocktailType"\)/);
  assert.match(client, /group\("Baza", "alcoBase"/);
  assert.match(client, /group\("Profil smaku", "alcoTaste"/);
  assert.match(client, /group\("Podanie", "alcoServing"/);
  assert.match(client, /servingLabel\(product\)/);
  assert.match(css, /\.waiter-drink-filters/);
  assert.match(css, /\.waiter-filter-chips button\.is-selected/);
});

test("keeps a staff-only preparation manual behind three product-photo taps", async () => {
  const [schema, migration, admin, adminCss, catalog, client, css, uploadRoute, mediaRoute, mediaStorage, storageSetup] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0032_overjoyed_newton_destine.sql"),
    read("app/admin/admin-panel.tsx"),
    read("app/admin/admin.css"),
    read("app/api/waiter/catalog/route.ts"),
    read("app/kelner/waiter-client.tsx"),
    read("app/kelner/waiter.css"),
    read("app/api/admin/products/[id]/staff-media/route.ts"),
    read("app/api/staff-manual-media/[filename]/route.ts"),
    read("lib/staff-manual-media.ts"),
    read("ops/prepare-persistent-storage.sh"),
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
  assert.match(catalog, /staffManualMediaAuthorizedPath\(media\.path\)/);
  assert.match(client, /function StaffManualDialog/);
  assert.match(client, /className="waiter-manual-close-icon"/);
  assert.match(client, /manualTaps\.current/);
  assert.match(client, /if \(count < 3\) return/);
  assert.match(client, /className="waiter-product-manual-hotspot"/);
  assert.match(client, /onPointerUp=\{\(\) => openProductManual\(product, Date\.now\(\)\)\}/);
  assert.match(client, /at - previous\.at <= 1100/);
  assert.match(css, /\.waiter-manual-backdrop/);
  assert.match(css, /\.waiter-manual-close-icon\{display:block;width:19px;height:19px/);
  assert.match(css, /\.waiter-manual-media img,\.waiter-manual-media video/);
  assert.match(css, /\.waiter-manual-media img,\.waiter-manual-media video\{[^}]*height:100%;[^}]*object-fit:contain;object-position:center/);
  assert.match(adminCss, /\.admin-staff-media-gallery img,\.admin-staff-media-gallery video\{[^}]*height:100%;[^}]*object-fit:contain;object-position:center/);
  assert.match(uploadRoute, /isAdmin\(\)/);
  assert.match(uploadRoute, /MAX_MEDIA_ITEMS = 8/);
  assert.match(mediaRoute, /isAdmin\(\)/);
  assert.match(mediaRoute, /currentWaiter\(request\)/);
  assert.match(mediaRoute, /validStaffManualMediaAccess/);
  assert.match(mediaRoute, /Content-Range/);
  assert.match(mediaStorage, /createHmac\("sha256", mediaAccessSecret\(\)\)/);
  assert.match(mediaStorage, /MEDIA_ACCESS_SECONDS = 18 \* 60 \* 60/);
  assert.match(mediaStorage, /optimizeProductImage\(await prepareUploadedImage\(bytes\)\)/);
  assert.match(mediaStorage, /MAX_IMAGE_BYTES = 50 \* 1024 \* 1024/);
  assert.match(mediaStorage, /MAX_VIDEO_SOURCE_BYTES = 95 \* 1024 \* 1024/);
  assert.match(mediaStorage, /spawn\("ffmpeg"/);
  assert.match(mediaStorage, /"-c:v", "libx264"/);
  assert.match(admin, /video\/quicktime/);
  assert.match(admin, /\.mov/);
  assert.match(storageSetup, /uploads\/staff-manuals/);
  assert.match(storageSetup, /-o menuapp -g menuapp/);
});

test("lets admins remove product images, preserves them while saving new data, and optimizes oversized files", async () => {
  const [admin, imageRoute, contentRoute, sourceRoute, imageImport, imageBackground, uploadedImage] = await Promise.all([
    read("app/admin/admin-panel.tsx"),
    read("app/api/admin/products/[id]/image/route.ts"),
    read("app/api/admin/products/[id]/route.ts"),
    read("app/api/admin/products/[id]/wine-sources/route.ts"),
    read("lib/image-import.ts"),
    read("lib/image-background.ts"),
    read("lib/uploaded-image.ts"),
  ]);
  assert.match(admin, /async function removeProductImage\(\)/);
  assert.match(admin, /method: "DELETE"/);
  assert.match(admin, />Usuń zdjęcie<\/button>/);
  assert.match(imageRoute, /export async function DELETE/);
  assert.match(imageRoute, /imagePath: null, imageSourceUrl: null/);
  assert.match(imageRoute, /removeImageWhenUnused/);
  assert.match(imageRoute, /Produkt ma już zapisane zdjęcie/);
  assert.match(imageRoute, /status: 409/);
  assert.match(contentRoute, /const imageSourceUrl = product\.imageSourceUrl/);
  assert.match(contentRoute, /const imagePath = product\.imagePath/);
  assert.doesNotMatch(contentRoute, /imageSourceUrl: values\.imageSourceUrl/);
  assert.match(sourceRoute, /const hasCurrentImage = Boolean\(current\?\.imagePath \|\| current\?\.imageSourceUrl\)/);
  assert.match(sourceRoute, /hasCurrentImage \? current\?\.imageSourceUrl \?\? null/);
  assert.match(admin, /obecne zdjęcie pozostanie bez zmian/);
  assert.match(imageImport, /optimizeProductImage\(prepared\.bytes/);
  assert.match(imageImport, /MAX_UPLOAD_BYTES = 50 \* 1024 \* 1024/);
  assert.match(admin, /MAX_LOCAL_IMAGE_BYTES = 50 \* 1024 \* 1024/);
  assert.match(admin, /return source;/);
  assert.match(admin, /image\/heic/);
  assert.match(imageImport, /removeProductImageFile/);
  assert.match(imageImport, /prepareUploadedImage\(bytes\)/);
  assert.match(uploadedImage, /await import\("heic-decode"\)/);
  assert.match(uploadedImage, /HEIC_BRANDS/);
  assert.match(uploadedImage, /webp\(\{ quality: 86/);
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
  assert.match(waiter, /const image = alternative \? waiterAlternativeCoffeeImage\(product\) : waiterProductImage\(product\)/);
});

test("records an auditable cash day with opening, handover, closing, and live POS checkpoints", async () => {
  const [schema, calculations, waiterRoute, adminRoute, form, admin, snapshot, waiterClient, tipsRoute] = await Promise.all([
    read("db/schema.ts"), read("lib/waiter-settlement.ts"), read("app/api/waiter/settlements/route.ts"),
    read("app/api/admin/waiter/settlements/route.ts"), read("app/kelner/settlement-form.tsx"), read("app/admin/settlements/settlements-admin-client.tsx"),
    read("lib/dotykacka/cash-snapshot.ts"), read("app/kelner/waiter-client.tsx"), read("app/api/waiter/tips/route.ts"),
  ]);
  assert.match(schema, /waiterCashDays = pgTable\("waiter_cash_days"/);
  assert.match(schema, /waiterSettlements = pgTable\("waiter_settlements"/);
  assert.match(schema, /waiterCashExpenses = pgTable\("waiter_cash_expenses"/);
  assert.match(schema, /waiterTipAllocations = pgTable\("waiter_tip_allocations"/);
  assert.match(schema, /waiterTipAdjustments = pgTable\("waiter_tip_adjustments"/);
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
  assert.match(adminRoute, /ADD_TIP_ADJUSTMENT/);
  assert.match(adminRoute, /VOID_TIP_ADJUSTMENT/);
  assert.match(adminRoute, /Wypłaconego wpisu nie można wycofać/);
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
  assert.match(form, /typeof browserCrypto\?\.randomUUID === "function"/);
  assert.match(form, /return `settlement-\$\{Date\.now\(\)\.toString\(36\)\}-\$\{fallbackKeyCounter\.toString\(36\)\}`/);
  assert.match(form, /type="button" className="cash-tip-add"/);
  assert.match(form, /<h3>Korekty płatności<\/h3>[^]*<button type="button" onClick=\{\(\) => setCorrections/);
  assert.match(form, /<h3>Wydatki z gotówki<\/h3>[^]*<button type="button" onClick=\{\(\) => setExpenses/);
  assert.match(form, /action: "SAVE_EXPENSE"/);
  assert.match(form, /action: "DELETE_EXPENSE"/);
  assert.match(form, /Zapisz wydatek/);
  assert.match(form, /item\.saved \? "✓ Zapisano w kasie" : "Niezapisany"/);
  assert.match(form, /expenses\.filter\(\(item\) => item\.saved\)/);
  assert.match(waiterRoute, /\["SAVE_EXPENSE", "DELETE_EXPENSE"\]/);
  assert.match(waiterRoute, /pendingExpenseRows/);
  assert.match(waiterRoute, /status: "SETTLED"/);
  assert.match(form, /Etap 1/);
  assert.match(form, /Etap 2/);
  assert.match(form, /Etap 3/);
  assert.ok(form.indexOf("<h2>Napiwki</h2>") < form.indexOf("<span>KROK 1</span>"));
  assert.match(admin, /Dni kasowe/);
  assert.match(admin, /Napiwki według pracownika/);
  assert.match(admin, /Ręczne wpisy napiwków/);
  assert.match(admin, /Dopisz napiwek/);
  assert.match(admin, /Odejmij \/ skoryguj/);
  assert.match(admin, /Stan oczekiwany teraz/);
  assert.match(admin, /Migawka Dotykački/);
  assert.match(admin, /Pobierz CSV/);
  assert.match(waiterClient, /Zatwierdzone napiwki do wypłaty/);
  assert.match(waiterClient, /fetch\("\/api\/waiter\/tips"/);
  assert.match(tipsRoute, /payoutStatus, "DUE"/);
  assert.match(tipsRoute, /waiterSettlements\.status, "VERIFIED"/);
  assert.match(tipsRoute, /waiterTipAdjustments\.payoutStatus, "DUE"/);
  assert.match(tipsRoute, /Math\.max\(0, total\)/);
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

test("keeps the waiter header on one continuous dark bar with ordered controls", async () => {
  const [client, styles, settlement, cashStyles, catalog] = await Promise.all([
    read("app/kelner/waiter-client.tsx"),
    read("app/kelner/unified-header.css"),
    read("app/kelner/settlement-form.tsx"),
    read("app/kelner/cash-day.css"),
    read("app/api/waiter/catalog/route.ts"),
  ]);
  const brand = client.indexOf("waiter-main-brand");
  const tools = client.indexOf("waiter-main-tools");
  const employee = client.indexOf("waiter-employee-summary");
  const controls = client.indexOf("waiter-main-controls", brand);
  assert.ok(brand >= 0 && brand < employee && employee < controls && controls < tools);
  assert.match(client.slice(brand, employee), /PANEL PRACOWNIKA/);
  assert.match(client.slice(brand, employee), /waiter-main-logo[\s\S]*logo-cafe\.png[\s\S]*waiter-main-title/);
  assert.match(client.slice(tools, tools + 700), /WaiterInstructionEntry[\s\S]*Grafik[\s\S]*ReservationReminder[\s\S]*Inwentaryzacja[\s\S]*Rozliczanie/);
  assert.match(client, /<\/header><nav className="waiter-main-tools waiter-ordering-tools"/);
  assert.match(client.slice(controls, controls + 700), /waiter-guest-receipt-entry[\s\S]*Rachunek dla gościa[\s\S]*waiter-main-exit-controls[\s\S]*← Menu[\s\S]*Wyloguj/);
  assert.match(client, /waiter-ordering-app[\s\S]*waiter-table-focus[\s\S]*activeTableNumber[\s\S]*aria-label="Wybierz stolik"/);
  assert.match(client, /<select required value=\{tableId\}[\s\S]*<option value="" disabled>Wybierz stolik<\/option>/);
  assert.match(client, /setTableId\(""\); setLoading\(false\);/);
  assert.doesNotMatch(client, /body\.tables\?\.\[0\]\?\.dotykackaId/);
  assert.match(client, /waiter-context"><label className="waiter-guest-count">Liczba gości[\s\S]*<WaiterSearch/);
  assert.match(client, /waiter-search-icon/);
  assert.match(catalog, /case when trim\(\$\{waiterTables\.name\}\) ~ '\^\[0-9\]\+\$' then trim\(\$\{waiterTables\.name\}\)::integer/);
  assert.doesNotMatch(client, /WaiterCurrentDate|waiter-main-calendar/);
  assert.match(settlement, /const POLAND_TIME_ZONE = "Europe\/Warsaw";[\s\S]*function CurrentDateCalendar\(\)[\s\S]*window\.setInterval\(refresh, 60_000\)/);
  assert.match(settlement, /Codzienny system rozliczania utargu\.[\s\S]*<\/h1>[\s\S]*<CurrentDateCalendar \/>/);
  assert.match(settlement, /function SettlementHeader[\s\S]*logo-cafe\.png[\s\S]*Kasa główna[\s\S]*Rozliczanie[\s\S]*waiter-section-controls[\s\S]*← Menu[\s\S]*Wyloguj/);
  assert.equal((settlement.match(/<SettlementHeader /g) ?? []).length, 2);
  assert.match(cashStyles, /\.cash-current-date \{[\s\S]*width: 146px;[\s\S]*text-align: center;/);
  assert.match(styles, /\.waiter-main-header \{[\s\S]*display: grid !important;[\s\S]*background-color: #000 !important;[\s\S]*background-image: linear-gradient\(#000, #000\) !important;/);
  assert.match(styles, /grid-template-columns: auto minmax\(0, 1fr\) auto/);
  assert.match(styles, /\.waiter-main-header \.waiter-main-brand > \.waiter-main-logo \{[\s\S]*display: block !important;[\s\S]*width: 170px !important;[\s\S]*visibility: visible !important;/);
  assert.match(styles, /\.waiter-main-exit-controls \{[\s\S]*display: flex;[\s\S]*gap: 7px;/);
  assert.match(styles, /\.waiter-main-header \.waiter-main-controls > \.waiter-guest-receipt-entry \{[\s\S]*background: #d92d76 !important;/);
  assert.match(styles, /\.waiter-ordering-tools,[\s\S]*\.waiter-main-header \.waiter-main-controls \{[\s\S]*position: static !important;[\s\S]*padding: 0 !important;[\s\S]*box-shadow: none !important;/);
  assert.match(styles, /\.waiter-ordering-tools \{[\s\S]*min-height: 58px;[\s\S]*justify-content: center;[\s\S]*margin: 6px 0 0 !important;[\s\S]*padding: 6px clamp\(18px, 3vw, 42px\) 8px !important;[\s\S]*background: #f7f3ea !important;/);
  assert.match(styles, /\.waiter-main-tools > a,[\s\S]*\.waiter-main-tools > button \{[\s\S]*border: 1px solid rgba\(243, 146, 104, \.72\) !important;[\s\S]*background: #fff !important;[\s\S]*color: #082f3c !important;/);
  assert.match(styles, /\.waiter-ordering-tools::before,[\s\S]*\.waiter-main-header \.waiter-main-controls::after \{[\s\S]*display: none !important;[\s\S]*content: none !important;/);
  assert.match(styles, /\.waiter-main-tools \{[\s\S]*justify-content: center;/);
  const waiterCss = await read("app/kelner/waiter.css");
  assert.match(waiterCss, /\.waiter-ordering-app>\.waiter-context\{[^}]*border-top:4px solid #edf1ee/);
  assert.match(waiterCss, /\.waiter-ordering-app\{[^}]*grid-template-columns:clamp\(82px,7\.5vw,105px\)/);
  assert.match(waiterCss, /\.waiter-ordering-app>\.waiter-main-header\{[^}]*grid-column:1\/-1;grid-row:1/);
  assert.match(waiterCss, /\.waiter-ordering-app>\.waiter-ordering-tools\{[^}]*grid-column:1\/-1;grid-row:2/);
  assert.match(waiterCss, /\.waiter-ordering-app>\.waiter-table-focus\{[^}]*z-index:2;[^}]*grid-column:1;grid-row:3;[^}]*width:100%;height:auto;min-height:0;aspect-ratio:1;align-self:start/);
  assert.match(waiterCss, /\.waiter-ordering-app>\.waiter-context\{[^}]*grid-column:2;grid-row:3/);
  assert.match(waiterCss, /\.waiter-search>span>button\{[^}]*min-width:112px;min-height:48px;padding:0 18px/);
});

test("keeps staff section navigation on the same continuous dark bar", async () => {
  const styles = await read("app/kelner/unified-header.css");
  assert.match(styles, /\.waiter-section-header \.waiter-section-controls \{[\s\S]*position: static !important;[\s\S]*padding: 0 !important;[\s\S]*background: #000 !important;[\s\S]*box-shadow: none !important;/);
  assert.match(styles, /\.waiter-section-header \.waiter-section-controls::before,[\s\S]*\.waiter-section-header \.waiter-section-controls::after \{[\s\S]*display: none !important;[\s\S]*content: none !important;/);
});

test("lets the waiter reservations header span the viewport", async () => {
  const styles = await read("app/kelner/rezerwacje/reservations-full-width.css");
  assert.match(styles, /\.waiter-reservations \{[\s\S]*padding: 0 0 76px !important/);
  assert.match(styles, /> header\.waiter-section-header \{[\s\S]*width: 100%/);
  assert.match(styles, /\.waiter-reservation-hero \{[\s\S]*margin: 17px var\(--waiter-reservations-gutter\) !important/);
});
