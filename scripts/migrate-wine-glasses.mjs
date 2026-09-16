import { createDecipheriv, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const WRITE_ENABLED = process.env.DOTYKACKA_WINE_MIGRATION_WRITE_ENABLED === "true";
const ARCHIVE_SUFFIX = " — przed migracją";
const GLASS_TAG = "KIELISZEK";
const NATURAL_CODES = new Set(["WIN14", "WIN64", "WIN65"]);
const SPARKLING_CODES = new Set(["WIN02", "WIN19", "WIN44", "WIN46"]);
const EXPECTED_BASES = 52;
const BOTTLE_PRICE_OVERRIDES = new Map([
  ["wave bianco", 110],
  ["yellow tail sauvignon blanc", 110],
]);

function normalized(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pl")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function productCode(product) {
  const values = Array.isArray(product.plu) ? product.plu : product.plu ? [product.plu] : [];
  return [...values, product.name].join(" ").match(/\bWIN\d{2,3}\b/i)?.[0]?.toUpperCase() ?? null;
}

function isGlass(product) {
  return /(kieliszek|glass)/i.test(product.name) || (product.tags ?? []).some((tag) => normalized(tag) === "kieliszek");
}

function overrideBottlePrice(product) {
  const name = normalized(product.name);
  for (const [prefix, price] of BOTTLE_PRICE_OVERRIDES) if (name.startsWith(prefix)) return price;
  return Number(product.priceWithVat ?? 0);
}

function roundedGlassPrice(value, divisor) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number / divisor) : null;
}

function withoutVat(priceWithVat, vat) {
  const multiplier = Number(vat);
  return Number.isFinite(multiplier) && multiplier > 0 ? Number((priceWithVat / multiplier).toFixed(6)) : priceWithVat;
}

function glassName(base, sparkling) {
  return `${base.name} — kieliszek ${sparkling ? 125 : 150} ml`;
}

const productWritableFields = [
  "id", "_categoryId", "_defaultCourseId", "_eetSubjectId", "_supplierId", "allergens", "alternativeName",
  "currency", "deleted", "description", "discountPercent", "discountPermitted", "display", "ean", "externalId",
  "features", "flags", "hexColor", "imageUrl", "margin", "marginMin", "minCustomerAge", "name",
  "notes", "onSale", "packageItem", "packaging", "packagingMeasurement", "packagingPriceWithVat", "plu", "points",
  "preparationDuration", "priceInPoints", "priceWithVat", "priceWithVatB", "priceWithVatC", "priceWithVatD",
  "priceWithVatE", "priceWithoutVat", "recipe", "requiresPriceEntry", "sortOrder", "stockDeduct", "stockOverdraft",
  "subtitle", "supplierProductCode", "tags", "translatedDescription", "translatedName", "unit", "unitMeasurement", "vat",
];

function writableProduct(product, changes = {}, create = false) {
  const result = {};
  for (const key of productWritableFields) if (product[key] !== undefined) result[key] = product[key];
  Object.assign(result, changes);
  if (create) delete result.id;
  return result;
}

function bottleUpdate(base) {
  const price = overrideBottlePrice(base);
  const changedPrice = price !== Number(base.priceWithVat ?? 0);
  return writableProduct(base, {
    packaging: 1,
    priceWithVat: price,
    ...(changedPrice ? { priceWithoutVat: withoutVat(price, base.vat) } : {}),
    stockDeduct: true,
    unit: "Piece",
  });
}

function glassChanges(base, visible) {
  const code = productCode(base);
  const sparkling = SPARKLING_CODES.has(code);
  const divisor = sparkling ? 5 : 4;
  const bottlePrice = overrideBottlePrice(base);
  const priceWithVat = roundedGlassPrice(bottlePrice, divisor);
  const changes = {
    _categoryId: base._categoryId,
    allergens: base.allergens ?? [],
    currency: base.currency,
    deleted: false,
    description: base.description ?? null,
    display: visible,
    ean: Array.isArray(base.ean) ? base.ean : base.ean ? [base.ean] : [],
    features: base.features ?? [],
    name: glassName(base, sparkling),
    packaging: 1,
    plu: Array.isArray(base.plu) ? base.plu : base.plu ? [base.plu] : [],
    priceWithVat,
    priceWithoutVat: withoutVat(priceWithVat, base.vat),
    priceWithVatB: roundedGlassPrice(base.priceWithVatB, divisor),
    priceWithVatC: roundedGlassPrice(base.priceWithVatC, divisor),
    priceWithVatD: roundedGlassPrice(base.priceWithVatD, divisor),
    priceWithVatE: roundedGlassPrice(base.priceWithVatE, divisor),
    stockDeduct: false,
    tags: [...new Set([...(base.tags ?? []), GLASS_TAG])],
    translatedDescription: base.translatedDescription ?? null,
    translatedName: null,
    unit: "Piece",
  };
  return { changes, divisor, serving: sparkling ? 1 / 6 : 0.2, servingMl: sparkling ? 125 : 150 };
}

function decryptToken(value) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not configured");
  const parts = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (parts.length !== 3) throw new Error("Stored Dotykačka token is invalid");
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), parts[0]);
  decipher.setAuthTag(parts[1]);
  return Buffer.concat([decipher.update(parts[2]), decipher.final()]).toString("utf8");
}

async function loadConfig() {
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    const rows = await sql`select refresh_token_encrypted, cloud_id, warehouse_id from dotykacka_connections where provider = 'dotykacka' limit 1`;
    const stored = rows[0];
    if (!stored) throw new Error("Brak zapisanego połączenia z Dotykačką.");
    return {
      apiUrl: (process.env.DOTYKACKA_API_URL ?? "https://api.dotykacka.cz/v2").replace(/\/$/, ""),
      cloudId: String(stored.cloud_id),
      warehouseId: stored.warehouse_id ? String(stored.warehouse_id) : null,
      refreshToken: decryptToken(stored.refresh_token_encrypted),
      timeoutMs: Math.max(5, Number(process.env.DOTYKACKA_HTTP_TIMEOUT ?? 20)) * 1000,
    };
  } finally {
    await sql.end();
  }
}

function createApi(config) {
  let accessToken;
  async function token() {
    if (accessToken) return accessToken;
    const response = await fetch(`${config.apiUrl}/signin/token`, {
      method: "POST",
      headers: { Authorization: `User ${config.refreshToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ _cloudId: config.cloudId }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!response.ok) throw new Error(`Autoryzacja Dotykački nie powiodła się (${response.status}).`);
    accessToken = (await response.json()).accessToken;
    if (!accessToken) throw new Error("Dotykačka nie zwróciła tokenu dostępu.");
    return accessToken;
  }
  async function request(pathname, { method = "GET", body, headers = {} } = {}) {
    const response = await fetch(`${config.apiUrl}${pathname}`, {
      method,
      headers: { Authorization: `Bearer ${await token()}`, Accept: "application/json", ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Dotykačka ${method} ${pathname.split("?")[0]}: HTTP ${response.status}${text ? ` — ${text.replace(/\s+/g, " ").slice(0, 300)}` : ""}`);
    return { data: text ? JSON.parse(text) : null, etag: response.headers.get("etag") };
  }
  async function pages(entity, query = "") {
    const output = [];
    for (let page = 1; page <= 100; page += 1) {
      const separator = query ? "&" : "?";
      const result = await request(`/clouds/${config.cloudId}/${entity}${query}${separator}page=${page}&limit=100`);
      const items = Array.isArray(result.data) ? result.data : result.data?.data ?? result.data?.items ?? [];
      output.push({ items, etag: result.etag, page });
      const totalPages = Array.isArray(result.data) ? null : result.data?.totalPages ?? result.data?.pages;
      if (!items.length || items.length < 100 || totalPages && page >= totalPages) break;
    }
    return output;
  }
  return { request, pages };
}

function flatten(pages) {
  return pages.flatMap((page) => page.items);
}

function buildPlan(categories, products, ingredients) {
  const wineCategory = categories.find((category) => normalized(category.name) === "wina" && !category.deleted);
  if (!wineCategory) throw new Error("Nie znaleziono aktywnej kategorii WINA.");
  const wines = products.filter((product) => String(product._categoryId) === String(wineCategory.id) && !product.deleted);
  const byId = new Map(products.map((product) => [String(product.id), product]));
  const wineGlassIds = new Set(wines.filter(isGlass).map((product) => String(product.id)));
  const bases = wines.filter((product) => product.display !== false && !wineGlassIds.has(String(product.id)));
  if (bases.length !== EXPECTED_BASES) {
    const classifiedGlasses = wines.filter((product) => product.display !== false && wineGlassIds.has(String(product.id))).map((product) => ({ id: product.id, name: product.name }));
    throw new Error(`Oczekiwano ${EXPECTED_BASES} aktywnych win bazowych, znaleziono ${bases.length}. Aktywne pozycje sklasyfikowane jako kieliszki: ${JSON.stringify(classifiedGlasses)}`);
  }
  const recipeByParent = new Map();
  for (const ingredient of ingredients.filter((item) => !item.deleted)) {
    const key = String(ingredient._parentProductId);
    recipeByParent.set(key, [...(recipeByParent.get(key) ?? []), ingredient]);
  }
  const activeGlasses = wines.filter((product) => product.display !== false && wineGlassIds.has(String(product.id)));
  const existingByBase = new Map();
  const unresolvedActive = [];
  for (const glass of activeGlasses) {
    const baseIngredients = (recipeByParent.get(String(glass.id)) ?? []).filter((item) => {
      const product = byId.get(String(item._productId));
      return product && String(product._categoryId) === String(wineCategory.id) && !isGlass(product);
    });
    if (baseIngredients.length > 1) throw new Error(`Aktywny kieliszek ID ${glass.id} (${glass.name}) ma więcej niż jedną bazę winną.`);
    if (baseIngredients.length === 0) {
      unresolvedActive.push(glass);
      continue;
    }
    const baseId = String(baseIngredients[0]._productId);
    if (existingByBase.has(baseId)) throw new Error(`Więcej niż jeden aktywny kieliszek jest przypięty do wina bazowego ID ${baseId}.`);
    existingByBase.set(baseId, glass);
  }
  const natural = bases.filter((base) => NATURAL_CODES.has(productCode(base)));
  if (natural.length !== NATURAL_CODES.size) throw new Error(`Oczekiwano ${NATURAL_CODES.size} win naturalnie musujących (${[...NATURAL_CODES].join(", ")}), znaleziono ${natural.length}.`);
  const eligible = bases.filter((base) => !NATURAL_CODES.has(productCode(base)));
  const activeByName = new Map(unresolvedActive.map((glass) => [normalized(glass.name), glass]));
  const glassByMarker = new Map(wines.flatMap((product) => (product.externalIds ?? (product.externalId ? [product.externalId] : []))
    .filter((value) => String(value).startsWith("menu-atelier-cafe:wine-glass:"))
    .map((value) => [String(value), product])));
  const pairs = eligible.map((base) => {
    const expectedName = glassName(base, SPARKLING_CODES.has(productCode(base)));
    const glass = existingByBase.get(String(base.id))
      ?? activeByName.get(normalized(expectedName))
      ?? glassByMarker.get(`menu-atelier-cafe:wine-glass:${base.id}`)
      ?? null;
    return { base, glass, ...glassChanges(base, true) };
  });
  const unpairedActive = activeGlasses.filter((glass) => !pairs.some((pair) => pair.glass?.id === glass.id));
  if (unpairedActive.length) throw new Error(`Znaleziono ${unpairedActive.length} aktywnych kieliszków bez dozwolonej pary: ${JSON.stringify(unpairedActive.map((product) => ({ id: product.id, name: product.name, ingredients: (recipeByParent.get(String(product.id)) ?? []).map((item) => ({ productId: item._productId, productName: byId.get(String(item._productId))?.name, code: productCode(byId.get(String(item._productId)) ?? {}) })) })))}.`);
  for (const pair of pairs) if (!(pair.changes.priceWithVat > 0)) throw new Error(`Brak ceny butelki dla ${pair.base.name}.`);
  const hiddenGlasses = wines.filter((product) => product.display === false && wineGlassIds.has(String(product.id)));
  const wineIds = new Set(wines.map((product) => String(product.id)));
  const recipesToDelete = ingredients.filter((item) => !item.deleted && wineIds.has(String(item._parentProductId)));
  return { wineCategory, wines, bases, natural, eligible, pairs, hiddenGlasses, recipesToDelete };
}

function report(plan) {
  const current = plan.pairs.filter((pair) => pair.glass).map((pair) => ({
    wine: pair.base.name,
    code: productCode(pair.base) ?? "—",
    bottle: overrideBottlePrice(pair.base),
    oldGlass: pair.glass.priceWithVat,
    newGlass: pair.changes.priceWithVat,
    serving: `${pair.servingMl} ml`,
  }));
  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    baseWines: plan.bases.length,
    bottleOnlyNatural: plan.natural.map((product) => ({ id: product.id, code: productCode(product), name: product.name })),
    eligibleForGlass: plan.eligible.length,
    existingActiveGlasses: plan.pairs.filter((pair) => pair.glass).length,
    glassesToCreate: plan.pairs.filter((pair) => !pair.glass).length,
    hiddenHistoricalToRename: plan.hiddenGlasses.filter((product) => !product.name.endsWith(ARCHIVE_SUFFIX)).length,
    recipesToReplace: plan.recipesToDelete.length,
    bottlePriceOverrides: plan.bases.filter((base) => overrideBottlePrice(base) !== Number(base.priceWithVat ?? 0)).map((base) => ({ id: base.id, name: base.name, from: base.priceWithVat, to: overrideBottlePrice(base) })),
    currentGlassPriceComparison: current,
  }, null, 2));
}

async function backupSnapshot(config, plan, products, ingredients, stocks) {
  const directory = path.resolve(process.env.DOTYKACKA_WINE_MIGRATION_BACKUP_DIR ?? "tmp/wine-migration-backups");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(directory, `wine-migration-backup-${stamp}.json`);
  const wineIds = new Set(plan.wines.map((product) => String(product.id)));
  const snapshot = {
    createdAt: new Date().toISOString(),
    cloudId: config.cloudId,
    category: plan.wineCategory,
    products: products.filter((product) => wineIds.has(String(product.id))),
    ingredients: ingredients.filter((item) => wineIds.has(String(item._parentProductId)) || wineIds.has(String(item._productId))),
    stocks: stocks.filter((item) => wineIds.has(String(item.id ?? item._productId))),
  };
  await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  return target;
}

async function replaceProductPages(api, config, categoryId, transform) {
  const query = `?filter=${encodeURIComponent(`_categoryId|eq|${categoryId}`)}`;
  const pages = await api.pages("products", query);
  for (const page of pages) {
    if (!page.etag) throw new Error(`Brak ETag dla strony ${page.page} produktów.`);
    const body = page.items.map((product) => writableProduct(transform(product)));
    await api.request(`/clouds/${config.cloudId}/products`, { method: "PUT", body, headers: { "If-Match": page.etag } });
  }
}

async function main() {
  if (APPLY && !WRITE_ENABLED) throw new Error("Tryb zapisu wymaga DOTYKACKA_WINE_MIGRATION_WRITE_ENABLED=true.");
  const config = await loadConfig();
  const api = createApi(config);
  const [categoryPages, productPages, ingredientPages, stockPages] = await Promise.all([
    api.pages("categories"),
    api.pages("products"),
    api.pages("product-ingredients"),
    config.warehouseId ? api.pages(`warehouses/${config.warehouseId}/products`) : Promise.resolve([]),
  ]);
  let products = flatten(productPages);
  let ingredients = flatten(ingredientPages);
  const plan = buildPlan(flatten(categoryPages), products, ingredients);
  report(plan);
  if (!APPLY) return;

  const backupPath = await backupSnapshot(config, plan, products, ingredients, flatten(stockPages));
  console.log(JSON.stringify({ stage: "backup-created", backupPath }));

  const toCreate = plan.pairs.filter((pair) => !pair.glass).map((pair) => {
    const marker = `menu-atelier-cafe:wine-glass:${pair.base.id}`;
    return writableProduct(pair.base, { ...pair.changes, display: false, externalId: marker }, true);
  });
  if (toCreate.length) await api.request(`/clouds/${config.cloudId}/products`, { method: "POST", body: toCreate });

  products = flatten(await api.pages("products"));
  const markerToProduct = new Map(products.flatMap((product) => (product.externalIds ?? (product.externalId ? [product.externalId] : []))
    .filter((value) => String(value).startsWith("menu-atelier-cafe:wine-glass:"))
    .map((value) => [String(value), product])));
  for (const pair of plan.pairs) {
    if (pair.glass) continue;
    pair.glass = markerToProduct.get(`menu-atelier-cafe:wine-glass:${pair.base.id}`) ?? null;
    if (!pair.glass) throw new Error(`Nie odnaleziono utworzonego kieliszka dla ${pair.base.name}. Kopia zapasowa: ${backupPath}`);
  }

  const baseById = new Map(plan.bases.map((base) => [String(base.id), base]));
  const pairByGlassId = new Map(plan.pairs.map((pair) => [String(pair.glass.id), pair]));
  const hiddenIds = new Set(plan.hiddenGlasses.map((product) => String(product.id)));
  await replaceProductPages(api, config, plan.wineCategory.id, (product) => {
    const base = baseById.get(String(product.id));
    if (base) return bottleUpdate(product);
    const pair = pairByGlassId.get(String(product.id));
    if (pair) return writableProduct(product, { ...pair.changes, display: pair.glass.externalId?.startsWith("menu-atelier-cafe:wine-glass:") ? false : true });
    if (hiddenIds.has(String(product.id))) return writableProduct(product, { name: product.name.endsWith(ARCHIVE_SUFFIX) ? product.name : `${product.name}${ARCHIVE_SUFFIX}`, stockDeduct: false });
    return product;
  });

  for (const ingredient of plan.recipesToDelete) {
    await api.request(`/clouds/${config.cloudId}/product-ingredients/${ingredient.id}`, { method: "DELETE" });
  }
  const recipes = plan.pairs.map((pair) => ({ _parentProductId: pair.glass.id, _productId: pair.base.id, deleted: false, quantity: pair.serving, unit: "Piece" }));
  if (recipes.length) await api.request(`/clouds/${config.cloudId}/product-ingredients`, { method: "POST", body: recipes });

  await replaceProductPages(api, config, plan.wineCategory.id, (product) => {
    const pair = pairByGlassId.get(String(product.id));
    return pair ? writableProduct(product, { display: true }) : product;
  });

  const verificationProducts = flatten(await api.pages("products"));
  const verificationIngredients = flatten(await api.pages("product-ingredients"));
  const verification = buildPlan(flatten(categoryPages), verificationProducts, verificationIngredients);
  const badRecipes = verification.pairs.filter((pair) => {
    const rows = verificationIngredients.filter((item) => !item.deleted && String(item._parentProductId) === String(pair.glass.id));
    return rows.length !== 1 || String(rows[0]._productId) !== String(pair.base.id) || Math.abs(Number(rows[0].quantity) - pair.serving) > 0.000001 || rows[0].unit !== "Piece";
  });
  const badProducts = verification.pairs.filter((pair) => pair.glass.display === false || pair.glass.stockDeduct !== false || pair.glass.unit !== "Piece" || Number(pair.base.packaging) !== 1 || pair.base.unit !== "Piece");
  if (badRecipes.length || badProducts.length || verification.pairs.length !== plan.eligible.length) {
    throw new Error(`Weryfikacja po migracji nie powiodła się (receptury: ${badRecipes.length}, produkty: ${badProducts.length}). Kopia zapasowa: ${backupPath}`);
  }
  console.log(JSON.stringify({ status: "ok", backupPath, bottles: verification.bases.length, activeGlasses: verification.pairs.length, bottleOnlyNatural: verification.natural.length }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
