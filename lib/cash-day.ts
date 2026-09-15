export const DOTYKACKA_CASH_PAYMENT_ID = 900000001;
export const DOTYKACKA_CARD_PAYMENT_ID = 900000002;
export const CASH_DESK_NAME = "Kasa główna";
export const CASH_DAY_TIME_ZONE = "Europe/Warsaw";

export type DotykackaPaymentLine = {
  typeId?: number | null;
  count?: number | null;
  total?: number | null;
  rawTotal?: number | null;
  currency?: string | null;
};

export type CashSnapshot = {
  cash: number;
  card: number;
  capturedAt: string;
  periodFrom: string;
  periodTo: string;
  payments: Array<{ typeId: number; count: number; total: string; currency: string | null }>;
};

export function reportPaymentTotals(report: { revenue?: { paymentTypeInfo?: DotykackaPaymentLine[] } } | null | undefined) {
  const lines = report?.revenue?.paymentTypeInfo ?? [];
  const total = (typeId: number) => Math.round(lines.filter((line) => Number(line.typeId) === typeId)
    .reduce((sum, line) => sum + Number(line.total ?? 0), 0) * 100);
  return {
    cash: total(DOTYKACKA_CASH_PAYMENT_ID),
    card: total(DOTYKACKA_CARD_PAYMENT_ID),
    payments: lines.map((line) => ({
      typeId: Number(line.typeId ?? 0),
      count: Number(line.count ?? 0),
      total: Number(line.total ?? 0).toFixed(2),
      currency: line.currency ?? null,
    })),
  };
}

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CASH_DAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function currentBusinessDate(now = new Date()) {
  const parts = Object.fromEntries(dateFormatter.formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function businessDayStart(businessDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) throw new Error("Nieprawidłowa data operacyjna.");
  const midnightAsUtc = Date.parse(`${businessDate}T00:00:00Z`);
  let result = midnightAsUtc;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: CASH_DAY_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(result)).map((part) => [part.type, part.value]));
    const representedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    result = midnightAsUtc - (representedAsUtc - result);
  }
  return new Date(result);
}

export function snapshotDelta(current: Pick<CashSnapshot, "cash" | "card">, previous: Pick<CashSnapshot, "cash" | "card">) {
  return { cash: current.cash - previous.cash, card: current.card - previous.card };
}
