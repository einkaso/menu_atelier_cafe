import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { menuAddons, menuCategories, menuProducts, productContent, waiterExtraProducts, waiterSurveyQuestions, waiterTables } from "../../../../db/schema";
import { productImageUrl } from "../../../../lib/image-import";
import { currentWaiter } from "../../../../lib/waiter-auth";
import { isAlternativeCoffeeBeanGroup, isAlternativeCoffeeMethod, isCoffeeAddonGroup } from "../../../../lib/coffee-addons";
import { acceptsFlavorSyrup, FLAVOR_SYRUP_GROUP, isForestLifeSyrupCategory, isGenericFlavorSyrupOption } from "../../../../lib/flavor-syrups";
import { isWholeVodkaBottleName } from "../../../../lib/alcohol-sale-warning";
import { menuProductIsAvailable, regularProductStockIsAvailable } from "../../../../lib/menu-tags";
import { sectionFor } from "../../../../lib/menu-categories";
import { isZeroAlcoholValue } from "../../../../lib/wine-characteristics";

export const dynamic = "force-dynamic";
const MENU_TAG = process.env.DOTYKACKA_MENU_TAG?.trim() || "MENU";

function hasGlassName(name: string) {
  return /(?:^|[\s_\-/])kielisz(?:ek|ki)(?:$|[\s_\-/])/i.test(name);
}

function hasGlassTag(tags: string[]) {
  return tags.some((tag) => ["kieliszek", "na kieliszki", "by-glass"].includes(tag.trim().toLocaleLowerCase("pl")));
}

function isByGlass(tags: string[], name: string) {
  return hasGlassName(name) && hasGlassTag(tags);
}

function hasBottleTag(tags: string[]) {
  return tags.some((tag) => tag.trim().toLocaleLowerCase("pl") === "butelka");
}

function isDraughtBeer(name: string) {
  return /(?:bosman|guin+ess)[_\s-]*(?:duże|duze|małe|male)\b/i.test(name);
}

function isAlcoholFree(tags: string[], licenseCodes: string[], name: string, wineStyle: string | null, alcoholPercentage?: string) {
  const text = [...tags, name, wineStyle ?? ""].join(" ").toLocaleLowerCase("pl");
  return licenseCodes.includes("0") || isZeroAlcoholValue(alcoholPercentage) || /(?:bezalkohol|alkoholfrei|alcohol.?free|(?:^|\s)0%)/.test(text);
}

export async function GET(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja kelnera wygasła." }, { status: 401 });
  const db = getDb();
  const [products, extraProducts, tables, surveyQuestions, addons] = await Promise.all([
    db.select({
      id: menuProducts.id,
      dotykackaId: menuProducts.dotykackaId,
      name: menuProducts.name,
      wineCode: menuProducts.wineCode,
      category: menuCategories.name,
      categoryId: menuCategories.id,
      categoryOrder: menuCategories.menuSortOrder,
      categorySourceOrder: menuCategories.sortOrder,
      productOrder: menuProducts.menuSortOrder,
      sourceOrder: menuProducts.sourceSortOrder,
      price: menuProducts.priceWithVat,
      currency: menuProducts.currency,
      stockDeduct: menuProducts.stockDeduct,
      stockOverdraft: menuProducts.stockOverdraft,
      stockQuantity: menuProducts.stockQuantity,
      tags: menuProducts.tags,
      licenseCodes: menuProducts.licenseCodes,
      imagePath: productContent.imagePath,
      country: productContent.country,
      wineStyle: productContent.wineStyle,
      wineColor: productContent.wineColor,
      sparklingType: productContent.sparklingType,
      sweetness: productContent.sweetness,
      veganStatus: productContent.veganStatus,
      attributes: productContent.attributes,
      staffInstructions: productContent.staffInstructions,
      staffMedia: productContent.staffMedia,
    }).from(menuProducts)
      .innerJoin(menuCategories, eq(menuProducts.dotykackaCategoryId, menuCategories.dotykackaId))
      .leftJoin(productContent, eq(menuProducts.id, productContent.productId))
      .where(and(
        eq(menuProducts.menuTagged, true), eq(menuProducts.display, true), eq(menuProducts.deleted, false),
        eq(menuCategories.display, true), sql`coalesce(${productContent.manualHidden}, false) = false`,
      )).orderBy(sql`coalesce(${menuCategories.menuSortOrder}, ${menuCategories.sortOrder}, 2147483647)`, asc(menuCategories.name), sql`coalesce(${menuProducts.menuSortOrder}, ${menuProducts.sourceSortOrder}, 2147483647)`, asc(menuProducts.name)),
    db.select({
      id: waiterExtraProducts.id,
      dotykackaId: waiterExtraProducts.dotykackaId,
      name: waiterExtraProducts.name,
      category: waiterExtraProducts.category,
      categoryOrder: waiterExtraProducts.categorySortOrder,
      productOrder: waiterExtraProducts.productSortOrder,
      price: waiterExtraProducts.priceWithVat,
      currency: waiterExtraProducts.currency,
      stockDeduct: waiterExtraProducts.stockDeduct,
      stockOverdraft: waiterExtraProducts.stockOverdraft,
      stockQuantity: waiterExtraProducts.stockQuantity,
    }).from(waiterExtraProducts)
      .orderBy(sql`coalesce(${waiterExtraProducts.categorySortOrder}, 2147483647)`, asc(waiterExtraProducts.category), sql`coalesce(${waiterExtraProducts.productSortOrder}, 2147483647)`, asc(waiterExtraProducts.name)),
    db.select({ dotykackaId: waiterTables.dotykackaId, name: waiterTables.name })
      .from(waiterTables).where(and(eq(waiterTables.display, true), eq(waiterTables.deleted, false))).orderBy(asc(waiterTables.name)),
    db.select({ id: waiterSurveyQuestions.id, prompt: waiterSurveyQuestions.prompt, kind: waiterSurveyQuestions.kind, options: waiterSurveyQuestions.options, required: waiterSurveyQuestions.required })
      .from(waiterSurveyQuestions).where(eq(waiterSurveyQuestions.active, true)).orderBy(asc(waiterSurveyQuestions.sortOrder), asc(waiterSurveyQuestions.id)),
    db.select({ parentId: menuAddons.parentDotykackaId, id: menuAddons.addonDotykackaId, groupName: menuAddons.groupName, name: menuAddons.name, price: menuAddons.priceWithVat, currency: menuAddons.currency, sortOrder: menuAddons.sortOrder })
      .from(menuAddons).orderBy(asc(menuAddons.sortOrder), asc(menuAddons.name)),
  ]);
  const addonGroupsByProduct = new Map<string, Map<string, { name: string; required: boolean; multiple: boolean; options: Array<{ id: string; name: string; price: string | null; currency: string }> }>>();
  for (const addon of addons) {
    const groupName = addon.groupName?.trim() || "Dodatki";
    const groups = addonGroupsByProduct.get(addon.parentId) ?? new Map();
    const group = groups.get(groupName) ?? { name: groupName, required: isAlternativeCoffeeBeanGroup(groupName), multiple: isCoffeeAddonGroup(groupName), options: [] };
    group.options.push({ id: addon.id, name: addon.name, price: addon.price, currency: addon.currency });
    groups.set(groupName, group); addonGroupsByProduct.set(addon.parentId, groups);
  }
  const sharedOptions = (matches: (name: string | null) => boolean) => Array.from(new Map(addons
    .filter((addon) => matches(addon.groupName))
    .map((addon) => [addon.id, { id: addon.id, name: addon.name, price: addon.price, currency: addon.currency }])).values());
  const sharedBeanOptions = sharedOptions(isAlternativeCoffeeBeanGroup);
  const sharedCoffeeAddons = sharedOptions(isCoffeeAddonGroup);
  const genericSyrupAddon = addons.find((addon) => isGenericFlavorSyrupOption(addon.name));
  const flavorSyrupOptions = genericSyrupAddon ? Array.from(new Map([...products, ...extraProducts]
    .filter((product) => isForestLifeSyrupCategory(product.category) && Number(product.stockQuantity ?? 0) > 0)
    .map((product) => [product.dotykackaId, { id: `syrup-flavor:${product.dotykackaId}`, name: product.name, price: genericSyrupAddon.price, currency: genericSyrupAddon.currency }])).values()) : [];
  const addonGroupsFor = (product: { dotykackaId: string; name: string; category: string }) => {
    const direct = Array.from(addonGroupsByProduct.get(product.dotykackaId)?.values() ?? []);
    const baseGroups = !isAlternativeCoffeeMethod(product.name) ? direct : (() => {
      const beans = direct.filter((group) => isAlternativeCoffeeBeanGroup(group.name));
      const additions = direct.filter((group) => isCoffeeAddonGroup(group.name));
      const other = direct.filter((group) => !isAlternativeCoffeeBeanGroup(group.name) && !isCoffeeAddonGroup(group.name));
      return [
      ...(beans.length ? beans : sharedBeanOptions.length ? [{ name: "ZIARNA DO KAW ALTERNATYWNYCH", required: true, multiple: false, options: sharedBeanOptions }] : []),
      ...other,
      ...(additions.length ? additions : sharedCoffeeAddons.length ? [{ name: "DODATKI DO KAWY", required: false, multiple: true, options: sharedCoffeeAddons }] : []),
      ];
    })();
    if (!flavorSyrupOptions.length || !acceptsFlavorSyrup(product.category, product.name)) return baseGroups;
    const withoutGenericSyrup = baseGroups.map((group) => ({
      ...group,
      options: group.options.filter((option) => !isGenericFlavorSyrupOption(option.name)),
    })).filter((group) => group.options.length > 0);
    return [...withoutGenericSyrup, { name: FLAVOR_SYRUP_GROUP, required: false, multiple: false, options: flavorSyrupOptions }];
  };
  const availableProducts = products.filter((product) => menuProductIsAvailable(
    product.tags, MENU_TAG, product.stockDeduct, product.stockOverdraft, product.stockQuantity,
  ));
  const wineDetailsByCode = new Map<string, (typeof availableProducts)[number]>();
  for (const product of availableProducts) {
    if (!product.wineCode || sectionFor(product.category) !== "wine") continue;
    const current = wineDetailsByCode.get(product.wineCode);
    if (!current || !isByGlass(product.tags, product.name)) wineDetailsByCode.set(product.wineCode, product);
  }
  return Response.json({
    employee,
    tables,
    products: [...availableProducts.map((product) => {
      const kind = sectionFor(product.category);
      const pairedWine = product.wineCode ? wineDetailsByCode.get(product.wineCode) : undefined;
      const attributes = product.attributes ?? pairedWine?.attributes ?? {};
      const licenseCodes = Array.from(new Set([...product.licenseCodes, ...(pairedWine?.licenseCodes ?? [])]));
      const serving = kind === "wine" ? (isByGlass(product.tags, product.name) ? "glass" : "bottle")
        : kind === "whisky" ? (hasBottleTag(product.tags) ? "bottle" : "serving")
          : kind === "beer" ? (isDraughtBeer(product.name) ? "draught" : "bottle")
            : kind === "cocktails" && isWholeVodkaBottleName(product.name) ? "bottle" : null;
      return {
        ...product,
        kind,
        serving,
        country: product.country ?? pairedWine?.country ?? null,
        wineStyle: product.wineStyle ?? pairedWine?.wineStyle ?? null,
        wineColor: product.wineColor ?? pairedWine?.wineColor ?? null,
        sparklingType: product.sparklingType ?? pairedWine?.sparklingType ?? null,
        sweetness: product.sweetness ?? pairedWine?.sweetness ?? null,
        vegan: (product.veganStatus ?? pairedWine?.veganStatus) === "YES",
        alcoholFree: isAlcoholFree(product.tags, licenseCodes, product.name, product.wineStyle ?? pairedWine?.wineStyle ?? null, attributes.alcoholPercentage),
        attributes,
        outsideMenu: false,
        image: productImageUrl(product.imagePath),
        staffManual: product.staffInstructions?.trim() || product.staffMedia?.length ? {
          instructions: product.staffInstructions?.trim() ?? "",
          media: product.staffMedia ?? [],
        } : null,
        addonGroups: addonGroupsFor(product),
      };
    }), ...extraProducts.filter((product) => regularProductStockIsAvailable(
      product.stockDeduct, product.stockOverdraft, product.stockQuantity,
    )).map((product) => ({ ...product, kind: "other", serving: null, country: null, wineStyle: null, wineColor: null, sparklingType: null, sweetness: null, veganStatus: "UNKNOWN", vegan: false, alcoholFree: false, attributes: {}, outsideMenu: true, image: null, staffManual: null, addonGroups: [] }))],
    surveyQuestions,
    posActionsEnabled: process.env.WAITER_POS_ACTIONS_ENABLED === "true",
  });
}
