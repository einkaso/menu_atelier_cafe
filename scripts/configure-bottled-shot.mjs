import { createDecipheriv, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

export const BOTTLED_SHOT_CONFIGS = {
  "1800-tequila": {
    label: "1800 Tequila",
    stockProduct: { id: 1560018041886335, expectedName: "1800 Tequila", bottleLiters: 0.7 },
    saleProduct: { id: 2236540314478447, expectedName: "1800 Tequila", servingLiters: 0.05 },
  },
  "absolut-elyx": {
    label: "ABSOLUT Elyx",
    stockProduct: { id: 1509109830436299, expectedName: "ABSOLUT Elyx", bottleLiters: 0.7 },
    saleProduct: { id: 1509112753113695, expectedName: "ABSOLUT Elyx", servingLiters: 0.05 },
  },
  "bacardi-reserva-ocho": {
    label: "BACARDI RISERVA OCHO RUM",
    stockProduct: { id: 1744027210548575, expectedName: "BACARDI RISERVA OCHO RUM", bottleLiters: 0.7 },
    saleProduct: { id: 1746873160084767, expectedName: "BACARDI RISERVA OCHO RUM", servingLiters: 0.05 },
  },
  "bacardi-spiced": {
    label: "BACARDI Spiced Rum",
    stockProduct: { id: 1242835479192703, expectedName: "BACARDI Spiced Rum", bottleLiters: 0.7 },
    saleProduct: { id: 1242836935204855, expectedName: "BACARDI Spiced Rum", servingLiters: 0.05 },
  },
  "bombay-sapphire-sunset": {
    label: "Bombay Sapphire Sunset",
    stockProduct: { id: 2304638502441591, expectedName: "Bombay Sapphire Sunset", bottleLiters: 0.7, convertPieceStockToLiters: true },
    saleProduct: { id: 2236552619374519, expectedName: "Bombay Sapphire Sunset", servingLiters: 0.05 },
  },
};

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

function requireProduct(products, expected, label) {
  const product = products.find((item) => String(item.id) === String(expected.id));
  if (!product) throw new Error(`Nie znaleziono produktu ${label} (${expected.id}).`);
  if (normalized(product.name) !== normalized(expected.expectedName)) {
    throw new Error(`Produkt ${expected.id} ma teraz nazwę „${product.name}”, oczekiwano „${expected.expectedName}”. Przerwano dla bezpieczeństwa.`);
  }
  return product;
}

async function syncLocalProductState(stockProductId, saleProductId) {
  if (!process.env.DATABASE_URL) return false;
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    await sql.begin(async (transaction) => {
      await transaction`update menu_products set display = false, stock_deduct = true, stock_unit = 'Liter', synced_at = now() where dotykacka_id = ${String(stockProductId)}`;
      await transaction`update menu_products set display = true, stock_deduct = false, stock_unit = 'Piece', menu_group = 'Shoty · 50 ml', synced_at = now() where dotykacka_id = ${String(saleProductId)}`;
      await transaction`update inventory_catalog_products set display = false, stock_deduct = true, unit = 'Liter', synced_at = now() where dotykacka_id = ${String(stockProductId)}`;
      await transaction`update inventory_catalog_products set display = true, stock_deduct = false, unit = 'Piece', synced_at = now() where dotykacka_id = ${String(saleProductId)}`;
      await transaction`
        insert into product_content (product_id, attributes, updated_at)
        select id, ${transaction.json({
          cocktailType: "Shot",
          servingStyle: "Shot",
          volume: "50 ml",
          __en__cocktailType: "Shot",
          __en__servingStyle: "Shot",
          __en__volume: "50 ml",
        })}::jsonb, now()
        from menu_products
        where dotykacka_id = ${String(saleProductId)}
        on conflict (product_id) do update
        set attributes = coalesce(product_content.attributes, '{}'::jsonb) || excluded.attributes,
            updated_at = now()
      `;
    });
    return true;
  } finally {
    await sql.end();
  }
}

async function main() {
  const apply = process.env.BOTTLED_SHOT_APPLY === "true";
  if (apply && process.env.DOTYKACKA_BOTTLED_SHOT_WRITE_ENABLED !== "true") {
    throw new Error("Zapis wymaga DOTYKACKA_BOTTLED_SHOT_WRITE_ENABLED=true.");
  }
  const target = process.env.BOTTLED_SHOT_TARGET ?? "1800-tequila";
  const shotConfiguration = BOTTLED_SHOT_CONFIGS[target];
  if (!shotConfiguration) throw new Error(`Nieznana konfiguracja shota: ${target}.`);
  const config = await connectionConfig();
  const api = new Api(config);
  const [products, ingredients, stockPackagings, warehouseStocks] = await Promise.all([
    api.all("products"), api.all("product-ingredients"), api.all("stock-packagings"),
    config.warehouseId ? api.all(`warehouses/${config.warehouseId}/products`) : Promise.resolve([]),
  ]);
  const stockProduct = requireProduct(products, shotConfiguration.stockProduct, "magazynowego");
  const saleProduct = requireProduct(products, shotConfiguration.saleProduct, "sprzedażowego");
  const currentIngredients = ingredients.filter((item) => !item.deleted && String(item._parentProductId) === String(saleProduct.id));
  const packages = stockPackagings.filter((item) => !item.deleted && String(item._productId) === String(stockProduct.id));
  if (packages.length > 1) throw new Error(`Znaleziono więcej niż jedno aktywne opakowanie magazynowe ${shotConfiguration.label}. Przerwano dla bezpieczeństwa.`);
  const stockPackaging = packages[0] ?? null;
  const report = {
    mode: apply ? "APPLY" : "AUDIT",
    stockProduct: {
      id: stockProduct.id, name: stockProduct.name, display: stockProduct.display,
      stockDeduct: stockProduct.stockDeduct, unit: stockProduct.unit, packaging: stockProduct.packaging,
      stockQuantity: warehouseStocks.find((item) => String(item.id) === String(stockProduct.id))?.stockQuantityStatus ?? null,
    },
    stockPackaging: stockPackaging ? {
      id: stockPackaging.id, name: stockPackaging.name, quantity: stockPackaging.quantity, unit: stockPackaging.unit,
    } : null,
    saleProduct: {
      id: saleProduct.id, name: saleProduct.name, display: saleProduct.display,
      stockDeduct: saleProduct.stockDeduct, unit: saleProduct.unit,
    },
    desiredIngredient: { productId: stockProduct.id, quantity: shotConfiguration.saleProduct.servingLiters, unit: "Liter" },
    currentIngredients: currentIngredients.map((item) => ({ id: item.id, productId: item._productId, quantity: item.quantity, unit: item.unit })),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!apply) return;

  const currentStockQuantity = Number(report.stockProduct.stockQuantity);
  const convertedStockLiters = shotConfiguration.stockProduct.convertPieceStockToLiters && stockProduct.unit === "Piece" && Number.isFinite(currentStockQuantity)
    ? currentStockQuantity * shotConfiguration.stockProduct.bottleLiters
    : null;
  if (convertedStockLiters !== null && !config.warehouseId) throw new Error("Brak wybranego magazynu Dotykački do przeliczenia aktualnego stanu z butelek na litry.");

  const backupDirectory = process.env.BOTTLED_SHOT_BACKUP_DIR ?? "/var/lib/banaszek-menu/backups";
  await mkdir(backupDirectory, { recursive: true });
  const backupPath = path.join(backupDirectory, `${target}-shot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), report, products: [stockProduct, saleProduct], ingredients: currentIngredients, stockPackaging }, null, 2), { mode: 0o600 });

  if (stockProduct.display !== false || stockProduct.stockDeduct !== true || stockProduct.unit !== "Liter" || Number(stockProduct.packaging ?? 1) !== 1) {
    await api.patch("products", stockProduct.id, { display: false, stockDeduct: true, unit: "Liter", packaging: 1 });
  }
  if (saleProduct.display !== true || saleProduct.stockDeduct !== false || saleProduct.unit !== "Piece") {
    await api.patch("products", saleProduct.id, { display: true, stockDeduct: false, unit: "Piece", packaging: 1 });
  }
  const recipeIsExact = currentIngredients.length === 1
    && String(currentIngredients[0]._productId) === String(stockProduct.id)
    && Number(currentIngredients[0].quantity) === shotConfiguration.saleProduct.servingLiters
    && currentIngredients[0].unit === "Liter";
  if (!recipeIsExact) {
    for (const ingredient of currentIngredients) {
      await api.raw(`/clouds/${config.cloudId}/product-ingredients/${ingredient.id}`, { method: "DELETE" });
    }
    await api.raw(`/clouds/${config.cloudId}/product-ingredients`, {
      method: "POST",
      body: [{
        _parentProductId: saleProduct.id,
        _productId: stockProduct.id,
        deleted: false,
        quantity: shotConfiguration.saleProduct.servingLiters,
        unit: "Liter",
      }],
    });
  }
  const desiredPackage = { _productId: stockProduct.id, name: "Butelka 0,7 l", quantity: shotConfiguration.stockProduct.bottleLiters, unit: "Liter", deleted: false };
  if (stockPackaging) {
    if (stockPackaging.name !== desiredPackage.name || Number(stockPackaging.quantity) !== desiredPackage.quantity || stockPackaging.unit !== desiredPackage.unit) {
      await api.patch("stock-packagings", stockPackaging.id, desiredPackage);
    }
  } else {
    await api.raw(`/clouds/${config.cloudId}/stock-packagings`, { method: "POST", body: [{ ...desiredPackage, ean: [], plu: [] }] });
  }
  if (convertedStockLiters !== null) {
    const dates = await api.raw(`/clouds/${config.cloudId}/warehouses/${config.warehouseId}/stock-taking-dates`, { method: "POST", body: { _productIds: [stockProduct.id] } });
    const previous = dates.body?.find((item) => String(item._productId) === String(stockProduct.id))?.stockTakingDate;
    const stockTakingDate = new Date();
    const previousTime = previous == null ? 0 : new Date(previous).getTime();
    if (Number.isFinite(previousTime) && stockTakingDate.getTime() <= previousTime) stockTakingDate.setTime(previousTime + 1000);
    const taking = await api.raw(`/clouds/${config.cloudId}/warehouses/${config.warehouseId}/stock-takings`, {
      method: "POST",
      body: {
        note: `${shotConfiguration.label}: ${currentStockQuantity} but. × ${shotConfiguration.stockProduct.bottleLiters} l`,
        stockTakingDate: stockTakingDate.toISOString(),
        items: [{ _productId: stockProduct.id, quantity: convertedStockLiters }],
      },
    });
    console.log(JSON.stringify({ stockConversion: { fromPieces: currentStockQuantity, toLiters: convertedStockLiters }, stockTaking: taking.body }, null, 2));
  }
  const localCatalogUpdated = await syncLocalProductState(stockProduct.id, saleProduct.id);
  console.log(JSON.stringify({ ok: true, backupPath, localCatalogUpdated }, null, 2));
}

if (process.env.BOTTLED_SHOT_RUN === "true" || (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
