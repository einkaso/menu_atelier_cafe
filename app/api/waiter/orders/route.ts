import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { menuAddons, menuCategories, menuProducts, waiterExtraProducts, waiterOrders, waiterSurveyQuestions, waiterTables } from "../../../../db/schema";
import { currentWaiter, waiterCookie } from "../../../../lib/waiter-auth";
import { isAlternativeCoffeeBeanGroup, isAlternativeCoffeeMethod, isCoffeeAddonGroup } from "../../../../lib/coffee-addons";
import { acceptsFlavorSyrup, isForestLifeSyrupCategory, isGenericFlavorSyrupOption, isLemonadeProduct } from "../../../../lib/flavor-syrups";
import { menuProductIsAvailable, productTakeawayAvailable, productTemperatures, regularProductStockIsAvailable, type ServingTemperature } from "../../../../lib/menu-tags";
import { DotykackaClient } from "../../../../lib/dotykacka/client";
import { getDotykackaConfig } from "../../../../lib/dotykacka/config";

const MENU_TAG = process.env.DOTYKACKA_MENU_TAG?.trim() || "MENU";

type OrderInput = { tableId?: unknown; guestCount?: unknown; note?: unknown; items?: unknown; surveyAnswers?: unknown };
type ItemInput = { productId?: unknown; quantity?: unknown; note?: unknown; temperature?: unknown; takeaway?: unknown; customizations?: unknown };

function requestedTemperature(value: unknown): ServingTemperature | null {
  return value === "warm" || value === "cold" ? value : null;
}

function temperatureOptionsFor<T extends object>(product: T) {
  const tags = "tags" in product && Array.isArray(product.tags) ? product.tags as string[] : [];
  return productTemperatures(tags);
}

function takeawayAvailableFor<T extends object>(product: T) {
  const tags = "tags" in product && Array.isArray(product.tags) ? product.tags as string[] : [];
  return productTakeawayAvailable(tags);
}

function clearCookie(response: Response) {
  response.headers.append("Set-Cookie", `${waiterCookie.name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response;
}

export async function POST(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja kelnera wygasła." }, { status: 401 });
  if (process.env.WAITER_POS_ACTIONS_ENABLED !== "true") return Response.json({ error: "Wysyłanie do POS jest jeszcze zablokowane do czasu testu integracyjnego." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as OrderInput;
  const tableId = typeof body.tableId === "string" ? body.tableId : "";
  const guestCount = Number(body.guestCount);
  const items = Array.isArray(body.items) ? body.items as ItemInput[] : [];
  if (!tableId || !Number.isInteger(guestCount) || guestCount < 1 || guestCount > 30 || !items.length || items.length > 100) {
    return Response.json({ error: "Uzupełnij stolik, liczbę gości i pozycje zamówienia." }, { status: 400 });
  }
  if (items.some((item) => typeof item.productId !== "string" || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 99)) {
    return Response.json({ error: "Zamówienie zawiera nieprawidłową pozycję lub ilość." }, { status: 400 });
  }
  const productIds = [...new Set(items.map((item) => String(item.productId)))];
  const db = getDb();
  const [table, products, extraProducts, questions, allowedAddons, syrupFlavorProducts, menuSyrupFlavorProducts] = await Promise.all([
    db.select({ id: waiterTables.dotykackaId }).from(waiterTables).where(and(eq(waiterTables.dotykackaId, tableId), eq(waiterTables.display, true), eq(waiterTables.deleted, false))).limit(1),
    db.select({
      id: menuProducts.id, dotykackaId: menuProducts.dotykackaId, name: menuProducts.name, category: menuCategories.name, price: menuProducts.priceWithVat,
      tags: menuProducts.tags, stockDeduct: menuProducts.stockDeduct, stockOverdraft: menuProducts.stockOverdraft, stockQuantity: menuProducts.stockQuantity,
    }).from(menuProducts).innerJoin(menuCategories, eq(menuProducts.dotykackaCategoryId, menuCategories.dotykackaId)).where(and(inArray(menuProducts.dotykackaId, productIds), eq(menuProducts.menuTagged, true), eq(menuProducts.deleted, false))),
    db.select({
      id: waiterExtraProducts.id, dotykackaId: waiterExtraProducts.dotykackaId, name: waiterExtraProducts.name, category: waiterExtraProducts.category, price: waiterExtraProducts.priceWithVat,
      stockDeduct: waiterExtraProducts.stockDeduct, stockOverdraft: waiterExtraProducts.stockOverdraft, stockQuantity: waiterExtraProducts.stockQuantity,
    }).from(waiterExtraProducts).where(inArray(waiterExtraProducts.dotykackaId, productIds)),
    db.select({ id: waiterSurveyQuestions.id, prompt: waiterSurveyQuestions.prompt, options: waiterSurveyQuestions.options, required: waiterSurveyQuestions.required }).from(waiterSurveyQuestions).where(eq(waiterSurveyQuestions.active, true)),
    db.select({ parentId: menuAddons.parentDotykackaId, customizationId: menuAddons.customizationDotykackaId, productId: menuAddons.addonDotykackaId, groupName: menuAddons.groupName, name: menuAddons.name, price: menuAddons.priceWithVat }).from(menuAddons),
    db.select({ dotykackaId: waiterExtraProducts.dotykackaId, name: waiterExtraProducts.name, category: waiterExtraProducts.category, stockQuantity: waiterExtraProducts.stockQuantity }).from(waiterExtraProducts),
    db.select({ dotykackaId: menuProducts.dotykackaId, name: menuProducts.name, category: menuCategories.name, stockQuantity: menuProducts.stockQuantity })
      .from(menuProducts).innerJoin(menuCategories, eq(menuProducts.dotykackaCategoryId, menuCategories.dotykackaId))
      .where(and(eq(menuProducts.menuTagged, true), eq(menuProducts.display, true), eq(menuProducts.deleted, false))),
  ]);
  const availableProducts = [...products.filter((product) => menuProductIsAvailable(
    product.tags, MENU_TAG, product.stockDeduct, product.stockOverdraft, product.stockQuantity,
  )), ...extraProducts.filter((product) => regularProductStockIsAvailable(
    product.stockDeduct, product.stockOverdraft, product.stockQuantity,
  ))];
  if (!table[0] || availableProducts.length !== productIds.length) return Response.json({ error: "Stolik lub produkt nie jest już dostępny. Odśwież zamówienie." }, { status: 409 });
  const byId = new Map(availableProducts.map((product) => [product.dotykackaId, product]));
  const allowedByParent = new Map<string, Map<string, (typeof allowedAddons)[number]>>();
  for (const addon of allowedAddons) {
    const parent = allowedByParent.get(addon.parentId) ?? new Map();
    parent.set(addon.productId, addon); allowedByParent.set(addon.parentId, parent);
  }
  const sharedBeans = new Map(allowedAddons.filter((addon) => isAlternativeCoffeeBeanGroup(addon.groupName)).map((addon) => [addon.productId, addon]));
  const sharedCoffeeAddons = new Map(allowedAddons.filter((addon) => isCoffeeAddonGroup(addon.groupName)).map((addon) => [addon.productId, addon]));
  const genericSyrupAddon = allowedAddons.find((addon) => isGenericFlavorSyrupOption(addon.name));
  const availableSyrupFlavors = new Map([...syrupFlavorProducts, ...menuSyrupFlavorProducts]
    .filter((product) => isForestLifeSyrupCategory(product.category) && Number(product.stockQuantity ?? 0) > 0)
    .map((product) => [`syrup-flavor:${product.dotykackaId}`, product]));
  const selectionsFor = (productId: string, requestedIds: string[]) => {
    const direct = allowedByParent.get(productId) ?? new Map();
    const product = byId.get(productId);
    const alternative = isAlternativeCoffeeMethod(product?.name);
    const hasDirectBeans = Array.from(direct.values()).some((addon) => isAlternativeCoffeeBeanGroup(addon.groupName));
    const hasDirectCoffeeAddons = Array.from(direct.values()).some((addon) => isCoffeeAddonGroup(addon.groupName));
    return requestedIds.map((id) => {
      const syrupFlavor = availableSyrupFlavors.get(id);
      if (syrupFlavor && genericSyrupAddon && acceptsFlavorSyrup(product?.category, product?.name)) {
        const directSyrupAddon = Array.from(direct.values()).find((addon) => isGenericFlavorSyrupOption(addon.name));
        const syrupAddon = directSyrupAddon ?? genericSyrupAddon;
        const includedInLemonade = isLemonadeProduct(product?.name);
        return { addon: includedInLemonade ? { ...syrupAddon, price: "0" } : syrupAddon, fallback: includedInLemonade || !directSyrupAddon ? "syrup" as const : null, flavorName: syrupFlavor.name, includedInLemonade };
      }
      const native = direct.get(id);
      if (native) return { addon: native, fallback: null as "bean" | "addition" | "syrup" | null, flavorName: null };
      if (alternative && !hasDirectBeans && sharedBeans.has(id)) return { addon: sharedBeans.get(id)!, fallback: "bean" as const };
      if (alternative && !hasDirectCoffeeAddons && sharedCoffeeAddons.has(id)) return { addon: sharedCoffeeAddons.get(id)!, fallback: "addition" as const };
      return null;
    });
  };
  for (const item of items) {
    const productId = String(item.productId);
    const product = byId.get(productId)!;
    const temperatureOptions = temperatureOptionsFor(product);
    const temperature = requestedTemperature(item.temperature);
    const hasTemperatureInput = item.temperature !== undefined && item.temperature !== null && item.temperature !== "";
    if (hasTemperatureInput && !temperature) return Response.json({ error: "Zamówienie zawiera nieprawidłowy sposób podania." }, { status: 400 });
    if (temperatureOptions.length > 1 && (!temperature || !temperatureOptions.includes(temperature))) return Response.json({ error: "Wybierz wersję na ciepło albo na zimno." }, { status: 400 });
    if (temperatureOptions.length === 1 && temperature && temperature !== temperatureOptions[0]) return Response.json({ error: "Wybrany sposób podania nie jest dostępny dla tego produktu." }, { status: 400 });
    if (!temperatureOptions.length && temperature) return Response.json({ error: "Ten produkt nie ma wariantu temperatury." }, { status: 400 });
    if (item.takeaway !== undefined && typeof item.takeaway !== "boolean") return Response.json({ error: "Zamówienie zawiera nieprawidłowy sposób wydania." }, { status: 400 });
    if (item.takeaway === true && !takeawayAvailableFor(product)) return Response.json({ error: "Tego produktu nie można oznaczyć jako zamówienie na wynos." }, { status: 400 });
    const requestedIds = [...new Set((Array.isArray(item.customizations) ? item.customizations : []).map((value) => typeof value === "string" ? value : "").filter(Boolean))];
    const resolved = selectionsFor(productId, requestedIds);
    if (resolved.some((selection) => !selection)) return Response.json({ error: "Zamówienie zawiera niedostępny dodatek." }, { status: 400 });
    const flavorCount = resolved.filter((selection) => selection?.flavorName).length;
    const maxFlavorCount = isLemonadeProduct(product.name) ? 2 : 1;
    if (flavorCount > maxFlavorCount) return Response.json({ error: isLemonadeProduct(product.name) ? "Do lemoniady możesz wybrać maksymalnie dwa smaki." : "Wybierz jeden smak syropu do napoju." }, { status: 400 });
    const selectedGroups = resolved.flatMap((selection) => selection?.flavorName && isLemonadeProduct(product.name) ? [] : [selection?.addon.groupName?.trim() || "Dodatki"]);
    const singleChoiceGroups = selectedGroups.filter((group) => !isCoffeeAddonGroup(group));
    if (new Set(singleChoiceGroups).size !== singleChoiceGroups.length) return Response.json({ error: "W tej grupie można wybrać tylko jeden wariant." }, { status: 400 });
    const requiredGroups = new Set(allowedAddons.filter((addon) => addon.parentId === productId && isAlternativeCoffeeBeanGroup(addon.groupName)).map((addon) => addon.groupName?.trim() || "Dodatki"));
    if ([...requiredGroups].some((group) => !selectedGroups.includes(group))) return Response.json({ error: "Wybierz ziarno do kawy alternatywnej." }, { status: 400 });
    if (isAlternativeCoffeeMethod(byId.get(productId)?.name) && !selectedGroups.some(isAlternativeCoffeeBeanGroup)) return Response.json({ error: "Wybierz ziarno do kawy alternatywnej." }, { status: 400 });
  }
  const normalizedItems = items.map((item) => {
    const product = byId.get(String(item.productId))!;
    const temperatureOptions = temperatureOptionsFor(product);
    const temperature = requestedTemperature(item.temperature) ?? (temperatureOptions.length === 1 ? temperatureOptions[0] : null);
    const takeaway = item.takeaway === true && takeawayAvailableFor(product);
    const rawCustomizations = Array.isArray(item.customizations) ? item.customizations : [];
    const customizationIds = [...new Set(rawCustomizations.map((value) => typeof value === "string" ? value : "").filter(Boolean))];
    const selected = selectionsFor(product.dotykackaId, customizationIds).filter((selection): selection is NonNullable<typeof selection> => Boolean(selection));
    const beanNotes = selected.filter((selection) => selection.fallback === "bean").map((selection) => `Ziarno: ${selection.addon.name}`);
    const syrupNotes = selected.filter((selection) => selection.flavorName).map((selection) => `Syrop: ${selection.flavorName}`);
    const rawNote = typeof item.note === "string" ? item.note.trim().slice(0, 500) : "";
    const temperatureNotes = temperature ? [`Sposób podania: ${temperature === "warm" ? "na ciepło" : "na zimno"}`] : [];
    const fulfillmentNotes = takeaway ? ["Sposób wydania: na wynos"] : [];
    const note = [rawNote, ...fulfillmentNotes, ...temperatureNotes, ...beanNotes, ...syrupNotes].filter(Boolean).join(" · ") || undefined;
    const unitPrice = Number(product.price ?? 0) + selected.reduce((sum, selection) => sum + Number(selection.addon.price ?? 0), 0);
    const customizations = selected.map(({ addon, fallback, flavorName }) => ({ customizationId: fallback ? "" : addon.customizationId ?? "", productId: addon.productId, name: flavorName ? `${addon.name}: ${flavorName}` : addon.name, price: addon.price ?? "0", fallback }));
    const posCustomizations = customizations.filter((addon) => !addon.fallback);
    const standaloneAddons = customizations.filter((addon) => addon.fallback === "addition" || (addon.fallback === "syrup" && !isLemonadeProduct(product.name)));
    return { productId: product.dotykackaId, localProductId: product.id, name: product.name, quantity: Number(item.quantity), unitPrice: String(unitPrice), note, temperature, takeaway, customizations, posCustomizations, standaloneAddons };
  });
  const rawAnswers = body.surveyAnswers && typeof body.surveyAnswers === "object" ? body.surveyAnswers as Record<string, unknown> : {};
  const surveyAnswers = questions.flatMap((question) => {
    const answer = typeof rawAnswers[String(question.id)] === "string" ? String(rawAnswers[String(question.id)]).trim() : "";
    return answer && question.options.includes(answer) ? [{ questionId: question.id, question: question.prompt, answer }] : [];
  });
  if (questions.some((question) => question.required && !surveyAnswers.some((answer) => answer.questionId === question.id))) return Response.json({ error: "Uzupełnij obowiązkowe pytania ankiety." }, { status: 400 });
  if (normalizedItems.some((item) => item.posCustomizations.some((addon) => !Number.isSafeInteger(Number(addon.customizationId))))) return Response.json({ error: "Odśwież katalog — wariant produktu nie ma jeszcze identyfikatora Dotykački." }, { status: 409 });
  const externalId = randomUUID();
  const [localOrder] = await db.insert(waiterOrders).values({
    externalId, employeeDotykackaId: employee.dotykackaId, tableDotykackaId: tableId,
    guestCount, note: typeof body.note === "string" ? body.note.trim().slice(0, 1000) || null : null,
    items: normalizedItems, surveyAnswers, status: "SENDING", sentAt: new Date(), updatedAt: new Date(),
  }).returning({ id: waiterOrders.id });
  try {
    const config = await getDotykackaConfig();
    if (!config.branchId) throw new Error("Nie wybrano oddziału Dotykački.");
    const result = await new DotykackaClient(config).posAction({
      action: "order/create",
      "idempotency-key": externalId,
      "external-id": externalId,
      "user-id": Number(employee.dotykackaId),
      "table-id": Number(tableId),
      "guest-count": guestCount,
      note: typeof body.note === "string" ? body.note.trim().slice(0, 1000) || undefined : undefined,
      items: normalizedItems.flatMap((item) => [{
        id: Number(item.productId),
        qty: item.quantity,
        note: item.note,
        ...(item.posCustomizations.length ? { customizations: item.posCustomizations.map((addon) => ({ "product-customization-id": Number(addon.customizationId), "product-id": Number(addon.productId), qty: 1 })) } : {}),
      }, ...item.standaloneAddons.map((addon) => ({ id: Number(addon.productId), qty: item.quantity, note: `Dodatek do: ${item.name}` }))]),
    });
    if (result.code !== 0 || !result.order?.id) {
      const message = result.localizedMessage || result.message || `Dotykačka odrzuciła zamówienie (kod ${result.code}).`;
      await db.update(waiterOrders).set({ status: "FAILED", error: message, updatedAt: new Date() }).where(eq(waiterOrders.id, localOrder.id));
      return Response.json({ error: message, code: result.code, externalId }, { status: 409 });
    }
    await db.update(waiterOrders).set({ status: "SENT", dotykackaOrderId: String(result.order.id), error: null, updatedAt: new Date() }).where(eq(waiterOrders.id, localOrder.id));
    return clearCookie(Response.json({ status: "sent", externalId, dotykackaOrderId: String(result.order.id) }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieznany błąd wysyłki do Dotykački.";
    await db.update(waiterOrders).set({ status: "UNKNOWN", error: message, updatedAt: new Date() }).where(eq(waiterOrders.id, localOrder.id));
    return Response.json({ error: `${message} Sprawdź rachunek na kasie przed ponowną próbą.`, externalId }, { status: 502 });
  }
}
