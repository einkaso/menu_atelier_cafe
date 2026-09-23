import "server-only";
import { and, desc, eq, inArray, isNotNull, ne, notInArray, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { inventoryCatalogCategories, inventoryCatalogProducts, menuAddons, menuCategories, menuProducts, productContent, suppliers, syncRuns, waiterEmployees, waiterExtraProducts, waiterTables, wineSources } from "../../db/schema";
import { DotykackaClient } from "./client";
import { getDotykackaConfig } from "./config";
import { legacyWineCode, parseProductCodes } from "../product-codes";
import { sectionFor } from "../menu-categories";
import { translateMenuContent, translatePolishTexts, translationConfigured, translationSourceHash } from "../translation";
import { matchLatestDeliveryNoteSuppliers } from "./delivery-notes";
import { isAlternativeCoffeeBeanGroup, isSupportedCoffeeOptionGroup } from "../coffee-addons";
import { isIngredientInventoryCategory, isInventoryTaggedIngredient, shouldManageMenuProduct, shouldSyncMenuProduct } from "../menu-tags";
import { isForestLifeSyrupCategory } from "../flavor-syrups";
import { detectSparklingType } from "../wine-characteristics";

const sourceDate = (value?: string | null) => value && !Number.isNaN(Date.parse(value)) ? new Date(value) : null;
const normalizedName = (value: string) => value.trim().toLocaleLowerCase("pl").replace(/\s+/g, " ");
const deliveryNoteIds = (value?: string | null) => value?.match(/\d+/g) ?? [];
export async function syncDotykackaMenu() {
  const config = await getDotykackaConfig();
  const db = getDb();
  const [run] = await db.insert(syncRuns).values({ status: "running" }).returning({ id: syncRuns.id });
  try {
    const client = new DotykackaClient(config);
    const reportTo = new Date();
    const reportFrom = new Date(reportTo.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [latestSales] = await db.select({ syncedAt: menuProducts.salesSyncedAt })
      .from(menuProducts)
      .where(isNotNull(menuProducts.salesSyncedAt))
      .orderBy(desc(menuProducts.salesSyncedAt))
      .limit(1);
    const salesCacheValid = latestSales?.syncedAt
      ? reportTo.getTime() - latestSales.syncedAt.getTime() < 6 * 60 * 60 * 1000
      : false;
    const salesReportPromise = salesCacheValid
      ? Promise.resolve({ report: null, warning: null as string | null, cached: true })
      : config.branchId
      ? client.salesReportRange(reportFrom, reportTo)
          .then((report) => ({ report, warning: null as string | null, cached: false }))
          .catch((error: unknown) => ({
            report: null,
            warning: `Nie udało się pobrać raportu sprzedaży: ${error instanceof Error ? error.message : "nieznany błąd"}`,
            cached: false,
          }))
      : Promise.resolve({
          report: null,
          warning: "Nie wybrano oddziału Dotykački. Ranking „Wybór naszych gości” nie może zostać obliczony.",
          cached: false,
        });
    const [products, categories, stocks, supplierRows, deliveryNotes, customizationResult, employeeResult, tableResult, salesResult] = await Promise.all([
      client.products(), client.categories(), client.stockProducts(), client.suppliers(),
      client.deliveryNotes().catch(() => []),
      client.productCustomizations()
        .then((rows) => ({ available: true as const, rows }))
        .catch(() => ({ available: false as const, rows: [] })),
      client.employees()
        .then((rows) => ({ available: true as const, rows }))
        .catch(() => ({ available: false as const, rows: [] })),
      client.tables()
        .then((rows) => ({ available: true as const, rows }))
        .catch(() => ({ available: false as const, rows: [] })),
      salesReportPromise,
    ]);
    const salesReport = salesResult.report;
    const stockByProduct = new Map(stocks.map((item) => [String(item.id), item.stockQuantityStatus]));
    const stockDetailsByProduct = new Map(stocks.map((item) => [String(item.id), item]));
    const salesByProduct = new Map((salesReport?.productSales ?? []).map((item) => [String(item.id), item.count ?? 0]));
    const existingInventorySettings = await db.select({
      dotykackaId: inventoryCatalogProducts.dotykackaId,
      inventoryTracked: inventoryCatalogProducts.inventoryTracked,
      inventoryCountingMode: inventoryCatalogProducts.inventoryCountingMode,
      servingsPerContainer: inventoryCatalogProducts.servingsPerContainer,
    }).from(inventoryCatalogProducts);
    const inventorySettingsByProduct = new Map(existingInventorySettings.map((product) => [product.dotykackaId, product]));
    const categoryNames = new Map(categories.map((item) => [String(item.id), item.name]));
    const selected = products.filter((product) => {
      const categoryName = categoryNames.get(String(product._categoryId ?? ""));
      const inventoryTracked = isIngredientInventoryCategory(categoryName)
        ? isInventoryTaggedIngredient(categoryName, product.tags ?? [])
        : inventorySettingsByProduct.get(String(product.id))?.inventoryTracked === true;
      return shouldManageMenuProduct(product.tags ?? [], config.menuTag, inventoryTracked)
        || isForestLifeSyrupCategory(categoryName);
    });
    const selectedIds = selected.map((product) => String(product.id));
    const categoryById = new Map(categories.map((item) => [String(item.id), item]));
    const waiterExtras = products.filter((product) => {
      const category = categoryById.get(String(product._categoryId ?? ""));
      return product.display && !product.deleted && !shouldSyncMenuProduct(product.tags ?? [], config.menuTag)
        && (!category || category.display && !category.deleted);
    });
    const categoryIds = new Set([...selected, ...waiterExtras].map((product) => String(product._categoryId ?? "")));
    const allProductsByCategory = new Map<string, typeof products>();
    for (const product of products) {
      const key = String(product._categoryId ?? "");
      allProductsByCategory.set(key, [...(allProductsByCategory.get(key) ?? []), product]);
    }
    const supplierIds = new Map<string, number>();
    const supplierKeysByName = new Map(supplierRows.map((supplier) => [normalizedName(supplier.name), String(supplier.id)]));
    const deliveryNoteById = new Map(deliveryNotes.filter((note) => !note.deleted).map((note) => [String(note.id), note]));

    if (employeeResult.available) {
      const activeIds = employeeResult.rows.map((employee) => String(employee.id));
      for (const employee of employeeResult.rows) {
        await db.insert(waiterEmployees).values({
          dotykackaId: String(employee.id), name: employee.name,
          barcode: String(employee.barcode ?? employee.barCode ?? employee.ean ?? "").trim() || null,
          enabled: employee.enabled !== false, deleted: employee.deleted === true,
          accessLevel: employee.accessLevel == null ? null : String(employee.accessLevel),
          requirePinAlways: employee.requirePinAlways === true,
          sourceVersion: sourceDate(employee.versionDate), syncedAt: new Date(),
        }).onConflictDoUpdate({
          target: waiterEmployees.dotykackaId,
          set: {
            name: employee.name, enabled: employee.enabled !== false, deleted: employee.deleted === true,
            barcode: String(employee.barcode ?? employee.barCode ?? employee.ean ?? "").trim() || null,
            accessLevel: employee.accessLevel == null ? null : String(employee.accessLevel),
            requirePinAlways: employee.requirePinAlways === true,
            sourceVersion: sourceDate(employee.versionDate), syncedAt: new Date(),
          },
        });
      }
      if (activeIds.length) await db.update(waiterEmployees).set({ enabled: false }).where(notInArray(waiterEmployees.dotykackaId, activeIds));
      else await db.update(waiterEmployees).set({ enabled: false });
    }

    if (tableResult.available) {
      const activeIds = tableResult.rows.map((table) => String(table.id));
      for (const table of tableResult.rows) {
        await db.insert(waiterTables).values({
          dotykackaId: String(table.id), name: table.name,
          display: table.display !== false && table.enabled !== false, deleted: table.deleted === true,
          sourceVersion: sourceDate(table.versionDate), syncedAt: new Date(),
        }).onConflictDoUpdate({
          target: waiterTables.dotykackaId,
          set: {
            name: table.name, display: table.display !== false && table.enabled !== false,
            deleted: table.deleted === true, sourceVersion: sourceDate(table.versionDate), syncedAt: new Date(),
          },
        });
      }
      if (activeIds.length) await db.update(waiterTables).set({ display: false }).where(notInArray(waiterTables.dotykackaId, activeIds));
      else await db.update(waiterTables).set({ display: false });
    }

    const inventorySyncedAt = new Date();
    const inventoryCategoryRows = categories.map((category) => ({
      dotykackaId: String(category.id),
      name: category.name,
      display: category.display !== false,
      deleted: category.deleted === true,
      sortOrder: category.sortOrder ?? null,
      sourceVersion: sourceDate(category.versionDate),
      syncedAt: inventorySyncedAt,
    }));
    const inventoryProductRows = products.map((product) => {
      const productId = String(product.id);
      const parsedCodes = parseProductCodes(product.plu);
      const categoryName = categoryNames.get(String(product._categoryId ?? "")) ?? "";
      const isWineBottle = categoryName.trim().toLocaleUpperCase("pl") === "WINA" && !/(kieliszek|glass)/i.test(product.name);
      const isWineGlass = categoryName.trim().toLocaleUpperCase("pl") === "WINA" && /(kieliszek|glass)/i.test(product.name);
      const ingredientCategory = isIngredientInventoryCategory(categoryName);
      const inventoryTaggedIngredient = isInventoryTaggedIngredient(categoryName, product.tags ?? []);
      const previousSettings = inventorySettingsByProduct.get(productId);
      const sparklingType = detectSparklingType(product.name, product.description, ...(product.features ?? []), ...(product.tags ?? []));
      const detectedServings = sparklingType ? 6 : 5;
      return {
        dotykackaId: productId,
        categoryDotykackaId: product._categoryId == null ? null : String(product._categoryId),
        name: product.name,
        display: product.display !== false,
        deleted: product.deleted === true,
        stockDeduct: product.stockDeduct === true,
        inventoryTracked: isWineGlass ? false : ingredientCategory ? inventoryTaggedIngredient : previousSettings?.inventoryTracked ?? false,
        inventoryCountingMode: isWineBottle
          ? previousSettings?.inventoryCountingMode ?? (sparklingType === "NATURALLY_SPARKLING" ? "BOTTLE_ONLY" : "WINE_BOTTLE")
          : previousSettings?.inventoryCountingMode ?? "QUANTITY",
        servingsPerContainer: isWineBottle && sparklingType !== "NATURALLY_SPARKLING"
          ? previousSettings?.servingsPerContainer ?? detectedServings
          : null,
        stockQuantity: stockByProduct.get(productId) == null ? null : String(stockByProduct.get(productId)),
        unit: stockDetailsByProduct.get(productId)?.unit ?? product.unit ?? null,
        tags: product.tags ?? [],
        priceWithVat: product.priceWithVat == null ? null : String(product.priceWithVat),
        eanCodes: (product.ean ?? []).map(String).filter(Boolean),
        pluCodes: parsedCodes.pluCodes,
        wineCode: parsedCodes.catalogCode?.startsWith("WIN") ? parsedCodes.catalogCode : legacyWineCode(product.name),
        catalogCode: parsedCodes.catalogCode,
        imageSourceUrl: product.imageUrl ?? null,
        sourceVersion: sourceDate(product.versionDate),
        syncedAt: inventorySyncedAt,
      };
    });
    await db.transaction(async (tx) => {
      await tx.delete(inventoryCatalogProducts);
      await tx.delete(inventoryCatalogCategories);
      for (let index = 0; index < inventoryCategoryRows.length; index += 500) {
        await tx.insert(inventoryCatalogCategories).values(inventoryCategoryRows.slice(index, index + 500));
      }
      for (let index = 0; index < inventoryProductRows.length; index += 500) {
        await tx.insert(inventoryCatalogProducts).values(inventoryProductRows.slice(index, index + 500));
      }
    });

    const extraSyncedAt = new Date();
    const waiterExtraRows = waiterExtras.map((product) => {
      const category = categoryById.get(String(product._categoryId ?? ""));
      return {
        dotykackaId: String(product.id),
        name: product.name,
        category: category?.name || "Pozostałe",
        categorySortOrder: category?.sortOrder ?? null,
        productSortOrder: product.sortOrder ?? null,
        priceWithVat: product.priceWithVat == null ? null : String(product.priceWithVat),
        currency: product.currency ?? "PLN",
        stockDeduct: product.stockDeduct,
        stockOverdraft: product.stockOverdraft ?? "ALLOW",
        stockQuantity: stockByProduct.get(String(product.id)) == null ? null : String(stockByProduct.get(String(product.id))),
        stockUnit: stockDetailsByProduct.get(String(product.id))?.unit ?? product.unit ?? null,
        tags: product.tags ?? [],
        sourceVersion: sourceDate(product.versionDate),
        syncedAt: extraSyncedAt,
      };
    });
    await db.transaction(async (tx) => {
      await tx.delete(waiterExtraProducts);
      for (let index = 0; index < waiterExtraRows.length; index += 500) {
        await tx.insert(waiterExtraProducts).values(waiterExtraRows.slice(index, index + 500));
      }
    });

    for (const supplier of supplierRows) {
      const [saved] = await db.insert(suppliers).values({
        dotykackaId: String(supplier.id), name: supplier.name, websiteUrl: supplier.websiteUrl ?? null, syncedAt: new Date(),
      }).onConflictDoUpdate({
        target: suppliers.dotykackaId,
        set: { name: supplier.name, websiteUrl: supplier.websiteUrl ?? null, syncedAt: new Date() },
      }).returning({ id: suppliers.id });
      supplierIds.set(String(supplier.id), saved.id);
    }

    // Dotykačka may attach a supplier to the delivery note without copying it
    // into Product._supplierId. Keep those names usable as a fallback.
    for (const note of deliveryNotes) {
      const name = note.supplierName?.trim();
      if (!name || supplierKeysByName.has(normalizedName(name))) continue;
      const key = `delivery-note:${normalizedName(name)}`;
      const [saved] = await db.insert(suppliers).values({
        dotykackaId: key, name, websiteUrl: null, syncedAt: new Date(),
      }).onConflictDoUpdate({
        target: suppliers.dotykackaId,
        set: { name, syncedAt: new Date() },
      }).returning({ id: suppliers.id });
      supplierKeysByName.set(normalizedName(name), key);
      supplierIds.set(key, saved.id);
    }

    const existingProducts = selectedIds.length ? await db.select({
      dotykackaId: menuProducts.dotykackaId,
      supplierId: menuProducts.dotykackaSupplierId,
      supplierDetectedAt: menuProducts.supplierDetectedAt,
    }).from(menuProducts).where(inArray(menuProducts.dotykackaId, selectedIds)) : [];
    const existingByProduct = new Map(existingProducts.map((product) => [product.dotykackaId, product]));
    const unresolvedProducts = selected.filter((product) =>
      !product._supplierId && !existingByProduct.get(String(product.id))?.supplierId
    );
    const deliveryNoteMatches = unresolvedProducts.length
      ? await matchLatestDeliveryNoteSuppliers(client, deliveryNotes, unresolvedProducts)
      : new Map();

    for (const category of categories.filter((item) => categoryIds.has(String(item.id)))) {
      await db.insert(menuCategories).values({
        dotykackaId: String(category.id), name: category.name, display: category.display && !category.deleted,
        sortOrder: category.sortOrder ?? null, showCatalogCodes: sectionFor(category.name) === "wine",
        sourceVersion: sourceDate(category.versionDate), syncedAt: new Date(),
      }).onConflictDoUpdate({
        target: menuCategories.dotykackaId,
        set: { name: category.name, display: category.display && !category.deleted, sortOrder: category.sortOrder ?? null, sourceVersion: sourceDate(category.versionDate), syncedAt: new Date() },
      });
    }

    const storedAddonRows = await db.select({
      addonDotykackaId: menuAddons.addonDotykackaId,
      name: menuAddons.name,
      nameEn: menuAddons.nameEn,
      descriptionPl: menuAddons.descriptionPl,
      descriptionEn: menuAddons.descriptionEn,
    }).from(menuAddons);
    const storedAddonTranslations = new Map(storedAddonRows.map((item) => [item.addonDotykackaId, item]));
    const selectedById = new Map(selected.map((product) => [String(product.id), product]));
    const addonRows = customizationResult.rows.flatMap((customization) => {
      const parent = selectedById.get(String(customization._productId));
      const parentCategory = parent ? categoryNames.get(String(parent._categoryId ?? "")) : null;
      const groupName = customization.name ?? categoryNames.get(String(customization._categoryId)) ?? "Dodatki";
      if (!parent || customization.deleted || !["coffee", "matcha"].includes(sectionFor(parentCategory ?? null)) || !isSupportedCoffeeOptionGroup(groupName)) return [];
      const isAlternativeBeanGroup = isAlternativeCoffeeBeanGroup(groupName);
      return (allProductsByCategory.get(String(customization._categoryId)) ?? [])
        // Dotykačka keeps selectable beans hidden as standalone sale items.
        // They still belong in the chooser; ordinary hidden add-ons remain hidden.
        .filter((addon) => !addon.deleted && (addon.display || isAlternativeBeanGroup))
        .map((addon) => {
          const addonId = String(addon.id);
          const sourceTranslation = addon.translatedName?.["en-GB"] ?? addon.translatedName?.en ?? null;
          const sourceDescription = addon.description?.trim() || null;
          const sourceDescriptionTranslation = addon.translatedDescription?.["en-GB"] ?? addon.translatedDescription?.en ?? null;
          const storedTranslation = storedAddonTranslations.get(addonId);
          return {
          parentDotykackaId: String(parent.id),
          customizationDotykackaId: String(customization.id),
          addonDotykackaId: addonId,
          groupName,
          name: addon.name,
          nameEn: sourceTranslation ?? (storedTranslation?.name === addon.name ? storedTranslation.nameEn : null),
          descriptionPl: sourceDescription,
          descriptionEn: sourceDescriptionTranslation ?? (storedTranslation?.name === addon.name && storedTranslation.descriptionPl === sourceDescription ? storedTranslation.descriptionEn : null),
          priceWithVat: addon.priceWithVat == null ? null : String(addon.priceWithVat),
          currency: addon.currency ?? "PLN",
          sortOrder: addon.sortOrder ?? customization.sortOrder ?? null,
          syncedAt: new Date(),
        };
        });
    });
    // Preserve the last correctly downloaded list when the optional endpoint
    // is temporarily unavailable. An empty but successful response does clear it.
    if (customizationResult.available) await db.transaction(async (tx) => {
      await tx.delete(menuAddons);
      if (addonRows.length) await tx.insert(menuAddons).values(addonRows);
    });

    for (const product of selected) {
      const notesForProduct = deliveryNoteIds(product.deliveryNoteIds)
        .map((id) => deliveryNoteById.get(id))
        .filter((note): note is NonNullable<typeof note> => Boolean(note))
        .sort((a, b) => Date.parse(a.expeditionDate ?? a.created ?? "") - Date.parse(b.expeditionDate ?? b.created ?? ""));
      const noteSupplierName = notesForProduct.at(-1)?.supplierName?.trim();
      const deliveryNoteMatch = deliveryNoteMatches.get(String(product.id));
      const detectedSupplierName = noteSupplierName ?? deliveryNoteMatch?.supplierName;
      const detectedSupplierKey = product._supplierId
        ? String(product._supplierId)
        : detectedSupplierName ? supplierKeysByName.get(normalizedName(detectedSupplierName)) ?? null : null;
      const directNoteDate = notesForProduct.at(-1)?.expeditionDate ?? notesForProduct.at(-1)?.created;
      const detectedAt = product._supplierId
        ? sourceDate(product.versionDate)
        : deliveryNoteMatch?.detectedAt ?? sourceDate(directNoteDate);
      const previousProduct = existingByProduct.get(String(product.id));
      // A product may be bought from many suppliers over time. Keep the last
      // resolved supplier as current when a later API response omits this link.
      const detectedIsNewer = Boolean(detectedSupplierKey) && (!previousProduct?.supplierId || !previousProduct.supplierDetectedAt || !detectedAt || detectedAt >= previousProduct.supplierDetectedAt);
      const supplierKey = detectedIsNewer ? detectedSupplierKey : previousProduct?.supplierId ?? detectedSupplierKey ?? null;
      const supplierDetectedAt = detectedIsNewer ? detectedAt ?? new Date() : previousProduct?.supplierDetectedAt ?? null;
      const parsedCodes = parseProductCodes(product.plu);
      const code = parsedCodes.catalogCode?.startsWith("WIN") ? parsedCodes.catalogCode : legacyWineCode(product.name);
      const eanCodes = (product.ean ?? []).map(String).filter(Boolean);
      const menuTagged = shouldSyncMenuProduct(product.tags ?? [], config.menuTag);
      const [savedProduct] = await db.insert(menuProducts).values({
        dotykackaId: String(product.id), dotykackaCategoryId: product._categoryId ? String(product._categoryId) : null,
        name: product.name, wineCode: code, catalogCode: parsedCodes.catalogCode,
        pluCodes: parsedCodes.pluCodes, licenseCodes: parsedCodes.licenseCodes,
        dotykackaSupplierId: supplierKey,
        supplierDetectedAt,
        supplierProductCode: product.supplierProductCode ?? null, eanCodes, sourceDescription: product.description ?? null,
        priceWithVat: product.priceWithVat == null ? null : String(product.priceWithVat), currency: product.currency ?? "PLN",
        display: product.display, deleted: product.deleted, stockDeduct: product.stockDeduct,
        stockOverdraft: product.stockOverdraft ?? "ALLOW",
        stockQuantity: stockByProduct.get(String(product.id)) == null ? null : String(stockByProduct.get(String(product.id))),
        salesCount30d: salesReport ? String(salesByProduct.get(String(product.id)) ?? 0) : "0",
        salesSyncedAt: salesReport ? reportTo : null,
        sourceSortOrder: product.sortOrder ?? null, tags: product.tags ?? [], allergens: product.allergens ?? [],
        features: product.features ?? [], menuTagged, sourceVersion: sourceDate(product.versionDate), syncedAt: new Date(),
      }).onConflictDoUpdate({
        target: menuProducts.dotykackaId,
        set: {
          dotykackaCategoryId: product._categoryId ? String(product._categoryId) : null, name: product.name, wineCode: code,
          catalogCode: parsedCodes.catalogCode, pluCodes: parsedCodes.pluCodes, licenseCodes: parsedCodes.licenseCodes,
          dotykackaSupplierId: supplierKey,
          supplierDetectedAt,
          supplierProductCode: product.supplierProductCode ?? null, eanCodes,
          sourceDescription: product.description ?? null, priceWithVat: product.priceWithVat == null ? null : String(product.priceWithVat),
          currency: product.currency ?? "PLN", display: product.display, deleted: product.deleted,
          stockDeduct: product.stockDeduct, stockOverdraft: product.stockOverdraft ?? "ALLOW",
          stockQuantity: stockByProduct.get(String(product.id)) == null ? null : String(stockByProduct.get(String(product.id))),
          stockUnit: stockDetailsByProduct.get(String(product.id))?.unit ?? product.unit ?? null,
          ...(salesReport ? {
            salesCount30d: String(salesByProduct.get(String(product.id)) ?? 0),
            salesSyncedAt: reportTo,
          } : {}),
          sourceSortOrder: product.sortOrder ?? null, tags: product.tags ?? [], allergens: product.allergens ?? [],
          features: product.features ?? [], menuTagged, sourceVersion: sourceDate(product.versionDate), syncedAt: new Date(),
        },
      }).returning({ id: menuProducts.id });

      // Every menu item needs a presentation row, even when it is not a wine.
      // This is where automatic translations and later visual enrichments live.
      await db.insert(productContent).values({ productId: savedProduct.id })
        .onConflictDoNothing({ target: productContent.productId });

      const isWine = Boolean(code) || /\bwin(?:o|a|e)?\b/i.test(categoryNames.get(String(product._categoryId ?? "")) ?? "");
      if (isWine) {
        if (code) {
          const [sharedContent] = await db.select({
            descriptionPl: productContent.descriptionPl,
            descriptionEn: productContent.descriptionEn,
            imagePath: productContent.imagePath,
            imageSourceUrl: productContent.imageSourceUrl,
            country: productContent.country,
            region: productContent.region,
            grapes: productContent.grapes,
            wineStyle: productContent.wineStyle,
            wineColor: productContent.wineColor,
            sparklingType: productContent.sparklingType,
            sweetness: productContent.sweetness,
            veganStatus: productContent.veganStatus,
            tastingNotes: productContent.tastingNotes,
          }).from(menuProducts)
            .innerJoin(productContent, eq(menuProducts.id, productContent.productId))
            .where(and(eq(menuProducts.wineCode, code), ne(menuProducts.id, savedProduct.id)))
            .limit(1);
          await db.insert(productContent).values({
            productId: savedProduct.id,
            descriptionPl: sharedContent?.descriptionPl ?? null,
            descriptionEn: sharedContent?.descriptionEn ?? null,
            imagePath: sharedContent?.imagePath ?? null,
            imageSourceUrl: sharedContent?.imageSourceUrl ?? product.imageUrl ?? null,
            country: sharedContent?.country ?? null,
            region: sharedContent?.region ?? null,
            grapes: sharedContent?.grapes ?? null,
            wineStyle: sharedContent?.wineStyle ?? null,
            wineColor: sharedContent?.wineColor ?? null,
            sparklingType: sharedContent?.sparklingType ?? detectSparklingType(product.name, ...(product.features ?? [])),
            sweetness: sharedContent?.sweetness ?? null,
            veganStatus: sharedContent?.veganStatus ?? "UNKNOWN",
            tastingNotes: sharedContent?.tastingNotes ?? null,
          }).onConflictDoNothing({ target: productContent.productId });
          await db.update(productContent).set({
            country: sql`coalesce(nullif(${productContent.country}, ''), ${sharedContent?.country ?? null})`,
            region: sql`coalesce(nullif(${productContent.region}, ''), ${sharedContent?.region ?? null})`,
            grapes: sql`coalesce(nullif(${productContent.grapes}, ''), ${sharedContent?.grapes ?? null})`,
            wineStyle: sql`coalesce(nullif(${productContent.wineStyle}, ''), ${sharedContent?.wineStyle ?? null})`,
            wineColor: sql`coalesce(nullif(${productContent.wineColor}, ''), ${sharedContent?.wineColor ?? null})`,
            sparklingType: sql`coalesce(${productContent.sparklingType}, ${sharedContent?.sparklingType ?? detectSparklingType(product.name, ...(product.features ?? []))})`,
            sweetness: sql`coalesce(nullif(${productContent.sweetness}, ''), ${sharedContent?.sweetness ?? null})`,
            veganStatus: sql`case when ${productContent.veganStatus} = 'UNKNOWN' and ${sharedContent?.veganStatus ?? "UNKNOWN"} <> 'UNKNOWN' then ${sharedContent?.veganStatus ?? "UNKNOWN"} else ${productContent.veganStatus} end`,
            tastingNotes: sql`coalesce(nullif(${productContent.tastingNotes}, ''), ${sharedContent?.tastingNotes ?? null})`,
          }).where(eq(productContent.productId, savedProduct.id));
        } else {
          await db.insert(productContent).values({
            productId: savedProduct.id,
            imageSourceUrl: product.imageUrl ?? null,
          }).onConflictDoNothing({ target: productContent.productId });
        }
        await db.update(productContent).set({
          imageSourceUrl: sql`coalesce(nullif(${productContent.imageSourceUrl}, ''), ${product.imageUrl ?? null})`,
        }).where(eq(productContent.productId, savedProduct.id));

      }

      // Keep source/supplier history for every product (wine, cake, drink,
      // etc.). The product row above points to the latest resolved supplier;
      // these records preserve all earlier suppliers and source material.
      const sourceIdentity = [
        supplierKey ?? "unknown",
        product.supplierProductCode ?? "",
        ...eanCodes.slice().sort(),
        product.description ?? "",
        product.imageUrl ?? "",
      ].join("|");
      const supplierChanged = previousProduct && previousProduct.supplierId !== supplierKey;
      const fingerprint = supplierChanged
        ? `${sourceIdentity}|change:${product.versionDate ?? new Date().toISOString()}`
        : sourceIdentity;
      await db.insert(wineSources).values({
        productId: savedProduct.id,
        supplierId: supplierKey ? supplierIds.get(supplierKey) ?? null : null,
        fingerprint,
        sourceUrl: product.imageUrl ?? null,
        ean: eanCodes[0] ?? null,
        supplierProductCode: product.supplierProductCode ?? null,
        proposedContent: {
          descriptionPl: product.description ?? null,
          imageSourceUrl: product.imageUrl ?? null,
        },
      }).onConflictDoNothing({
        target: [wineSources.productId, wineSources.fingerprint],
      });
    }

    if (selectedIds.length) {
      await db.update(menuProducts).set({ menuTagged: false }).where(notInArray(menuProducts.dotykackaId, selectedIds));
    } else {
      await db.update(menuProducts).set({ menuTagged: false });
    }

    // Translate only new or changed Polish content. Translation problems must
    // never prevent prices, availability and stock from being synchronized.
    let translationStatus: "ok" | "not-needed" | "not-configured" | "error" = "not-needed";
    let productsTranslated = 0;
    let coffeeAddonsTranslated = 0;
    let translationWarning: string | null = null;
    if (selectedIds.length) {
      const translationRows = await db.select({
          id: menuProducts.id,
          name: menuProducts.name,
          wineCode: menuProducts.wineCode,
          sourceDescription: menuProducts.sourceDescription,
          descriptionPl: productContent.descriptionPl,
          country: productContent.country,
          region: productContent.region,
          wineStyle: productContent.wineStyle,
          tastingNotes: productContent.tastingNotes,
          autoTranslate: productContent.autoTranslate,
          translationSourceHash: productContent.translationSourceHash,
        }).from(menuProducts)
          .leftJoin(productContent, eq(menuProducts.id, productContent.productId))
          .where(inArray(menuProducts.dotykackaId, selectedIds));
      const candidates = translationRows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.descriptionPl,
          country: row.country,
          region: row.region,
          wineStyle: row.wineStyle,
          tastingNotes: row.tastingNotes,
          preserveName: Boolean(row.wineCode),
          currentHash: row.translationSourceHash,
          enabled: row.autoTranslate !== false,
        })).filter((row) => row.enabled && translationSourceHash(row) !== row.currentHash);
      const addonCandidates = Array.from(new Map(addonRows
        .filter((item) => !item.nameEn?.trim() || Boolean(item.descriptionPl?.trim() && !item.descriptionEn?.trim()))
        .map((item) => [item.addonDotykackaId, {
          id: item.addonDotykackaId,
          name: item.name,
          nameEn: item.nameEn,
          descriptionPl: item.descriptionPl,
          descriptionEn: item.descriptionEn,
        }])).values());
      if ((candidates.length || addonCandidates.length) && !translationConfigured()) {
        translationStatus = "not-configured";
        translationWarning = "Automatyczne tłumaczenie czeka na konfigurację DEEPL_API_KEY.";
      } else if (candidates.length || addonCandidates.length) try {
        const translations = await translateMenuContent(candidates);
        for (const translation of translations ?? []) {
          await db.update(productContent).set({
            nameEn: translation.nameEn,
            descriptionEn: translation.descriptionEn,
            countryEn: translation.countryEn,
            regionEn: translation.regionEn,
            wineStyleEn: translation.wineStyleEn,
            tastingNotesEn: translation.tastingNotesEn,
            translationSourceHash: translation.sourceHash,
            updatedAt: new Date(),
          }).where(eq(productContent.productId, translation.id));
        }
        productsTranslated = translations?.length ?? 0;
        const addonTranslationJobs = addonCandidates.flatMap((item) => [
          ...(!item.nameEn?.trim() ? [{ id: item.id, field: "nameEn" as const, text: item.name }] : []),
          ...(item.descriptionPl?.trim() && !item.descriptionEn?.trim() ? [{ id: item.id, field: "descriptionEn" as const, text: item.descriptionPl.trim() }] : []),
        ]);
        const translatedAddonTexts = await translatePolishTexts(addonTranslationJobs.map((job) => job.text));
        const translatedAddons = new Map<string, { nameEn?: string; descriptionEn?: string }>();
        addonTranslationJobs.forEach((job, index) => {
          const value = translatedAddonTexts?.[index];
          if (value) translatedAddons.set(job.id, { ...translatedAddons.get(job.id), [job.field]: value });
        });
        for (const item of addonCandidates) {
          const translated = translatedAddons.get(item.id);
          if (!translated) continue;
          await db.update(menuAddons).set({ ...translated, syncedAt: new Date() }).where(eq(menuAddons.addonDotykackaId, item.id));
          coffeeAddonsTranslated += 1;
        }
        translationStatus = "ok";
      } catch (error) {
        translationStatus = "error";
        translationWarning = `Automatyczne tłumaczenie nie powiodło się; kolejna synchronizacja ponowi próbę: ${error instanceof Error ? error.message : "nieznany błąd"}`;
      }
    }

    const wineProductsWithSales = selected.filter((product) => {
      const parsedCodes = parseProductCodes(product.plu);
      const code = parsedCodes.catalogCode?.startsWith("WIN") ? parsedCodes.catalogCode : legacyWineCode(product.name);
      return Boolean(code) && Number(salesByProduct.get(String(product.id)) ?? 0) > 0;
    }).length;
    await db.update(syncRuns).set({
      status: "success",
      productsSeen: products.length,
      productsImported: selected.length,
      error: [salesResult.warning, translationWarning].filter(Boolean).join(" ") || null,
      finishedAt: new Date(),
    }).where(eq(syncRuns.id, run.id));
    return {
      productsSeen: products.length,
      productsImported: selected.length,
      salesStatus: salesReport ? "ok" as const : salesResult.cached ? "cached" as const : config.branchId ? "error" as const : "not-configured" as const,
      salesProductsSeen: salesReport?.productSales?.length ?? 0,
      wineProductsWithSales,
      deliveryNotesSeen: deliveryNotes.length,
      deliveryNoteSupplierMatches: deliveryNoteMatches.size,
      coffeeAddonsImported: customizationResult.available ? addonRows.length : null,
      waiterEmployeesImported: employeeResult.available ? employeeResult.rows.length : null,
      waiterTablesImported: tableResult.available ? tableResult.rows.length : null,
      waiterExtraProductsImported: waiterExtraRows.length,
      salesSyncedAt: salesReport ? reportTo.toISOString() : latestSales?.syncedAt?.toISOString() ?? null,
      salesWarning: salesResult.warning,
      translationStatus,
      productsTranslated,
      coffeeAddonsTranslated,
      translationWarning,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown synchronization error";
    await db.update(syncRuns).set({ status: "failed", error: message, finishedAt: new Date() }).where(eq(syncRuns.id, run.id));
    throw error;
  }
}
