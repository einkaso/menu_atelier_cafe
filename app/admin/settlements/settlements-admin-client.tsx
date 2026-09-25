"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import AdminSectionHeader from "../admin-section-header";

type Correction = { direction: "CARD_TO_CASH" | "CASH_TO_CARD"; amount: string; reason: string };
type Expense = { description: string; amount: string; receiptNumber?: string; receiptIncluded: boolean };
type Deposit = { contributor: string; amount: string; note?: string };
type Tip = { key: string; paymentMethod: "CASH" | "CARD"; amount: string; note?: string; allocations: Array<{ employeeDotykackaId: string; employeeName: string; amount: string }> };
type Settlement = {
  id: number; externalId: string; businessDate: string; shiftName: string; cashDesk: string; employeeName: string;
  cashDayId: number | null; checkpointType: "HANDOVER" | "CLOSE" | "LEGACY"; posSnapshotAt: string | null;
  openingCash: string; posCash: string; posCard: string; terminalCard: string; countedCash: string; cashLeft: string; envelopeCash: string;
  envelopeNumber: string | null; corrections: Correction[]; expenses: Expense[]; deposits: Deposit[]; tips: Tip[]; expectedCash: string; cashDifference: string;
  expectedTerminal: string; terminalDifference: string; expensesTotal: string; depositsTotal: string; tipsTotal: string; discrepancyNote: string | null; employeeNote: string | null;
  status: "SUBMITTED" | "VERIFIED" | "NEEDS_CORRECTION"; adminNote: string | null; submittedAt: string; verifiedAt: string | null;
};
type CashDay = {
  id: number; businessDate: string; cashDesk: string; status: "OPEN" | "CLOSED";
  expectedOpeningCash: string; countedOpeningCash: string; openingDifference: string; openingNote: string | null;
  carryoverDeclaredByName: string | null; carryoverDeclaredAt: string | null;
  openedByName: string; openedAt: string; finalCashLeft: string | null; closedByName: string | null; closedAt: string | null;
};
type Employee = { dotykackaId: string; name: string };
type TipAdjustment = {
  id: number; employeeDotykackaId: string; employeeName: string; businessDate: string; amount: string; reason: string;
  payoutStatus: "DUE" | "PAID"; paidAt: string | null; createdBy: string; createdAt: string;
  voidedBy: string | null; voidedAt: string | null; voidReason: string | null;
};
type TipSummary = { employeeDotykackaId: string; employeeName: string; total: number; due: number; pending: number; paid: number; allocationIds: number[]; adjustmentIds: number[] };
type Summary = { count: number; openingCash: number; posCash: number; posCard: number; terminalCard: number; countedCash: number; cashLeft: number; envelopeCash: number; expenses: number; deposits: number; tips: number; cashDifference: number; terminalDifference: number };

const money = (value: number | string) => new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const monthStart = () => `${today().slice(0, 7)}-01`;
const statusLabel = (status: Settlement["status"]) => status === "VERIFIED" ? "Sprawdzone" : status === "NEEDS_CORRECTION" ? "Wymaga korekty" : "Do sprawdzenia";

export default function SettlementsAdminClient() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState("ALL");
  const [cashDays, setCashDays] = useState<CashDay[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [ledgerSettlements, setLedgerSettlements] = useState<Settlement[]>([]);
  const [tips, setTips] = useState<TipSummary[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tipAdjustments, setTipAdjustments] = useState<TipAdjustment[]>([]);
  const [tipEmployeeId, setTipEmployeeId] = useState("");
  const [tipDirection, setTipDirection] = useState<"ADD" | "DEDUCT">("ADD");
  const [tipAmount, setTipAmount] = useState("");
  const [tipDate, setTipDate] = useState(today);
  const [tipReason, setTipReason] = useState("");
  const [voidingTipId, setVoidingTipId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [summary, setSummary] = useState<Summary>({ count: 0, openingCash: 0, posCash: 0, posCard: 0, terminalCard: 0, countedCash: 0, cashLeft: 0, envelopeCash: 0, expenses: 0, deposits: 0, tips: 0, cashDifference: 0, terminalDifference: 0 });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const response = await fetch(`/api/admin/waiter/settlements?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&status=${encodeURIComponent(status)}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { cashDays?: CashDay[]; settlements?: Settlement[]; ledgerSettlements?: Settlement[]; tipsByEmployee?: TipSummary[]; tipAdjustments?: TipAdjustment[]; employees?: Employee[]; summary?: Summary; error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się pobrać rozliczeń.");
    else { const nextEmployees = body.employees ?? []; setCashDays(body.cashDays ?? []); setSettlements(body.settlements ?? []); setLedgerSettlements(body.ledgerSettlements ?? body.settlements ?? []); setTips(body.tipsByEmployee ?? []); setTipAdjustments(body.tipAdjustments ?? []); setEmployees(nextEmployees); setTipEmployeeId((current) => current || nextEmployees[0]?.dotykackaId || ""); if (body.summary) setSummary(body.summary); }
    setLoading(false);
  }, [from, to, status]);
  // Initial hydration and filter refresh from the administrator-only endpoint.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const selected = settlements.find((item) => item.id === selectedId) ?? null;
  const unresolved = useMemo(() => settlements.filter((item) => item.status !== "VERIFIED").length, [settlements]);

  async function review(action: "VERIFY" | "NEEDS_CORRECTION") {
    if (!selected) return;
    if (action === "NEEDS_CORRECTION" && !adminNote.trim()) { setError("Wpisz, co pracownik powinien wyjaśnić lub poprawić."); return; }
    setBusy(action); setError(""); setMessage("");
    const response = await fetch("/api/admin/waiter/settlements", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, settlementId: selected.id, note: adminNote }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zmienić statusu.");
    else { setMessage(action === "VERIFY" ? "Rozliczenie zostało sprawdzone." : "Rozliczenie oznaczono jako wymagające korekty."); setAdminNote(""); await load(); }
    setBusy("");
  }

  async function markPaid(row: TipSummary) {
    if (!row.allocationIds.length && !row.adjustmentIds.length) return;
    setBusy(`tip-${row.employeeDotykackaId}`); setError(""); setMessage("");
    const response = await fetch("/api/admin/waiter/settlements", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "MARK_TIPS_PAID", allocationIds: row.allocationIds, adjustmentIds: row.adjustmentIds }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się oznaczyć napiwków jako wypłaconych.");
    else { setMessage(`Napiwki dla ${row.employeeName} oznaczono jako wypłacone.`); await load(); }
    setBusy("");
  }

  async function addTipAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("tip-adjustment"); setError(""); setMessage("");
    const response = await fetch("/api/admin/waiter/settlements", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "ADD_TIP_ADJUSTMENT", employeeDotykackaId: tipEmployeeId, businessDate: tipDate, direction: tipDirection, amount: tipAmount, reason: tipReason }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zapisać korekty napiwku.");
    else { setMessage(tipDirection === "ADD" ? "Napiwek został dopisany pracownikowi." : "Korekta pomniejszająca napiwek została zapisana."); setTipAmount(""); setTipReason(""); await load(); }
    setBusy("");
  }

  async function voidTipAdjustment(adjustment: TipAdjustment) {
    if (!voidReason.trim()) { setError("Podaj powód wycofania wpisu."); return; }
    setBusy(`void-tip-${adjustment.id}`); setError(""); setMessage("");
    const response = await fetch("/api/admin/waiter/settlements", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "VOID_TIP_ADJUSTMENT", adjustmentId: adjustment.id, reason: voidReason }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się wycofać wpisu.");
    else { setMessage(`Wycofano ręczny wpis dla ${adjustment.employeeName}.`); setVoidingTipId(null); setVoidReason(""); await load(); }
    setBusy("");
  }

  function exportCsv() {
    const header = ["Data", "Zmiana", "Kasa", "Pracownik", "POS gotówka", "POS karta", "Terminal", "Gotówka policzona", "W kopercie", "Numer koperty", "Wydatki", "Wpłaty do kasy", "Napiwki", "Różnica gotówki", "Różnica terminala", "Status"];
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = settlements.map((item) => [item.businessDate, item.shiftName, item.cashDesk, item.employeeName, item.posCash, item.posCard, item.terminalCard, item.countedCash, item.envelopeCash, item.envelopeNumber, item.expensesTotal, item.depositsTotal, item.tipsTotal, item.cashDifference, item.terminalDifference, statusLabel(item.status)]);
    const blob = new Blob(["\ufeff", [header, ...rows].map((row) => row.map(quote).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `rozliczenia-${from}-${to}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }

  return <main className="settlements-admin">
    <AdminSectionHeader eyebrow="Finanse operacyjne" title="Rozliczenia zmian" links={[{ href: "/admin/waiters", label: "Pracownicy" }]}/>
    {(message || error) && <div className={error ? "admin-status is-error" : "admin-status"}>{error || message}</div>}
    <section className="settlements-toolbar"><label>Od<input type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></label><label>Do<input type="date" value={to} onChange={(event) => setTo(event.target.value)}/></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">Wszystkie</option><option value="SUBMITTED">Do sprawdzenia</option><option value="VERIFIED">Sprawdzone</option><option value="NEEDS_CORRECTION">Wymaga korekty</option></select></label><button className="admin-primary" onClick={() => void load()}>Odśwież</button><button className="admin-secondary" disabled={!settlements.length} onClick={exportCsv}>Pobierz CSV</button></section>
    <section className="settlements-summary"><article><span>Rozliczenia</span><strong>{summary.count}</strong><small>{unresolved} oczekuje na decyzję</small></article><article><span>Gotówka w kopertach</span><strong>{money(summary.envelopeCash)} zł</strong><small>Pozostawiono w kasach: {money(summary.cashLeft)} zł</small></article><article><span>Wydatki z kas</span><strong>{money(summary.expenses)} zł</strong><small>Dokumenty potwierdzone w rozliczeniach</small></article><article><span>Wpłaty drobnych</span><strong>{money(summary.deposits)} zł</strong><small>Dodatkowe środki wniesione do kas</small></article><article><span>Napiwki pracowników</span><strong>{money(summary.tips)} zł</strong><small>Do wypłaty: {money(tips.reduce((sum, item) => sum + item.due, 0))} zł</small></article><article className={Math.abs(summary.cashDifference) > .009 || Math.abs(summary.terminalDifference) > .009 ? "has-difference" : ""}><span>Suma różnic</span><strong>{money(summary.cashDifference)} / {money(summary.terminalDifference)} zł</strong><small>Gotówka / terminal</small></article></section>
    <section className="cash-day-ledger"><div className="settlements-section-title"><div><span className="admin-eyebrow">Ciągłość gotówki</span><h2>Dni kasowe</h2><p>Otwarcie, przekazania i zamknięcie są podpisane kontem pracownika.</p></div></div><div className="cash-day-ledger-list">{cashDays.map((day) => { const dayCheckpoints = ledgerSettlements.filter((item) => item.cashDayId === day.id); return <article key={day.id}><header><div><span>{day.businessDate} · {day.cashDesk}</span><h3>{day.status === "CLOSED" ? "Dzień zamknięty" : "Dzień otwarty"}</h3></div><em data-status={day.status}>{day.status === "CLOSED" ? "Zamknięty" : "W toku"}</em></header><div className="cash-day-ledger-flow"><span><small>Zadeklarował przy zamknięciu · {day.carryoverDeclaredByName ?? "brak wcześniejszego dnia"}</small><b>{money(day.expectedOpeningCash)} zł</b>{day.carryoverDeclaredAt && <i>{new Date(day.carryoverDeclaredAt).toLocaleString("pl-PL")}</i>}</span><span className={Number(day.openingDifference) ? "has-difference" : ""}><small>Policzył przy otwarciu · {day.openedByName}</small><b>{money(day.countedOpeningCash)} zł</b><i>{new Date(day.openedAt).toLocaleString("pl-PL")} · różnica {money(day.openingDifference)} zł</i></span>{dayCheckpoints.map((item) => <span key={item.id} className={Number(item.cashDifference) ? "has-difference" : ""}><small>{item.checkpointType === "HANDOVER" ? "Przekazanie" : item.checkpointType === "CLOSE" ? "Zamknięcie" : "Rozliczenie"} · {item.employeeName}</small><b>{money(item.countedCash)} zł</b><i>{new Date(item.submittedAt).toLocaleString("pl-PL")} · oczekiwano {money(item.expectedCash)} zł · różnica {money(item.cashDifference)} zł</i></span>)}{day.status === "CLOSED" && <span><small>Pozostawiono na kolejny dzień · {day.closedByName}</small><b>{money(day.finalCashLeft ?? 0)} zł</b><i>{day.closedAt ? new Date(day.closedAt).toLocaleString("pl-PL") : "—"}</i></span>}</div>{day.openingNote && <p><b>Różnica przy otwarciu:</b> {day.openingNote}</p>}</article>; })}{!loading && !cashDays.length && <p className="admin-muted">Brak dni kasowych w wybranym okresie.</p>}</div></section>
    <section className="settlements-layout">
      <div className="settlements-list"><div className="settlements-section-title"><div><span className="admin-eyebrow">Dziennik zmian</span><h2>Rozliczenia</h2></div></div>{loading ? <p className="admin-muted">Pobieram rozliczenia…</p> : settlements.map((item) => <button key={item.id} className={selectedId === item.id ? "is-active" : ""} onClick={() => { setSelectedId(item.id); setAdminNote(item.adminNote ?? ""); }}><div><span>{item.businessDate} · {item.shiftName}</span><h3>{item.employeeName}</h3><small>{item.cashDesk} · koperta {item.envelopeNumber || "—"}</small></div><div><b>{money(item.envelopeCash)} zł</b><em data-status={item.status}>{statusLabel(item.status)}</em></div></button>)}{!loading && !settlements.length && <p className="admin-muted">Brak rozliczeń w wybranym okresie.</p>}</div>
      <aside className="settlement-detail">{selected ? <><div className="settlements-section-title"><div><span className="admin-eyebrow">Protokół #{selected.id}</span><h2>{selected.businessDate} · {selected.shiftName}</h2><p>{selected.employeeName} · {selected.cashDesk} · zapis {new Date(selected.submittedAt).toLocaleString("pl-PL")}</p></div><em data-status={selected.status}>{statusLabel(selected.status)}</em></div><div className="settlement-detail-grid"><span>Stan po poprzednim przeliczeniu<b>{money(selected.openingCash)} zł</b></span><span>Utarg od poprzedniej migawki · gotówka<b>{money(selected.posCash)} zł</b></span><span>Utarg od poprzedniej migawki · karta<b>{money(selected.posCard)} zł</b></span><span>Migawka Dotykački<b>{selected.posSnapshotAt ? new Date(selected.posSnapshotAt).toLocaleString("pl-PL") : "—"}</b></span><span>Stan oczekiwany teraz<b>{money(selected.expectedCash)} zł</b></span><span>Pełny stan policzony<b>{money(selected.countedCash)} zł</b></span><span>W kasie<b>{money(selected.cashLeft)} zł</b></span><span>W kopercie<b>{money(selected.envelopeCash)} zł</b></span><span className={Number(selected.cashDifference) ? "has-difference" : ""}>Różnica gotówki<b>{money(selected.cashDifference)} zł</b></span><span className={Number(selected.terminalDifference) ? "has-difference" : ""}>Różnica terminala<b>{money(selected.terminalDifference)} zł</b></span></div><section><h3>Koperta bezpieczeństwa</h3><p>Numer: <b>{selected.envelopeNumber || "—"}</b> · gotówka: <b>{money(selected.envelopeCash)} zł</b></p></section>{selected.corrections.length > 0 && <section><h3>Korekty sposobu płatności</h3>{selected.corrections.map((item, index) => <p key={index}><b>{item.direction === "CARD_TO_CASH" ? "Karta → gotówka" : "Gotówka → karta"}: {money(item.amount)} zł</b><br/>{item.reason}</p>)}</section>}{selected.expenses.length > 0 && <section><h3>Wydatki z kasy</h3>{selected.expenses.map((item, index) => <p key={index}><b>{item.description}: {money(item.amount)} zł</b><br/>Dokument {item.receiptNumber || "bez wpisanego numeru"} · w kopercie</p>)}</section>}{selected.tips.length > 0 && <section><h3>Napiwki do wypłaty</h3>{selected.tips.map((tip) => <p key={tip.key}><b>{tip.paymentMethod === "CARD" ? "Karta" : "Gotówka"}: {money(tip.amount)} zł</b><br/>{tip.allocations.map((allocation) => `${allocation.employeeName} ${money(allocation.amount)} zł`).join(" · ")}</p>)}</section>}{(selected.discrepancyNote || selected.employeeNote) && <section><h3>Uwagi pracownika</h3>{selected.discrepancyNote && <p><b>Wyjaśnienie różnicy:</b> {selected.discrepancyNote}</p>}{selected.employeeNote && <p>{selected.employeeNote}</p>}</section>}<label className="settlement-admin-note">Komentarz administratora<textarea value={adminNote} maxLength={1000} onChange={(event) => setAdminNote(event.target.value)} placeholder="Powód korekty albo uwaga do zatwierdzenia"/></label><div className="settlement-review-actions"><button className="admin-secondary" disabled={Boolean(busy)} onClick={() => void review("NEEDS_CORRECTION")}>Wymaga korekty</button><button className="admin-primary" disabled={Boolean(busy)} onClick={() => void review("VERIFY")}>Zatwierdź rozliczenie</button></div></> : <div className="admin-empty"><h2>Wybierz rozliczenie</h2><p>Zobaczysz pełny protokół, wydatki, napiwki i różnice.</p></div>}</aside>
    </section>
    <section className="settlements-tip-adjustments"><div className="settlements-section-title"><div><span className="admin-eyebrow">Konfiguracja i korekty</span><h2>Ręczne wpisy napiwków</h2><p>Dodatnie wpisy zwiększają saldo pracownika, ujemne je korygują. Oryginalne rozliczenia pozostają bez zmian.</p></div></div><form className="tip-adjustment-form" onSubmit={addTipAdjustment}><label>Pracownik<select value={tipEmployeeId} onChange={(event) => setTipEmployeeId(event.target.value)} required><option value="">Wybierz pracownika</option>{employees.map((employee) => <option key={employee.dotykackaId} value={employee.dotykackaId}>{employee.name}</option>)}</select></label><label>Data<input type="date" value={tipDate} onChange={(event) => setTipDate(event.target.value)} required/></label><label>Operacja<select value={tipDirection} onChange={(event) => setTipDirection(event.target.value as "ADD" | "DEDUCT")}><option value="ADD">Dopisz napiwek</option><option value="DEDUCT">Odejmij / skoryguj</option></select></label><label>Kwota<input type="number" min="0.01" max="100000" step="0.01" value={tipAmount} onChange={(event) => setTipAmount(event.target.value)} placeholder="0,00" required/></label><label className="tip-adjustment-reason">Powód<input value={tipReason} maxLength={500} onChange={(event) => setTipReason(event.target.value)} placeholder="np. błędny podział napiwku w rozliczeniu" required/></label><button className="admin-primary" disabled={busy === "tip-adjustment" || !employees.length}>{busy === "tip-adjustment" ? "Zapisuję…" : "Zapisz wpis"}</button></form><div className="tip-adjustment-history"><div className="is-head"><span>Data</span><span>Pracownik</span><span>Operacja</span><span>Kwota</span><span>Powód i autor</span><span>Status</span><span></span></div>{tipAdjustments.map((adjustment) => <div key={adjustment.id} className={adjustment.voidedAt ? "is-voided" : ""}><span>{adjustment.businessDate}</span><strong>{adjustment.employeeName}</strong><span>{Number(adjustment.amount) >= 0 ? "Dopisanie" : "Korekta"}</span><b className={Number(adjustment.amount) < 0 ? "is-negative" : ""}>{Number(adjustment.amount) >= 0 ? "+" : "−"}{money(Math.abs(Number(adjustment.amount)))} zł</b><span>{adjustment.reason}<small>{adjustment.createdBy} · {new Date(adjustment.createdAt).toLocaleString("pl-PL")}</small>{adjustment.voidedAt && <small>Wycofał: {adjustment.voidedBy} · {adjustment.voidReason}</small>}</span><em>{adjustment.voidedAt ? "Wycofany" : adjustment.payoutStatus === "PAID" ? "Wypłacony" : "Do wypłaty"}</em><div>{voidingTipId === adjustment.id ? <><input value={voidReason} maxLength={500} onChange={(event) => setVoidReason(event.target.value)} placeholder="Powód wycofania"/><button className="admin-secondary" disabled={busy === `void-tip-${adjustment.id}`} onClick={() => void voidTipAdjustment(adjustment)}>Potwierdź</button><button className="admin-secondary" type="button" onClick={() => { setVoidingTipId(null); setVoidReason(""); }}>Anuluj</button></> : <button type="button" className="admin-secondary" disabled={Boolean(adjustment.voidedAt) || adjustment.payoutStatus === "PAID" || Boolean(busy)} onClick={() => { setVoidingTipId(adjustment.id); setVoidReason(""); }}>Wycofaj wpis</button>}</div></div>)}{!tipAdjustments.length && <p className="admin-muted">Brak ręcznych wpisów w wybranym okresie.</p>}</div></section>
    <section className="settlements-tips"><div className="settlements-section-title"><div><span className="admin-eyebrow">Zobowiązania wobec zespołu</span><h2>Napiwki według pracownika</h2></div></div><div className="settlements-tip-table"><div className="is-head"><span>Pracownik</span><span>Łącznie</span><span>Oczekuje na sprawdzenie</span><span>Wypłacono</span><span>Do wypłaty</span><span></span></div>{tips.map((row) => <div key={row.employeeDotykackaId}><strong>{row.employeeName}</strong><span>{money(row.total)} zł</span><span>{money(row.pending)} zł</span><span>{money(row.paid)} zł</span><b>{money(row.due)} zł</b><button className="admin-secondary" disabled={(!row.allocationIds.length && !row.adjustmentIds.length) || row.due <= 0 || Boolean(busy)} onClick={() => void markPaid(row)}>{row.due > 0 ? "Oznacz jako wypłacone" : "Brak zatwierdzonych"}</button></div>)}{!tips.length && <p className="admin-muted">Brak napiwków w wybranym okresie.</p>}</div></section>
  </main>;
}
