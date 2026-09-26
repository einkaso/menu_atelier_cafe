"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { settlementTotals } from "../../lib/waiter-settlement";
import { saveWaiterSessionToken, waiterSessionHeaders } from "./waiter-session-client";

type Employee = { dotykackaId: string; name: string };
type Correction = { key: string; direction: "CARD_TO_CASH" | "CASH_TO_CARD"; amount: string; reason: string };
type Expense = { id?: number; key: string; description: string; amount: string; receiptNumber: string; receiptIncluded: boolean; saved: boolean; saving?: boolean };
type Deposit = { id?: number; key: string; contributor: string; amount: string; note: string; saved: boolean; saving?: boolean };
type Allocation = { key: string; employeeDotykackaId: string; amount: string };
type Tip = { key: string; paymentMethod: "CASH" | "CARD"; amount: string; note: string; allocations: Allocation[] };
type Snapshot = { cash: number; card: number; capturedAt: string; periodFrom: string; periodTo: string };
type CashDay = {
  id: number;
  businessDate: string;
  cashDesk: string;
  status: "OPEN" | "CLOSED";
  expectedOpeningCash: string;
  countedOpeningCash: string;
  openingDifference: string;
  openingNote: string | null;
  carryoverDeclaredByName: string | null;
  carryoverDeclaredAt: string | null;
  openedByName: string;
  openedAt: string;
  finalCashLeft: string | null;
  closedByName: string | null;
  closedAt: string | null;
};
type Checkpoint = {
  id: number;
  checkpointType: "HANDOVER" | "CLOSE" | "LEGACY";
  shiftName: string;
  employeeName: string;
  countedCash: string;
  expectedCash: string;
  cashDifference: string;
  posCash: string;
  posCard: string;
  cashLeft: string;
  envelopeCash: string;
  submittedAt: string;
};
type PreviousClose = { businessDate: string; finalCashLeft: string | null; closedByName: string | null; closedAt: string | null };
type Workflow = {
  employee: Employee;
  employees: Employee[];
  businessDate: string;
  cashDesk: string;
  day: CashDay | null;
  checkpoints: Checkpoint[];
  pendingExpenses: Array<{ id: number; description: string; amount: string; receiptNumber: string | null; receiptIncluded: boolean }>;
  pendingDeposits: Array<{ id: number; contributor: string; amount: string; note: string | null }>;
  latest: Checkpoint | null;
  previousClose: PreviousClose | null;
  snapshot: Snapshot | null;
  snapshotError: string | null;
  baseline: { cash: string; snapshot: Snapshot | null };
  interval: { posCash: string; posCard: string; expectedCash: string };
  fullCycle: {
    openingCash: string;
    posCash: string;
    posCard: string;
    expectedCash: string;
  };
};

const amountProps = { min: "0", step: "0.01", inputMode: "decimal" as const };
const POLAND_TIME_ZONE = "Europe/Warsaw";
let fallbackKeyCounter = 0;
const newKey = () => {
  const browserCrypto = globalThis.crypto;
  if (typeof browserCrypto?.randomUUID === "function") return browserCrypto.randomUUID();
  fallbackKeyCounter += 1;
  return `settlement-${Date.now().toString(36)}-${fallbackKeyCounter.toString(36)}`;
};
const cents = (value: string | number | null | undefined) =>
  Math.round((Number(String(value ?? "0").replace(",", ".")) || 0) * 100);
const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(typeof value === "number" ? value / 100 : Number(value ?? 0));
const moneyInput = (value: number) => (Math.max(0, value) / 100).toFixed(2);
const time = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Warsaw",
  }).format(new Date(value))
  : "—";
const clock = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Warsaw",
  }).format(new Date(value))
  : "—";

function MoneyField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <label>
      {label}
      <input type="number" {...amountProps} value={value} onChange={(event) => onChange(event.target.value)} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function SummaryAmount({
  label,
  value,
  sign,
  highlight,
}: {
  label: string;
  value: number;
  sign?: string;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? "cash-summary-amount is-result" : "cash-summary-amount"}>
      {sign && <i>{sign}</i>}
      <span>{label}</span>
      <strong>{money(value)} zł</strong>
    </div>
  );
}

function CurrentDateCalendar() {
  const [currentDate, setCurrentDate] = useState<Date | null>(null);

  useEffect(() => {
    const refresh = () => setCurrentDate(new Date());
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!currentDate) {
    return <time className="cash-current-date" aria-label="Aktualna data"><span>Dzisiaj</span><strong>—</strong><small>ustalam datę</small></time>;
  }

  const parts = new Intl.DateTimeFormat("pl-PL", {
    timeZone: POLAND_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(currentDate);
  const part = (type: "weekday" | "day" | "month" | "year") => parts.find((item) => item.type === type)?.value ?? "";
  const machineDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: POLAND_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(currentDate);

  return <time className="cash-current-date" dateTime={machineDate} aria-label={`Dzisiaj: ${part("weekday")}, ${part("day")} ${part("month")} ${part("year")}`}>
    <span>{part("weekday")}</span>
    <strong>{part("day")}</strong>
    <small>{part("month")} {part("year")} rok</small>
  </time>;
}

function SettlementHeader({ employeeName, onBack, onLogout }: { employeeName: string; onBack: () => void; onLogout: () => void }) {
  return <header className="waiter-section-header waiter-settlement-header">
    <img src="/logo-cafe.png" alt="Marta Banaszek atelier-café" />
    <div className="waiter-section-title">
      <span>Kasa główna</span>
      <strong>Rozliczanie</strong>
      <small>{employeeName}</small>
    </div>
    <nav className="waiter-section-controls" aria-label="Nawigacja rozliczeń">
      <button type="button" onClick={onBack}>← Menu</button>
      <button type="button" onClick={onLogout}>Wyloguj</button>
    </nav>
  </header>;
}

export default function SettlementForm({
  employee,
  onBack,
  onLogout,
}: {
  employee: Employee;
  onBack: () => void;
  onLogout: () => void;
}) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([employee]);
  const [action, setAction] = useState<"HANDOVER" | "CLOSE">("HANDOVER");
  const [countedCash, setCountedCash] = useState("");
  const [cashLeft, setCashLeft] = useState("");
  const [envelopeCash, setEnvelopeCash] = useState("");
  const [splitAnchor, setSplitAnchor] = useState<"CASH_LEFT" | "SAFE" | null>(null);
  const [envelopeNumber, setEnvelopeNumber] = useState("");
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [tips, setTips] = useState<Tip[]>([]);
  const [discrepancyNote, setDiscrepancyNote] = useState("");
  const [employeeNote, setEmployeeNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState<{
    id?: number;
    action: "HANDOVER" | "CLOSE";
    snapshotAt?: string;
    posCash?: string;
    posCard?: string;
  } | null>(null);
  const submissionKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/waiter/settlements", { cache: "no-store", headers: waiterSessionHeaders() });
      const body = await response.json().catch(() => ({})) as Workflow & { error?: string };
      if (!response.ok) setError(body.error ?? "Nie udało się przygotować dnia kasowego.");
      else {
        setWorkflow(body);
        setEmployees(body.employees ?? [employee]);
        setExpenses((current) => [
          ...(body.pendingExpenses ?? []).map((item) => ({
            id: item.id,
            key: `cash-expense-${item.id}`,
            description: item.description,
            amount: item.amount,
            receiptNumber: item.receiptNumber ?? "",
            receiptIncluded: item.receiptIncluded,
            saved: true,
          })),
          ...current.filter((item) => !item.saved && !item.id),
        ]);
        setDeposits((current) => [
          ...(body.pendingDeposits ?? []).map((item) => ({
            id: item.id,
            key: `cash-deposit-${item.id}`,
            contributor: item.contributor,
            amount: item.amount,
            note: item.note ?? "",
            saved: true,
          })),
          ...current.filter((item) => !item.saved && !item.id),
        ]);
      }
    } catch {
      setError("Nie udało się połączyć z modułem rozliczeń.");
    } finally {
      setLoading(false);
    }
  }, [employee]);

  // Initial hydration of the current cash-day workflow.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = window.setInterval(() => {
      void fetch("/api/waiter/session", { method: "PUT", headers: waiterSessionHeaders() }).then(async (response) => {
        if (!response.ok) return;
        const body = await response.json().catch(() => ({})) as { token?: string };
        saveWaiterSessionToken(body.token);
      });
    }, 4 * 60 * 1000);
    return () => window.clearInterval(refresh);
  }, []);
  useEffect(() => {
    const refresh = window.setInterval(() => { void load(); }, 2 * 60 * 1000);
    return () => window.clearInterval(refresh);
  }, [load]);

  const openingMode = !workflow?.day;
  const previousCash = cents(workflow?.previousClose?.finalCashLeft);
  const baselineCash = cents(workflow?.baseline.cash);
  const posCash = cents(workflow?.interval.posCash);
  const posCard = cents(workflow?.interval.posCard);
  const totals = useMemo(() => settlementTotals({
    openingCash: baselineCash,
    posCash,
    posCard,
    terminalCard: 0,
    countedCash: cents(countedCash),
    cashLeft: action === "CLOSE" ? cents(cashLeft) : cents(countedCash),
    envelopeCash: action === "CLOSE" ? cents(envelopeCash) : 0,
    corrections: action === "HANDOVER" ? [] : corrections.map((item) => ({ direction: item.direction, amount: cents(item.amount) })),
    expenses: expenses.filter((item) => item.saved).map((item) => ({ amount: cents(item.amount) })),
    deposits: deposits.filter((item) => item.saved).map((item) => ({ amount: cents(item.amount) })),
    tips: action === "HANDOVER" ? [] : tips.map((item) => ({ paymentMethod: item.paymentMethod, amount: cents(item.amount) })),
  }), [baselineCash, posCash, posCard, countedCash, cashLeft, envelopeCash, action, corrections, expenses, deposits, tips]);
  const openingDifference = cents(countedCash) - previousCash;
  const difference = openingMode ? openingDifference : totals.cashDifference;
  const hasCount = countedCash !== "";
  const tipsComplete = tips.every((tip) =>
    cents(tip.amount) > 0 &&
    tip.allocations.length > 0 &&
    tip.allocations.every((allocation) => allocation.employeeDotykackaId && cents(allocation.amount) > 0) &&
    tip.allocations.reduce((sum, allocation) => sum + cents(allocation.amount), 0) === cents(tip.amount));
  const detailsComplete =
    corrections.every((item) => cents(item.amount) > 0 && item.reason.trim()) &&
    expenses.every((item) => item.saved && cents(item.amount) > 0 && item.description.trim() && item.receiptIncluded) &&
    deposits.every((item) => item.saved && cents(item.amount) > 0 && item.contributor.trim()) &&
    tipsComplete;
  const openReady =
    openingMode &&
    Boolean(workflow?.snapshot) &&
    hasCount &&
    (openingDifference === 0 || Boolean(discrepancyNote.trim()));
  const closeReady =
    action !== "CLOSE" ||
    (totals.splitDifference === 0 &&
      cashLeft !== "" &&
      envelopeCash !== "" &&
      Boolean(envelopeNumber.trim()));
  const checkpointReady =
    !openingMode &&
    workflow?.day?.status === "OPEN" &&
    Boolean(workflow.snapshot) &&
    hasCount &&
    detailsComplete &&
    (totals.cashDifference === 0 || Boolean(discrepancyNote.trim())) &&
    closeReady;
  const canSubmit = !loading && !sending && Boolean(openReady || checkpointReady);
  const extrasCount = expenses.length + deposits.length + (action === "CLOSE" ? corrections.length + (employeeNote.trim() ? 1 : 0) : 0);

  const updateCorrection = (rowKey: string, change: Partial<Correction>) =>
    setCorrections((rows) => rows.map((row) => row.key === rowKey ? { ...row, ...change } : row));
  const updateExpense = (rowKey: string, change: Partial<Expense>) =>
    setExpenses((rows) => rows.map((row) => row.key === rowKey ? { ...row, ...change, saved: change.saved ?? false } : row));
  const updateDeposit = (rowKey: string, change: Partial<Deposit>) =>
    setDeposits((rows) => rows.map((row) => row.key === rowKey ? { ...row, ...change, saved: change.saved ?? false } : row));
  const updateTip = (rowKey: string, change: Partial<Tip>) =>
    setTips((rows) => rows.map((row) => row.key === rowKey ? { ...row, ...change } : row));
  const updateAllocation = (tipKey: string, allocationKey: string, change: Partial<Allocation>) =>
    setTips((rows) => rows.map((tip) => tip.key === tipKey
      ? {
        ...tip,
        allocations: tip.allocations.map((row) =>
          row.key === allocationKey ? { ...row, ...change } : row),
      }
      : tip));

  function addAllocation(tip: Tip) {
    const unused = employees.find((candidate) =>
      !tip.allocations.some((row) => row.employeeDotykackaId === candidate.dotykackaId));
    if (unused) {
      updateTip(tip.key, {
        allocations: [
          ...tip.allocations,
          { key: newKey(), employeeDotykackaId: unused.dotykackaId, amount: "" },
        ],
      });
    }
  }

  function splitEvenly(tip: Tip) {
    const total = cents(tip.amount);
    if (!total || !tip.allocations.length) return;
    const base = Math.floor(total / tip.allocations.length);
    const remainder = total - base * tip.allocations.length;
    updateTip(tip.key, {
      allocations: tip.allocations.map((row, index) => ({
        ...row,
        amount: ((base + (index === 0 ? remainder : 0)) / 100).toFixed(2),
      })),
    });
  }

  function useOpeningFloat() {
    const counted = cents(countedCash);
    const preferred = Math.min(counted, cents(workflow?.day?.countedOpeningCash));
    setSplitAnchor("CASH_LEFT");
    setCashLeft(moneyInput(preferred));
    setEnvelopeCash(moneyInput(counted - preferred));
  }

  function changeCountedCash(value: string) {
    setCountedCash(value);
    if (action !== "CLOSE") return;
    if (!value) {
      if (splitAnchor === "CASH_LEFT") setEnvelopeCash("");
      if (splitAnchor === "SAFE") setCashLeft("");
      return;
    }
    const total = cents(value);
    if (splitAnchor === "CASH_LEFT" && cashLeft !== "") {
      setEnvelopeCash(total >= cents(cashLeft) ? moneyInput(total - cents(cashLeft)) : "");
    }
    if (splitAnchor === "SAFE" && envelopeCash !== "") {
      setCashLeft(total >= cents(envelopeCash) ? moneyInput(total - cents(envelopeCash)) : "");
    }
  }

  function changeCashLeft(value: string) {
    setSplitAnchor("CASH_LEFT");
    setCashLeft(value);
    if (!value || countedCash === "" || cents(value) > cents(countedCash)) {
      setEnvelopeCash("");
      return;
    }
    setEnvelopeCash(moneyInput(cents(countedCash) - cents(value)));
  }

  function changeSafeCash(value: string) {
    setSplitAnchor("SAFE");
    setEnvelopeCash(value);
    if (!value || countedCash === "" || cents(value) > cents(countedCash)) {
      setCashLeft("");
      return;
    }
    setCashLeft(moneyInput(cents(countedCash) - cents(value)));
  }

  async function saveExpense(item: Expense) {
    if (!item.description.trim() || cents(item.amount) <= 0 || !item.receiptIncluded || item.saving) return;
    updateExpense(item.key, { saving: true, saved: item.saved });
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/waiter/settlements", {
        method: "POST",
        headers: waiterSessionHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ action: "SAVE_EXPENSE", expenseId: item.id, expense: { description: item.description, amount: item.amount, receiptNumber: item.receiptNumber, receiptIncluded: item.receiptIncluded } }),
      });
      const body = await response.json().catch(() => ({})) as { expense?: { id: number; description: string; amount: string; receiptNumber: string | null; receiptIncluded: boolean }; error?: string };
      if (!response.ok || !body.expense) setError(body.error ?? "Nie udało się zapisać wydatku.");
      else {
        setExpenses((rows) => rows.map((row) => row.key === item.key ? { id: body.expense!.id, key: `cash-expense-${body.expense!.id}`, description: body.expense!.description, amount: body.expense!.amount, receiptNumber: body.expense!.receiptNumber ?? "", receiptIncluded: body.expense!.receiptIncluded, saved: true, saving: false } : row));
        setMessage("Wydatek został zapisany w bieżącym cyklu kasowym.");
      }
    } catch {
      setError("Nie udało się połączyć z modułem rozliczeń.");
    } finally {
      setExpenses((rows) => rows.map((row) => row.key === item.key ? { ...row, saving: false } : row));
    }
  }

  async function removeExpense(item: Expense) {
    if (!item.id) { setExpenses((rows) => rows.filter((row) => row.key !== item.key)); return; }
    updateExpense(item.key, { saving: true, saved: item.saved });
    setError("");
    try {
      const response = await fetch("/api/waiter/settlements", { method: "POST", headers: waiterSessionHeaders({ "content-type": "application/json" }), body: JSON.stringify({ action: "DELETE_EXPENSE", expenseId: item.id }) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) setError(body.error ?? "Nie udało się usunąć wydatku.");
      else { setExpenses((rows) => rows.filter((row) => row.key !== item.key)); setMessage("Wydatek został usunięty."); }
    } catch {
      setError("Nie udało się połączyć z modułem rozliczeń.");
    } finally {
      setExpenses((rows) => rows.map((row) => row.key === item.key ? { ...row, saving: false } : row));
    }
  }

  async function saveDeposit(item: Deposit) {
    if (!item.contributor.trim() || cents(item.amount) <= 0 || item.saving) return;
    updateDeposit(item.key, { saving: true, saved: item.saved });
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/waiter/settlements", {
        method: "POST",
        headers: waiterSessionHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ action: "SAVE_DEPOSIT", depositId: item.id, deposit: { contributor: item.contributor, amount: item.amount, note: item.note } }),
      });
      const body = await response.json().catch(() => ({})) as { deposit?: { id: number; contributor: string; amount: string; note: string | null }; error?: string };
      if (!response.ok || !body.deposit) setError(body.error ?? "Nie udało się zapisać wpłaty do kasy.");
      else {
        setDeposits((rows) => rows.map((row) => row.key === item.key ? { id: body.deposit!.id, key: `cash-deposit-${body.deposit!.id}`, contributor: body.deposit!.contributor, amount: body.deposit!.amount, note: body.deposit!.note ?? "", saved: true, saving: false } : row));
        setMessage("Wpłata drobnych została dodana do bieżącego cyklu kasowego.");
      }
    } catch {
      setError("Nie udało się połączyć z modułem rozliczeń.");
    } finally {
      setDeposits((rows) => rows.map((row) => row.key === item.key ? { ...row, saving: false } : row));
    }
  }

  async function removeDeposit(item: Deposit) {
    if (!item.id) { setDeposits((rows) => rows.filter((row) => row.key !== item.key)); return; }
    updateDeposit(item.key, { saving: true, saved: item.saved });
    setError("");
    try {
      const response = await fetch("/api/waiter/settlements", { method: "POST", headers: waiterSessionHeaders({ "content-type": "application/json" }), body: JSON.stringify({ action: "DELETE_DEPOSIT", depositId: item.id }) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) setError(body.error ?? "Nie udało się usunąć wpłaty.");
      else { setDeposits((rows) => rows.filter((row) => row.key !== item.key)); setMessage("Wpłata została usunięta."); }
    } catch {
      setError("Nie udało się połączyć z modułem rozliczeń.");
    } finally {
      setDeposits((rows) => rows.map((row) => row.key === item.key ? { ...row, saving: false } : row));
    }
  }

  async function submit() {
    if (!canSubmit) return;
    const requestedAction = openingMode ? "OPEN" : action;
    const idempotencyKey = submissionKey.current ?? newKey();
    submissionKey.current = idempotencyKey;
    setSending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/waiter/settlements", {
        method: "POST",
        headers: waiterSessionHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          action: requestedAction,
          countedCash,
          cashLeft,
          envelopeCash,
          envelopeNumber,
          corrections: requestedAction === "HANDOVER" ? [] : corrections.map(({ direction, amount, reason }) => ({ direction, amount, reason })),
          expenses: expenses.filter((item) => item.saved).map(({ description, amount, receiptNumber, receiptIncluded }) => ({
            description,
            amount,
            receiptNumber,
            receiptIncluded,
          })),
          deposits: deposits.filter((item) => item.saved).map(({ contributor, amount, note }) => ({ contributor, amount, note })),
          tips: requestedAction === "HANDOVER" ? [] : tips.map((tip) => ({
            key: tip.key,
            paymentMethod: tip.paymentMethod,
            amount: tip.amount,
            note: tip.note,
            allocations: tip.allocations.map(({ employeeDotykackaId, amount }) => ({
              employeeDotykackaId,
              amount,
            })),
          })),
          discrepancyNote,
          employeeNote,
          idempotencyKey,
          snapshotCashCents: workflow?.snapshot?.cash,
          snapshotCardCents: workflow?.snapshot?.card,
        }),
      });
      const body = await response.json().catch(() => ({})) as {
        settlementId?: number;
        error?: string;
        snapshotChanged?: boolean;
        snapshotAt?: string;
        posCash?: string;
        posCard?: string;
      };
      if (!response.ok) {
        if (body.snapshotChanged) await load();
        setError(body.error ?? "Nie udało się zapisać operacji kasowej.");
      } else if (requestedAction === "OPEN") {
        setCountedCash("");
        setDiscrepancyNote("");
        setMessage("Kasa została otwarta. Możesz rozpocząć pracę.");
        await load();
      } else if (Number.isInteger(body.settlementId)) {
        setSubmitted({
          id: body.settlementId,
          action: requestedAction,
          snapshotAt: body.snapshotAt,
          posCash: body.posCash,
          posCard: body.posCard,
        });
      } else {
        setError("Serwer nie potwierdził numeru protokołu. Nie wylogowano pracownika — spróbuj ponownie tym samym przyciskiem.");
      }
    } catch {
      setError("Nie udało się połączyć z modułem rozliczeń.");
    } finally {
      setSending(false);
    }
  }

  if (submitted) {
    return (
      <main className="waiter-app">
        <SettlementHeader employeeName={employee.name} onBack={onBack} onLogout={onLogout} />
        <section className="cash-done">
          <span>PROTOKÓŁ #{submitted.id}</span>
          <h1>Gotowe</h1>
          <p>
            {submitted.action === "HANDOVER"
              ? "Stan kasy został zapisany. Teraz zmiennik loguje się swoim PIN-em."
              : "Cykl kasowy został zamknięty, a pełny policzony stan zapisany do kolejnego otwarcia."}
          </p>
          <div>
            <SummaryAmount label="Policzona gotówka" value={cents(countedCash)} />
            <SummaryAmount label="Dotykačka · gotówka" value={cents(submitted.posCash)} />
            <SummaryAmount label="Dotykačka · karta" value={cents(submitted.posCard)} />
            {submitted.action === "CLOSE" && <SummaryAmount label="Pełny stan do kolejnego otwarcia" value={cents(countedCash)} />}
          </div>
          <p className="cash-final-snapshot">Dane z Dotykački pobrano o {clock(submitted.snapshotAt)}.</p>
          <button onClick={onLogout}>{submitted.action === "HANDOVER" ? "Przekazanie zapisane — zakończ i wyloguj" : "Zamknięcie zapisane — zakończ i wyloguj"}</button>
        </section>
      </main>
    );
  }

  return (
    <main className="waiter-app">
      <SettlementHeader employeeName={employee.name} onBack={onBack} onLogout={onLogout} />

      <section className="waiter-settlement cash-simple">
        <div className="cash-simple-title">
          <span>{workflow?.day ? `CYKL OTWARTY ${workflow.day.businessDate}` : workflow?.businessDate ?? "CYKL KASOWY"}</span>
          <h1>
            {openingMode
              ? "Otwórz kasę"
              : workflow?.day?.status === "CLOSED"
                ? "Kasa zamknięta"
                : "Codzienny system rozliczania utargu."}
          </h1>
          <CurrentDateCalendar />
          <p>
            {openingMode
              ? "Przelicz pieniądze po poprzednim zamknięciu. System przenosi pełny policzony stan."
              : "Wybierz przekazanie zmiany albo zamknięcie cyklu kasowego. Cykl może przechodzić przez północ."}
          </p>
        </div>

        {(message || error) && (
          <p className={error ? "waiter-error" : "waiter-settlement-message"} role={error ? "alert" : "status"}>
            {error || message}
          </p>
        )}

        {loading ? (
          <section className="cash-simple-card">
            <p className="cash-loading">Pobieram aktualny stan z Dotykački…</p>
          </section>
        ) : workflow?.day?.status === "CLOSED" ? (
          <section className="cash-simple-card cash-closed">
            <b>✓</b>
            <div>
                  <h2>Cykl kasowy jest już zamknięty</h2>
              <p>{workflow.day.closedByName} · {time(workflow.day.closedAt)}</p>
            </div>
            <strong>{money(workflow.day.finalCashLeft)} zł do kolejnego otwarcia</strong>
          </section>
        ) : (
          <>
            <section className="cash-operation-choice cash-stage-cards" aria-label="Etapy prowadzenia kasy">
                <button className={openingMode ? "is-active" : "is-complete"} disabled={!openingMode} aria-current={openingMode ? "step" : undefined}>
                  <span>Etap 1</span>
                  <b>Otwarcie kasy</b>
                  <small>{openingMode ? "Policz i potwierdź saldo pozostawione przez poprzednią zmianę." : `Otwarto: ${workflow?.day?.openedByName ?? "—"}`}</small>
                </button>
                <button
                  className={action === "HANDOVER" ? "is-active" : ""}
                  disabled={openingMode}
                  aria-current={!openingMode && action === "HANDOVER" ? "step" : undefined}
                  onClick={() => setAction("HANDOVER")}
                >
                  <span>Etap 2</span>
                  <b>Przekazanie zmiany</b>
                  <small>Policz kasę, zapisz stan i wyloguj się.</small>
                </button>
                <button
                  className={action === "CLOSE" ? "is-active" : ""}
                  disabled={openingMode}
                  aria-current={!openingMode && action === "CLOSE" ? "step" : undefined}
                  onClick={() => setAction("CLOSE")}
                >
                  <span>Etap 3</span>
                  <b>Zamknięcie cyklu kasowego</b>
                  <small>Policz pełny stan i zapisz podział na kasę oraz kopertę.</small>
                </button>
              </section>

            {!openingMode && action === "CLOSE" && (
              <section className="cash-simple-card cash-tips-card">
                <header>
                  <span>WAŻNE</span>
                  <div>
                    <h2>Napiwki</h2>
                    <p>Wpisz napiwki z tej zmiany i przypisz je pracownikom.</p>
                  </div>
                  <button type="button" className="cash-tip-add" onClick={() => setTips((rows) => [
                    ...rows,
                    {
                      key: newKey(),
                      paymentMethod: "CARD",
                      amount: "",
                      note: "",
                      allocations: [{ key: newKey(), employeeDotykackaId: employee.dotykackaId, amount: "" }],
                    },
                  ])}>+ Dodaj napiwek</button>
                </header>
                {!tips.length && <p className="cash-tips-empty">Nie wpisano jeszcze napiwku dla tej zmiany.</p>}
                {tips.map((tip) => (
                  <article className="waiter-tip-row" key={tip.key}>
                    <div className="waiter-settlement-fields">
                      <label>
                        Sposób
                        <select value={tip.paymentMethod} onChange={(event) => updateTip(tip.key, { paymentMethod: event.target.value as Tip["paymentMethod"] })}>
                          <option value="CARD">Karta</option>
                          <option value="CASH">Gotówka</option>
                        </select>
                      </label>
                      <MoneyField
                        label="Łączna kwota"
                        value={tip.amount}
                        onChange={(value) => updateTip(tip.key, {
                          amount: value,
                          allocations: tip.allocations.length === 1
                            ? [{ ...tip.allocations[0], amount: value }]
                            : tip.allocations,
                        })}
                      />
                      <label>
                        Opis
                        <input value={tip.note} maxLength={300} onChange={(event) => updateTip(tip.key, { note: event.target.value })} />
                      </label>
                    </div>
                    <div className="waiter-tip-head">
                      <b>Podział napiwku</b>
                      <div>
                        <button type="button" onClick={() => splitEvenly(tip)}>Podziel równo</button>
                        <button type="button" disabled={tip.allocations.length >= employees.length} onClick={() => addAllocation(tip)}>+ Osoba</button>
                      </div>
                    </div>
                    {tip.allocations.map((allocation) => (
                      <div className="waiter-tip-allocation" key={allocation.key}>
                        <select
                          value={allocation.employeeDotykackaId}
                          onChange={(event) => updateAllocation(tip.key, allocation.key, {
                            employeeDotykackaId: event.target.value,
                          })}
                        >
                          {employees.map((candidate) => (
                            <option key={candidate.dotykackaId} value={candidate.dotykackaId}>{candidate.name}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          {...amountProps}
                          value={allocation.amount}
                          onChange={(event) => updateAllocation(tip.key, allocation.key, { amount: event.target.value })}
                        />
                        <button
                          type="button"
                          disabled={tip.allocations.length === 1}
                          onClick={() => updateTip(tip.key, {
                            allocations: tip.allocations.filter((row) => row.key !== allocation.key),
                          })}
                        >×</button>
                      </div>
                    ))}
                    <footer>
                      <small>
                        Przydzielono {money(tip.allocations.reduce((sum, row) => sum + cents(row.amount), 0))} z {money(cents(tip.amount))} zł
                      </small>
                      <button type="button" className="waiter-remove-row" onClick={() => setTips((rows) => rows.filter((row) => row.key !== tip.key))}>Usuń napiwek</button>
                    </footer>
                  </article>
                ))}
              </section>
            )}

            {(openingMode || action === "CLOSE") && (
            <section className="cash-simple-card">
              <header>
                <span>KROK 1</span>
                <div>
                  <h2>{openingMode ? "Sprawdź saldo z poprzedniego zamknięcia" : "Sprawdź wyliczenie systemu"}</h2>
                  <p>
                    {openingMode
                      ? "Tyle powinno fizycznie zostać w kasie."
                      : "Kontrola obejmuje ostatni policzony stan i sprzedaż od tamtej migawki."}
                  </p>
                </div>
                <button className="cash-refresh" onClick={() => void load()}>↻ Odśwież</button>
              </header>

              {openingMode ? (
                <div className="cash-opening-summary">
                  <SummaryAmount label="Pełny stan z poprzedniego zamknięcia" value={previousCash} highlight />
                  <div className="cash-opening-person">
                    <span>Ostatnie zamknięcie</span>
                    <b>{workflow?.previousClose?.closedByName ?? "Brak wcześniejszego zamknięcia"}</b>
                    <small>{time(workflow?.previousClose?.closedAt)}</small>
                  </div>
                </div>
              ) : (
                <>
                  <div className="cash-equation" aria-label="Kontrola stanu gotówki od ostatniego fizycznego przeliczenia">
                    <SummaryAmount label="Ostatnio policzona gotówka" value={baselineCash} />
                    <SummaryAmount label="Dotykačka · gotówka od ostatniego przeliczenia" value={posCash} sign="+" />
                    {totals.cashTips > 0 && <SummaryAmount label="Napiwki gotówkowe" value={totals.cashTips} sign="+" />}
                    {totals.cardToCash > 0 && <SummaryAmount label="Korekta karta → gotówka" value={totals.cardToCash} sign="+" />}
                    {totals.cashToCard > 0 && <SummaryAmount label="Korekta gotówka → karta" value={totals.cashToCard} sign="−" />}
                    {totals.expensesTotal > 0 && <SummaryAmount label="Wydatki z kasy" value={totals.expensesTotal} sign="−" />}
                    {totals.depositsTotal > 0 && <SummaryAmount label="Wpłaty drobnych do kasy" value={totals.depositsTotal} sign="+" />}
                    <SummaryAmount label="Stan oczekiwany teraz" value={totals.expectedCash} highlight />
                  </div>
                  <div className="cash-card-info">
                    <span>Dotykačka · karta od ostatniego przeliczenia</span>
                    <strong>{money(posCard)} zł</strong>
                  </div>
                </>
              )}

              {workflow?.snapshot ? (
                <div className="cash-live-state">
                  <i />
                  <div>
                    <b>Aktualne dane z Dotykački na godz. {clock(workflow.snapshot.capturedAt)}</b>
                    <span>Odświeżają się automatycznie. Przy zapisie system sprawdzi je ponownie.</span>
                  </div>
                </div>
              ) : (
                <p className="cash-snapshot-error">
                  {workflow?.snapshotError ?? "Brak połączenia z Dotykačką. Naciśnij „Odśwież”."}
                </p>
              )}
            </section>
            )}

            {!openingMode && (
              <details className="cash-extras">
                <summary>
                  <span className="cash-extras-step">KROK 2</span>
                  <div>
                    <b>Opcje dodatkowe</b>
                    <span>{action === "HANDOVER" ? "Wydatki i wpłaty prowadzone na bieżąco" : "Korekty płatności, wydatki, wpłaty drobnych i uwagi"}</span>
                  </div>
                  <em>{extrasCount ? String(extrasCount) + " wpisów" : "Rozwiń tylko w razie potrzeby"}</em>
                </summary>
                <div className="cash-extras-body">
                  {action === "CLOSE" && (
                  <section>
                    <header>
                      <div><h3>Korekty płatności</h3><p>Gdy sposób płatności w POS różni się od faktycznego.</p></div>
                      <button type="button" onClick={() => setCorrections((rows) => [
                        ...rows,
                        { key: newKey(), direction: "CARD_TO_CASH", amount: "", reason: "" },
                      ])}>+ Dodaj</button>
                    </header>
                    {corrections.map((item) => (
                      <article className="waiter-settlement-row" key={item.key}>
                        <label>
                          Kierunek
                          <select
                            value={item.direction}
                            onChange={(event) => updateCorrection(item.key, {
                              direction: event.target.value as Correction["direction"],
                            })}
                          >
                            <option value="CARD_TO_CASH">W POS karta → gotówka</option>
                            <option value="CASH_TO_CARD">W POS gotówka → karta</option>
                          </select>
                        </label>
                        <MoneyField label="Kwota" value={item.amount} onChange={(value) => updateCorrection(item.key, { amount: value })} />
                        <label className="is-wide">
                          Wyjaśnienie
                          <input value={item.reason} maxLength={300} onChange={(event) => updateCorrection(item.key, { reason: event.target.value })} />
                        </label>
                        <button type="button" className="waiter-remove-row" onClick={() => setCorrections((rows) => rows.filter((row) => row.key !== item.key))}>Usuń</button>
                      </article>
                    ))}
                  </section>
                  )}

                  <section>
                    <header>
                      <div><h3>Wydatki z gotówki</h3><p>Tylko wydatki od ostatniego przeliczenia. Saldo uwzględnia wyłącznie pozycje oznaczone „Zapisano w kasie”.</p></div>
                      <button type="button" onClick={() => setExpenses((rows) => [
                        ...rows,
                        { key: newKey(), description: "", amount: "", receiptNumber: "", receiptIncluded: false, saved: false },
                      ])}>+ Dodaj</button>
                    </header>
                    {expenses.map((item) => (
                      <article className="waiter-settlement-row cash-expense-row" key={item.key}>
                        <label className="is-wide">
                          Co kupiono
                          <input value={item.description} maxLength={300} onChange={(event) => updateExpense(item.key, { description: event.target.value })} />
                        </label>
                        <MoneyField label="Kwota" value={item.amount} onChange={(value) => updateExpense(item.key, { amount: value })} />
                        <label>
                          Numer dokumentu
                          <input value={item.receiptNumber} maxLength={100} onChange={(event) => updateExpense(item.key, { receiptNumber: event.target.value })} />
                        </label>
                        <label className="waiter-receipt-check">
                          <input type="checkbox" checked={item.receiptIncluded} onChange={(event) => updateExpense(item.key, { receiptIncluded: event.target.checked })} />
                          Paragon zabezpieczony
                        </label>
                        <div className={`cash-expense-save${item.saved ? " is-saved" : ""}`}><span>{item.saved ? "✓ Zapisano w kasie" : "Niezapisany"}</span><button type="button" disabled={item.saving || item.saved || !item.description.trim() || cents(item.amount) <= 0 || !item.receiptIncluded} onClick={() => void saveExpense(item)}>{item.saving ? "Zapisuję…" : item.saved ? "Zapisano" : "Zapisz wydatek"}</button></div>
                        <button type="button" disabled={item.saving} className="waiter-remove-row" onClick={() => void removeExpense(item)}>Usuń</button>
                      </article>
                    ))}
                  </section>

                  <section>
                    <header>
                      <div><h3>Wpłata środków do kasy</h3><p>Uzupełnienie drobnych z kasy głównej — dopłata bez wymiany banknotów i monet.</p></div>
                      <button type="button" onClick={() => setDeposits((rows) => [
                        ...rows,
                        { key: newKey(), contributor: "", amount: "", note: "", saved: false },
                      ])}>+ Dodaj</button>
                    </header>
                    {deposits.map((item) => (
                      <article className="waiter-settlement-row cash-deposit-row" key={item.key}>
                        <label className="is-wide">
                          Osoba przekazująca środki
                          <input value={item.contributor} maxLength={160} onChange={(event) => updateDeposit(item.key, { contributor: event.target.value })} placeholder="np. manager" />
                        </label>
                        <MoneyField label="Kwota dopłaty" value={item.amount} onChange={(value) => updateDeposit(item.key, { amount: value })} />
                        <label className="is-wide">
                          Informacja
                          <input value={item.note} maxLength={300} onChange={(event) => updateDeposit(item.key, { note: event.target.value })} placeholder="np. drobne do wydawania reszty" />
                        </label>
                        <button type="button" disabled={item.saving} className="waiter-remove-row" onClick={() => void removeDeposit(item)}>Usuń</button>
                        <div className={`cash-expense-save cash-deposit-save${item.saved ? " is-saved" : ""}`}><span>{item.saved ? "✓ Wpłata zapisana" : "Niezapisana"}</span><button type="button" disabled={item.saving || item.saved || !item.contributor.trim() || cents(item.amount) <= 0} onClick={() => void saveDeposit(item)}>{item.saving ? "Zapisuję…" : item.saved ? "Zapisano" : "Zapisz wpłatę"}</button></div>
                      </article>
                    ))}
                  </section>

                  {action === "CLOSE" && <label className="cash-employee-note">
                    Inna uwaga
                    <textarea value={employeeNote} maxLength={1000} onChange={(event) => setEmployeeNote(event.target.value)} />
                  </label>}
                </div>
              </details>
            )}

            <section className="cash-simple-card cash-count-card">
              <header>
                <span>{openingMode ? "KROK 2" : "KROK 3"}</span>
                <div>
                  <h2>{action === "HANDOVER" && !openingMode ? "Przelicz gotówkę i przekaż zmianę" : "Podaj pełny stan kasy"}</h2>
                  <p>{action === "HANDOVER" && !openingMode ? "Wpisz wyłącznie pełną kwotę, którą fizycznie policzono w kasie." : "Wpisz całą policzoną kwotę — nie tylko utarg od poprzedniej zmiany."}</p>
                </div>
              </header>
              <div className={`cash-count-entry${!openingMode ? " is-checkpoint" : ""}`}>
                {!openingMode && (
                  <div className="cash-expected-inline">
                    <span>System oczekuje teraz</span>
                    <strong>{money(totals.expectedCash)} zł</strong>
                    <small>
                      {money(baselineCash)} zł ostatniego stanu + {money(posCash)} zł sprzedaży gotówkowej
                      {totals.cashTips > 0 ? ` + ${money(totals.cashTips)} zł napiwków gotówkowych` : ""}
                      {totals.cardToCash > 0 ? ` + ${money(totals.cardToCash)} zł korekt na gotówkę` : ""}
                      {totals.cashToCard > 0 ? ` − ${money(totals.cashToCard)} zł korekt na kartę` : ""}
                      {totals.expensesTotal > 0 ? ` − ${money(totals.expensesTotal)} zł wypłat` : ""}
                      {totals.depositsTotal > 0 ? ` + ${money(totals.depositsTotal)} zł wpłat` : ""}
                      {action === "CLOSE" ? ` · Sprzedaż gotówkowa całego cyklu: ${money(cents(workflow?.fullCycle.posCash))} zł` : ""}
                    </small>
                    <button type="button" className="cash-refresh cash-expected-refresh" onClick={() => void load()}>↻ Odśwież</button>
                  </div>
                )}
                <label>
                  Pełna kwota w kasie teraz
                  <div>
                    <input
                      autoFocus
                      type="number"
                      {...amountProps}
                      value={countedCash}
                      placeholder="0,00"
                      onChange={(event) => changeCountedCash(event.target.value)}
                    />
                    <b>zł</b>
                  </div>
                </label>
                <div className={hasCount && difference !== 0 ? "cash-difference is-warning" : "cash-difference"}>
                  <span>Różnica</span>
                  <strong>{hasCount ? money(difference) : "—"} zł</strong>
                  <small>{difference === 0 && hasCount ? "Wszystko się zgadza" : "stan fizyczny minus wyliczenie"}</small>
                </div>
              </div>

              {hasCount && difference !== 0 && (
                <label className="cash-required-note">
                  Wyjaśnij różnicę
                  <textarea
                    value={discrepancyNote}
                    maxLength={1000}
                    onChange={(event) => setDiscrepancyNote(event.target.value)}
                    placeholder="Np. pomyłka przy wydawaniu reszty albo inny stan od poprzedniego zamknięcia"
                  />
                  <small>Bez wyjaśnienia nie można zapisać różnicy.</small>
                </label>
              )}
            </section>

            {!openingMode && action === "CLOSE" && (
              <section className="cash-simple-card">
                <header>
                  <span>KROK 4</span>
                  <div>
                    <h2>Podziel gotówkę</h2>
                    <p>Wpisz jedną kwotę. System automatycznie wyliczy drugą tak, aby cała gotówka została rozdzielona.</p>
                  </div>
                </header>
                <button className="cash-use-float" disabled={!hasCount} onClick={useOpeningFloat}>
                  Zostaw w kasie tyle, ile było przy otwarciu
                </button>
                <div className="cash-split-fields">
                  <MoneyField label="Fizycznie zostaje w szufladzie" value={cashLeft} onChange={changeCashLeft} hint={splitAnchor === "SAFE" && cashLeft !== "" ? "Wyliczono automatycznie" : undefined} />
                  <MoneyField label="Do sejfu w bezpiecznej kopercie" value={envelopeCash} onChange={changeSafeCash} hint={splitAnchor === "CASH_LEFT" && envelopeCash !== "" ? "Wyliczono automatycznie" : undefined} />
                  <label>
                    Numer bezpiecznej koperty
                    <input required value={envelopeNumber} maxLength={80} onChange={(event) => setEnvelopeNumber(event.target.value)} />
                    <small>Obowiązkowo włóż do koperty wydruk z kasy fiskalnej i wydruk z terminala — także gdy do sejfu przekazujesz 0 zł.</small>
                  </label>
                </div>
                {cashLeft !== "" && envelopeCash !== "" && (
                  <p className={totals.splitDifference === 0 ? "cash-split-ok" : "cash-split-error"}>
                    {totals.splitDifference === 0
                      ? "✓ Cała gotówka została rozdzielona."
                      : "Pozostało do rozdzielenia: " + money(totals.splitDifference) + " zł"}
                  </p>
                )}
              </section>
            )}

            <section className="cash-confirm">
              <div>
                <span>{openingMode ? "OTWIERA KASĘ" : action === "HANDOVER" ? "PRZEKAZUJE ZMIANĘ" : "ZAMYKA KASĘ"}</span>
                <strong>{employee.name}</strong>
                <small>Tożsamość potwierdzona PIN-em</small>
              </div>
              <button disabled={!canSubmit} onClick={() => void submit()}>
                {sending
                  ? "Sprawdzam dane i zapisuję…"
                  : openingMode
                    ? "Potwierdź otwarcie"
                    : action === "HANDOVER"
                      ? "Przekaż zmianę"
                      : "Zamknij cykl"}
              </button>
            </section>

            {workflow?.day && (
              <details className="cash-history">
                <summary>Historia bieżącego cyklu kasy ({workflow.checkpoints.length + 1})</summary>
                <article>
                  <div>
                    <b>Otwarcie kasy</b>
                    <span>{workflow.day.openedByName} · {time(workflow.day.openedAt)}</span>
                  </div>
                  <strong>{money(workflow.day.countedOpeningCash)} zł</strong>
                </article>
                {workflow.checkpoints.map((item) => (
                  <article key={item.id}>
                    <div>
                      <b>{item.checkpointType === "HANDOVER" ? "Przekazanie zmiany" : "Zamknięcie cyklu kasowego"}</b>
                      <span>{item.employeeName} · {time(item.submittedAt)}</span>
                    </div>
                    <strong>{money(item.countedCash)} zł</strong>
                  </article>
                ))}
              </details>
            )}
          </>
        )}
      </section>
    </main>
  );
}
