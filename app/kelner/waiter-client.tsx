"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import SettlementForm from "./settlement-form";
import GuestReceiptPicker from "./guest-receipt-picker";
import GuestReceiptView from "./guest-receipt-view";
import type { GuestReceipt } from "../../lib/guest-receipt";
import { clearWaiterSessionToken, saveWaiterSessionToken, waiterSessionHeaders } from "./waiter-session-client";

type Employee = { dotykackaId: string; name: string };
type Table = { dotykackaId: string; name: string };
type Addon = { id: string; name: string; price: string | null; currency: string };
type AddonGroup = { name: string; required: boolean; multiple: boolean; options: Addon[] };
type StaffManual = { instructions: string; media: Array<{ id: string; path: string; type: "IMAGE" | "VIDEO"; name: string }> };
type Product = { id: number; dotykackaId: string; name: string; category: string; price: string | null; currency: string; image: string | null; staffManual: StaffManual | null; addonGroups: AddonGroup[]; outsideMenu: boolean; kind: string; serving: "glass" | "bottle" | "draught" | "serving" | null; wineColor: string | null; wineStyle: string | null; sweetness: string | null; sparklingType: "SPARKLING" | "NATURALLY_SPARKLING" | null; country: string | null; vegan: boolean; alcoholFree: boolean; attributes: Record<string, string> };
type CartItem = { product: Product; quantity: number; note: string; customizations: Addon[] };
type SurveyQuestion = { id: number; prompt: string; kind: "YES_NO" | "SINGLE_CHOICE"; options: string[]; required: boolean };
type DrinkFilters = { color: string; taste: string; sparkling: string; serving: string; country: string; vegan: boolean; zero: boolean; beerStyle: string; alcohol: string; spiritType: string; spiritStyle: string; spiritTaste: string; spiritOrigin: string; spiritAge: string };

const moneyFormatter = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (value: number) => moneyFormatter.format(value);
const OUTSIDE_MENU = "Poza menu";
const ALL = "Wszystkie";
const SEARCH_DELAY_MS = 350;
const RESULT_PAGE_SIZE = 36;
const emptyDrinkFilters = (): DrinkFilters => ({ color: ALL, taste: ALL, sparkling: "all", serving: "all", country: ALL, vegan: false, zero: false, beerStyle: "all", alcohol: "all", spiritType: ALL, spiritStyle: ALL, spiritTaste: ALL, spiritOrigin: ALL, spiritAge: ALL });
const waiterTeaImageByName: Record<string, string> = {
  "english breakfast": "/tea/english-breakfast.jpg",
  "earl grey": "/tea/earl-grey.jpg",
  "ctc assam": "/tea/ctc-assam.jpg",
  "japanese sencha": "/tea/japanese-sencha.jpg",
  "tropical green": "/tea/tropical-green.jpg",
  peppermint: "/tea/peppermint.jpg",
  "spiced plum herbal": "/tea/spiced-plum.jpg",
  "orange passion fruit": "/tea/orange-passion-fruit.jpg",
  "peach fruit tea": "/tea/peach-fruit.jpg",
  "strawberry kiwi fruit tea": "/tea/strawberry-kiwi.jpg",
  paris: "/tea/paris.jpg",
  "hot cinnamon spice": "/tea/hot-cinnamon-spice.jpg",
  jasmine: "/tea/jasmine.jpg",
  "mango fruit tea": "/tea/mango-fruit.jpg",
  "mango friut tea": "/tea/mango-fruit.jpg",
  "rooibos chai": "/tea/rooibos-chai.jpg",
};

function waiterProductImage(product: Product) {
  if (product.kind !== "tea") return product.image;
  const name = product.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pl");
  return waiterTeaImageByName[name] ?? product.image;
}

function beerStyleKey(product: Product) {
  const text = [product.attributes?.beerStyle, product.name].filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pl");
  if (/\bipa\b|india pale ale/.test(text)) return "ipa";
  if (/pszen|witbier|blanche|weizen/.test(text)) return "wheat";
  if (/porter|stout|guinness/.test(text)) return "stout";
  if (/lager|bosman|mastne/.test(text)) return "lager";
  if (/\bale\b|blonde|grimbergen/.test(text)) return "ale";
  if (/somersby|hardmade|cydr|smakow/.test(text)) return "flavoured";
  return "other";
}

function matchesDrinkFilters(product: Product, filters: DrinkFilters) {
  if (product.kind === "wine") return (filters.color === ALL || product.wineColor === filters.color)
    && (filters.taste === ALL || (product.sweetness || product.wineStyle) === filters.taste)
    && (filters.sparkling === "all" || (filters.sparkling === "STILL" ? !product.sparklingType : product.sparklingType === filters.sparkling))
    && (filters.serving === "all" || product.serving === filters.serving)
    && (filters.country === ALL || product.country === filters.country)
    && (!filters.vegan || product.vegan) && (!filters.zero || product.alcoholFree);
  if (product.kind === "beer") return (filters.beerStyle === "all" || beerStyleKey(product) === filters.beerStyle)
    && (filters.alcohol === "all" || (filters.alcohol === "zero" ? product.alcoholFree : !product.alcoholFree))
    && (filters.serving === "all" || product.serving === filters.serving)
    && (filters.country === ALL || product.attributes?.origin === filters.country);
  if (product.kind === "whisky") return (filters.spiritType === ALL || product.attributes?.spiritType === filters.spiritType)
    && (filters.spiritStyle === ALL || product.attributes?.spiritStyle === filters.spiritStyle)
    && (filters.spiritTaste === ALL || product.attributes?.tasteProfile === filters.spiritTaste)
    && (filters.spiritOrigin === ALL || product.attributes?.origin === filters.spiritOrigin)
    && (filters.spiritAge === ALL || product.attributes?.ageStatement === filters.spiritAge)
    && (filters.serving === "all" || product.serving === filters.serving);
  return true;
}

function servingLabel(product: Product) {
  if (product.serving === "glass") return "na kieliszki";
  if (product.serving === "draught") return "z nalewaka";
  if (product.serving === "serving") return "50 ml";
  if (product.serving === "bottle" && ["wine", "beer", "whisky"].includes(product.kind)) return "butelka";
  return "";
}

function WaiterSearch({ onQueryChange }: { onQueryChange: (query: string) => void }) {
  const input = useRef<HTMLInputElement | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    const field = input.current;
    if (!field) return;
    const scheduleSearch = () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => onQueryChange(field.value), SEARCH_DELAY_MS);
    };
    const deleteBackward = () => {
      const start = field.selectionStart ?? field.value.length;
      const end = field.selectionEnd ?? start;
      if (start === end && start === 0) return;
      field.setRangeText("", start === end ? start - 1 : start, end, "end");
      scheduleSearch();
    };
    let handledKeydownAt = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" && event.keyCode !== 8) return;
      event.preventDefault();
      handledKeydownAt = Date.now();
      deleteBackward();
    };
    const onBeforeInput = (event: InputEvent) => {
      if (event.inputType !== "deleteContentBackward" || !event.cancelable) return;
      event.preventDefault();
      if (Date.now() - handledKeydownAt < 50) return;
      deleteBackward();
    };
    field.addEventListener("input", scheduleSearch);
    field.addEventListener("keydown", onKeyDown);
    field.addEventListener("beforeinput", onBeforeInput);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      field.removeEventListener("input", scheduleSearch);
      field.removeEventListener("keydown", onKeyDown);
      field.removeEventListener("beforeinput", onBeforeInput);
    };
  }, [onQueryChange]);
  function clearSearch() {
    if (!input.current) return;
    input.current.value = "";
    if (timer.current !== null) window.clearTimeout(timer.current);
    onQueryChange("");
    input.current.focus();
  }
  return <label className="waiter-search">Szukaj<span><input ref={input} type="text" defaultValue="" placeholder="Kawa, ciasto, piwo…" autoComplete="off" autoCorrect="off" spellCheck={false}/><button type="button" onPointerDown={(event) => event.preventDefault()} onClick={clearSearch}>Wyczyść</button></span></label>;
}

function StaffManualDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const manual = product.staffManual;
  if (!manual) return null;
  return <div className="waiter-manual-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="waiter-manual" role="dialog" aria-modal="true" aria-labelledby="waiter-manual-title">
      <header><div><span>INSTRUKCJA DLA PERSONELU</span><h2 id="waiter-manual-title">{product.name}</h2></div><button type="button" onClick={onClose} aria-label="Zamknij instrukcję">×</button></header>
      {manual.media.length > 0 && <div className="waiter-manual-media">{manual.media.map((media) => <figure key={media.id}>{media.type === "IMAGE" ? <img src={media.path} alt={media.name}/> : <video src={media.path} controls playsInline preload="metadata" aria-label={media.name}/>}</figure>)}</div>}
      {manual.instructions ? <div className="waiter-manual-copy">{manual.instructions}</div> : <p className="waiter-manual-empty">Instrukcja zawiera wyłącznie materiały wizualne.</p>}
      <footer><span>Podpowiedź otwiera się po trzech szybkich dotknięciach zdjęcia produktu.</span><button type="button" onClick={onClose}>Zamknij</button></footer>
    </section>
  </div>;
}

function WaiterDrinkFilters({ kind, products, filters, onChange }: { kind: string; products: Product[]; filters: DrinkFilters; onChange: (next: DrinkFilters) => void }) {
  const values = (read: (product: Product) => string | null | undefined) => Array.from(new Set(products.map(read).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "pl"));
  const pairs = (items: string[]): Array<[string, string]> => items.map((value) => [value, value]);
  const set = <K extends keyof DrinkFilters,>(key: K, value: DrinkFilters[K]) => onChange({ ...filters, [key]: value });
  const changed = JSON.stringify(filters) !== JSON.stringify(emptyDrinkFilters());
  const group = (label: string, key: keyof DrinkFilters, options: Array<[string, string]>) => options.length > 0 && <div className="waiter-filter-row"><strong>{label}</strong><div className="waiter-filter-chips" role="group" aria-label={label}><button type="button" className={filters[key] === (key === "serving" || key === "sparkling" || key === "beerStyle" || key === "alcohol" ? "all" : ALL) ? "is-selected" : ""} aria-pressed={filters[key] === (key === "serving" || key === "sparkling" || key === "beerStyle" || key === "alcohol" ? "all" : ALL)} onClick={() => set(key, (key === "serving" || key === "sparkling" || key === "beerStyle" || key === "alcohol" ? "all" : ALL) as never)}>Wszystkie</button>{options.map(([value, labelText]) => <button type="button" key={value} className={filters[key] === value ? "is-selected" : ""} aria-pressed={filters[key] === value} onClick={() => set(key, value as never)}>{labelText}</button>)}</div></div>;
  const select = (label: string, key: "country" | "spiritOrigin", options: string[]) => options.length > 0 && <label className="waiter-filter-select"><strong>{label}</strong><select value={filters[key]} onChange={(event) => set(key, event.target.value)}><option value={ALL}>Wszystkie dostępne kraje</option>{options.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>;
  const wineColors = values((product) => product.wineColor).filter((value) => !/^(musujące|musujace|sparkling)$/i.test(value));
  const wineTastes = values((product) => product.sweetness || product.wineStyle);
  const origins = values((product) => product.attributes?.origin);
  const beerStyles = Array.from(new Set(products.map(beerStyleKey)));
  const styleLabels: Record<string, string> = { lager: "Lager", wheat: "Pszeniczne", ipa: "IPA", stout: "Porter / stout", ale: "Ale", flavoured: "Smakowe", other: "Pozostałe" };
  return <section className="waiter-drink-filters" aria-label="Filtry napojów dla kelnera"><div className="waiter-filter-header"><div><span>TAKI SAM WYBÓR JAK W MENU GOŚCIA</span><h2>Pomóż gościowi znaleźć właściwy trunek</h2></div>{changed && <button type="button" onClick={() => onChange(emptyDrinkFilters())}>Wyczyść wybór</button>}</div>
    {kind === "wine" && <>{group("Kolor", "color", pairs(wineColors))}{group("Smak", "taste", pairs(wineTastes))}{group("Musowanie", "sparkling", [["STILL", "Spokojne"], ["SPARKLING", "Musujące"], ["NATURALLY_SPARKLING", "Naturalnie musujące"]])}{group("Podanie", "serving", [["glass", "Na kieliszki"], ["bottle", "Na butelki"]])}{(products.some((product) => product.vegan) || products.some((product) => product.alcoholFree)) && <div className="waiter-filter-row"><strong>Cechy</strong><div className="waiter-filter-chips">{products.some((product) => product.vegan) && <button type="button" className={filters.vegan ? "is-selected" : ""} aria-pressed={filters.vegan} onClick={() => set("vegan", !filters.vegan)}>Wegańskie</button>}{products.some((product) => product.alcoholFree) && <button type="button" className={filters.zero ? "is-selected" : ""} aria-pressed={filters.zero} onClick={() => set("zero", !filters.zero)}>0%</button>}</div></div>}{select("Kraj", "country", values((product) => product.country))}</>}
    {kind === "beer" && <>{group("Styl", "beerStyle", beerStyles.map((value): [string, string] => [value, styleLabels[value] ?? value]))}{group("Alkohol", "alcohol", [["alcoholic", "Alkoholowe"], ["zero", "0%"]])}{group("Podanie", "serving", [["bottle", "Butelka"], ["draught", "Z nalewaka"]])}{select("Pochodzenie", "country", origins)}</>}
    {kind === "whisky" && <>{group("Rodzaj trunku", "spiritType", pairs(values((product) => product.attributes?.spiritType)))}{group("Styl", "spiritStyle", pairs(values((product) => product.attributes?.spiritStyle)))}{group("Profil smaku", "spiritTaste", pairs(values((product) => product.attributes?.tasteProfile)))}{select("Pochodzenie", "spiritOrigin", origins)}{group("Wiek", "spiritAge", pairs(values((product) => product.attributes?.ageStatement)))}{group("Podanie", "serving", [["serving", "50 ml"], ["bottle", "Butelka"]])}</>}
  </section>;
}

export default function WaiterClient() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [tables, setTables] = useState<Table[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tableId, setTableId] = useState("");
  const [guestCount, setGuestCount] = useState(1);
  const [category, setCategory] = useState("Wszystkie");
  const [query, setSearchQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(RESULT_PAGE_SIZE);
  const [drinkFilters, setDrinkFilters] = useState<DrinkFilters>(emptyDrinkFilters);
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [configuring, setConfiguring] = useState<Product | null>(null);
  const [addonSelections, setAddonSelections] = useState<Record<string, string[]>>({});
  const [orderNote, setOrderNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [surveying, setSurveying] = useState(false);
  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestion[]>([]);
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string>>({});
  const [posEnabled, setPosEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [area, setArea] = useState<"orders" | "settlement" | "guest-receipts">("orders");
  const [guestReceipt, setGuestReceipt] = useState<GuestReceipt | null>(null);
  const [approvedTips, setApprovedTips] = useState({ count: 0, total: "0.00" });
  const [inventoryTaskCount, setInventoryTaskCount] = useState(0);
  const [manualProduct, setManualProduct] = useState<Product | null>(null);
  const manualTaps = useRef({ productId: "", count: 0, at: 0 });
  const setQuery = useCallback((value: string) => {
    setSearchQuery(value);
    setVisibleLimit(RESULT_PAGE_SIZE);
  }, []);

  const loadCatalog = useCallback(async (reportFailure = false, loginToken?: string) => {
    try {
      const response = await fetch("/api/waiter/catalog", { cache: "no-store", credentials: "same-origin", headers: waiterSessionHeaders(loginToken ? { authorization: `Bearer ${loginToken}` } : undefined) });
      const body = await response.json().catch(() => ({})) as { employee?: Employee; tables?: Table[]; products?: Product[]; surveyQuestions?: SurveyQuestion[]; posActionsEnabled?: boolean; error?: string };
      if (!response.ok) {
        setEmployee(null);
        if (response.status === 401) clearWaiterSessionToken();
        if (reportFailure) setError(body.error ?? "Nie udało się otworzyć strefy kelnera.");
        setLoading(false);
        return false;
      }
      setEmployee(body.employee ?? null); setTables(body.tables ?? []); setProducts(body.products ?? []); setSurveyQuestions(body.surveyQuestions ?? []); setPosEnabled(Boolean(body.posActionsEnabled));
      setTableId((current) => current || body.tables?.[0]?.dotykackaId || ""); setLoading(false);
      return true;
    } catch {
      setEmployee(null);
      if (reportFailure) setError("Tablet nie może teraz połączyć się ze strefą kelnera. Sprawdź połączenie z internetem i spróbuj ponownie.");
      setLoading(false);
      return false;
    }
  }, []);
  // A handed-off guest receipt takes precedence over the waiter login on this tablet.
  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/guest/receipt", { cache: "no-store", credentials: "same-origin" }).catch(() => null);
      if (response?.ok) {
        const body = await response.json().catch(() => ({})) as { receipt?: GuestReceipt };
        if (body.receipt) { setGuestReceipt(body.receipt); setLoading(false); return; }
      }
      await loadCatalog();
    })();
  }, [loadCatalog]);

  const loadApprovedTips = useCallback(async () => {
    const response = await fetch("/api/waiter/tips", { cache: "no-store", headers: waiterSessionHeaders() });
    const body = await response.json().catch(() => ({})) as { count?: number; total?: string };
    if (response.ok) setApprovedTips({ count: body.count ?? 0, total: body.total ?? "0.00" });
  }, []);
  const loadInventoryTaskCount = useCallback(async () => {
    const response = await fetch("/api/waiter/inventory", { cache: "no-store", credentials: "same-origin", headers: waiterSessionHeaders() }).catch(() => null);
    if (!response?.ok) return;
    const body = await response.json().catch(() => ({})) as { stages?: Array<{ status: string }> };
    setInventoryTaskCount((body.stages ?? []).filter((stage) => ["ASSIGNED", "IN_PROGRESS", "CHANGES_REQUESTED"].includes(stage.status)).length);
  }, []);
  useEffect(() => {
    if (!employee) return;
    const refresh = () => { void Promise.all([loadApprovedTips(), loadInventoryTaskCount()]); };
    refresh();
    const timer = window.setInterval(refresh, 2 * 60 * 1000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [employee, loadApprovedTips, loadInventoryTaskCount]);
  useEffect(() => {
    if (!employee) return;
    const refresh = async () => {
      const response = await fetch("/api/waiter/session", { method: "PUT", credentials: "same-origin", headers: waiterSessionHeaders() }).catch(() => null);
      if (!response?.ok) return;
      const body = await response.json().catch(() => ({})) as { token?: string };
      saveWaiterSessionToken(body.token);
    };
    const timer = window.setInterval(() => { void refresh(); }, 4 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [employee]);

  async function login(event: FormEvent) {
    event.preventDefault(); clearWaiterSessionToken(); setError(""); setLoading(true);
    try {
      const response = await fetch("/api/waiter/session", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) });
      const body = await response.json().catch(() => ({})) as { employee?: Employee; token?: string; error?: string };
      if (!response.ok) { setError(body.error ?? "Nie udało się zalogować."); setPin(""); return; }
      saveWaiterSessionToken(body.token); setEmployee(body.employee ?? null); setPin(""); await loadCatalog(true, body.token);
    } catch {
      setError("Tablet nie może teraz połączyć się ze strefą kelnera. Odśwież ekran i spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      await fetch("/api/waiter/session", { method: "DELETE", credentials: "same-origin", headers: waiterSessionHeaders() });
    } finally {
      clearWaiterSessionToken();
    }
    setEmployee(null); setCart({}); setReviewing(false); setSurveying(false); setSurveyAnswers({}); setOrderNote(""); setPin(""); setError(""); setArea("orders"); setApprovedTips({ count: 0, total: "0.00" }); setInventoryTaskCount(0);
    window.location.replace("/");
  }

  function handoffToGuest(receipt: GuestReceipt) {
    clearWaiterSessionToken();
    setEmployee(null);
    setGuestReceipt(receipt);
  }

  const categories = useMemo(() => {
    const regular = Array.from(new Set(products.filter((product) => !product.outsideMenu).map((product) => product.category))).sort((a, b) => a.localeCompare(b, "pl"));
    return ["Wszystkie", ...regular, ...(products.some((product) => product.outsideMenu) ? [OUTSIDE_MENU] : [])];
  }, [products]);
  const categoryProducts = useMemo(() => products.filter((product) => !product.outsideMenu && product.category === category), [products, category]);
  const activeDrinkKind = categoryProducts.find((product) => ["wine", "beer", "whisky"].includes(product.kind))?.kind ?? "";
  const normalizedQuery = query.trim().toLocaleLowerCase("pl");
  const productSearchTexts = useMemo(() => new Map(products.map((product) => [product.dotykackaId, `${product.name} ${product.category}`.toLocaleLowerCase("pl")])), [products]);
  const matchingProducts = useMemo(() => products.filter((product) => {
    const matchesView = category === OUTSIDE_MENU ? product.outsideMenu : !product.outsideMenu && (category === "Wszystkie" || product.category === category);
    return matchesView && matchesDrinkFilters(product, drinkFilters) && (!normalizedQuery || productSearchTexts.get(product.dotykackaId)?.includes(normalizedQuery));
  }), [products, category, normalizedQuery, drinkFilters, productSearchTexts]);
  const visible = matchingProducts.slice(0, visibleLimit);
  const resultsLimited = matchingProducts.length > visible.length;
  const items = useMemo(() => Object.entries(cart).map(([lineKey, item]) => ({ ...item, lineKey })), [cart]);
  const quantityByProduct = useMemo(() => {
    const quantities = new Map<string, number>();
    for (const item of items) quantities.set(item.product.dotykackaId, (quantities.get(item.product.dotykackaId) ?? 0) + item.quantity);
    return quantities;
  }, [items]);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const itemUnitPrice = (item: CartItem) => Number(item.product.price ?? 0) + item.customizations.reduce((sum, addon) => sum + Number(addon.price ?? 0), 0);
  const total = items.reduce((sum, item) => sum + item.quantity * itemUnitPrice(item), 0);

  function changeLine(lineKey: string, delta: number) {
    setCart((current) => {
      const existing = current[lineKey];
      if (!existing) return current;
      const quantity = Math.max(0, (existing?.quantity ?? 0) + delta);
      if (!quantity) { const next = { ...current }; delete next[lineKey]; return next; }
      return { ...current, [lineKey]: { ...existing, quantity } };
    });
  }

  function addConfigured(product: Product, customizations: Addon[]) {
    const lineKey = `${product.dotykackaId}:${customizations.map((addon) => addon.id).sort().join(",") || "standard"}`;
    setCart((current) => ({ ...current, [lineKey]: { product, customizations, note: current[lineKey]?.note ?? "", quantity: (current[lineKey]?.quantity ?? 0) + 1 } }));
    setConfiguring(null); setAddonSelections({});
  }

  function addProduct(product: Product) {
    if (!product.addonGroups.length) return addConfigured(product, []);
    setAddonSelections({}); setConfiguring(product);
  }

  function removeProduct(product: Product) {
    const line = [...items].reverse().find((item) => item.product.dotykackaId === product.dotykackaId);
    if (line) changeLine(line.lineKey, -1);
  }

  function chooseCategory(nextCategory: string) {
    setCategory(nextCategory);
    setDrinkFilters(emptyDrinkFilters());
    setVisibleLimit(RESULT_PAGE_SIZE);
  }

  function openProductManual(product: Product, at: number) {
    if (!product.staffManual) return;
    const previous = manualTaps.current;
    const count = previous.productId === product.dotykackaId && at - previous.at <= 1100 ? previous.count + 1 : 1;
    manualTaps.current = { productId: product.dotykackaId, count, at };
    if (count < 3) return;
    manualTaps.current = { productId: "", count: 0, at: 0 };
    setManualProduct(product);
  }

  function confirmConfiguration() {
    if (!configuring || configuring.addonGroups.some((group) => group.required && !addonSelections[group.name]?.length)) return;
    const byId = new Map(configuring.addonGroups.flatMap((group) => group.options).map((addon) => [addon.id, addon]));
    addConfigured(configuring, Object.values(addonSelections).flat().map((id) => byId.get(id)).filter((addon): addon is Addon => Boolean(addon)));
  }

  function itemNote(lineKey: string, note: string) {
    setCart((current) => current[lineKey] ? { ...current, [lineKey]: { ...current[lineKey], note } } : current);
  }

  async function sendOrder() {
    if (!tableId || !items.length || !posEnabled) return;
    setSending(true); setError("");
    const response = await fetch("/api/waiter/orders", { method: "POST", headers: waiterSessionHeaders({ "content-type": "application/json" }), body: JSON.stringify({ tableId, guestCount, note: orderNote, surveyAnswers, items: items.map((item) => ({ productId: item.product.dotykackaId, quantity: item.quantity, note: item.note, customizations: item.customizations.map((addon) => addon.id) })) }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się wysłać zamówienia.");
    else { clearWaiterSessionToken(); window.location.assign("/"); }
    setSending(false);
  }

  if (guestReceipt) return <GuestReceiptView receipt={guestReceipt}/>;
  if (loading) return <main className="waiter-login"><img src="/logo-cafe.png" alt="Marta Banaszek atelier-café"/><p>Przygotowuję strefę kelnera…</p></main>;
  if (!employee) return <main className="waiter-login"><section><img src="/logo-cafe.png" alt="Marta Banaszek atelier-café"/><span>STREFA KELNERA</span><h1>Wpisz swój PIN</h1><p>Po wysłaniu zamówienia lub rozliczenia tablet automatycznie wróci do menu dla gości.</p><form onSubmit={login}><input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))} type="password" inputMode="numeric" pattern="[0-9]{4,8}" autoComplete="off" enterKeyHint="go" aria-label="PIN pracownika"/><div className="waiter-keypad">{[1,2,3,4,5,6,7,8,9].map((digit) => <button type="button" key={digit} onClick={() => setPin((value) => `${value}${digit}`.slice(0, 8))}>{digit}</button>)}<button type="button" onClick={() => setPin("")}>C</button><button type="button" onClick={() => setPin((value) => `${value}0`.slice(0, 8))}>0</button><button type="button" aria-label="Usuń ostatnią cyfrę" onClick={() => setPin((value) => value.slice(0, -1))}>⌫</button></div>{error && <p className="waiter-error" role="alert">{error}</p>}<button className="waiter-login-button" disabled={!/^\d{4,8}$/.test(pin)}>Wejdź</button></form><Link href="/">Wróć do menu gościa</Link></section></main>;

  if (area === "settlement") return <SettlementForm employee={employee} onBack={() => setArea("orders")} onLogout={() => void logout()}/>;
  if (area === "guest-receipts") return <GuestReceiptPicker employeeName={employee.name} onBack={() => setArea("orders")} onHandoff={handoffToGuest} onLogout={() => void logout()}/>;

  if (surveying) {
    const requiredComplete = surveyQuestions.every((question) => !question.required || Boolean(surveyAnswers[String(question.id)]));
    return <main className="waiter-app"><header className="waiter-header"><button onClick={() => setSurveying(false)}>← Zamówienie</button><div><span>Krótka ankieta</span><strong>{employee.name}</strong></div><button onClick={logout}>Wyloguj</button></header><section className="waiter-survey"><div className="waiter-review-title"><span>OSTATNI KROK</span><h1>Kilka pytań</h1><p>Odpowiedzi zapiszą się z zamówieniem, bez danych osobowych gościa.</p></div>{surveyQuestions.map((question, index) => <fieldset key={question.id}><legend><b>{index + 1}</b>{question.prompt}{question.required && <small>wymagane</small>}</legend><div>{question.options.map((option) => <button type="button" className={surveyAnswers[String(question.id)] === option ? "is-selected" : ""} key={option} onClick={() => setSurveyAnswers((current) => ({ ...current, [String(question.id)]: option }))}>{option}</button>)}</div></fieldset>)}{error && <p className="waiter-error" role="alert">{error}</p>}<footer><button className="waiter-survey-skip" onClick={() => setSurveying(false)}>Wróć i popraw</button><button disabled={!requiredComplete || !posEnabled || sending} onClick={sendOrder}>{sending ? "Wysyłam…" : posEnabled ? "Wyślij zamówienie" : "Wysyłka jeszcze zablokowana"}</button>{!posEnabled && <small>Możesz sprawdzić cały przebieg i ankietę. Połączenie z POS uruchomimy dopiero po teście.</small>}</footer></section></main>;
  }

  if (reviewing) return <main className="waiter-app"><header className="waiter-header"><button onClick={() => setReviewing(false)}>← Wróć</button><div><span>Zamówienie</span><strong>{employee.name}</strong></div><button onClick={logout}>Wyloguj</button></header><section className="waiter-review"><div className="waiter-review-title"><span>SPRAWDŹ PRZED WYSŁANIEM</span><h1>Stolik {tables.find((table) => table.dotykackaId === tableId)?.name ?? "—"}</h1><p>{guestCount} {guestCount === 1 ? "gość" : "gości"} · {itemCount} pozycji</p></div>{items.map((item) => <article className="waiter-review-item" key={item.lineKey}><div><h2>{item.product.name}</h2>{item.customizations.length > 0 && <p className="waiter-item-options">{item.customizations.map((addon) => addon.name).join(" · ")}</p>}<strong>{money(itemUnitPrice(item) * item.quantity)} zł</strong></div><div className="waiter-quantity"><button onClick={() => changeLine(item.lineKey, -1)}>−</button><b>{item.quantity}</b><button onClick={() => changeLine(item.lineKey, 1)}>+</button></div><label>Uwagi do pozycji<input value={item.note} maxLength={500} onChange={(event) => itemNote(item.lineKey, event.target.value)} placeholder="np. bez lodu, osobno…"/></label></article>)}<label className="waiter-order-note">Uwagi do całego zamówienia<textarea value={orderNote} maxLength={1000} onChange={(event) => setOrderNote(event.target.value)} placeholder="Informacja dla baru lub kuchni"/></label>{error && <p className="waiter-error" role="alert">{error}</p>}<footer><div><span>Razem</span><strong>{money(total)} zł</strong></div><button disabled={!items.length || (!surveyQuestions.length && !posEnabled)} onClick={() => surveyQuestions.length ? setSurveying(true) : void sendOrder()}>{surveyQuestions.length ? "Dalej: krótka ankieta →" : posEnabled ? "Wyślij do Dotykački" : "Wysyłka jeszcze zablokowana"}</button>{!posEnabled && !surveyQuestions.length && <small>Najpierw sprawdzimy połączenie na środowisku testowym. Ten ekran nie może teraz utworzyć zamówienia ani paragonu.</small>}</footer></section></main>;

  return <main className="waiter-app"><header className="waiter-header"><img src="/logo-cafe.png" alt="Atelier Café"/><div><span>Zalogowany pracownik</span><strong>{employee.name}</strong></div><aside className="waiter-finance-entry"><div className="waiter-header-actions"><Link className="waiter-inventory-entry" href="/kelner/inventory">Inwentaryzacja{inventoryTaskCount > 0 && <b>{inventoryTaskCount}</b>}</Link><button className="waiter-guest-receipt-entry" onClick={() => setArea("guest-receipts")}>Rachunek dla gościa</button><button className="waiter-settlement-entry" onClick={() => setArea("settlement")}>Rozliczenie</button></div><span>Zatwierdzone napiwki do wypłaty: <b>{money(Number(approvedTips.total))} zł</b>{approvedTips.count > 0 && <small> · {approvedTips.count} {approvedTips.count === 1 ? "pozycja" : "pozycje"}</small>}</span></aside><button onClick={logout}>Wyloguj</button></header>{inventoryTaskCount > 0 && <Link className="waiter-inventory-alert" href="/kelner/inventory"><span>Masz {inventoryTaskCount} {inventoryTaskCount === 1 ? "zadanie inwentaryzacyjne" : "zadania inwentaryzacyjne"} do wykonania</span><b>Otwórz zadania →</b></Link>}<section className="waiter-context"><label>Stolik<select value={tableId} onChange={(event) => setTableId(event.target.value)}><option value="">Wybierz stolik</option>{tables.map((table) => <option key={table.dotykackaId} value={table.dotykackaId}>{table.name}</option>)}</select></label><label>Liczba gości<div className="waiter-quantity"><button onClick={() => setGuestCount((value) => Math.max(1, value - 1))}>−</button><b>{guestCount}</b><button onClick={() => setGuestCount((value) => Math.min(30, value + 1))}>+</button></div></label><WaiterSearch onQueryChange={setQuery}/></section><nav className="waiter-categories">{categories.map((item) => <button key={item} className={`${category === item ? "is-active" : ""}${item === OUTSIDE_MENU ? " is-outside-menu" : ""}`} onClick={() => chooseCategory(item)}>{item}</button>)}</nav>{category === OUTSIDE_MENU && <aside className="waiter-outside-menu-note"><b>Pozycje spoza karty gościa</b><span>Aktywne produkty oznaczone jako wyświetlane w Dotykačce, bez tagów MENU i PÓŁKA.</span></aside>}{activeDrinkKind && <WaiterDrinkFilters kind={activeDrinkKind} products={categoryProducts} filters={drinkFilters} onChange={setDrinkFilters}/>}<section className="waiter-products">{visible.map((product) => { const quantity = quantityByProduct.get(product.dotykackaId) ?? 0; const service = servingLabel(product); const image = waiterProductImage(product); return <article key={product.dotykackaId} className={product.outsideMenu ? "is-outside-menu" : undefined}><button type="button" className="waiter-product-manual-hotspot" onPointerUp={() => openProductManual(product, Date.now())} aria-label={`Zdjęcie produktu ${product.name}`}>{image ? <img src={image} alt={product.kind === "tea" ? `Napar i liście herbaty ${product.name}` : ""} loading="lazy" decoding="async" draggable={false}/> : <span className="waiter-product-placeholder"/>}</button><div><small>{product.category}{service ? ` · ${service}` : product.outsideMenu ? " · poza menu" : product.addonGroups.length > 0 ? " · wybór wariantu" : ""}</small><h2>{product.name}</h2><strong>{money(Number(product.price ?? 0))} zł</strong></div><div className="waiter-quantity"><button aria-label={`Odejmij ${product.name}`} disabled={!quantity} onClick={() => removeProduct(product)}>−</button><b>{quantity}</b><button aria-label={`Dodaj ${product.name}`} onClick={() => addProduct(product)}>+</button></div></article>; })}{resultsLimited && <div className="waiter-search-limit"><span>Pokazuję {visible.length} z {matchingProducts.length} wyników.{normalizedQuery ? " Możesz dopisać kolejne znaki albo wyświetlić więcej." : ""}</span><button type="button" onClick={() => setVisibleLimit((current) => current + RESULT_PAGE_SIZE)}>Pokaż kolejne</button></div>}{!visible.length && <p className="waiter-empty">Brak pozycji pasujących do wybranych filtrów.</p>}</section>{configuring && <div className="waiter-configurator-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfiguring(null); }}><section className="waiter-configurator" role="dialog" aria-modal="true" aria-labelledby="waiter-configurator-title"><header><div><span>DODAJ JEDNĄ POZYCJĘ</span><h2 id="waiter-configurator-title">{configuring.name}</h2></div><button onClick={() => setConfiguring(null)} aria-label="Zamknij">×</button></header>{configuring.addonGroups.map((group) => { const selected = addonSelections[group.name] ?? []; return <fieldset key={group.name}><legend>{group.name}{group.required ? <small>wymagany wybór</small> : group.multiple ? <small>możesz wybrać kilka</small> : <small>opcjonalnie</small>}</legend><div>{!group.required && <button type="button" className={!selected.length ? "is-selected" : ""} onClick={() => setAddonSelections((current) => ({ ...current, [group.name]: [] }))}>Bez zmiany</button>}{group.options.map((addon) => <button type="button" key={addon.id} aria-pressed={selected.includes(addon.id)} className={selected.includes(addon.id) ? "is-selected" : ""} onClick={() => setAddonSelections((current) => { const previous = current[group.name] ?? []; const next = group.multiple ? (previous.includes(addon.id) ? previous.filter((id) => id !== addon.id) : [...previous, addon.id]) : [addon.id]; return { ...current, [group.name]: next }; })}><b>{addon.name}</b>{Number(addon.price ?? 0) > 0 && <small>+ {money(Number(addon.price))} zł</small>}</button>)}</div></fieldset>; })}<footer><button className="waiter-configurator-cancel" onClick={() => setConfiguring(null)}>Anuluj</button><button disabled={configuring.addonGroups.some((group) => group.required && !addonSelections[group.name]?.length)} onClick={confirmConfiguration}>Dodaj do zamówienia</button></footer></section></div>}{manualProduct && <StaffManualDialog product={manualProduct} onClose={() => setManualProduct(null)}/>}<footer className="waiter-cart"><div><b>{itemCount}</b><span>{itemCount === 1 ? "pozycja" : "pozycji"}<small>{money(total)} zł</small></span></div><button disabled={!itemCount || !tableId} onClick={() => setReviewing(true)}>Sprawdź zamówienie →</button></footer></main>;
}
