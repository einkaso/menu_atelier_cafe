import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { waiterCashDays, waiterEmployees, waiterSettlementEvents, waiterSettlements, waiterTipAllocations } from "../../../../db/schema";
import { CASH_DESK_NAME, currentBusinessDate, snapshotDelta, type CashSnapshot } from "../../../../lib/cash-day";
import { fetchCashSnapshot } from "../../../../lib/dotykacka/cash-snapshot";
import { currentWaiter, waiterCookie } from "../../../../lib/waiter-auth";
import { centsToMoney, moneyToCents, settlementTotals, type SettlementCorrectionInput, type SettlementExpenseInput, type SettlementTipInput } from "../../../../lib/waiter-settlement";

export const dynamic = "force-dynamic";

type CashAction = "OPEN" | "HANDOVER" | "CLOSE";
type SettlementInput = {
  action?: unknown;
  countedCash?: unknown;
  cashLeft?: unknown;
  envelopeCash?: unknown;
  envelopeNumber?: unknown;
  corrections?: unknown;
  expenses?: unknown;
  tips?: unknown;
  discrepancyNote?: unknown;
  employeeNote?: unknown;
  snapshotCashCents?: unknown;
  snapshotCardCents?: unknown;
};

const textValue = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const numeric = (value: string | null | undefined) => Math.round(Number(value ?? 0) * 100);
const snapshotFromDay = (day: typeof waiterCashDays.$inferSelect): CashSnapshot => ({
  cash: numeric(day.openingPosCash),
  card: numeric(day.openingPosCard),
  capturedAt: day.openingSnapshotAt.toISOString(),
  periodFrom: day.openingSnapshotFrom.toISOString(),
  periodTo: day.openingSnapshotAt.toISOString(),
  payments: day.openingSnapshotDetails,
});
const snapshotFromSettlement = (item: typeof waiterSettlements.$inferSelect): CashSnapshot => ({
  cash: numeric(item.posSnapshotCash),
  card: numeric(item.posSnapshotCard),
  capturedAt: item.posSnapshotAt?.toISOString() ?? item.submittedAt.toISOString(),
  periodFrom: item.posSnapshotFrom?.toISOString() ?? item.submittedAt.toISOString(),
  periodTo: item.posSnapshotAt?.toISOString() ?? item.submittedAt.toISOString(),
  payments: item.posSnapshotDetails,
});
function clearCookie(response: Response) {
  response.headers.append("Set-Cookie", `${waiterCookie.name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response;
}

async function safeSnapshot(businessDate: string) {
  try { return { snapshot: await fetchCashSnapshot(businessDate), snapshotError: null }; }
  catch (error) { return { snapshot: null, snapshotError: error instanceof Error ? error.message : "Nie udało się pobrać raportu Dotykački." }; }
}

export async function GET(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });
  const db = getDb();
  const businessDate = currentBusinessDate();
  const [employees, openDays, todayDays, previousClose, recent] = await Promise.all([
    db.select({ dotykackaId: waiterEmployees.dotykackaId, name: waiterEmployees.name })
      .from(waiterEmployees).where(and(eq(waiterEmployees.enabled, true), eq(waiterEmployees.deleted, false)))
      .orderBy(waiterEmployees.name),
    db.select().from(waiterCashDays).where(and(eq(waiterCashDays.cashDesk, CASH_DESK_NAME), eq(waiterCashDays.status, "OPEN"))).orderBy(desc(waiterCashDays.businessDate)).limit(1),
    db.select().from(waiterCashDays).where(and(eq(waiterCashDays.businessDate, businessDate), eq(waiterCashDays.cashDesk, CASH_DESK_NAME))).limit(1),
    db.select().from(waiterCashDays).where(and(eq(waiterCashDays.cashDesk, CASH_DESK_NAME), eq(waiterCashDays.status, "CLOSED"), lt(waiterCashDays.businessDate, businessDate))).orderBy(desc(waiterCashDays.businessDate), desc(waiterCashDays.closedAt)).limit(1),
    db.select({
      id: waiterSettlements.id, businessDate: waiterSettlements.businessDate, shiftName: waiterSettlements.shiftName,
      checkpointType: waiterSettlements.checkpointType, cashDesk: waiterSettlements.cashDesk, status: waiterSettlements.status,
      adminNote: waiterSettlements.adminNote, envelopeNumber: waiterSettlements.envelopeNumber,
      envelopeCash: waiterSettlements.envelopeCash, cashDifference: waiterSettlements.cashDifference,
      terminalDifference: waiterSettlements.terminalDifference, submittedAt: waiterSettlements.submittedAt,
    }).from(waiterSettlements).where(eq(waiterSettlements.employeeDotykackaId, employee.dotykackaId))
      .orderBy(desc(waiterSettlements.submittedAt)).limit(10),
  ]);
  const day = openDays[0] ?? todayDays[0] ?? null;
  const checkpoints = day ? await db.select().from(waiterSettlements).where(eq(waiterSettlements.cashDayId, day.id)).orderBy(waiterSettlements.submittedAt) : [];
  const latest = checkpoints.at(-1) ?? null;
  const report = day?.status === "CLOSED" ? { snapshot: null, snapshotError: null } : await safeSnapshot(day?.businessDate ?? businessDate);
  const baselineSnapshot = day ? (latest ? snapshotFromSettlement(latest) : snapshotFromDay(day)) : null;
  const baselineCash = day ? numeric(latest?.countedCash ?? day.countedOpeningCash) : numeric(previousClose[0]?.finalCashLeft);
  const delta = report.snapshot && baselineSnapshot ? snapshotDelta(report.snapshot, baselineSnapshot) : { cash: 0, card: 0 };
  // The full-day view must always show the complete live Dotykacka totals for the
  // business day. The opening snapshot is only a checkpoint for interval deltas;
  // subtracting it here hid sales made before this module was opened.
  const dayTotals = report.snapshot && day ? { cash: report.snapshot.cash, card: report.snapshot.card } : { cash: 0, card: 0 };
  const dayOpeningCash = numeric(day?.countedOpeningCash);
  return Response.json({
    employee, employees, recent, businessDate, cashDesk: CASH_DESK_NAME,
    day, checkpoints, latest, previousClose: previousClose[0] ?? null,
    snapshot: report.snapshot, snapshotError: report.snapshotError,
    baseline: { cash: centsToMoney(baselineCash), snapshot: baselineSnapshot },
    interval: { posCash: centsToMoney(delta.cash), posCard: centsToMoney(delta.card), expectedCash: centsToMoney(baselineCash + delta.cash) },
    fullDay: {
      openingCash: centsToMoney(dayOpeningCash),
      posCash: centsToMoney(dayTotals.cash),
      posCard: centsToMoney(dayTotals.card),
      expectedCash: centsToMoney(dayOpeningCash + dayTotals.cash),
    },
  });
}

async function normalizedDetails(body: SettlementInput) {
  const rawCorrections = Array.isArray(body.corrections) ? body.corrections as SettlementCorrectionInput[] : [];
  const corrections = rawCorrections.slice(0, 50).map((item) => ({ direction: item?.direction, amount: moneyToCents(item?.amount), reason: textValue(item?.reason, 300) }));
  if (corrections.length !== rawCorrections.length || corrections.some((item) => !["CARD_TO_CASH", "CASH_TO_CARD"].includes(item.direction) || !item.amount || !item.reason)) throw new Error("Każda korekta płatności wymaga kierunku, dodatniej kwoty i wyjaśnienia.");

  const rawExpenses = Array.isArray(body.expenses) ? body.expenses as SettlementExpenseInput[] : [];
  const expenses = rawExpenses.slice(0, 50).map((item) => ({ description: textValue(item?.description, 300), amount: moneyToCents(item?.amount), receiptNumber: textValue(item?.receiptNumber, 100), receiptIncluded: item?.receiptIncluded === true }));
  if (expenses.length !== rawExpenses.length || expenses.some((item) => !item.description || !item.amount || !item.receiptIncluded)) throw new Error("Każdy wydatek wymaga opisu, dodatniej kwoty i potwierdzenia dokumentu.");

  const rawTips = Array.isArray(body.tips) ? body.tips as SettlementTipInput[] : [];
  if (rawTips.length > 50) throw new Error("Rozliczenie zawiera zbyt wiele wpisów napiwków.");
  const db = getDb();
  const employeeIds = [...new Set(rawTips.flatMap((tip) => Array.isArray(tip.allocations) ? tip.allocations.map((allocation) => String(allocation.employeeDotykackaId ?? "")) : []))].filter(Boolean);
  const activeEmployees = employeeIds.length ? await db.select({ dotykackaId: waiterEmployees.dotykackaId, name: waiterEmployees.name })
    .from(waiterEmployees).where(and(inArray(waiterEmployees.dotykackaId, employeeIds), eq(waiterEmployees.enabled, true), eq(waiterEmployees.deleted, false))) : [];
  const employeeNames = new Map(activeEmployees.map((item) => [item.dotykackaId, item.name]));
  const tips = rawTips.map((item) => {
    const amount = moneyToCents(item?.amount);
    const allocations = Array.isArray(item?.allocations) ? item.allocations.slice(0, 20).map((allocation) => ({ employeeDotykackaId: String(allocation?.employeeDotykackaId ?? ""), employeeName: employeeNames.get(String(allocation?.employeeDotykackaId ?? "")) ?? "", amount: moneyToCents(allocation?.amount) })) : [];
    return { key: textValue(item?.key, 80) || randomUUID(), paymentMethod: item?.paymentMethod, amount, note: textValue(item?.note, 300), allocations };
  });
  if (tips.some((tip) => !["CASH", "CARD"].includes(tip.paymentMethod) || !tip.amount || !tip.allocations.length || tip.allocations.some((allocation) => !allocation.employeeName || !allocation.amount) || new Set(tip.allocations.map((allocation) => allocation.employeeDotykackaId)).size !== tip.allocations.length || tip.allocations.reduce((sum, allocation) => sum + (allocation.amount ?? 0), 0) !== tip.amount)) throw new Error("Każdy napiwek musi mieć prawidłowy sposób płatności i pełny podział kwoty pomiędzy aktywnych pracowników.");
  return { corrections, expenses, tips };
}

export async function POST(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as SettlementInput;
  const action = typeof body.action === "string" ? body.action as CashAction : "" as CashAction;
  if (!["OPEN", "HANDOVER", "CLOSE"].includes(action)) return Response.json({ error: "Wybierz otwarcie, przekazanie albo zamknięcie dnia." }, { status: 400 });
  const countedCash = moneyToCents(body.countedCash);
  if (countedCash == null) return Response.json({ error: "Podaj fizycznie policzoną gotówkę." }, { status: 400 });
  const discrepancyNote = textValue(body.discrepancyNote, 1000);
  const employeeNote = textValue(body.employeeNote, 1000);
  const businessDate = currentBusinessDate();
  const db = getDb();
  const snapshotResult = await safeSnapshot(businessDate);
  if (!snapshotResult.snapshot) return Response.json({ error: `Nie można zapisać operacji bez aktualnego raportu Dotykački. ${snapshotResult.snapshotError ?? ""}`.trim() }, { status: 502 });
  const snapshot = snapshotResult.snapshot;
  const displayedCash = Number(body.snapshotCashCents);
  const displayedCard = Number(body.snapshotCardCents);
  if (!Number.isInteger(displayedCash) || !Number.isInteger(displayedCard)) {
    return Response.json({ error: "Odśwież dane z Dotykački przed zapisaniem operacji." }, { status: 409 });
  }
  if (displayedCash !== snapshot.cash || displayedCard !== snapshot.card) {
    return Response.json({
      error: "W Dotykačce pojawiła się nowa sprzedaż. Dane zostały odświeżone — sprawdź ponownie policzoną gotówkę.",
      snapshotChanged: true,
      snapshot,
    }, { status: 409 });
  }

  if (action === "OPEN") {
    const [alreadyOpen, todayDay, previousClose] = await Promise.all([
      db.select({ id: waiterCashDays.id, businessDate: waiterCashDays.businessDate }).from(waiterCashDays).where(and(eq(waiterCashDays.cashDesk, CASH_DESK_NAME), eq(waiterCashDays.status, "OPEN"))).limit(1),
      db.select({ id: waiterCashDays.id }).from(waiterCashDays).where(and(eq(waiterCashDays.businessDate, businessDate), eq(waiterCashDays.cashDesk, CASH_DESK_NAME))).limit(1),
      db.select().from(waiterCashDays).where(and(eq(waiterCashDays.cashDesk, CASH_DESK_NAME), eq(waiterCashDays.status, "CLOSED"), lt(waiterCashDays.businessDate, businessDate))).orderBy(desc(waiterCashDays.businessDate), desc(waiterCashDays.closedAt)).limit(1),
    ]);
    if (alreadyOpen[0]) return Response.json({ error: `Dzień ${alreadyOpen[0].businessDate} jest już otwarty.` }, { status: 409 });
    if (todayDay[0]) return Response.json({ error: "Dzisiejszy dzień kasowy został już utworzony." }, { status: 409 });
    const expectedOpening = numeric(previousClose[0]?.finalCashLeft);
    const difference = countedCash - expectedOpening;
    if (difference !== 0 && !discrepancyNote) return Response.json({ error: "Wyjaśnij różnicę pomiędzy kwotą pozostawioną poprzedniego dnia a stanem fizycznym." }, { status: 400 });
    try {
      const [saved] = await db.insert(waiterCashDays).values({
        businessDate, cashDesk: CASH_DESK_NAME, status: "OPEN",
        expectedOpeningCash: centsToMoney(expectedOpening), countedOpeningCash: centsToMoney(countedCash), openingDifference: centsToMoney(difference), openingNote: discrepancyNote || null,
        openingPosCash: centsToMoney(snapshot.cash), openingPosCard: centsToMoney(snapshot.card), openingSnapshotAt: new Date(snapshot.capturedAt), openingSnapshotFrom: new Date(snapshot.periodFrom), openingSnapshotDetails: snapshot.payments,
        carryoverCashDayId: previousClose[0]?.id ?? null,
        carryoverDeclaredByDotykackaId: previousClose[0]?.closedByDotykackaId ?? null,
        carryoverDeclaredByName: previousClose[0]?.closedByName ?? null,
        carryoverDeclaredAt: previousClose[0]?.closedAt ?? null,
        openedByDotykackaId: employee.dotykackaId, openedByName: employee.name,
      }).returning({ id: waiterCashDays.id });
      return Response.json({ status: "ok", action, cashDayId: saved.id, sessionClosed: false, snapshotAt: snapshot.capturedAt });
    } catch {
      return Response.json({ error: "Dzisiejszy dzień kasowy został już otwarty przez inną osobę." }, { status: 409 });
    }
  }

  const [day] = await db.select().from(waiterCashDays).where(and(eq(waiterCashDays.businessDate, businessDate), eq(waiterCashDays.cashDesk, CASH_DESK_NAME), eq(waiterCashDays.status, "OPEN"))).limit(1);
  if (!day) return Response.json({ error: "Najpierw otwórz dzisiejszy dzień kasowy." }, { status: 409 });
  const checkpoints = await db.select().from(waiterSettlements).where(eq(waiterSettlements.cashDayId, day.id)).orderBy(waiterSettlements.submittedAt, waiterSettlements.id);
  const latest = checkpoints.at(-1);
  let details: Awaited<ReturnType<typeof normalizedDetails>>;
  try { details = await normalizedDetails(body); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Nieprawidłowe dane rozliczenia." }, { status: 400 }); }
  const baselineCash = numeric(latest?.countedCash ?? day.countedOpeningCash);
  const baselineSnapshot = latest ? snapshotFromSettlement(latest) : snapshotFromDay(day);
  const posDelta = snapshotDelta(snapshot, baselineSnapshot);
  const closeCashLeft = action === "CLOSE" ? moneyToCents(body.cashLeft) : countedCash;
  const envelopeCash = action === "CLOSE" ? moneyToCents(body.envelopeCash) : 0;
  if (closeCashLeft == null || envelopeCash == null) return Response.json({ error: "Podaj kwoty pozostawione w kasie i przekazane do koperty." }, { status: 400 });
  const intervalTotals = settlementTotals({
    openingCash: baselineCash, posCash: posDelta.cash, posCard: posDelta.card, terminalCard: 0,
    countedCash, cashLeft: closeCashLeft, envelopeCash,
    corrections: details.corrections.map((item) => ({ direction: item.direction as "CARD_TO_CASH" | "CASH_TO_CARD", amount: item.amount! })),
    expenses: details.expenses.map((item) => ({ amount: item.amount! })),
    tips: details.tips.map((item) => ({ paymentMethod: item.paymentMethod as "CASH" | "CARD", amount: item.amount! })),
  });
  const terminalCard = intervalTotals.expectedTerminal;
  const totals = { ...intervalTotals, terminalDifference: 0 };
  const envelopeNumber = action === "CLOSE" ? textValue(body.envelopeNumber, 80) : "";
  if (action === "CLOSE" && totals.splitDifference !== 0) return Response.json({ error: "Policzona gotówka musi być równa sumie gotówki pozostawionej w kasie i włożonej do koperty." }, { status: 400 });
  if (action === "CLOSE" && !envelopeNumber) return Response.json({ error: "Podaj numer bezpiecznej koperty. Koperta z wydrukiem z kasy fiskalnej i terminala jest obowiązkowa także przy 0 zł do sejfu." }, { status: 400 });
  if (totals.cashDifference !== 0 && !discrepancyNote) return Response.json({ error: "Wyjaśnij różnicę pomiędzy oczekiwanym a policzonym stanem gotówki." }, { status: 400 });

  const normalizedCorrections = details.corrections.map((item) => ({ direction: item.direction as "CARD_TO_CASH" | "CASH_TO_CARD", amount: centsToMoney(item.amount!), reason: item.reason }));
  const normalizedExpenses = details.expenses.map((item) => ({ description: item.description, amount: centsToMoney(item.amount!), receiptNumber: item.receiptNumber || undefined, receiptIncluded: true }));
  const normalizedTips = details.tips.map((tip) => ({ key: tip.key, paymentMethod: tip.paymentMethod as "CASH" | "CARD", amount: centsToMoney(tip.amount!), note: tip.note || undefined, allocations: tip.allocations.map((allocation) => ({ employeeDotykackaId: allocation.employeeDotykackaId, employeeName: allocation.employeeName, amount: centsToMoney(allocation.amount!) })) }));
  const externalId = randomUUID();
  try {
    const settlementId = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from waiter_cash_days where id = ${day.id} for update`);
      const [lockedDay] = await tx.select({ status: waiterCashDays.status }).from(waiterCashDays).where(eq(waiterCashDays.id, day.id)).limit(1);
      if (lockedDay?.status !== "OPEN") throw new Error("STALE_CASH_DAY");
      const [currentLatest] = await tx.select({ id: waiterSettlements.id }).from(waiterSettlements).where(eq(waiterSettlements.cashDayId, day.id)).orderBy(desc(waiterSettlements.submittedAt), desc(waiterSettlements.id)).limit(1);
      if ((currentLatest?.id ?? null) !== (latest?.id ?? null)) throw new Error("STALE_CASH_DAY");
      const checkpointNumber = (await tx.select({ id: waiterSettlements.id }).from(waiterSettlements).where(eq(waiterSettlements.cashDayId, day.id))).length + 1;
      const shiftName = action === "HANDOVER" ? `Przekazanie zmiany #${checkpointNumber}` : "Zamknięcie dnia";
      const [saved] = await tx.insert(waiterSettlements).values({
        externalId, businessDate, shiftName, cashDesk: CASH_DESK_NAME, cashDayId: day.id, checkpointType: action, priorSettlementId: latest?.id ?? null,
        employeeDotykackaId: employee.dotykackaId, employeeName: employee.name,
        openingCash: centsToMoney(baselineCash), posCash: centsToMoney(posDelta.cash), posCard: centsToMoney(posDelta.card), terminalCard: centsToMoney(terminalCard),
        countedCash: centsToMoney(countedCash), cashLeft: centsToMoney(closeCashLeft), envelopeCash: centsToMoney(envelopeCash), envelopeNumber: envelopeNumber || null,
        corrections: normalizedCorrections, expenses: normalizedExpenses, tips: normalizedTips,
        expectedCash: centsToMoney(totals.expectedCash), cashDifference: centsToMoney(totals.cashDifference), expectedTerminal: centsToMoney(totals.expectedTerminal), terminalDifference: "0.00",
        expensesTotal: centsToMoney(totals.expensesTotal), tipsTotal: centsToMoney(totals.tipsTotal),
        posSnapshotCash: centsToMoney(snapshot.cash), posSnapshotCard: centsToMoney(snapshot.card), posSnapshotAt: new Date(snapshot.capturedAt), posSnapshotFrom: new Date(snapshot.periodFrom), posSnapshotDetails: snapshot.payments,
        discrepancyNote: discrepancyNote || null, employeeNote: employeeNote || null, status: "SUBMITTED",
      }).returning({ id: waiterSettlements.id });
      const allocationRows = normalizedTips.flatMap((tip) => tip.allocations.map((allocation) => ({ settlementId: saved.id, tipKey: tip.key, employeeDotykackaId: allocation.employeeDotykackaId, employeeName: allocation.employeeName, paymentMethod: tip.paymentMethod, amount: allocation.amount })));
      if (allocationRows.length) await tx.insert(waiterTipAllocations).values(allocationRows);
      await tx.insert(waiterSettlementEvents).values({ settlementId: saved.id, actorType: "EMPLOYEE", actorId: employee.dotykackaId, action: action === "HANDOVER" ? "HANDOVER_SUBMITTED" : "CLOSING_SUBMITTED", details: { externalId, cashDayId: day.id, snapshotAt: snapshot.capturedAt } });
      if (action === "CLOSE") await tx.update(waiterCashDays).set({ status: "CLOSED", finalCashLeft: centsToMoney(closeCashLeft), closedByDotykackaId: employee.dotykackaId, closedByName: employee.name, closedAt: new Date(), updatedAt: new Date() }).where(eq(waiterCashDays.id, day.id));
      return saved.id;
    });
    return clearCookie(Response.json({
      status: "ok",
      action,
      settlementId,
      externalId,
      sessionClosed: true,
      snapshotAt: snapshot.capturedAt,
      posCash: centsToMoney(snapshot.cash),
      posCard: centsToMoney(snapshot.card),
      totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, centsToMoney(value)])),
    }));
  } catch (error) {
    if (error instanceof Error && error.message === "STALE_CASH_DAY") return Response.json({ error: "Stan dnia zmienił się w międzyczasie. Zaloguj się ponownie i pobierz aktualne dane." }, { status: 409 });
    throw error;
  }
}
