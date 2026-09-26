import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { waiterCashDays, waiterCashDeposits, waiterCashExpenses, waiterEmployees, waiterSettlementEvents, waiterSettlements, waiterTipAllocations } from "../../../../db/schema";
import { CASH_DESK_NAME, currentBusinessDate, snapshotDelta, type CashSnapshot } from "../../../../lib/cash-day";
import { fetchCashSnapshot } from "../../../../lib/dotykacka/cash-snapshot";
import { currentWaiter } from "../../../../lib/waiter-auth";
import { centsToMoney, moneyToCents, settlementTotals, type SettlementCorrectionInput, type SettlementDepositInput, type SettlementExpenseInput, type SettlementTipInput } from "../../../../lib/waiter-settlement";

export const dynamic = "force-dynamic";

type CashAction = "OPEN" | "HANDOVER" | "CLOSE";
type SettlementInput = {
  action?: unknown;
  expenseId?: unknown;
  expense?: unknown;
  depositId?: unknown;
  deposit?: unknown;
  countedCash?: unknown;
  cashLeft?: unknown;
  envelopeCash?: unknown;
  envelopeNumber?: unknown;
  corrections?: unknown;
  expenses?: unknown;
  deposits?: unknown;
  tips?: unknown;
  discrepancyNote?: unknown;
  employeeNote?: unknown;
  idempotencyKey?: unknown;
  snapshotCashCents?: unknown;
  snapshotCardCents?: unknown;
};

const textValue = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const numeric = (value: string | null | undefined) => Math.round(Number(value ?? 0) * 100);
function normalizedExpense(value: unknown) {
  const item = value && typeof value === "object" ? value as SettlementExpenseInput : {} as SettlementExpenseInput;
  const expense = { description: textValue(item.description, 300), amount: moneyToCents(item.amount), receiptNumber: textValue(item.receiptNumber, 100), receiptIncluded: item.receiptIncluded === true };
  if (!expense.description || !expense.amount || !expense.receiptIncluded) throw new Error("Wydatek wymaga opisu, dodatniej kwoty i potwierdzenia zabezpieczenia paragonu.");
  return expense;
}
function normalizedDeposit(value: unknown) {
  const item = value && typeof value === "object" ? value as SettlementDepositInput : {} as SettlementDepositInput;
  const deposit = { contributor: textValue(item.contributor, 160), amount: moneyToCents(item.amount), note: textValue(item.note, 300) };
  if (!deposit.contributor || !deposit.amount) throw new Error("Wpłata do kasy wymaga osoby przekazującej środki i dodatniej kwoty.");
  return deposit;
}
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
async function safeSnapshot(businessDate: string) {
  try { return { snapshot: await fetchCashSnapshot(businessDate), snapshotError: null }; }
  catch (error) { return { snapshot: null, snapshotError: error instanceof Error ? error.message : "Nie udało się pobrać raportu Dotykački." }; }
}

export async function GET(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });
  const db = getDb();
  const businessDate = currentBusinessDate();
  const [employees, openDays, previousClose, recent] = await Promise.all([
    db.select({ dotykackaId: waiterEmployees.dotykackaId, name: waiterEmployees.name })
      .from(waiterEmployees).where(and(eq(waiterEmployees.enabled, true), eq(waiterEmployees.deleted, false)))
      .orderBy(waiterEmployees.name),
    db.select().from(waiterCashDays).where(and(eq(waiterCashDays.cashDesk, CASH_DESK_NAME), eq(waiterCashDays.status, "OPEN"))).orderBy(desc(waiterCashDays.openedAt), desc(waiterCashDays.id)).limit(1),
    db.select().from(waiterCashDays).where(and(eq(waiterCashDays.cashDesk, CASH_DESK_NAME), eq(waiterCashDays.status, "CLOSED"))).orderBy(desc(waiterCashDays.closedAt), desc(waiterCashDays.id)).limit(1),
    db.select({
      id: waiterSettlements.id, businessDate: waiterSettlements.businessDate, shiftName: waiterSettlements.shiftName,
      checkpointType: waiterSettlements.checkpointType, cashDesk: waiterSettlements.cashDesk, status: waiterSettlements.status,
      adminNote: waiterSettlements.adminNote, envelopeNumber: waiterSettlements.envelopeNumber,
      envelopeCash: waiterSettlements.envelopeCash, cashDifference: waiterSettlements.cashDifference,
      terminalDifference: waiterSettlements.terminalDifference, submittedAt: waiterSettlements.submittedAt,
    }).from(waiterSettlements).where(eq(waiterSettlements.employeeDotykackaId, employee.dotykackaId))
      .orderBy(desc(waiterSettlements.submittedAt)).limit(10),
  ]);
  const day = openDays[0] ?? null;
  const [checkpoints, pendingExpenses, pendingDeposits] = day ? await Promise.all([
    db.select().from(waiterSettlements).where(eq(waiterSettlements.cashDayId, day.id)).orderBy(waiterSettlements.submittedAt),
    db.select().from(waiterCashExpenses).where(and(eq(waiterCashExpenses.cashDayId, day.id), eq(waiterCashExpenses.status, "PENDING"))).orderBy(waiterCashExpenses.createdAt, waiterCashExpenses.id),
    db.select().from(waiterCashDeposits).where(and(eq(waiterCashDeposits.cashDayId, day.id), eq(waiterCashDeposits.status, "PENDING"))).orderBy(waiterCashDeposits.createdAt, waiterCashDeposits.id),
  ]) : [[], [], []];
  const latest = checkpoints.at(-1) ?? null;
  const report = day?.status === "CLOSED" ? { snapshot: null, snapshotError: null } : await safeSnapshot(day?.businessDate ?? businessDate);
  const baselineSnapshot = day ? (latest ? snapshotFromSettlement(latest) : snapshotFromDay(day)) : null;
  const baselineCash = day ? numeric(latest?.countedCash ?? day.countedOpeningCash) : numeric(previousClose[0]?.finalCashLeft);
  const delta = report.snapshot && baselineSnapshot ? snapshotDelta(report.snapshot, baselineSnapshot) : { cash: 0, card: 0 };
  // A cash cycle is operational, not calendar-based. Subtracting the opening
  // snapshot keeps its totals correct across midnight and across multiple cycles
  // opened on the same calendar date.
  const cycleTotals = report.snapshot && day ? snapshotDelta(report.snapshot, snapshotFromDay(day)) : { cash: 0, card: 0 };
  const dayOpeningCash = numeric(day?.countedOpeningCash);
  return Response.json({
    employee, employees, recent, businessDate, cashDesk: CASH_DESK_NAME,
    day, checkpoints, latest, previousClose: previousClose[0] ?? null,
    pendingExpenses, pendingDeposits,
    snapshot: report.snapshot, snapshotError: report.snapshotError,
    baseline: { cash: centsToMoney(baselineCash), snapshot: baselineSnapshot },
    interval: { posCash: centsToMoney(delta.cash), posCard: centsToMoney(delta.card), expectedCash: centsToMoney(baselineCash + delta.cash) },
    fullCycle: {
      openingCash: centsToMoney(dayOpeningCash),
      posCash: centsToMoney(cycleTotals.cash),
      posCard: centsToMoney(cycleTotals.card),
      expectedCash: centsToMoney(dayOpeningCash + cycleTotals.cash),
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

  const rawDeposits = Array.isArray(body.deposits) ? body.deposits as SettlementDepositInput[] : [];
  const deposits = rawDeposits.slice(0, 50).map((item) => ({ contributor: textValue(item?.contributor, 160), amount: moneyToCents(item?.amount), note: textValue(item?.note, 300) }));
  if (deposits.length !== rawDeposits.length || deposits.some((item) => !item.contributor || !item.amount)) throw new Error("Każda wpłata do kasy wymaga osoby przekazującej środki i dodatniej kwoty.");

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
  return { corrections, expenses, deposits, tips };
}

export async function POST(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as SettlementInput;
  const requestedAction = typeof body.action === "string" ? body.action : "";
  const businessDate = currentBusinessDate();
  const db = getDb();
  if (["SAVE_EXPENSE", "DELETE_EXPENSE"].includes(requestedAction)) {
    const [day] = await db.select({ id: waiterCashDays.id }).from(waiterCashDays).where(and(eq(waiterCashDays.cashDesk, CASH_DESK_NAME), eq(waiterCashDays.status, "OPEN"))).orderBy(desc(waiterCashDays.openedAt), desc(waiterCashDays.id)).limit(1);
    if (!day) return Response.json({ error: "Najpierw otwórz kasę." }, { status: 409 });
    const expenseId = Number(body.expenseId);
    if (requestedAction === "DELETE_EXPENSE") {
      if (!Number.isInteger(expenseId) || expenseId < 1) return Response.json({ error: "Nieprawidłowy wydatek." }, { status: 400 });
      const removed = await db.delete(waiterCashExpenses).where(and(eq(waiterCashExpenses.id, expenseId), eq(waiterCashExpenses.cashDayId, day.id), eq(waiterCashExpenses.status, "PENDING"))).returning({ id: waiterCashExpenses.id });
      if (!removed.length) return Response.json({ error: "Wydatek został już rozliczony albo usunięty." }, { status: 409 });
      return Response.json({ ok: true, expenseId });
    }
    let expense: ReturnType<typeof normalizedExpense>;
    try { expense = normalizedExpense(body.expense); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Nieprawidłowy wydatek." }, { status: 400 }); }
    const now = new Date();
    const values = { description: expense.description, amount: centsToMoney(expense.amount!), receiptNumber: expense.receiptNumber || null, receiptIncluded: true, updatedByDotykackaId: employee.dotykackaId, updatedByName: employee.name, updatedAt: now };
    if (Number.isInteger(expenseId) && expenseId > 0) {
      const [saved] = await db.update(waiterCashExpenses).set(values).where(and(eq(waiterCashExpenses.id, expenseId), eq(waiterCashExpenses.cashDayId, day.id), eq(waiterCashExpenses.status, "PENDING"))).returning();
      if (!saved) return Response.json({ error: "Wydatek został już rozliczony albo usunięty." }, { status: 409 });
      return Response.json({ ok: true, expense: saved });
    }
    const [saved] = await db.insert(waiterCashExpenses).values({ cashDayId: day.id, ...values, createdByDotykackaId: employee.dotykackaId, createdByName: employee.name }).returning();
    return Response.json({ ok: true, expense: saved }, { status: 201 });
  }
  if (["SAVE_DEPOSIT", "DELETE_DEPOSIT"].includes(requestedAction)) {
    const [day] = await db.select({ id: waiterCashDays.id }).from(waiterCashDays).where(and(eq(waiterCashDays.cashDesk, CASH_DESK_NAME), eq(waiterCashDays.status, "OPEN"))).orderBy(desc(waiterCashDays.openedAt), desc(waiterCashDays.id)).limit(1);
    if (!day) return Response.json({ error: "Najpierw otwórz kasę." }, { status: 409 });
    const depositId = Number(body.depositId);
    if (requestedAction === "DELETE_DEPOSIT") {
      if (!Number.isInteger(depositId) || depositId < 1) return Response.json({ error: "Nieprawidłowa wpłata." }, { status: 400 });
      const removed = await db.delete(waiterCashDeposits).where(and(eq(waiterCashDeposits.id, depositId), eq(waiterCashDeposits.cashDayId, day.id), eq(waiterCashDeposits.status, "PENDING"))).returning({ id: waiterCashDeposits.id });
      if (!removed.length) return Response.json({ error: "Wpłata została już rozliczona albo usunięta." }, { status: 409 });
      return Response.json({ ok: true, depositId });
    }
    let deposit: ReturnType<typeof normalizedDeposit>;
    try { deposit = normalizedDeposit(body.deposit); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Nieprawidłowa wpłata." }, { status: 400 }); }
    const now = new Date();
    const values = { contributor: deposit.contributor, amount: centsToMoney(deposit.amount!), note: deposit.note || null, updatedByDotykackaId: employee.dotykackaId, updatedByName: employee.name, updatedAt: now };
    if (Number.isInteger(depositId) && depositId > 0) {
      const [saved] = await db.update(waiterCashDeposits).set(values).where(and(eq(waiterCashDeposits.id, depositId), eq(waiterCashDeposits.cashDayId, day.id), eq(waiterCashDeposits.status, "PENDING"))).returning();
      if (!saved) return Response.json({ error: "Wpłata została już rozliczona albo usunięta." }, { status: 409 });
      return Response.json({ ok: true, deposit: saved });
    }
    const [saved] = await db.insert(waiterCashDeposits).values({ cashDayId: day.id, ...values, createdByDotykackaId: employee.dotykackaId, createdByName: employee.name }).returning();
    return Response.json({ ok: true, deposit: saved }, { status: 201 });
  }
  const action = requestedAction as CashAction;
  if (!["OPEN", "HANDOVER", "CLOSE"].includes(action)) return Response.json({ error: "Wybierz otwarcie, przekazanie albo zamknięcie kasy." }, { status: 400 });
  const idempotencyKey = textValue(body.idempotencyKey, 80);
  if (action !== "OPEN" && !/^[a-zA-Z0-9-]{16,80}$/.test(idempotencyKey)) return Response.json({ error: "Brak bezpiecznego identyfikatora operacji. Odśwież ekran i spróbuj ponownie." }, { status: 400 });
  if (action !== "OPEN") {
    const [existing] = await db.select({
      id: waiterSettlements.id,
      checkpointType: waiterSettlements.checkpointType,
      posSnapshotCash: waiterSettlements.posSnapshotCash,
      posSnapshotCard: waiterSettlements.posSnapshotCard,
      posSnapshotAt: waiterSettlements.posSnapshotAt,
    }).from(waiterSettlements).where(and(eq(waiterSettlements.externalId, idempotencyKey), eq(waiterSettlements.employeeDotykackaId, employee.dotykackaId))).limit(1);
    if (existing) return Response.json({
      status: "ok",
      action: existing.checkpointType,
      settlementId: existing.id,
      externalId: idempotencyKey,
      sessionClosed: false,
      replayed: true,
      snapshotAt: existing.posSnapshotAt?.toISOString(),
      posCash: existing.posSnapshotCash,
      posCard: existing.posSnapshotCard,
    });
  }
  const countedCash = moneyToCents(body.countedCash);
  if (countedCash == null) return Response.json({ error: "Podaj fizycznie policzoną gotówkę." }, { status: 400 });
  const discrepancyNote = textValue(body.discrepancyNote, 1000);
  const employeeNote = textValue(body.employeeNote, 1000);
  const [activeDay] = action === "OPEN" ? [] : await db.select().from(waiterCashDays)
    .where(and(eq(waiterCashDays.cashDesk, CASH_DESK_NAME), eq(waiterCashDays.status, "OPEN")))
    .orderBy(desc(waiterCashDays.openedAt), desc(waiterCashDays.id)).limit(1);
  if (action !== "OPEN" && !activeDay) return Response.json({ error: "Najpierw otwórz kasę." }, { status: 409 });
  const snapshotBusinessDate = activeDay?.businessDate ?? businessDate;
  const snapshotResult = await safeSnapshot(snapshotBusinessDate);
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
    try {
      const saved = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`waiter-cash-day:${CASH_DESK_NAME}`}))`);
        const [alreadyOpen] = await tx.select({ id: waiterCashDays.id }).from(waiterCashDays)
          .where(and(eq(waiterCashDays.cashDesk, CASH_DESK_NAME), eq(waiterCashDays.status, "OPEN"))).limit(1);
        if (alreadyOpen) throw new Error("CASH_DAY_ALREADY_OPEN");
        const [previousClose] = await tx.select().from(waiterCashDays)
          .where(and(eq(waiterCashDays.cashDesk, CASH_DESK_NAME), eq(waiterCashDays.status, "CLOSED")))
          .orderBy(desc(waiterCashDays.closedAt), desc(waiterCashDays.id)).limit(1);
        const expectedOpening = numeric(previousClose?.finalCashLeft);
        const difference = countedCash - expectedOpening;
        if (difference !== 0 && !discrepancyNote) throw new Error("OPENING_DIFFERENCE_REQUIRES_NOTE");
        const [created] = await tx.insert(waiterCashDays).values({
          businessDate, cashDesk: CASH_DESK_NAME, status: "OPEN",
          expectedOpeningCash: centsToMoney(expectedOpening), countedOpeningCash: centsToMoney(countedCash), openingDifference: centsToMoney(difference), openingNote: discrepancyNote || null,
          openingPosCash: centsToMoney(snapshot.cash), openingPosCard: centsToMoney(snapshot.card), openingSnapshotAt: new Date(snapshot.capturedAt), openingSnapshotFrom: new Date(snapshot.periodFrom), openingSnapshotDetails: snapshot.payments,
          carryoverCashDayId: previousClose?.id ?? null,
          carryoverDeclaredByDotykackaId: previousClose?.closedByDotykackaId ?? null,
          carryoverDeclaredByName: previousClose?.closedByName ?? null,
          carryoverDeclaredAt: previousClose?.closedAt ?? null,
          openedByDotykackaId: employee.dotykackaId, openedByName: employee.name,
        }).returning({ id: waiterCashDays.id });
        return created;
      });
      return Response.json({ status: "ok", action, cashDayId: saved.id, sessionClosed: false, snapshotAt: snapshot.capturedAt });
    } catch (error) {
      if (error instanceof Error && error.message === "OPENING_DIFFERENCE_REQUIRES_NOTE") {
        return Response.json({ error: "Wyjaśnij różnicę pomiędzy kwotą pozostawioną po poprzednim zamknięciu a stanem fizycznym." }, { status: 400 });
      }
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if ((error instanceof Error && error.message === "CASH_DAY_ALREADY_OPEN") || code === "23505") {
        return Response.json({ error: "Kasa została już otwarta przez inną osobę." }, { status: 409 });
      }
      throw error;
    }
  }

  const day = activeDay;
  if (!day) return Response.json({ error: "Najpierw otwórz kasę." }, { status: 409 });
  const checkpoints = await db.select().from(waiterSettlements).where(eq(waiterSettlements.cashDayId, day.id)).orderBy(waiterSettlements.submittedAt, waiterSettlements.id);
  const latest = checkpoints.at(-1);
  const [pendingExpenseRows, pendingDepositRows] = await Promise.all([
    db.select().from(waiterCashExpenses).where(and(eq(waiterCashExpenses.cashDayId, day.id), eq(waiterCashExpenses.status, "PENDING"))).orderBy(waiterCashExpenses.createdAt, waiterCashExpenses.id),
    db.select().from(waiterCashDeposits).where(and(eq(waiterCashDeposits.cashDayId, day.id), eq(waiterCashDeposits.status, "PENDING"))).orderBy(waiterCashDeposits.createdAt, waiterCashDeposits.id),
  ]);
  const expenseFingerprint = pendingExpenseRows.map((item) => `${item.id}:${item.updatedAt.getTime()}`).join("|");
  const depositFingerprint = pendingDepositRows.map((item) => `${item.id}:${item.updatedAt.getTime()}`).join("|");
  let details: Awaited<ReturnType<typeof normalizedDetails>>;
  try { details = await normalizedDetails({
    ...body,
    corrections: action === "HANDOVER" ? [] : body.corrections,
    expenses: pendingExpenseRows.map((item) => ({ description: item.description, amount: item.amount, receiptNumber: item.receiptNumber ?? undefined, receiptIncluded: item.receiptIncluded })),
    deposits: pendingDepositRows.map((item) => ({ contributor: item.contributor, amount: item.amount, note: item.note ?? undefined })),
    tips: action === "HANDOVER" ? [] : body.tips,
  }); }
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
    deposits: details.deposits.map((item) => ({ amount: item.amount! })),
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
  const normalizedDeposits = details.deposits.map((item) => ({ contributor: item.contributor, amount: centsToMoney(item.amount!), note: item.note || undefined }));
  const normalizedTips = details.tips.map((tip) => ({ key: tip.key, paymentMethod: tip.paymentMethod as "CASH" | "CARD", amount: centsToMoney(tip.amount!), note: tip.note || undefined, allocations: tip.allocations.map((allocation) => ({ employeeDotykackaId: allocation.employeeDotykackaId, employeeName: allocation.employeeName, amount: centsToMoney(allocation.amount!) })) }));
  const externalId = idempotencyKey;
  try {
    const settlementId = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from waiter_cash_days where id = ${day.id} for update`);
      const [lockedDay] = await tx.select({ status: waiterCashDays.status }).from(waiterCashDays).where(eq(waiterCashDays.id, day.id)).limit(1);
      if (lockedDay?.status !== "OPEN") throw new Error("STALE_CASH_DAY");
      const [currentLatest] = await tx.select({ id: waiterSettlements.id }).from(waiterSettlements).where(eq(waiterSettlements.cashDayId, day.id)).orderBy(desc(waiterSettlements.submittedAt), desc(waiterSettlements.id)).limit(1);
      if ((currentLatest?.id ?? null) !== (latest?.id ?? null)) throw new Error("STALE_CASH_DAY");
      const currentExpenseRows = await tx.select({ id: waiterCashExpenses.id, updatedAt: waiterCashExpenses.updatedAt }).from(waiterCashExpenses).where(and(eq(waiterCashExpenses.cashDayId, day.id), eq(waiterCashExpenses.status, "PENDING"))).orderBy(waiterCashExpenses.createdAt, waiterCashExpenses.id);
      if (currentExpenseRows.map((item) => `${item.id}:${item.updatedAt.getTime()}`).join("|") !== expenseFingerprint) throw new Error("STALE_CASH_DAY");
      const currentDepositRows = await tx.select({ id: waiterCashDeposits.id, updatedAt: waiterCashDeposits.updatedAt }).from(waiterCashDeposits).where(and(eq(waiterCashDeposits.cashDayId, day.id), eq(waiterCashDeposits.status, "PENDING"))).orderBy(waiterCashDeposits.createdAt, waiterCashDeposits.id);
      if (currentDepositRows.map((item) => `${item.id}:${item.updatedAt.getTime()}`).join("|") !== depositFingerprint) throw new Error("STALE_CASH_DAY");
      const checkpointNumber = (await tx.select({ id: waiterSettlements.id }).from(waiterSettlements).where(eq(waiterSettlements.cashDayId, day.id))).length + 1;
      const shiftName = action === "HANDOVER" ? `Przekazanie zmiany #${checkpointNumber}` : "Zamknięcie cyklu kasowego";
      const [saved] = await tx.insert(waiterSettlements).values({
        externalId, businessDate: day.businessDate, shiftName, cashDesk: CASH_DESK_NAME, cashDayId: day.id, checkpointType: action, priorSettlementId: latest?.id ?? null,
        employeeDotykackaId: employee.dotykackaId, employeeName: employee.name,
        openingCash: centsToMoney(baselineCash), posCash: centsToMoney(posDelta.cash), posCard: centsToMoney(posDelta.card), terminalCard: centsToMoney(terminalCard),
        countedCash: centsToMoney(countedCash), cashLeft: centsToMoney(closeCashLeft), envelopeCash: centsToMoney(envelopeCash), envelopeNumber: envelopeNumber || null,
        corrections: normalizedCorrections, expenses: normalizedExpenses, deposits: normalizedDeposits, tips: normalizedTips,
        expectedCash: centsToMoney(totals.expectedCash), cashDifference: centsToMoney(totals.cashDifference), expectedTerminal: centsToMoney(totals.expectedTerminal), terminalDifference: "0.00",
        expensesTotal: centsToMoney(totals.expensesTotal), depositsTotal: centsToMoney(totals.depositsTotal), tipsTotal: centsToMoney(totals.tipsTotal),
        posSnapshotCash: centsToMoney(snapshot.cash), posSnapshotCard: centsToMoney(snapshot.card), posSnapshotAt: new Date(snapshot.capturedAt), posSnapshotFrom: new Date(snapshot.periodFrom), posSnapshotDetails: snapshot.payments,
        discrepancyNote: discrepancyNote || null, employeeNote: employeeNote || null, status: "SUBMITTED",
      }).returning({ id: waiterSettlements.id });
      const allocationRows = normalizedTips.flatMap((tip) => tip.allocations.map((allocation) => ({ settlementId: saved.id, tipKey: tip.key, employeeDotykackaId: allocation.employeeDotykackaId, employeeName: allocation.employeeName, paymentMethod: tip.paymentMethod, amount: allocation.amount })));
      if (allocationRows.length) await tx.insert(waiterTipAllocations).values(allocationRows);
      if (pendingExpenseRows.length) await tx.update(waiterCashExpenses).set({ settlementId: saved.id, status: "SETTLED", settledAt: new Date(), updatedAt: new Date() }).where(inArray(waiterCashExpenses.id, pendingExpenseRows.map((item) => item.id)));
      if (pendingDepositRows.length) await tx.update(waiterCashDeposits).set({ settlementId: saved.id, status: "SETTLED", settledAt: new Date(), updatedAt: new Date() }).where(inArray(waiterCashDeposits.id, pendingDepositRows.map((item) => item.id)));
      await tx.insert(waiterSettlementEvents).values({ settlementId: saved.id, actorType: "EMPLOYEE", actorId: employee.dotykackaId, action: action === "HANDOVER" ? "HANDOVER_SUBMITTED" : "CLOSING_SUBMITTED", details: { externalId, cashDayId: day.id, snapshotAt: snapshot.capturedAt } });
      if (action === "CLOSE") await tx.update(waiterCashDays).set({ status: "CLOSED", finalCashLeft: centsToMoney(countedCash), closedByDotykackaId: employee.dotykackaId, closedByName: employee.name, closedAt: new Date(), updatedAt: new Date() }).where(eq(waiterCashDays.id, day.id));
      return saved.id;
    });
    return Response.json({
      status: "ok",
      action,
      settlementId,
      externalId,
      sessionClosed: false,
      snapshotAt: snapshot.capturedAt,
      posCash: centsToMoney(snapshot.cash),
      posCard: centsToMoney(snapshot.card),
      totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, centsToMoney(value)])),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "STALE_CASH_DAY") return Response.json({ error: "Stan dnia zmienił się w międzyczasie. Zaloguj się ponownie i pobierz aktualne dane." }, { status: 409 });
    throw error;
  }
}
