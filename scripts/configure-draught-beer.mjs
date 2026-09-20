import { createDecipheriv, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

export function draughtBeerConsumption(servingLiters, lossPercent = 3) {
  const serving = Number(servingLiters);
  const loss = Number(lossPercent);
  if (!Number.isFinite(serving) || serving <= 0 || !Number.isFinite(loss) || loss < 0) throw new Error("Nieprawidłowa objętość porcji lub procent straty.");
  return Number((serving * (1 + loss / 100)).toFixed(3));
}

export const DRAUGHT_BEER_CONFIGS = [{
  name: "Bosman",
  stockProduct: { id: 2113036097020351, expectedName: "Bosman KEG 30l", litersPerPackage: 30 },
  sales: [
    { id: 2113033250521259, expectedName: "BOSMAN 0,5l", servingLiters: 0.5 },
    { id: 2113034865920067, expectedName: "BOSMAN 0,3l", servingLiters: 0.3 },
  ],
  lossPercent: 3,
}];

function normalized(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pl").replace(/\s+/g, " ").trim();
}

function decryptStoredToken(value, secret) {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !encrypted) throw new Error("Zapisany token Dotykački ma nieprawidłowy format.");
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

async function connectionConfig() {
  let stored;
  if (process.env.DATABASE_URL) {
    const sql = postgres(process.env.DATABASE_URL, { max: 1 });
    try {
      [stored] = await sql`select refresh_token_encrypted, cloud_id, warehouse_id from dotykacka_connections where provider = 'dotykacka' limit 1`;
    } finally {
      await sql.end();
    }
  }
  const secret = process.env.ADMIN_SESSION_SECRET;
  const refreshToken = stored?.refresh_token_encrypted
    ? (secret ? decryptStoredToken(stored.refresh_token_encrypted, secret) : null)
    : process.env.DOTYKACKA_REFRESH_TOKEN;
  const cloudId = stored?.cloud_id ? String(stored.cloud_id) : process.env.DOTYKACKA_CLOUD_ID;
  const warehouseId = stored?.warehouse_id ? String(stored.warehouse_id) : process.env.DOTYKACKA_WAREHOUSE_ID;
  if (!refreshToken || !cloudId) throw new Error("Brak połączenia z Dotykačką.");
  return {
    apiUrl: (process.env.DOTYKACKA_API_URL ?? "https://api.dotykacka.cz/v2").replace(/\/$/, ""),
    refreshToken,
    cloudId,
    warehouseId,
  };
}

class Api {
  constructor(config) { this.config = config; this.accessToken = ""; }
  async token() {
    if (this.accessToken) return this.accessToken;
    const response = await fetch(`${this.config.apiUrl}/signin/token`, {
      method: "POST",
      headers: { Authorization: `User ${this.config.refreshToken}`, "content-type": "application/json" },
      body: JSON.stringify({ _cloudId: this.config.cloudId }),
    });
    if (!response.ok) throw new Error(`Autoryzacja Dotykački nie powiodła się (${response.status}).`);
    this.accessToken = (await response.json()).accessToken;
    if (!this.accessToken) throw new Error("Dotykačka nie zwróciła tokenu dostępu.");
    return this.accessToken;
  }
  async raw(pathname, options = {}) {
    const response = await fetch(`${this.config.apiUrl}${pathname}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        ...(options.etag ? { "If-Match": options.etag } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (!response.ok) throw new Error(`Dotykačka ${options.method ?? "GET"} ${pathname} (${response.status}): ${(await response.text()).slice(0, 500)}`);
    const text = await response.text();
    return { body: text ? JSON.parse(text) : null, etag: response.headers.get("etag") };
  }
  async all(entity) {
    const rows = [];
    for (let page = 1; page <= 100; page += 1) {
      const { body } = await this.raw(`/clouds/${this.config.cloudId}/${entity}?page=${page}&limit=100`);
      const items = Array.isArray(body) ? body : body?.data ?? body?.items ?? [];
      rows.push(...items);
      if (items.length < 100 || (body?.totalPages && page >= body.totalPages)) break;
    }
    return rows;
  }
  async patch(entity, id, changes) {
    const current = await this.raw(`/clouds/${this.config.cloudId}/${entity}/${id}`);
    return this.raw(`/clouds/${this.config.cloudId}/${entity}/${id}`, { method: "PATCH", body: { id, ...changes }, etag: current.etag ?? "*" });
  }
}

function requireProduct(products, expected) {
  const product = products.find((item) => String(item.id) === String(expected.id));
  if (!product) throw new Error(`Nie znaleziono produktu ${expected.expectedName} (${expected.id}).`);
  if (normalized(product.name) !== normalized(expected.expectedName)) throw new Error(`Produkt ${expected.id} ma teraz nazwę „${product.name}”, oczekiwano „${expected.expectedName}”. Przerwano dla bezpieczeństwa.`);
  return product;
}

async function main() {
  const apply = process.env.DRAUGHT_BEER_APPLY === "true";
  if (apply && process.env.DOTYKACKA_DRAUGHT_BEER_WRITE_ENABLED !== "true") throw new Error("Zapis wymaga DOTYKACKA_DRAUGHT_BEER_WRITE_ENABLED=true.");
  const setStockLiters = process.env.DRAUGHT_BEER_SET_STOCK_LITERS === undefined ? null : Number(process.env.DRAUGHT_BEER_SET_STOCK_LITERS);
  if (setStockLiters !== null && (!Number.isFinite(setStockLiters) || setStockLiters < 0)) throw new Error("DRAUGHT_BEER_SET_STOCK_LITERS musi być nieujemną liczbą.");
  if (setStockLiters !== null && !apply) throw new Error("Ustawienie stanu magazynu wymaga trybu zapisu.");

  const config = await connectionConfig();
  const api = new Api(config);
  const [products, ingredients, stockPackagings, warehouseStocks] = await Promise.all([
    api.all("products"), api.all("product-ingredients"), api.all("stock-packagings"),
    config.warehouseId ? api.all(`warehouses/${config.warehouseId}/products`) : Promise.resolve([]),
  ]);
  const plans = DRAUGHT_BEER_CONFIGS.map((beer) => {
    const stockProduct = requireProduct(products, beer.stockProduct);
    const sales = beer.sales.map((sale) => ({
      ...sale,
      product: requireProduct(products, sale),
      consumptionLiters: draughtBeerConsumption(sale.servingLiters, beer.lossPercent),
      currentIngredients: ingredients.filter((item) => !item.deleted && String(item._parentProductId) === String(sale.id)),
    }));
    const packages = stockPackagings.filter((item) => !item.deleted && String(item._productId) === String(stockProduct.id));
    if (packages.length > 1) throw new Error(`${beer.name}: znaleziono więcej niż jedno aktywne opakowanie magazynowe. Przerwano dla bezpieczeństwa.`);
    return { ...beer, stockProduct, sales, stockPackaging: packages[0] ?? null };
  });

  const report = plans.map((plan) => ({
    beer: plan.name,
    stockProduct: { id: plan.stockProduct.id, name: plan.stockProduct.name, unit: plan.stockProduct.unit, stockDeduct: plan.stockProduct.stockDeduct, display: plan.stockProduct.display, stockQuantity: warehouseStocks.find((item) => String(item.id) === String(plan.stockProduct.id))?.stockQuantityStatus ?? null },
    stockPackaging: plan.stockPackaging ? { id: plan.stockPackaging.id, name: plan.stockPackaging.name, quantity: plan.stockPackaging.quantity, unit: plan.stockPackaging.unit } : null,
    sales: plan.sales.map((sale) => ({
      id: sale.product.id,
      name: sale.product.name,
      stockDeduct: sale.product.stockDeduct,
      desiredIngredient: { productId: plan.stockProduct.id, quantity: sale.consumptionLiters, unit: "Liter" },
      currentIngredients: sale.currentIngredients.map((item) => ({ id: item.id, productId: item._productId, quantity: item.quantity, unit: item.unit })),
    })),
    requestedStockLiters: setStockLiters,
  }));
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "AUDIT", report }, null, 2));
  if (!apply) return;

  const backupDirectory = process.env.DRAUGHT_BEER_BACKUP_DIR ?? "/var/lib/banaszek-menu/backups";
  await mkdir(backupDirectory, { recursive: true });
  const backupPath = path.join(backupDirectory, `draught-beer-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), report, products: plans.flatMap((plan) => [plan.stockProduct, ...plan.sales.map((sale) => sale.product)]), ingredients: plans.flatMap((plan) => plan.sales.flatMap((sale) => sale.currentIngredients)), stockPackagings: plans.map((plan) => plan.stockPackaging).filter(Boolean) }, null, 2), { mode: 0o600 });

  for (const plan of plans) {
    if (plan.stockProduct.display !== false || plan.stockProduct.stockDeduct !== true || plan.stockProduct.unit !== "Liter" || Number(plan.stockProduct.packaging ?? 1) !== 1) {
      await api.patch("products", plan.stockProduct.id, { display: false, stockDeduct: true, unit: "Liter", packaging: 1 });
    }
    for (const sale of plan.sales) {
      if (sale.product.stockDeduct !== false) await api.patch("products", sale.product.id, { stockDeduct: false });
      const recipeIsExact = sale.currentIngredients.length === 1
        && String(sale.currentIngredients[0]._productId) === String(plan.stockProduct.id)
        && Number(sale.currentIngredients[0].quantity) === sale.consumptionLiters
        && sale.currentIngredients[0].unit === "Liter";
      if (!recipeIsExact) {
        for (const ingredient of sale.currentIngredients) await api.raw(`/clouds/${config.cloudId}/product-ingredients/${ingredient.id}`, { method: "DELETE" });
        await api.raw(`/clouds/${config.cloudId}/product-ingredients`, { method: "POST", body: [{ _parentProductId: sale.product.id, _productId: plan.stockProduct.id, deleted: false, quantity: sale.consumptionLiters, unit: "Liter" }] });
      }
    }
    if (plan.stockPackaging) {
      if (plan.stockPackaging.name !== "KEG 30 l" || Number(plan.stockPackaging.quantity) !== plan.stockProduct.litersPerPackage || plan.stockPackaging.unit !== "Liter") {
        await api.patch("stock-packagings", plan.stockPackaging.id, { _productId: plan.stockProduct.id, name: "KEG 30 l", quantity: plan.stockProduct.litersPerPackage, unit: "Liter", deleted: false });
      }
    } else {
      await api.raw(`/clouds/${config.cloudId}/stock-packagings`, { method: "POST", body: [{ _productId: plan.stockProduct.id, name: "KEG 30 l", quantity: plan.stockProduct.litersPerPackage, unit: "Liter", deleted: false, ean: [], plu: [] }] });
    }
    if (setStockLiters !== null) {
      if (!config.warehouseId) throw new Error("Brak wybranego magazynu Dotykački.");
      const dates = await api.raw(`/clouds/${config.cloudId}/warehouses/${config.warehouseId}/stock-taking-dates`, { method: "POST", body: { _productIds: [plan.stockProduct.id] } });
      const previous = dates.body?.find((item) => String(item._productId) === String(plan.stockProduct.id))?.stockTakingDate;
      const now = new Date();
      const previousTime = previous == null ? 0 : new Date(previous).getTime();
      if (Number.isFinite(previousTime) && now.getTime() <= previousTime) now.setTime(previousTime + 1000);
      const taking = await api.raw(`/clouds/${config.cloudId}/warehouses/${config.warehouseId}/stock-takings`, { method: "POST", body: { note: `Bosman KEG: ${setStockLiters / plan.stockProduct.litersPerPackage} opak. × ${plan.stockProduct.litersPerPackage} l`, stockTakingDate: now.toISOString(), items: [{ _productId: plan.stockProduct.id, quantity: setStockLiters }] } });
      console.log(JSON.stringify({ stockTaking: taking.body }, null, 2));
    }
  }
  console.log(JSON.stringify({ ok: true, backupPath }, null, 2));
}

if (process.env.DRAUGHT_BEER_RUN === "true" || (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
