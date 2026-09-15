"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import "./inventory.css";

type Category = { dotykackaId: string; name: string; display: boolean; productCount: number };
type Employee = { dotykackaId: string; name: string };
type InventoryProduct = { dotykackaId: string; categoryDotykackaId: string | null; categoryName: string; name: string; inventoryTracked: boolean; stockQuantity: string | null; unit: string | null; imageSourceUrl: string | null };
type StageSummary = { id: number; title: string; status: string; categoryName: string; assignedEmployeeName: string; dueAt: string | null; createdAt: string; totalItems: number; countedItems: number; differences: number };
type Anomaly = { productDotykackaId: string; productName: string; occurrences: number; netDifference: string; referenceLoss: string; reasons: Record<string, number> };
type CountEntry = { id: number; location: string; quantity: string; note: string | null; createdByName: string; updatedAt: string };
type StageItem = { id: number; productName: string; productDotykackaId: string; imagePath: string | null; eanCodes: string[]; pluCodes: string[]; wineCode: string | null; catalogCode: string | null; unit: string; expectedQuantity: string; countedQuantity: string | null; referencePrice: string | null; countStatus: string; reasonCode: string | null; workerNote: string | null; adminNote: string | null; entries: CountEntry[] };
type StageDetail = StageSummary & { locations: string[]; expectedSnapshotAt: string; workerNote: string | null; adminNote: string | null; submittedAt: string | null; approvedAt: string | null; approvedBy: string | null; items: StageItem[]; events: Array<{ id: number; actorName: string; action: string; details: Record<string, unknown>; createdAt: string }>; export: { status: string; error: string | null; stockTransactionId: string | null; payloadHash: string } | null };

const statusLabels: Record<string, string> = { ASSIGNED: "Przypisany", IN_PROGRESS: "Liczenie trwa", CHANGES_REQUESTED: "Do poprawy", SUBMITTED: "Czeka na akceptację", APPROVED: "Zatwierdzony", SENDING: "Wysyłanie", PROCESSING: "Dotykačka przetwarza", FINISHED: "Zakończony", FAILED: "Błąd", UNKNOWN: "Status niepewny", CANCELLED: "Anulowany" };
const reasonLabels: Record<string, string> = { BRAK: "Brak", NADWYZKA: "Nadwyżka", ZEPSUCIE: "Zepsucie", STLUCZENIE: "Stłuczenie", PRZETERMINOWANIE: "Przeterminowanie", ZUZYCIE_WEWNETRZNE: "Zużycie wewnętrzne", BLAD_DOSTAWY: "Błąd dostawy", BLAD_EWIDENCJI: "Błąd ewidencji", INNE: "Inne" };
const reasonOptions = Object.entries(reasonLabels);
const formatQuantity = (value: string | number | null) => value == null ? "—" : new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 3 }).format(Number(value));
const difference = (item: StageItem) => item.countedQuantity == null ? null : Number(item.countedQuantity) - Number(item.expectedQuantity);

export default function InventoryAdminClient() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [stages, setStages] = useState<StageSummary[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<StageDetail | null>(null);
  const [writeEnabled, setWriteEnabled] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/inventory", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { categories?: Category[]; products?: InventoryProduct[]; employees?: Employee[]; stages?: StageSummary[]; anomalies?: Anomaly[]; inventoryWriteEnabled?: boolean; error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się pobrać inwentaryzacji.");
    else { setCategories(body.categories ?? []); setProducts(body.products ?? []); setEmployees(body.employees ?? []); setStages(body.stages ?? []); setAnomalies(body.anomalies ?? []); setWriteEnabled(Boolean(body.inventoryWriteEnabled)); }
    setLoading(false);
  }, []);

  const loadDetail = useCallback(async (stageId: number) => {
    const response = await fetch(`/api/admin/inventory/${stageId}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { stage?: StageDetail; inventoryWriteEnabled?: boolean; error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się pobrać etapu.");
    else { setDetail(body.stage ?? null); setWriteEnabled(Boolean(body.inventoryWriteEnabled)); setReviewNote(body.stage?.adminNote ?? ""); }
  }, []);

  // Initial remote data hydration is intentionally started from an effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (selectedId) void loadDetail(selectedId); else setDetail(null); }, [selectedId, loadDetail]);

  async function createStage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dueAt = String(form.get("dueAt") ?? "");
    setBusy("create"); setError(""); setMessage("");
    const response = await fetch("/api/admin/inventory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      categoryDotykackaId: form.get("categoryDotykackaId"),
      assignedEmployeeDotykackaId: form.get("assignedEmployeeDotykackaId"),
      title: form.get("title"),
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      locations: String(form.get("locations") ?? "").split(","),
    }) });
    const body = await response.json().catch(() => ({})) as { stageId?: number; error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się utworzyć etapu.");
    else { setMessage("Etap został przypisany pracownikowi."); await load(); if (body.stageId) setSelectedId(body.stageId); }
    setBusy("");
  }

  async function setProductTracking(product: InventoryProduct, inventoryTracked: boolean) {
    setBusy(`tracking:${product.dotykackaId}`); setError(""); setMessage("");
    const response = await fetch("/api/admin/inventory", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "SET_PRODUCT_TRACKING", productDotykackaId: product.dotykackaId, inventoryTracked }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zmienić ustawienia produktu.");
    else { setMessage(inventoryTracked ? `Dodano do inwentaryzacji: ${product.name}.` : `Wyłączono z inwentaryzacji: ${product.name}.`); await load(); }
    setBusy("");
  }

  async function stageAction(action: string) {
    if (!detail) return;
    setBusy(action); setError(""); setMessage("");
    const response = await fetch(`/api/admin/inventory/${detail.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, note: reviewNote }) });
    const body = await response.json().catch(() => ({})) as { status?: string; error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się wykonać operacji.");
    else { setMessage(action === "APPROVE" ? "Etap został zatwierdzony. Stany nie zostały jeszcze wysłane." : action === "SEND" ? "Operacja została przekazana do Dotykački." : action === "POLL_STATUS" ? `Status Dotykački: ${body.status ?? "—"}.` : "Etap został cofnięty do poprawy."); await Promise.all([load(), loadDetail(detail.id)]); }
    setBusy("");
  }

  async function adjustItem(event: FormEvent<HTMLFormElement>, item: StageItem) {
    event.preventDefault();
    if (!detail) return;
    const form = new FormData(event.currentTarget);
    setBusy(`item:${item.id}`); setError(""); setMessage("");
    const response = await fetch(`/api/admin/inventory/${detail.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ADJUST_ITEM", itemId: item.id, countedQuantity: form.get("countedQuantity"), reasonCode: form.get("reasonCode"), note: form.get("note") }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się poprawić pozycji.");
    else { setMessage(`Zapisano korektę: ${item.productName}.`); await Promise.all([load(), loadDetail(detail.id)]); }
    setBusy("");
  }

  const summary = useMemo(() => ({ active: stages.filter((stage) => ["ASSIGNED", "IN_PROGRESS", "CHANGES_REQUESTED"].includes(stage.status)).length, review: stages.filter((stage) => stage.status === "SUBMITTED").length, finished: stages.filter((stage) => stage.status === "FINISHED").length }), [stages]);

  return <main className="inventory-admin">
    <header className="admin-topbar"><img src="/logo-cafe.png" alt="Marta Banaszek atelier-café"/><div><span className="admin-eyebrow">Kontrola magazynu</span><h1>Inwentaryzacja etapowa</h1></div><div className="admin-top-actions"><a className="admin-secondary" href="/admin/waiters">Pracownicy</a><a className="admin-secondary" href="/admin">Wróć do menu</a></div></header>
    {(message || error) && <div className={error ? "admin-status is-error" : "admin-status"}>{error || message}</div>}
    {!writeEnabled && <div className="inventory-safety"><b>Bezpieczny tryb wdrożeniowy</b><span>Liczenie, korekty i zatwierdzanie działają. Przycisk wysyłki do Dotykački pozostaje zablokowany do kontrolowanego testu.</span></div>}
    <div className="inventory-admin-content">
      <details className="inventory-product-settings"><summary><span><b>Produkty podlegające inwentaryzacji</b><small>Wybierz fizyczne towary i składniki. Gotowych napojów przygotowywanych ze składników nie zaznaczaj.</small></span><strong>{products.filter((product) => product.inventoryTracked).length} wybranych</strong></summary><div>{Array.from(new Set(products.map((product) => product.categoryName))).sort((a, b) => a.localeCompare(b, "pl")).map((categoryName) => <section key={categoryName}><h3>{categoryName}</h3>{products.filter((product) => product.categoryName === categoryName).map((product) => <label key={product.dotykackaId} className={product.inventoryTracked ? "is-tracked" : ""}><input type="checkbox" checked={product.inventoryTracked} disabled={busy !== ""} onChange={(event) => void setProductTracking(product, event.target.checked)}/>{product.imageSourceUrl ? <img src={product.imageSourceUrl} alt=""/> : <span className="inventory-product-placeholder">{product.name.slice(0, 2)}</span>}<span><b>{product.name}</b><small>Stan: {formatQuantity(product.stockQuantity)} {product.unit || "szt."}</small></span></label>)}</section>)}</div></details>
      <section className="inventory-create"><div><span className="admin-eyebrow">Nowe zlecenie</span><h2>Przypisz jeden etap</h2><p>Etap można zakończyć i zatwierdzić niezależnie od pozostałych kategorii lub miejsc.</p></div><form onSubmit={createStage}><label>Kategoria<select name="categoryDotykackaId" required defaultValue=""><option value="" disabled>Wybierz kategorię</option>{categories.map((category) => <option value={category.dotykackaId} key={category.dotykackaId}>{category.name} · {category.productCount} poz.</option>)}</select></label><label>Osoba licząca<select name="assignedEmployeeDotykackaId" required defaultValue=""><option value="" disabled>Wybierz pracownika</option>{employees.map((employee) => <option value={employee.dotykackaId} key={employee.dotykackaId}>{employee.name}</option>)}</select></label><label>Nazwa etapu<input name="title" maxLength={160} placeholder="np. Wina — lodówka barowa"/></label><label>Miejsca, po przecinku<input name="locations" defaultValue="Lodówka barowa, Zaplecze" maxLength={600}/></label><label>Termin<input name="dueAt" type="datetime-local"/></label><button className="admin-primary" disabled={busy === "create" || loading}>{busy === "create" ? "Tworzę…" : "Przypisz etap"}</button></form></section>
      <section className="inventory-summary"><span><b>{summary.active}</b> etapów w liczeniu</span><span><b>{summary.review}</b> czeka na akceptację</span><span><b>{summary.finished}</b> zakończonych w Dotykačce</span><span><b>{anomalies.length}</b> produktów z odchyleniami</span></section>
      <div className="inventory-admin-layout"><section className="inventory-stage-list"><header><span className="admin-eyebrow">Etapy</span><h2>Historia i zadania</h2></header>{stages.map((stage) => <button className={selectedId === stage.id ? "is-active" : ""} onClick={() => setSelectedId(stage.id)} key={stage.id}><div><b>{stage.title}</b><span>{stage.categoryName} · {stage.assignedEmployeeName}</span><small>{stage.countedItems}/{stage.totalItems} pozycji · {stage.differences} różnic</small></div><em data-status={stage.status}>{statusLabels[stage.status] ?? stage.status}</em></button>)}{!stages.length && <p className="admin-muted">Nie utworzono jeszcze żadnego etapu.</p>}</section>
        <section className="inventory-review">{!detail ? <div className="inventory-empty"><h2>Wybierz etap</h2><p>Zobaczysz policzone ilości, miejsca, różnice i pełną historię.</p></div> : <><header><div><span className="admin-eyebrow">{detail.categoryName}</span><h2>{detail.title}</h2><p>{detail.assignedEmployeeName} · migawka {new Date(detail.expectedSnapshotAt).toLocaleString("pl-PL")}</p></div><em data-status={detail.status}>{statusLabels[detail.status] ?? detail.status}</em></header>{detail.adminNote && <p className="inventory-review-note"><b>Informacja administratora:</b> {detail.adminNote}</p>}<div className="inventory-item-table"><div className="inventory-item-head"><span>Produkt</span><span>Oczekiwano</span><span>Policzono</span><span>Różnica</span><span>Przyczyna</span></div>{detail.items.map((item) => { const delta = difference(item); return <article key={item.id} className={delta ? "has-difference" : ""}><div className="inventory-product"><div className="inventory-product-image">{item.imagePath ? <img src={item.imagePath} alt=""/> : <span>brak zdjęcia</span>}</div><div><b>{item.productName}</b><small>{[item.wineCode, item.catalogCode, ...item.pluCodes].filter(Boolean).filter((value, index, array) => array.indexOf(value) === index).join(" · ") || `ID ${item.productDotykackaId}`}</small><small>EAN: {item.eanCodes.join(", ") || "brak"}</small>{item.entries.length > 0 && <ul>{item.entries.map((entry) => <li key={entry.id}>{entry.location}: <b>{formatQuantity(entry.quantity)}</b> · {entry.createdByName}</li>)}</ul>}{item.workerNote && <p>{item.workerNote}</p>}</div></div><strong>{formatQuantity(item.expectedQuantity)} {item.unit}</strong><strong>{formatQuantity(item.countedQuantity)} {item.unit}</strong><strong>{delta == null ? "—" : `${delta > 0 ? "+" : ""}${formatQuantity(delta)}`} {item.unit}</strong><span>{item.reasonCode ? reasonLabels[item.reasonCode] ?? item.reasonCode : delta ? "wymaga przyczyny" : "—"}</span>{detail.status === "SUBMITTED" && <form className="inventory-adjust" onSubmit={(event) => adjustItem(event, item)}><label>Stan zatwierdzony<input name="countedQuantity" type="number" min="0" step="0.001" defaultValue={item.countedQuantity ?? ""} required/></label><label>Przyczyna<select name="reasonCode" defaultValue={item.reasonCode ?? ""}><option value="">Brak różnicy</option>{reasonOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Notatka korekty<input name="note" maxLength={1000} placeholder="Skąd wynika korekta?" required/></label><button className="admin-secondary" disabled={busy === `item:${item.id}`}>Popraw</button></form>}</article>; })}</div><section className="inventory-review-actions"><label>Notatka dla pracownika / protokołu<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={1000}/></label><div>{detail.status === "SUBMITTED" && <><button className="admin-secondary" disabled={busy !== "" || !reviewNote.trim()} onClick={() => void stageAction("REQUEST_CHANGES")}>Cofnij do poprawy</button><button className="admin-primary" disabled={busy !== ""} onClick={() => void stageAction("APPROVE")}>Zatwierdź etap</button></>}{detail.status === "APPROVED" && <button className="admin-primary" disabled={!writeEnabled || busy !== ""} onClick={() => void stageAction("SEND")}>{writeEnabled ? "Zatwierdź i wyślij do Dotykački" : "Wysyłka zablokowana do testu"}</button>}{["PROCESSING", "UNKNOWN"].includes(detail.status) && <button className="admin-primary" disabled={busy !== ""} onClick={() => void stageAction("POLL_STATUS")}>Sprawdź status Dotykački</button>}</div></section><details className="inventory-events"><summary>Historia etapu · {detail.events.length} zdarzeń</summary>{detail.events.map((event) => <p key={event.id}><b>{new Date(event.createdAt).toLocaleString("pl-PL")} · {event.actorName}</b><span>{event.action}</span></p>)}</details></>}</section></div>
      <section className="inventory-anomalies"><header><span className="admin-eyebrow">Sygnały kontrolne</span><h2>Powtarzające się odchylenia</h2><p>Raport wskazuje wzorce do wyjaśnienia — nie przypisuje automatycznie odpowiedzialności.</p></header>{anomalies.length ? <div>{anomalies.map((item) => <article key={item.productDotykackaId}><b>{item.productName}</b><span>{item.occurrences} {item.occurrences === 1 ? "odchylenie" : "odchylenia"}</span><span>Bilans: {formatQuantity(item.netDifference)}</span><span>Wartość braków: {item.referenceLoss} zł</span><small>{Object.entries(item.reasons).map(([reason, count]) => `${reasonLabels[reason] ?? reason}: ${count}`).join(" · ") || "Brak klasyfikacji"}</small></article>)}</div> : <p className="admin-muted">Raport pojawi się po zakończeniu pierwszych etapów z różnicami.</p>}</section>
    </div>
  </main>;
}
