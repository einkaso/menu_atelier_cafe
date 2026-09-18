import type { DotykackaMoneyLog, DotykackaOrder, DotykackaOrderItem } from "./dotykacka/types";

export type GuestSurveyQuestion = { id: number; prompt: string; kind: "RATING" | "SINGLE_CHOICE"; options: string[]; required: boolean };
export type GuestReceiptListItem = { orderId: string; tableId: string | null; tableName: string; documentNumber: string; completedAt: string; total: string; currency: string };
export type GuestReceipt = GuestReceiptListItem & {
  items: Array<{ id: string; name: string; quantity: string; unitPrice: string; total: string; vat: string | null; customizations: string[] }>;
  payments: Array<{ id: string; label: string; amount: string; currency: string; tip: string }>;
  surveyQuestions: GuestSurveyQuestion[];
  reviewUrl: string | null;
  servedBy: { name: string; mediaUrl: string | null; mediaType: "GIF" | "VIDEO" | null } | null;
};

const decimal = (value: unknown, fallback = 0) => {
  const parsed = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function dotykackaDate(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && String(value).trim() !== "" ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isClosedReceipt(order: DotykackaOrder, branchId?: string, now = new Date()) {
  if (String(order.status ?? "").toLocaleLowerCase() !== "closed") return false;
  if (branchId && String(order._branchId ?? "") !== branchId) return false;
  const completed = dotykackaDate(order.completed);
  if (!completed || completed.getTime() > now.getTime() + 5 * 60_000 || completed.getTime() < now.getTime() - 24 * 60 * 60_000) return false;
  const type = String(order.documentType ?? "").toLocaleLowerCase();
  return !type || type.includes("receipt") || type.includes("paragon");
}

export function receiptListItem(order: DotykackaOrder, tableNames: Map<string, string>): GuestReceiptListItem {
  const tableId = order._tableId === null || order._tableId === undefined ? null : String(order._tableId);
  const completed = dotykackaDate(order.completed) ?? new Date(0);
  return {
    orderId: String(order.id),
    tableId,
    tableName: tableId ? tableNames.get(tableId) ?? `Stolik ${tableId}` : "Bez stolika",
    documentNumber: order.documentNumber?.trim() || `Rachunek ${order.id}`,
    completedAt: completed.toISOString(),
    total: decimal(order.totalValueRounded).toFixed(2),
    currency: order.currency?.trim() || "PLN",
  };
}

function paymentLabel(id: unknown) {
  if (String(id) === "900000001") return "Gotówka";
  if (String(id) === "900000002") return "Karta";
  return "Płatność";
}

export function buildGuestReceipt(order: DotykackaOrder, orderItems: DotykackaOrderItem[], moneyLogs: DotykackaMoneyLog[], tableNames: Map<string, string>): Omit<GuestReceipt, "surveyQuestions" | "reviewUrl" | "servedBy"> {
  const base = receiptListItem(order, tableNames);
  const items = orderItems.filter((item) => !item.canceledDate && decimal(item.quantity) !== 0).map((item) => {
    const quantity = decimal(item.quantity, 1);
    const total = decimal(item.totalPriceWithVat, decimal(item.billedUnitPriceWithVat ?? item.unitPriceWithVat) * quantity);
    const unit = decimal(item.billedUnitPriceWithVat ?? item.unitPriceWithVat, quantity ? total / quantity : total);
    return {
      id: String(item.id),
      name: item.alternativeName?.trim() || item.name?.trim() || "Pozycja",
      quantity: quantity.toFixed(3).replace(/\.?0+$/, ""),
      unitPrice: unit.toFixed(2),
      total: total.toFixed(2),
      vat: item.vat === null || item.vat === undefined ? null : decimal(item.vat).toFixed(0),
      customizations: (item.orderItemCustomizations ?? []).map((entry) => entry.name?.trim()).filter((name): name is string => Boolean(name)),
    };
  });
  const payments = moneyLogs.filter((payment) => decimal(payment.amountDefaultCurrency ?? payment.amount) !== 0).map((payment) => ({
    id: String(payment.id),
    label: paymentLabel(payment.paymentTypeId),
    amount: decimal(payment.amountDefaultCurrency ?? payment.amount).toFixed(2),
    currency: payment.currency?.trim() || base.currency,
    tip: decimal(payment.tipAmount).toFixed(2),
  }));
  return { ...base, items, payments };
}
