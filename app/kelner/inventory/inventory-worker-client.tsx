"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { clearWaiterSessionToken, saveWaiterSessionToken, waiterSessionHeaders } from "../waiter-session-client";
import "./inventory-worker.css";
import "./inventory-worker-enhancements.css";

type StageSummary = { id: number; title: string; status: string; categoryName: string; dueAt: string | null; adminNote: string | null; totalItems: number; countedItems: number };
type Entry = { id: number; location: string; quantity: string; note: string | null };
type Item = { id: number; productName: string; productDotykackaId: string; imagePath: string | null; eanCodes: string[]; pluCodes: string[]; wineCode: string | null; catalogCode: string | null; unit: string; expectedQuantity: string; countedQuantity: string | null; countStatus: string; reasonCode: string | null; workerNote: string | null; entries: Entry[] };
type StageDetail = StageSummary & { locations: string[]; expectedSnapshotAt: string; workerNote: string | null; items: Item[] };
type LocationRow = { key: string; location: string; quantity: string; note: string };

const statusLabels: Record<string, string> = { ASSIGNED: "Nowe zadanie", IN_PROGRESS: "Liczenie trwa", CHANGES_REQUESTED: "Do poprawy", SUBMITTED: "Czeka na akceptację", APPROVED: "Zatwierdzone", SENDING: "Wysyłanie", PROCESSING: "Przetwarzanie", FINISHED: "Zakończone", FAILED: "Błąd", UNKNOWN: "Status niepewny" };
const reasons = [["BRAK", "Brak"], ["NADWYZKA", "Nadwyżka"], ["ZEPSUCIE", "Zepsucie"], ["STLUCZENIE", "Stłuczenie"], ["PRZETERMINOWANIE", "Przeterminowanie"], ["ZUZYCIE_WEWNETRZNE", "Zużycie wewnętrzne"], ["BLAD_DOSTAWY", "Błąd dostawy"], ["BLAD_EWIDENCJI", "Błąd ewidencji"], ["INNE", "Inne"]];
const editable = (status: string) => ["ASSIGNED", "IN_PROGRESS", "CHANGES_REQUESTED"].includes(status);
const formatQuantity = (value: string | number | null) => value == null ? "—" : new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 3 }).format(Number(value));
const unitLabel = (value: string) => value.toLocaleLowerCase() === "kilogram" ? "kg" : value.toLocaleLowerCase() === "piece" ? "szt." : value;
const rowKey = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

function ItemEditor({ item, places, disabled, busy, onSave }: { item: Item; places: string[]; disabled: boolean; busy: boolean; onSave: (payload: Record<string, unknown>) => Promise<void> }) {
  const initialRows = () => item.entries.length
    ? item.entries.map((entry) => ({ key: rowKey(), location: entry.location, quantity: entry.quantity, note: entry.note ?? "" }))
    : [{ key: rowKey(), location: places[0] ?? "", quantity: "", note: "" }];
  const [rows, setRows] = useState<LocationRow[]>(initialRows);
  const [reasonCode, setReasonCode] = useState(item.reasonCode ?? "");
  const [note, setNote] = useState(item.workerNote ?? "");
  const [notFound, setNotFound] = useState(item.countStatus === "NOT_FOUND");
  const counted = notFound ? 0 : rows.reduce((sum, row) => sum + (Number(String(row.quantity).replace(",", ".")) || 0), 0);
  const difference = counted - Number(item.expectedQuantity);
  const identifiers = [item.wineCode, item.catalogCode, ...item.pluCodes].filter(Boolean).filter((value, index, list) => list.indexOf(value) === index);

  function updateRow(key: string, field: keyof Omit<LocationRow, "key">, value: string) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSave({
      itemId: item.id,
      countStatus: notFound ? "NOT_FOUND" : "COUNTED",
      entries: notFound ? [] : rows.map(({ location, quantity, note: rowNote }) => ({ location, quantity, note: rowNote })),
      reasonCode: difference === 0 ? null : reasonCode,
      note,
    });
  }

  return <article className={`inventory-count-item ${item.countStatus !== "PENDING" ? "is-counted" : ""} ${difference ? "has-difference" : ""}`}>
    <header><div className="inventory-count-photo">{item.imagePath ? <img src={item.imagePath} alt={`Produkt ${item.productName}`}/> : <span>{item.productName.slice(0, 2)}</span>}</div><div className="inventory-count-identity"><small>{item.countStatus === "PENDING" ? "Produkt do policzenia" : "Zapisano"}</small><h3>{item.productName}</h3><p>{identifiers.join(" · ") || `ID produktu ${item.productDotykackaId}`}</p>{item.eanCodes.length > 0 && <p>EAN: {item.eanCodes.join(", ")}</p>}</div><div className="inventory-count-expected"><span>Stan zapisany w Dotykačce</span><b>{formatQuantity(item.expectedQuantity)} {unitLabel(item.unit)}</b><small>Policz rzeczywisty stan poniżej</small></div></header>
    <form onSubmit={submit}>
      <label className="inventory-not-found"><input type="checkbox" checked={notFound} disabled={disabled} onChange={(event) => { setNotFound(event.target.checked); if (event.target.checked && !reasonCode) setReasonCode("BRAK"); }}/><span>Nie znalazłem produktu — stan 0</span></label>
      {!notFound && <div className="inventory-location-list">{rows.map((row) => <div className="inventory-location-row" key={row.key}><label>Miejsce<input list={`places-${item.id}`} value={row.location} onChange={(event) => updateRow(row.key, "location", event.target.value)} placeholder="np. Lodówka barowa" required disabled={disabled}/></label><label>Ilość<input inputMode="decimal" value={row.quantity} onChange={(event) => updateRow(row.key, "quantity", event.target.value)} placeholder="0" required disabled={disabled}/></label><label>Notatka<input value={row.note} onChange={(event) => updateRow(row.key, "note", event.target.value)} placeholder="opcjonalnie" maxLength={300} disabled={disabled}/></label>{rows.length > 1 && <button type="button" className="inventory-remove-place" onClick={() => setRows((current) => current.filter((entry) => entry.key !== row.key))} disabled={disabled} aria-label="Usuń miejsce">×</button>}</div>)}<datalist id={`places-${item.id}`}>{places.map((place) => <option key={place} value={place}/>)}</datalist><button type="button" className="inventory-add-place" onClick={() => setRows((current) => [...current, { key: rowKey(), location: "", quantity: "", note: "" }])} disabled={disabled}>+ Dodaj inne miejsce</button></div>}
      <div className="inventory-item-result"><span>Razem fizycznie: <b>{formatQuantity(counted)} {unitLabel(item.unit)}</b></span><span className={difference ? "is-difference" : ""}>Różnica: <b>{difference > 0 ? "+" : ""}{formatQuantity(difference)} {unitLabel(item.unit)}</b></span></div>
      {difference !== 0 && <label>Przyczyna różnicy<select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} required disabled={disabled}><option value="">Wybierz przyczynę</option>{reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      <label>Uwagi do produktu<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} placeholder="np. otwarte opakowanie, produkt znaleziony na zapleczu" disabled={disabled}/></label>
      {!disabled && <button className="inventory-save-item" disabled={busy}>{busy ? "Zapisuję…" : item.countStatus === "PENDING" ? "Zapisz policzony stan" : "Zapisz zmianę"}</button>}
    </form>
  </article>;
}

export default function InventoryWorkerClient() {
  const [employeeName, setEmployeeName] = useState("");
  const [stages, setStages] = useState<StageSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<StageDetail | null>(null);
  const [search, setSearch] = useState("");
  const [stageNote, setStageNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadStages = useCallback(async () => {
    const response = await fetch("/api/waiter/inventory", { cache: "no-store", credentials: "same-origin", headers: waiterSessionHeaders() });
    const body = await response.json().catch(() => ({})) as { employee?: { name: string }; stages?: StageSummary[]; error?: string };
    if (response.status === 401) { clearWaiterSessionToken(); window.location.href = "/kelner"; return; }
    if (!response.ok) setError(body.error ?? "Nie udało się pobrać zadań.");
    else { setEmployeeName(body.employee?.name ?? ""); setStages(body.stages ?? []); setSelectedId((current) => current ?? body.stages?.find((stage) => editable(stage.status))?.id ?? body.stages?.[0]?.id ?? null); }
  }, []);

  const loadDetail = useCallback(async (stageId: number) => {
    const response = await fetch(`/api/waiter/inventory/${stageId}`, { cache: "no-store", credentials: "same-origin", headers: waiterSessionHeaders() });
    const body = await response.json().catch(() => ({})) as { stage?: StageDetail; error?: string };
    if (response.status === 401) { clearWaiterSessionToken(); window.location.href = "/kelner"; return; }
    if (!response.ok) setError(body.error ?? "Nie udało się pobrać etapu.");
    else { setDetail(body.stage ?? null); setStageNote(body.stage?.workerNote ?? ""); }
  }, []);

  // Initial remote data hydration is intentionally started from an effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadStages(); }, [loadStages]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (selectedId) void loadDetail(selectedId); else setDetail(null); }, [selectedId, loadDetail]);
  useEffect(() => {
    if (!employeeName) return;
    const refresh = async () => {
      const response = await fetch("/api/waiter/session", { method: "PUT", credentials: "same-origin", headers: waiterSessionHeaders() }).catch(() => null);
      if (!response?.ok) return;
      const body = await response.json().catch(() => ({})) as { token?: string };
      saveWaiterSessionToken(body.token);
    };
    const timer = window.setInterval(() => { void refresh(); }, 4 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [employeeName]);

  async function action(actionName: string, payload: Record<string, unknown> = {}, busyKey = actionName) {
    if (!detail) return;
    setBusy(busyKey); setError(""); setMessage("");
    const response = await fetch(`/api/waiter/inventory/${detail.id}`, { method: "PATCH", credentials: "same-origin", headers: waiterSessionHeaders({ "content-type": "application/json" }), body: JSON.stringify({ action: actionName, ...payload }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zapisać zmiany.");
    else { setMessage(actionName === "SUBMIT" ? "Etap przekazano administratorowi do sprawdzenia." : actionName === "SAVE_ITEM" ? "Stan produktu zapisany." : "Liczenie rozpoczęte."); await Promise.all([loadStages(), loadDetail(detail.id)]); }
    setBusy("");
  }

  const visibleItems = useMemo(() => detail?.items.filter((item) => `${item.productName} ${item.eanCodes.join(" ")} ${item.pluCodes.join(" ")} ${item.wineCode ?? ""} ${item.catalogCode ?? ""}`.toLocaleLowerCase("pl").includes(search.toLocaleLowerCase("pl"))) ?? [], [detail, search]);
  const missing = detail?.items.filter((item) => item.countStatus === "PENDING").length ?? 0;
  const canEdit = detail ? editable(detail.status) : false;

  return <main className="inventory-worker"><header className="inventory-worker-top"><a href="/kelner"><img src="/logo-cafe.png" alt="Atelier Café"/></a><div><span>Inwentaryzacja</span><b>{employeeName || "Pracownik"}</b></div><a href="/kelner">Wróć do zamówień</a></header>
    {(message || error) && <div className={error ? "inventory-worker-message is-error" : "inventory-worker-message"}>{error || message}</div>}
    <div className="inventory-worker-layout"><aside className="inventory-worker-stages"><span>Moje zadania</span><h1>Etapy liczenia</h1>{stages.map((stage) => <button className={selectedId === stage.id ? "is-active" : ""} key={stage.id} onClick={() => setSelectedId(stage.id)}><b>{stage.title}</b><small>{stage.categoryName}</small><span>{stage.countedItems}/{stage.totalItems} pozycji</span><em data-status={stage.status}>{statusLabels[stage.status] ?? stage.status}</em></button>)}{!stages.length && <p>Nie masz obecnie przydzielonych zadań.</p>}</aside>
      <section className="inventory-worker-stage">{!detail ? <div className="inventory-worker-empty"><h2>Wybierz etap</h2><p>Przydzielone przez administratora zadania pojawią się po lewej.</p></div> : <><header><div><span>{detail.categoryName}</span><h2>{detail.title}</h2><p>Stan oczekiwany zapisano {new Date(detail.expectedSnapshotAt).toLocaleString("pl-PL")}. Licz fizyczny stan, nie przepisuj wartości systemowej.</p></div><em data-status={detail.status}>{statusLabels[detail.status] ?? detail.status}</em></header>{detail.adminNote && <div className="inventory-admin-request"><b>Informacja od administratora</b><p>{detail.adminNote}</p></div>}{detail.status === "ASSIGNED" && <button className="inventory-start" disabled={busy !== ""} onClick={() => void action("START")}>Rozpocznij liczenie</button>}<div className="inventory-worker-progress"><div><span>Postęp etapu</span><b>{detail.items.length - missing} / {detail.items.length}</b></div><progress value={detail.items.length - missing} max={detail.items.length || 1}/><span>{missing ? `Pozostało ${missing} pozycji` : "Wszystkie pozycje potwierdzone"}</span></div><label className="inventory-worker-search">Szukaj produktu, EAN lub kodu<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Zacznij wpisywać…"/></label><div className="inventory-count-list">{visibleItems.map((item) => <ItemEditor key={`${item.id}:${item.countedQuantity}:${item.countStatus}`} item={item} places={detail.locations} disabled={!canEdit} busy={busy === `item:${item.id}`} onSave={(payload) => action("SAVE_ITEM", payload, `item:${item.id}`)}/>)}</div>{canEdit && <section className="inventory-submit-stage"><label>Uwagi do całego etapu<textarea value={stageNote} onChange={(event) => setStageNote(event.target.value)} maxLength={1000} placeholder="Co administrator powinien wiedzieć?"/></label><button disabled={missing > 0 || busy !== ""} onClick={() => void action("SUBMIT", { note: stageNote })}>{missing ? `Najpierw potwierdź ${missing} pozycji` : "Zakończ etap i wyślij do akceptacji"}</button><p>Zakończenie tego etapu nie wymaga przeliczenia innych kategorii ani całego magazynu.</p></section>}</>}</section></div>
  </main>;
}
