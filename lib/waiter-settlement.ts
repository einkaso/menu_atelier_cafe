export type SettlementCorrectionInput = { direction: "CARD_TO_CASH" | "CASH_TO_CARD"; amount: string; reason: string };
export type SettlementExpenseInput = { description: string; amount: string; receiptNumber?: string; receiptIncluded: boolean };
export type SettlementTipInput = {
  key: string;
  paymentMethod: "CASH" | "CARD";
  amount: string;
  note?: string;
  allocations: Array<{ employeeDotykackaId: string; amount: string }>;
};

export function moneyToCents(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= 1_000_000_000 ? cents : null;
}

export function centsToMoney(cents: number) {
  return (cents / 100).toFixed(2);
}

export function settlementTotals(input: {
  openingCash: number;
  posCash: number;
  posCard: number;
  terminalCard: number;
  countedCash: number;
  cashLeft: number;
  envelopeCash: number;
  corrections: Array<{ direction: "CARD_TO_CASH" | "CASH_TO_CARD"; amount: number }>;
  expenses: Array<{ amount: number }>;
  tips: Array<{ paymentMethod: "CASH" | "CARD"; amount: number }>;
}) {
  const cardToCash = input.corrections.filter((item) => item.direction === "CARD_TO_CASH").reduce((sum, item) => sum + item.amount, 0);
  const cashToCard = input.corrections.filter((item) => item.direction === "CASH_TO_CARD").reduce((sum, item) => sum + item.amount, 0);
  const expensesTotal = input.expenses.reduce((sum, item) => sum + item.amount, 0);
  const cashTips = input.tips.filter((item) => item.paymentMethod === "CASH").reduce((sum, item) => sum + item.amount, 0);
  const cardTips = input.tips.filter((item) => item.paymentMethod === "CARD").reduce((sum, item) => sum + item.amount, 0);
  const tipsTotal = cashTips + cardTips;
  const expectedCash = input.openingCash + input.posCash + cardToCash - cashToCard + cashTips - expensesTotal;
  const expectedTerminal = input.posCard - cardToCash + cashToCard + cardTips;
  return {
    cardToCash,
    cashToCard,
    expensesTotal,
    cashTips,
    cardTips,
    tipsTotal,
    expectedCash,
    expectedTerminal,
    cashDifference: input.countedCash - expectedCash,
    terminalDifference: input.terminalCard - expectedTerminal,
    splitDifference: input.countedCash - input.cashLeft - input.envelopeCash,
  };
}
