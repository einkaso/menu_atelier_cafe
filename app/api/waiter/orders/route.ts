import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { menuAddons, menuProducts, waiterExtraProducts, waiterOrders, waiterSurveyQuestions, waiterTables } from "../../../../db/schema";
import { currentWaiter, waiterCookie } from "../../../../lib/waiter-auth";
import { isAlternativeCoffeeBeanGroup, isCoffeeAddonGroup } from "../../../../lib/coffee-addons";
import { menuProductIsAvailable, regularProductStockIsAvailable } from "../../../../lib/menu-tags";
import { DotykackaClient } from "../../../../lib/dotykacka/client";
import { getDotykackaConfig } from "../../../../lib/dotykacka/config";

const MENU_TAG = process.env.DOTYKACKA_MENU_TAG?.trim() || "MENU";

type OrderInput = { tableId?: unknown; guestCount?: unknown; note?: unknown; items?: unknown; surveyAnswers?: unknown };
type ItemInput = { productId?: unknown; quantity?: unknown; note?: unknown; customizations?: unknown };

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
  const [table, products, extraProducts, questions, allowedAddons] = await Promise.all([
    db.select({ id: waiterTables.dotykackaId }).from(waiterTables).where(and(eq(waiterTables.dotykackaId, tableId), eq(waiterTables.display, true), eq(waiterTables.deleted, false))).limit(1),
    db.select({
      id: menuProducts.id, dotykackaId: menuProducts.dotykackaId, name: menuProducts.name, price: menuProducts.priceWithVat,
      tags: menuProducts.tags, stockDeduct: menuProducts.stockDeduct, stockOverdraft: menuProducts.stockOverdraft, stockQuantity: menuProducts.stockQuantity,
    }).from(menuProducts).where(and(inArray(menuProducts.dotykackaId, productIds), eq(menuProducts.menuTagged, true), eq(menuProducts.display, true), eq(menuProducts.deleted, false))),
    db.select({
      id: waiterExtraProducts.id, dotykackaId: waiterExtraProducts.dotykackaId, name: waiterExtraProducts.name, price: waiterExtraProducts.priceWithVat,
      stockDeduct: waiterExtraProducts.stockDeduct, stockOverdraft: waiterExtraProducts.stockOverdraft, stockQuantity: waiterExtraProducts.stockQuantity,
    }).from(waiterExtraProducts).where(inArray(waiterExtraProducts.dotykackaId, productIds)),
    db.select({ id: waiterSurveyQuestions.id, prompt: waiterSurveyQuestions.prompt, options: waiterSurveyQuestions.options, required: waiterSurveyQuestions.required }).from(waiterSurveyQuestions).where(eq(waiterSurveyQuestions.active, true)),
    db.select({ parentId: menuAddons.parentDotykackaId, customizationId: menuAddons.customizationDotykackaId, productId: menuAddons.addonDotykackaId, groupName: menuAddons.groupName, name: menuAddons.name, price: menuAddons.priceWithVat }).from(menuAddons).where(inArray(menuAddons.parentDotykackaId, productIds)),
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
  for (const item of items) {
    const productId = String(item.productId);
    const requestedIds = [...new Set((Array.isArray(item.customizations) ? item.customizations : []).map((value) => typeof value === "string" ? value : "").filter(Boolean))];
    const selected = requestedIds.map((id) => allowedByParent.get(productId)?.get(id));
    if (selected.some((addon) => !addon)) return Response.json({ error: "Zamówienie zawiera niedostępny dodatek." }, { status: 400 });
    const selectedGroups = selected.map((addon) => addon?.groupName?.trim() || "Dodatki");
    const singleChoiceGroups = selectedGroups.filter((group) => !isCoffeeAddonGroup(group));
    if (new Set(singleChoiceGroups).size !== singleChoiceGroups.length) return Response.json({ error: "W tej grupie można wybrać tylko jeden wariant." }, { status: 400 });
    const requiredGroups = new Set(allowedAddons.filter((addon) => addon.parentId === productId && isAlternativeCoffeeBeanGroup(addon.groupName)).map((addon) => addon.groupName?.trim() || "Dodatki"));
    if ([...requiredGroups].some((group) => !selectedGroups.includes(group))) return Response.json({ error: "Wybierz ziarno do kawy alternatywnej." }, { status: 400 });
  }
  const normalizedItems = items.map((item) => {
    const product = byId.get(String(item.productId))!;
    const rawCustomizations = Array.isArray(item.customizations) ? item.customizations : [];
    const customizationIds = [...new Set(rawCustomizations.map((value) => typeof value === "string" ? value : "").filter(Boolean))];
    const customizations = customizationIds.map((id) => allowedByParent.get(product.dotykackaId)?.get(id)).filter((addon): addon is NonNullable<typeof addon> => Boolean(addon));
    const unitPrice = Number(product.price ?? 0) + customizations.reduce((sum, addon) => sum + Number(addon.price ?? 0), 0);
    return { productId: product.dotykackaId, localProductId: product.id, name: product.name, quantity: Number(item.quantity), unitPrice: String(unitPrice), note: typeof item.note === "string" ? item.note.trim().slice(0, 500) || undefined : undefined, customizations: customizations.map((addon) => ({ customizationId: addon.customizationId ?? "", productId: addon.productId, name: addon.name, price: addon.price ?? "0" })) };
  });
  const rawAnswers = body.surveyAnswers && typeof body.surveyAnswers === "object" ? body.surveyAnswers as Record<string, unknown> : {};
  const surveyAnswers = questions.flatMap((question) => {
    const answer = typeof rawAnswers[String(question.id)] === "string" ? String(rawAnswers[String(question.id)]).trim() : "";
    return answer && question.options.includes(answer) ? [{ questionId: question.id, question: question.prompt, answer }] : [];
  });
  if (questions.some((question) => question.required && !surveyAnswers.some((answer) => answer.questionId === question.id))) return Response.json({ error: "Uzupełnij obowiązkowe pytania ankiety." }, { status: 400 });
  if (normalizedItems.some((item) => item.customizations?.some((addon) => !Number.isSafeInteger(Number(addon.customizationId))))) return Response.json({ error: "Odśwież katalog — wariant produktu nie ma jeszcze identyfikatora Dotykački." }, { status: 409 });
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
      items: normalizedItems.map((item) => ({
        id: Number(item.productId),
        qty: item.quantity,
        note: item.note,
        ...(item.customizations?.length ? { customizations: item.customizations.map((addon) => ({ "product-customization-id": Number(addon.customizationId), "product-id": Number(addon.productId), qty: 1 })) } : {}),
      })),
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
