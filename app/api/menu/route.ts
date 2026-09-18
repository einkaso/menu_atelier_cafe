import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { menuAddons, menuCategories, menuGroupOrders, menuOfferSettings, menuProducts, productContent, suppliers } from "../../../db/schema";
import { categoryTranslations, sectionFor } from "../../../lib/menu-categories";
import { suggestProductGroup, translateProductGroup } from "../../../lib/product-order";
import { productImageUrl } from "../../../lib/image-import";
import { isAlternativeCoffeeBeanGroup, isCoffeeAddonGroup } from "../../../lib/coffee-addons";
import { hasTag, isShelfProduct, menuProductDestinations, menuProductIsAvailable, shelfHasPositiveStock } from "../../../lib/menu-tags";
import { productAttributesEn, productAttributesPl } from "../../../lib/translation";
import { isZeroAlcoholValue } from "../../../lib/wine-characteristics";

export const dynamic = "force-dynamic";
const APP_BUILD_VERSION = process.env.NEXT_PUBLIC_APP_BUILD_VERSION ?? "development";
const MENU_TAG = process.env.DOTYKACKA_MENU_TAG?.trim() || "MENU";
const CAPUCCINO_CAFE_SUPPLIER = "FONTANNA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ";
type PublicOffer = { kind: "glass" | "serving" | "bottle"; price: string; productId: number };

function normalizedSupplier(value: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pl");
}

function categoryKey(id: number | null) {
  return id ? `category-${id}` : "category-other";
}

function hasGlassName(name: string) {
  return /(?:^|[\s_\-/])kielisz(?:ek|ki)(?:$|[\s_\-/])/i.test(name);
}

function hasGlassTag(tags: string[]) {
  return tags.some((tag) => ["kieliszek", "na kieliszki", "by-glass"].includes(tag.trim().toLocaleLowerCase("pl")));
}

function isByGlass(tags: string[], name = "") {
  // Obowiązująca reguła: wariant kieliszkowy musi mieć zarówno właściwy dopisek
  // w nazwie, jak i tag. Sam tag nie może ujawnić historycznej pozycji POS.
  return hasGlassName(name) && hasGlassTag(tags);
}

function hasBottleTag(tags: string[]) {
  return tags.some((tag) => tag.trim().toLocaleLowerCase("pl") === "butelka");
}

function isSpiritPairingCode(value: string | null) {
  return Boolean(value && /^(?:WHI|BRA)\d{3}$/i.test(value.trim()));
}

function isPromo(tags: string[]) {
  return tags.some((tag) => tag.trim().toLocaleLowerCase("pl") === "promo");
}

const seasonTitles = {
  "LATO": { pl: "Lato w Atelier", en: "Summer at Atelier" },
  "JESIEŃ": { pl: "Jesień w Atelier", en: "Autumn at Atelier" },
  "ZIMA": { pl: "Zima w Atelier", en: "Winter at Atelier" },
  "WIOSNA": { pl: "Wiosna w Atelier", en: "Spring at Atelier" },
} as const;

function isAlcoholFree(tags: string[], licenseCodes: string[], name: string, style: string | null, alcoholPercentage?: string) {
  const text = [...tags, name, style ?? ""].join(" ").toLocaleLowerCase("pl");
  return licenseCodes.includes("0") || isZeroAlcoholValue(alcoholPercentage) || /(?:bezalkohol|alkoholfrei|alcohol.?free|(?:^|\s)0%)/.test(text);
}

function guestWineName(name: string) {
  return name
    .replace(/\bWIN\s*[-_]?\s*\d+\b/ig, "")
    .replace(/\s*[-—]\s*(?:(?:na\s+)?kielisz(?:ek|ki)|butelka|glass|bottle).*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function guestSpiritName(name: string) {
  return name
    .replace(/\s+50\s*ml\b/ig, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function price(value: string | null) {
  if (!value) return "";
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(number) : value;
}

export async function GET() {
  try {
    const db = getDb();
    const rows = await db.select({
      id: menuProducts.id,
      categoryId: menuCategories.id,
      category: menuCategories.name,
      categorySourceSortOrder: menuCategories.sortOrder,
      categoryShelfSortOrder: menuCategories.shelfSortOrder,
      name: menuProducts.name,
      wineCode: menuProducts.wineCode,
      catalogCode: menuProducts.catalogCode,
      sourceDescription: menuProducts.sourceDescription,
      price: menuProducts.priceWithVat,
      display: menuProducts.display,
      deleted: menuProducts.deleted,
      stockDeduct: menuProducts.stockDeduct,
      stockOverdraft: menuProducts.stockOverdraft,
      stockQuantity: menuProducts.stockQuantity,
      salesCount30d: menuProducts.salesCount30d,
      sourceSortOrder: menuProducts.sourceSortOrder,
      menuSortOrder: menuProducts.menuSortOrder,
      menuGroup: menuProducts.menuGroup,
      tags: menuProducts.tags,
      licenseCodes: menuProducts.licenseCodes,
      eanCodes: menuProducts.eanCodes,
      allergens: menuProducts.allergens,
      features: menuProducts.features,
      menuTagged: menuProducts.menuTagged,
      categoryDisplay: menuCategories.display,
      categoryShowCatalogCodes: menuCategories.showCatalogCodes,
      nameEn: productContent.nameEn,
      descriptionPl: productContent.descriptionPl,
      descriptionEn: productContent.descriptionEn,
      countryEn: productContent.countryEn,
      regionEn: productContent.regionEn,
      wineStyleEn: productContent.wineStyleEn,
      tastingNotesEn: productContent.tastingNotesEn,
      imagePath: productContent.imagePath,
      featured: productContent.featured,
      featuredSortOrder: productContent.featuredSortOrder,
      hideWhenOutOfStock: productContent.hideWhenOutOfStock,
      manualHidden: productContent.manualHidden,
      country: productContent.country,
      region: productContent.region,
      grapes: productContent.grapes,
      wineStyle: productContent.wineStyle,
      wineColor: productContent.wineColor,
      sparklingType: productContent.sparklingType,
      sweetness: productContent.sweetness,
      veganStatus: productContent.veganStatus,
      tastingNotes: productContent.tastingNotes,
      attributes: productContent.attributes,
      supplierName: suppliers.name,
    }).from(menuProducts)
      .leftJoin(menuCategories, eq(menuProducts.dotykackaCategoryId, menuCategories.dotykackaId))
      .leftJoin(productContent, eq(menuProducts.id, productContent.productId))
      .leftJoin(suppliers, eq(menuProducts.dotykackaSupplierId, suppliers.dotykackaId))
      .orderBy(sql`coalesce(${menuCategories.menuSortOrder}, ${menuCategories.sortOrder}, 2147483647)`, asc(menuProducts.name));
    const offerSetting = (await db.select().from(menuOfferSettings).where(eq(menuOfferSettings.key, "main")).limit(1))[0];
    const activeSeason = offerSetting?.season && offerSetting.season in seasonTitles
      ? offerSetting.season as keyof typeof seasonTitles
      : null;

    const salesByWineCode = new Map<string, number>();
    for (const item of rows) {
      if (!item.wineCode) continue;
      salesByWineCode.set(item.wineCode, (salesByWineCode.get(item.wineCode) ?? 0) + Number(item.salesCount30d ?? 0));
    }
    const individuallyVisibleRows = rows.filter((item) => {
      if (!item.menuTagged || !item.display || item.deleted || item.categoryDisplay === false || item.manualHidden) return false;
      return menuProductIsAvailable(item.tags, MENU_TAG, item.stockDeduct, item.stockOverdraft, item.stockQuantity);
    });
    const availableBottleKeys = new Set(individuallyVisibleRows
      .filter((item) => item.wineCode && !hasGlassName(item.name))
      .map((item) => `${item.categoryId ?? "other"}:${item.wineCode}`));
    const visibleRows = individuallyVisibleRows.filter((item) => sectionFor(item.category) !== "wine" || !hasGlassName(item.name)
      || Boolean(isByGlass(item.tags, item.name) && item.wineCode
        && availableBottleKeys.has(`${item.categoryId ?? "other"}:${item.wineCode}`)));
    const savedGroupRows = await db.select({ categoryId: menuGroupOrders.categoryId, groupName: menuGroupOrders.groupName, sortOrder: menuGroupOrders.sortOrder })
      .from(menuGroupOrders);
    const savedGroupOrder = new Map(savedGroupRows.map((group) => [`${group.categoryId}:${group.groupName}`, group.sortOrder]));
    const groupOrder = new Map<string, number>();
    for (const item of visibleRows) {
      const suggestion = suggestProductGroup(item.category, item.name);
      const group = suggestion?.pl === "Kawy alternatywne" ? suggestion.pl : item.menuGroup || suggestion?.pl || "";
      const key = `${item.categoryId ?? "other"}:${group}`;
      const value = savedGroupOrder.get(key) ?? item.menuSortOrder ?? suggestion?.rank ?? 9999;
      groupOrder.set(key, Math.min(groupOrder.get(key) ?? value, value));
    }
    const orderedRows = [...visibleRows].sort((a, b) => {
      if (a.categoryId !== b.categoryId) return 0;
      const aSuggestion = suggestProductGroup(a.category, a.name);
      const bSuggestion = suggestProductGroup(b.category, b.name);
      const aGroup = aSuggestion?.pl === "Kawy alternatywne" ? aSuggestion.pl : a.menuGroup || aSuggestion?.pl || "";
      const bGroup = bSuggestion?.pl === "Kawy alternatywne" ? bSuggestion.pl : b.menuGroup || bSuggestion?.pl || "";
      const aGroupOrder = groupOrder.get(`${a.categoryId ?? "other"}:${aGroup}`) ?? 9999;
      const bGroupOrder = groupOrder.get(`${b.categoryId ?? "other"}:${bGroup}`) ?? 9999;
      if (aGroup !== bGroup && aGroupOrder !== bGroupOrder) return aGroupOrder - bGroupOrder;
      return (a.menuSortOrder ?? a.sourceSortOrder ?? 9999) - (b.menuSortOrder ?? b.sourceSortOrder ?? 9999) || a.name.localeCompare(b.name, "pl");
    });
    const shelfRows = orderedRows.filter((item) => isShelfProduct(item.tags) && shelfHasPositiveStock(item.stockQuantity));
    const categories = Array.from(new Map(orderedRows.filter((item) => hasTag(item.tags, MENU_TAG)).map((item) => {
      const visualKind = sectionFor(item.category);
      const id = categoryKey(item.categoryId);
      return [id, {
        id,
        pl: item.category || "Pozostałe",
        en: item.category ? (categoryTranslations[visualKind] ?? item.category) : "Other",
        visualKind,
      }] as const;
    })).values());
    const virtualCategories: Array<{ id: string; pl: string; en: string; visualKind: string }> = [];
    const standardMenuRows = visibleRows.filter((item) => hasTag(item.tags, MENU_TAG));
    if (activeSeason && standardMenuRows.some((item) => hasTag(item.tags, activeSeason.toLocaleLowerCase("pl")))) {
      virtualCategories.push({ id: "seasonal-offer", ...seasonTitles[activeSeason], visualKind: "seasonal" });
    }
    if (offerSetting?.specialEnabled && offerSetting.specialNamePl?.trim()
      && standardMenuRows.some((item) => hasTag(item.tags, "specjal"))) {
      virtualCategories.push({
        id: "special-offer",
        pl: offerSetting.specialNamePl.trim(),
        en: offerSetting.specialNameEn?.trim() || offerSetting.specialNamePl.trim(),
        visualKind: "special",
      });
    }
    categories.unshift(...virtualCategories);
    const rawProducts = orderedRows.map((item) => {
      const byGlass = isByGlass(item.tags, item.name);
      const shelfProduct = isShelfProduct(item.tags);
      const destinations = menuProductDestinations(item.tags, MENU_TAG, item.stockQuantity);
      const standardMenuProduct = destinations.regular;
      const shelfVisible = destinations.shelf;
      const visualKind = sectionFor(item.category);
      const whiskyBottle = visualKind === "whisky" && hasBottleTag(item.tags);
      const offers: PublicOffer[] | undefined = visualKind === "wine"
        ? [{ kind: byGlass ? "glass" : "bottle", price: price(item.price), productId: item.id }]
        : visualKind === "whisky"
          ? [{ kind: whiskyBottle ? "bottle" : "serving", price: price(item.price), productId: item.id }]
          : undefined;
      const suggestedGroup = suggestProductGroup(item.category, item.name);
      const groupPl = suggestedGroup?.pl === "Kawy alternatywne" ? suggestedGroup.pl : item.menuGroup || suggestedGroup?.pl || undefined;
      const alcoholFree = isAlcoholFree(item.tags, item.licenseCodes, item.name, item.wineStyle, item.attributes?.alcoholPercentage);
      const publicAttributes = productAttributesPl(item.attributes);
      const publicAttributesEn = productAttributesEn(item.attributes);
      delete publicAttributes.volume;
      delete publicAttributesEn.volume;
      const extraCategories = standardMenuProduct ? [
        ...(alcoholFree && categoryKey(item.categoryId) !== "zero" ? ["zero"] : []),
        ...(activeSeason && hasTag(item.tags, activeSeason.toLocaleLowerCase("pl")) ? ["seasonal-offer"] : []),
        ...(offerSetting?.specialEnabled && offerSetting.specialNamePl?.trim() && hasTag(item.tags, "specjal") ? ["special-offer"] : []),
        ...(shelfVisible ? ["shelf"] : []),
      ] : [];
      return {
      id: item.id,
      category: standardMenuProduct ? categoryKey(item.categoryId) : "shelf",
      sourceCategory: item.category,
      sourceCategoryEn: item.category ? (shelfProduct ? item.category : categoryTranslations[visualKind] ?? item.category) : "Other",
      shelfGroupOrder: item.categoryShelfSortOrder ?? item.categorySourceSortOrder ?? 2147483647,
      visualKind,
      pl: visualKind === "wine" ? guestWineName(item.name) : visualKind === "whisky" ? guestSpiritName(item.name) : item.name,
      en: visualKind === "wine" ? guestWineName(item.nameEn || item.name) : visualKind === "whisky" ? guestSpiritName(item.nameEn || item.name) : item.nameEn || item.name,
      descPl: visualKind === "tea" ? item.sourceDescription || item.descriptionPl || "" : item.descriptionPl || "",
      descEn: item.descriptionEn || (visualKind === "tea" ? item.sourceDescription : item.descriptionPl) || "",
      price: price(item.price),
      wineCode: item.wineCode || undefined,
      productCode: (item.categoryShowCatalogCodes ?? (visualKind === "wine")) ? item.catalogCode || undefined : undefined,
      wine: visualKind === "wine",
      whisky: visualKind === "whisky",
      cakePartner: visualKind === "cakes" && normalizedSupplier(item.supplierName) === CAPUCCINO_CAFE_SUPPLIER ? "capuccino-cafe" as const : undefined,
      spiritCode: visualKind === "whisky" && isSpiritPairingCode(item.catalogCode) ? item.catalogCode || undefined : undefined,
      salesCount30d: item.wineCode ? salesByWineCode.get(item.wineCode) ?? 0 : Number(item.salesCount30d ?? 0),
      groupPl,
      groupEn: groupPl ? translateProductGroup(groupPl) : undefined,
      extraCategories,
      zeroGroupPl: item.category || "Pozostałe",
      zeroGroupEn: item.category ? (categoryTranslations[visualKind] ?? item.category) : "Other",
      allergens: (item.allergens ?? []).map(Number).filter((id) => Number.isInteger(id) && id >= 1 && id <= 14),
      guestChoice: false,
      country: item.country || undefined,
      countryEn: item.countryEn || item.country || undefined,
      region: item.region || undefined,
      regionEn: item.regionEn || item.region || undefined,
      kind: item.wineColor || undefined,
      kindEn: item.wineColor || undefined,
      taste: item.sweetness || item.wineStyle || undefined,
      tasteEn: item.sweetness || item.wineStyleEn || item.wineStyle || undefined,
      wineStyle: item.wineStyle || undefined,
      wineStyleEn: item.wineStyleEn || item.wineStyle || undefined,
      wineColor: item.wineColor || undefined,
      sparklingType: item.sparklingType || undefined,
      sweetness: item.sweetness || undefined,
      grapes: item.grapes || undefined,
      image: productImageUrl(item.imagePath) || undefined,
      featured: standardMenuProduct ? item.featured || isPromo(item.tags) || undefined : undefined,
      promo: standardMenuProduct ? isPromo(item.tags) : false,
      promoOrder: item.featuredSortOrder ?? 2147483647,
      tastingNotes: item.tastingNotes || undefined,
      tastingNotesEn: item.tastingNotesEn || item.tastingNotes || undefined,
      attributes: publicAttributes,
      attributesEn: publicAttributesEn,
      takeHome: hasTag(item.tags, "ziarno"),
      byGlass,
      vegan: item.veganStatus === "YES" || item.features.some((feature) => feature.toLocaleLowerCase("pl") === "vegan"),
      veganStatus: item.veganStatus,
      alcoholFree,
      offers,
    };
    });

    const groupedProducts = new Map<string, (typeof rawProducts)[number]>();
    for (const product of rawProducts) {
      const groupingCode = product.wineCode || product.spiritCode;
      if (!groupingCode) {
        groupedProducts.set(`product-${product.id}`, product);
        continue;
      }
      const key = `${product.category}:${product.visualKind}:${groupingCode}`;
      const current = groupedProducts.get(key);
      if (!current) {
        groupedProducts.set(key, product);
        continue;
      }
      const offers = [...(current.offers ?? []), ...(product.offers ?? [])]
        .filter((offer, index, all) => all.findIndex((candidate) => candidate.kind === offer.kind) === index)
        .sort((a, b) => ["glass", "serving", "bottle"].indexOf(a.kind) - ["glass", "serving", "bottle"].indexOf(b.kind));
      const currentIsOnlyGlass = current.byGlass && !(current.offers ?? []).some((offer) => offer.kind === "bottle");
      const currentIsOnlySpiritServing = current.whisky && (current.offers ?? []).some((offer) => offer.kind === "serving") && !(current.offers ?? []).some((offer) => offer.kind === "bottle");
      const productHasBottle = (product.offers ?? []).some((offer) => offer.kind === "bottle");
      const primary = currentIsOnlyGlass && !product.byGlass || currentIsOnlySpiritServing && productHasBottle ? product : current;
      const secondary = primary === current ? product : current;
      groupedProducts.set(key, {
        ...primary,
        id: Math.min(current.id, product.id),
        descPl: primary.descPl || secondary.descPl,
        descEn: primary.descEn || secondary.descEn,
        image: primary.image || secondary.image,
        country: primary.country || secondary.country,
        countryEn: primary.countryEn || secondary.countryEn,
        region: primary.region || secondary.region,
        regionEn: primary.regionEn || secondary.regionEn,
        grapes: primary.grapes || secondary.grapes,
        kind: primary.kind || secondary.kind,
        taste: primary.taste || secondary.taste,
        wineStyle: primary.wineStyle || secondary.wineStyle,
        wineStyleEn: primary.wineStyleEn || secondary.wineStyleEn,
        wineColor: primary.wineColor || secondary.wineColor,
        sparklingType: primary.sparklingType || secondary.sparklingType,
        sweetness: primary.sweetness || secondary.sweetness,
        tastingNotes: primary.tastingNotes || secondary.tastingNotes,
        tastingNotesEn: primary.tastingNotesEn || secondary.tastingNotesEn,
        attributes: { ...(secondary.attributes ?? {}), ...(primary.attributes ?? {}) },
        attributesEn: { ...(secondary.attributesEn ?? {}), ...(primary.attributesEn ?? {}) },
        featured: current.featured || product.featured,
        promo: current.promo || product.promo,
        promoOrder: Math.min(current.promoOrder, product.promoOrder),
        vegan: current.vegan || product.vegan,
        alcoholFree: current.alcoholFree || product.alcoholFree,
        extraCategories: Array.from(new Set([...current.extraCategories, ...product.extraCategories])),
        allergens: Array.from(new Set([...current.allergens, ...product.allergens])).sort((a, b) => a - b),
        salesCount30d: Math.max(current.salesCount30d, product.salesCount30d),
        byGlass: offers.some((offer) => offer.kind === "glass"),
        offers,
        price: offers.map((offer) => offer.price).filter(Boolean).join(" / "),
      });
    }
    const products = Array.from(groupedProducts.values());
    if (products.some((product) => product.alcoholFree) && !categories.some((category) => category.id === "zero")) {
      categories.push({ id: "zero", pl: "Strefa 0%", en: "Alcohol-free", visualKind: "zero" });
    }
    if (shelfRows.length) categories.push({ id: "shelf", pl: "Z PÓŁKI", en: "From the shelf", visualKind: "shelf" });
    const guestChoiceIds = new Set(products
      .filter((product) => product.wine && product.salesCount30d > 0)
      .sort((a, b) => b.salesCount30d - a.salesCount30d)
      .slice(0, 3)
      .map((product) => product.id));
    for (const product of products) product.guestChoice = guestChoiceIds.has(product.id);

    const addonRows = await db.select().from(menuAddons).orderBy(asc(menuAddons.sortOrder), asc(menuAddons.name));
    const coffeeOptions = Array.from(new Map(addonRows.filter((item) => isCoffeeAddonGroup(item.groupName)).map((item) => [item.addonDotykackaId, {
      id: item.addonDotykackaId,
      pl: item.name,
      en: item.nameEn || item.name,
      price: price(item.priceWithVat),
      currency: item.currency,
      group: item.groupName,
    }])).values());

    const alternativeCoffeeBeans = Array.from(new Map(addonRows.filter((item) => isAlternativeCoffeeBeanGroup(item.groupName)).map((item) => [item.addonDotykackaId, {
      id: item.addonDotykackaId,
      pl: item.name,
      en: item.nameEn || item.name,
      descriptionPl: item.descriptionPl || "",
      descriptionEn: item.descriptionEn || item.descriptionPl || "",
    }])).values());

    return Response.json({ appVersion: APP_BUILD_VERSION, categories, products, coffeeOptions, alternativeCoffeeBeans, source: "dotykacka" }, {
      headers: { "cache-control": "no-store", "x-menu-build-version": APP_BUILD_VERSION },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Menu jest chwilowo niedostępne.";
    return Response.json({ error: message }, { status: 503 });
  }
}
