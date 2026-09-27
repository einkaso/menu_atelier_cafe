"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarClock, Check, ChevronRight, Coffee, PackageCheck, Printer, Search, ShoppingBasket, UserRoundCheck, Users } from "lucide-react";
import styles from "./event-os.module.css";

type CatalogProduct = { id: number; dotykackaId: string; name: string; category: string; price: string | null; currency: string; display: boolean; stockQuantity: string | null; stockUnit: string | null; eventEnabled: boolean; available: boolean };
type EventRow = { externalId: string; title: string; startsAt: string; endsAt: string | null; status: string; discountPercent: string; orderCutoffAt: string | null; orderCount: number; expectedGuests: number; arrivedGuests: number; forecastRevenue: number; sentToPosRevenue: number };
type OrderItem = { productId: string; name: string; category: string; quantity: number; unitPriceRegular: number; discountPercent: number; unitPriceAfterDiscount: number };
type OrderRow = { externalId: string; ticketCode: string; guestName: string; guestEmail: string | null; guestPhone: string | null; tableLabel: string | null; status: string; specialRequest: string | null; items: OrderItem[]; regularTotal: string; discountTotal: string; forecastTotal: string; orderedAt: string };
type ProductSummary = { productId: string; name: string; category: string; quantity: number; regularValue: number; discountValue: number; forecastValue: number };
type EventDetail = { event: EventRow; orders: OrderRow[]; products: ProductSummary[]; totals: { regular: number; discount: number; forecast: number; arrived: number; sentToPos: number; settled: number } };

const money = (value: number, currency = "PLN") => new Intl.NumberFormat("pl-PL", { style: "currency", currency }).format(value);
const dateTime = (value: string) => new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Warsaw" }).format(new Date(value));
const statusLabels: Record<string, string> = { RESERVED: "Zarezerwowane", ARRIVED: "Gość przybył", SENT_TO_POS: "Wysłane do POS", IN_SERVICE: "W realizacji", SETTLED: "Rozliczone", CANCELLED: "Anulowane", NO_SHOW: "Gość nie przyszedł" };

export default function EventOsAdmin({ administratorName }: { administratorName: string }) {
  const [tab, setTab] = useState<"catalog" | "orders">("catalog");
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [detailTab, setDetailTab] = useState<"products" | "guests">("products");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadCatalog() {
    setLoading(true); setError("");
    const response = await fetch("/api/admin/event-os/catalog", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { products?: CatalogProduct[]; error?: string };
    if (!response.ok) setError(body.error || "Nie udało się pobrać produktów."); else setCatalog(body.products ?? []);
    setLoading(false);
  }
  async function loadEvents() {
    setLoading(true); setError("");
    const response = await fetch("/api/admin/event-os/events", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { events?: EventRow[]; error?: string };
    if (!response.ok) setError(body.error || "Nie udało się pobrać wydarzeń."); else {
      const rows = body.events ?? []; setEvents(rows); setSelectedEventId((current) => current && rows.some((event) => event.externalId === current) ? current : highlightedEvent(rows)?.externalId ?? rows[0]?.externalId ?? null);
    }
    setLoading(false);
  }
  useEffect(() => { void loadCatalog(); }, []);
  useEffect(() => { if (tab === "orders") void loadEvents(); }, [tab]);
  useEffect(() => {
    if (!selectedEventId || tab !== "orders") { setDetail(null); return; }
    let active = true; setDetail(null);
    fetch(`/api/admin/event-os/events/${encodeURIComponent(selectedEventId)}/orders`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => ({})) as EventDetail & { error?: string };
      if (!response.ok) throw new Error(body.error || "Nie udało się pobrać zamówień."); if (active) setDetail(body);
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : "Nie udało się pobrać danych."));
    return () => { active = false; };
  }, [selectedEventId, tab]);

  const groupedCatalog = useMemo(() => {
    const phrase = query.trim().toLocaleLowerCase("pl");
    const rows = catalog.filter((product) => !phrase || `${product.name} ${product.category}`.toLocaleLowerCase("pl").includes(phrase));
    const groups = new Map<string, CatalogProduct[]>(); for (const row of rows) groups.set(row.category, [...(groups.get(row.category) ?? []), row]);
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "pl"));
  }, [catalog, query]);

  async function changeProducts(productIds: number[], enabled: boolean) {
    if (!productIds.length) return;
    const key = `${enabled}:${productIds.join(",")}`; setSaving(key); setError(""); setMessage("");
    const response = await fetch("/api/admin/event-os/catalog", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ productIds, enabled }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error || "Nie udało się zapisać wyboru."); else {
      const changed = new Set(productIds); setCatalog((current) => current.map((product) => changed.has(product.id) ? { ...product, eventEnabled: enabled } : product));
      setMessage(enabled ? `Dodano ${productIds.length} pozycji do katalogu EVENT OS.` : `Usunięto ${productIds.length} pozycji z katalogu EVENT OS.`);
    }
    setSaving(null);
  }

  return <main className={styles.shell}>
    <header className={styles.topbar}><div className={styles.brand}><img src="/logo-cafe.png" alt="Marta Banaszek atelier-café" /><div><span>Połączenie aplikacji</span><h1>EVENT OS</h1></div></div><div className={styles.topActions}><span>Zalogowany: {administratorName}</span><a href="/admin"><ArrowLeft size={16} /> Panel główny</a></div></header>
    <section className={styles.hero}><div><span className={styles.eyebrow}>Kawiarnia × wydarzenia</span><h2>Menu i zamówienia gości</h2><p>Wybierz produkty udostępniane EVENT OS, a potem planuj i realizuj zamówienia osobno dla każdego wydarzenia.</p></div><div className={styles.heroIcon}><Coffee /></div></section>
    <nav className={styles.tabs}><button className={tab === "catalog" ? styles.active : ""} onClick={() => setTab("catalog")}><PackageCheck /> Menu eventowe</button><button className={tab === "orders" ? styles.active : ""} onClick={() => setTab("orders")}><ShoppingBasket /> Zamówienia gości</button></nav>
    {error && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.success} role="status">{message}</p>}
    {tab === "catalog" ? <section className={styles.catalog}>
      <header className={styles.sectionHeader}><div><span className={styles.eyebrow}>Źródło oferty</span><h2>Produkty dostępne dla EVENT OS</h2><p>Bez zdjęć — szybki wybór całych kategorii lub pojedynczych produktów.</p></div><label className={styles.search}><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Szukaj produktu lub kategorii" /></label></header>
      <div className={styles.summary}><article><strong>{catalog.length}</strong><span>produktów w bazie</span></article><article><strong>{catalog.filter((item) => item.eventEnabled).length}</strong><span>udostępnionych EVENT OS</span></article><article><strong>{catalog.filter((item) => item.eventEnabled && item.available).length}</strong><span>aktualnie dostępnych</span></article></div>
      {loading ? <div className={styles.empty}>Pobieram produkty…</div> : <div className={styles.categories}>{groupedCatalog.map(([category, products]) => {
        const enabled = products.filter((product) => product.eventEnabled).length; const ids = products.map((product) => product.id);
        return <section key={category} className={styles.category}><header><div><h3>{category}</h3><span>{enabled} z {products.length} w menu eventowym</span></div><div><button disabled={Boolean(saving) || enabled === products.length} onClick={() => void changeProducts(ids, true)}>Pokaż całą grupę</button><button disabled={Boolean(saving) || enabled === 0} onClick={() => void changeProducts(ids, false)}>Nie pokazuj grupy</button></div></header><div className={styles.productRows}>{products.map((product) => <label key={product.id} className={!product.available ? styles.unavailable : ""}><input type="checkbox" checked={product.eventEnabled} disabled={Boolean(saving)} onChange={(event) => void changeProducts([product.id], event.target.checked)} /><span><strong>{product.name}</strong><small>{product.available ? product.stockQuantity === null ? "Dostępny" : `Stan: ${product.stockQuantity}${product.stockUnit ? ` ${product.stockUnit}` : ""}` : "Niedostępny w sprzedaży / brak stanu"}</small></span><b>{product.price === null ? "—" : money(Number(product.price), product.currency)}</b></label>)}</div></section>;
      })}</div>}
    </section> : <section className={styles.orders}>
      <header className={styles.sectionHeader}><div><span className={styles.eyebrow}>Wiele wydarzeń równolegle</span><h2>Wybierz konkretne wydarzenie</h2><p>Najbliższe lub trwające wydarzenie jest wyróżnione, ale pozostałe zawsze pozostają dostępne.</p></div></header>
      {!loading && events.length === 0 ? <div className={styles.empty}><CalendarClock /><h3>Brak zsynchronizowanych wydarzeń</h3><p>Po zapisaniu oferty gastronomicznej w EVENT OS wydarzenie pojawi się tutaj automatycznie.</p></div> : <div className={styles.eventGrid}>{events.map((event) => {
        const highlighted = highlightedEvent(events)?.externalId === event.externalId; return <button key={event.externalId} className={`${styles.eventCard} ${selectedEventId === event.externalId ? styles.selected : ""} ${highlighted ? styles.highlighted : ""}`} onClick={() => setSelectedEventId(event.externalId)}>{highlighted && <em>{eventState(event)}</em>}<span>{dateTime(event.startsAt)}</span><h3>{event.title}</h3><div><small>Zamówienia<strong>{event.orderCount}</strong></small><small>Goście<strong>{event.expectedGuests}</strong></small><small>Prognoza<strong>{money(event.forecastRevenue)}</strong></small></div><ChevronRight /></button>;
      })}</div>}
      {selectedEventId && !detail && <div className={styles.empty}>Pobieram zamówienia wybranego wydarzenia…</div>}
      {detail && <div className={styles.detail}>
        <header><div><span className={styles.eyebrow}>Wybrane wydarzenie</span><h2>{detail.event.title}</h2><p>{dateTime(detail.event.startsAt)} · rabat {Number(detail.event.discountPercent)}%</p></div><button onClick={() => window.print()}><Printer /> Drukuj zestawienie</button></header>
        <div className={styles.revenue}><article><span>Wartość regularna</span><strong>{money(detail.totals.regular)}</strong></article><article><span>Ustalony rabat</span><strong>−{money(detail.totals.discount)}</strong></article><article className={styles.forecast}><span>Prognoza przychodu</span><strong>{money(detail.totals.forecast)}</strong></article><article><span>Goście obecni</span><strong>{money(detail.totals.arrived)}</strong></article><article><span>Wysłane do POS</span><strong>{money(detail.totals.sentToPos)}</strong></article><article><span>Rozliczone</span><strong>{money(detail.totals.settled)}</strong></article></div>
        <nav className={styles.detailTabs}><button className={detailTab === "products" ? styles.active : ""} onClick={() => setDetailTab("products")}><ShoppingBasket /> Produkty i ilości</button><button className={detailTab === "guests" ? styles.active : ""} onClick={() => setDetailTab("guests")}><Users /> Osoba po osobie</button></nav>
        {detailTab === "products" ? <div className={styles.table}><div className={styles.tableHead}><span>Produkt</span><span>Ilość</span><span>Regularnie</span><span>Rabat</span><span>Prognoza</span></div>{detail.products.map((product) => <div key={product.productId}><span><strong>{product.name}</strong><small>{product.category}</small></span><b>{product.quantity}</b><span>{money(product.regularValue)}</span><span>−{money(product.discountValue)}</span><strong>{money(product.forecastValue)}</strong></div>)}{detail.products.length === 0 && <p className={styles.noRows}>Nie złożono jeszcze żadnych zamówień.</p>}</div> : <div className={styles.guestList}>{detail.orders.map((order) => <article key={order.externalId}><header><div><UserRoundCheck /><span><strong>{order.guestName}</strong><small>Bilet {order.ticketCode} · stolik {order.tableLabel || "do ustalenia"}</small></span></div><em data-status={order.status}>{statusLabels[order.status] || order.status}</em></header><ul>{order.items.map((item, index) => <li key={`${item.productId}:${index}`}><span>{item.quantity} × {item.name}</span><strong>{money(item.quantity * item.unitPriceAfterDiscount)}</strong></li>)}</ul>{order.specialRequest && <p><b>Życzenie gościa:</b> {order.specialRequest}</p>}<footer><span>Rezerwacja: {dateTime(order.orderedAt)}</span><strong>{money(Number(order.forecastTotal))}</strong></footer></article>)}{detail.orders.length === 0 && <p className={styles.noRows}>Nie złożono jeszcze żadnych zamówień.</p>}</div>}
      </div>}
    </section>}
  </main>;
}

function eventState(event: EventRow) {
  const now = Date.now(); const start = new Date(event.startsAt).getTime(); const end = event.endsAt ? new Date(event.endsAt).getTime() : start + 4 * 3600000;
  return now >= start && now <= end ? "TRWA TERAZ" : "NAJBLIŻSZE";
}

function highlightedEvent(events: EventRow[]) {
  const now = Date.now();
  return events.find((event) => now >= new Date(event.startsAt).getTime() && now <= new Date(event.endsAt || new Date(new Date(event.startsAt).getTime() + 4 * 3600000)).getTime())
    ?? events.find((event) => new Date(event.startsAt).getTime() >= now)
    ?? events[events.length - 1];
}
