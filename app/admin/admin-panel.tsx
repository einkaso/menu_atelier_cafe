"use client";

import { type CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CalendarDays, ChevronDown, ChevronRight, ChevronUp, ClipboardList, Coffee, DoorOpen, LayoutList, Lightbulb, PackageOpen, RefreshCw, Settings2, Tags, Users, WalletCards } from "lucide-react";
import { sectionFor } from "../../lib/menu-categories";
import { manualProductSearchUrl, productSearchTitle } from "../../lib/manual-product-search";
import { hasTag, isShelfProduct, shelfHasPositiveStock } from "../../lib/menu-tags";
import { isForestLifeSyrupCategory } from "../../lib/flavor-syrups";
import { menuProductVisibleForGuest } from "../../lib/menu-visibility";
import { filterStockLevels, formatStockQuantity, stockQuantityValue, usedStockTags, type StockLevelProduct, type StockStateFilter } from "../../lib/stock-levels";

type StaffManualMedia = { id: string; path: string; type: "IMAGE" | "VIDEO"; name: string };

type Product = {
  id: number;
  dotykackaId: string;
  name: string;
  wineCode: string | null;
  catalogCode: string | null;
  catalogCodeCandidates: string[];
  pluCodes: string[];
  licenseCodes: string[];
  dotykackaSupplierId: string | null;
  supplierName: string | null;
  supplierProductCode: string | null;
  eanCodes: string[];
  sourceDescription: string | null;
  category: string | null;
  price: string | null;
  currency: string;
  display: boolean;
  deleted: boolean;
  stockDeduct: boolean;
  stockOverdraft: "ALLOW" | "WARN" | "DISABLE";
  stockQuantity: string | null;
  salesCount30d: string;
  salesSyncedAt: string | null;
  tags: string[];
  allergens: number[];
  features: string[];
  menuTagged: boolean;
  syncedAt: string;
  contentUpdatedAt: string | null;
  nameEn: string | null;
  descriptionPl: string | null;
  descriptionEn: string | null;
  countryEn: string | null;
  regionEn: string | null;
  wineStyleEn: string | null;
  tastingNotesEn: string | null;
  autoTranslate: boolean | null;
  translationSourceHash: string | null;
  imageSourceUrl: string | null;
  imagePath: string | null;
  galleryPaths: string[];
  detailBackdropPath: string | null;
  detailBackdropSourceUrl: string | null;
  featured: boolean | null;
  featuredSortOrder: number | null;
  contentApproved: boolean | null;
  hideWhenOutOfStock: boolean | null;
  manualHidden: boolean | null;
  waiterVisibilityOverride: boolean | null;
  country: string | null;
  region: string | null;
  grapes: string | null;
  wineStyle: string | null;
  wineColor: string | null;
  sparklingType: "SPARKLING" | "NATURALLY_SPARKLING" | null;
  sweetness: string | null;
  veganStatus: "YES" | "NO" | "UNKNOWN";
  tastingNotes: string | null;
  drinkVesselId: number | null;
  espressoShots: 0 | 1 | 2 | null;
  alcoholMarker: boolean | null;
  attributes: Record<string, string> | null;
  staffInstructions: string | null;
  staffMedia: StaffManualMedia[] | null;
};

type DrinkVessel = {
  id: number;
  key: string;
  name: string;
  capacityMl: number;
  iconPath: string | null;
};

type WineSource = {
  id: number;
  supplierName: string | null;
  supplierWebsite: string | null;
  sourceUrl: string | null;
  ean: string | null;
  supplierProductCode: string | null;
  sourceKind: string;
  proposedContent: {
    descriptionPl?: string | null;
    imageSourceUrl?: string | null;
    country?: string | null;
    region?: string | null;
    grapes?: string | null;
    wineStyle?: string | null;
    wineColor?: string | null;
    sparklingType?: "SPARKLING" | "NATURALLY_SPARKLING" | null;
    sweetness?: string | null;
    veganStatus?: string | null;
    tastingNotes?: string | null;
    attributes?: Record<string, string>;
    sourceUrls?: string[];
    imageCandidates?: Array<{ url: string; sourceUrl: string; label?: string }>;
  } | null;
  status: "PENDING" | "APPLIED" | "KEPT" | "FAILED";
  decision: "KEEP_CURRENT" | "FILL_MISSING" | "REPLACE" | null;
  fetchedAt: string;
};

type ProductSearchCandidate = {
  url: string;
  title: string;
  description: string;
  imageUrl?: string;
};

type MenuCategory = {
  id: number;
  name: string;
  sourceOrder: number | null;
  menuOrder: number | null;
  showCatalogCodes: boolean;
  visibleProducts: number;
  promoProducts: number;
};
type ShelfGroupRow = { id: number; name: string; sourceOrder: number | null; shelfOrder: number | null; taggedProducts: number; visibleProducts: number };

type OrderSuggestion = { context: string; categoryIds: number[]; reason: string };
type ProductOrderRow = { id: number; name: string; sourceOrder: number | null; menuOrder: number | null; menuGroup: string | null; suggestion: { pl: string; en: string; rank: number } | null };
type ProductGroupOrderRow = { name: string; productCount: number; sortOrder: number };
type PromotionRow = { id: number; name: string; category: string | null; source: string; order: number | null };
type Season = "" | "LATO" | "JESIEŃ" | "ZIMA" | "WIOSNA";
type OfferSettings = {
  season: Season;
  specialEnabled: boolean;
  specialNamePl: string;
  specialNameEn: string;
  seasonCounts: Record<Exclude<Season, "">, number>;
  specialCount: number;
};
type AuditIssue = { productId: number; name: string; category: string; kind: "image" | "description" | "translation" | "wine" | "beer"; message: string };
type VisibilityEvent = {
  id: number;
  productId: number | null;
  productDotykackaId: string;
  productName: string;
  categoryName: string;
  previousVisible: boolean;
  visible: boolean;
  reason: string;
  employeeDotykackaId: string;
  employeeName: string;
  createdAt: string;
};
type DotykackaOption = { id: string; name: string };
type DotykackaStatus = {
  connectorConfigured: boolean;
  connected: boolean;
  cloudId?: string;
  warehouseId?: string | null;
  branchId?: string | null;
  warehouses: DotykackaOption[];
  branches: DotykackaOption[];
  connectionError?: string;
  stockWebhookRegistered?: boolean;
  stockEvents?: {
    received: number;
    assigned: number;
    unresolved: number;
    lastEventAt: string | null;
    lastEventStatus: string | null;
  };
};
type VisibilityFilter = "" | "visible" | "hidden" | "all";
type ProductStatusKind = "approved" | "needs-review" | "dotykacka-hidden" | "menu-hidden";
type ProductStatusFilter = "all" | ProductStatusKind;
type AdminView = "home" | "connection" | "products" | "stock" | "categories" | "productOrder" | "offers" | "promotions" | "audit" | "visibilityHistory" | "rules";
type AdminDashboardTileId = "products" | "reservations" | "settlements" | "connection" | "lighting" | "rooms" | "employees" | "stock" | "instructions" | "inventory" | "workforce" | "categories" | "offers";
type AdminDashboardTilePreference = { id: AdminDashboardTileId; visible: boolean; background: string; foreground: string };

const ADMIN_DASHBOARD_TILES: Array<{ id: AdminDashboardTileId; title: string; description: string; view?: AdminView; href?: string }> = [
  { id: "products", title: "Produkty", description: "Wyszukiwanie, widoczność i edycja produktów.", view: "products" },
  { id: "reservations", title: "Rezerwacje", description: "Kalendarz gości, stoliki i przygotowanie.", href: "/admin/reservations" },
  { id: "settlements", title: "Rozliczenia", description: "Zmiany, napiwki i finanse operacyjne.", href: "/admin/settlements" },
  { id: "connection", title: "Połączenie z Dotykačką", description: "Synchronizacja, produkty, magazyn i stoliki.", view: "connection" },
  { id: "lighting", title: "Oświetlenie", description: "Strefy, lampy i automatyzacje BleBox.", href: "/admin/lighting" },
  { id: "rooms", title: "Pomieszczenia", description: "Zamki, dostęp i stan wejść TTLock.", href: "/admin/rooms" },
  { id: "employees", title: "Pracownicy", description: "Dostępy, uprawnienia i konta zespołu.", href: "/admin/waiters" },
  { id: "stock", title: "Stany magazynowe", description: "Dostępność i zasady ukrywania produktów.", view: "stock" },
  { id: "instructions", title: "Instrukcje", description: "Procedury i materiały dla zespołu.", href: "/admin/instructions" },
  { id: "inventory", title: "Inwentaryzacja", description: "Zadania, liczenie i różnice magazynowe.", href: "/admin/inventory" },
  { id: "workforce", title: "Grafik", description: "Planowanie pracy i ewidencja godzin.", href: "/admin/workforce" },
  { id: "categories", title: "Zakładki i kody PLU", description: "Kolejność sekcji i prezentacja kodów.", view: "categories" },
  { id: "offers", title: "Oferty czasowe", description: "Sezonowe i specjalne propozycje.", view: "offers" },
];

const DEFAULT_ADMIN_DASHBOARD_PREFERENCES: AdminDashboardTilePreference[] = ADMIN_DASHBOARD_TILES.map((tile) => ({
  id: tile.id,
  visible: ["products", "reservations", "settlements", "connection", "lighting", "rooms", "employees"].includes(tile.id),
  background: tile.id === "connection" ? "#519e46" : tile.id === "settlements" ? "#0b3442" : "paper",
  foreground: "auto",
}));

const ADMIN_DASHBOARD_COLORS = [
  { value: "paper", label: "Jasny — polecany" },
  { value: "#0b3442", label: "Granatowy" },
  { value: "#519e46", label: "Zielony" },
  { value: "#f36b30", label: "Pomarańczowy" },
  { value: "#d51b77", label: "Różowy" },
  { value: "#7763a7", label: "Fioletowy" },
] as const;

function normalizedDashboardPreferences(value: unknown): AdminDashboardTilePreference[] {
  if (!Array.isArray(value)) return DEFAULT_ADMIN_DASHBOARD_PREFERENCES.map((item) => ({ ...item }));
  const accepted = new Map<AdminDashboardTileId, AdminDashboardTilePreference>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    const tile = ADMIN_DASHBOARD_TILES.find((entry) => entry.id === candidate.id);
    const validBackground = candidate.background === "paper" || (typeof candidate.background === "string" && /^#[0-9a-f]{6}$/i.test(candidate.background));
    const validForeground = candidate.foreground === undefined || candidate.foreground === "auto" || (typeof candidate.foreground === "string" && /^#[0-9a-f]{6}$/i.test(candidate.foreground));
    if (tile && typeof candidate.visible === "boolean" && validBackground && validForeground) accepted.set(tile.id, { id: tile.id, visible: candidate.visible, background: String(candidate.background).toLowerCase(), foreground: candidate.foreground === undefined ? "auto" : String(candidate.foreground).toLowerCase() });
  }
  const ordered = value.flatMap((item) => item && typeof item === "object" && accepted.has((item as { id?: AdminDashboardTileId }).id!) ? [accepted.get((item as { id: AdminDashboardTileId }).id)!] : []);
  for (const fallback of DEFAULT_ADMIN_DASHBOARD_PREFERENCES) if (!accepted.has(fallback.id)) ordered.push({ ...fallback });
  return ordered.length === ADMIN_DASHBOARD_TILES.length && ordered.some((item) => item.visible) ? ordered : DEFAULT_ADMIN_DASHBOARD_PREFERENCES.map((item) => ({ ...item }));
}

function dashboardTileForeground(background: string, foreground = "auto") {
  if (foreground !== "auto") return foreground;
  if (background === "paper") return "#0b3442";
  const channels = [1, 3, 5].map((offset) => Number.parseInt(background.slice(offset, offset + 2), 16));
  const luminance = (channels[0] * 299 + channels[1] * 587 + channels[2] * 114) / 1000;
  return luminance >= 158 ? "#0b3442" : "#ffffff";
}

function AdminDashboardTileIcon({ id }: { id: AdminDashboardTileId }) {
  const props = { size: 21, strokeWidth: 1.8, "aria-hidden": true } as const;
  if (id === "products") return <Coffee {...props}/>;
  if (id === "reservations") return <CalendarDays {...props}/>;
  if (id === "settlements") return <WalletCards {...props}/>;
  if (id === "connection") return <RefreshCw {...props}/>;
  if (id === "lighting") return <Lightbulb {...props}/>;
  if (id === "rooms") return <DoorOpen {...props}/>;
  if (id === "employees") return <Users {...props}/>;
  if (id === "stock") return <PackageOpen {...props}/>;
  if (id === "instructions") return <BookOpenCheck {...props}/>;
  if (id === "inventory") return <ClipboardList {...props}/>;
  if (id === "workforce") return <CalendarDays {...props}/>;
  if (id === "categories") return <LayoutList {...props}/>;
  return <Tags {...props}/>;
}

type HistoricalImportResult = {
  receiptDocuments: number;
  purchaseGroups: number;
  purchaseLines: number;
  linkedPurchaseLines: number;
  unresolvedReportLines: number;
  suppliersFound: number;
  catalogProductsMatched: number;
  catalogProductsUnmatched: number;
  productsToUpdate: number;
  multipleSupplierProducts: number;
  applied: boolean;
  warnings: string[];
};

const editable = ["nameEn", "descriptionPl", "descriptionEn", "country", "region", "grapes", "wineStyle", "wineColor", "sparklingType", "sweetness", "veganStatus", "tastingNotes", "staffInstructions"] as const;
const attributeKeys = ["alcoholPercentage", "beerStyle", "origin", "teaType", "brewTemperature", "brewTime", "coffeeOrigin", "coffeeProfile", "coffeeModifiers", "producer", "dietaryInfo", "cocktailType", "cocktailBase", "servingStyle", "tasteProfile", "volume", "spiritType", "spiritStyle", "ageStatement", "caskType"] as const;
const drinkVesselKinds = new Set(["coffee", "tea", "matcha", "cold"]);

function supportsDrinkVessel(kind: string, category?: string | null) {
  const normalizedCategory = (category ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pl");
  const namedDrinkCategory = /wkladka\s+jesien|napoj/.test(normalizedCategory);
  return drinkVesselKinds.has(kind) || namedDrinkCategory;
}

const MAX_LOCAL_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_STORED_IMAGE_BYTES = 2_400_000;
const localImageTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
};

function normalizedLocalImage(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const declaredType = file.type.toLowerCase();
  const type = Object.values(localImageTypes).includes(declaredType) ? declaredType : localImageTypes[extension];
  if (!type || !Object.values(localImageTypes).includes(type)) throw new Error("Wybierz zdjęcie JPG, PNG, WebP, AVIF, HEIC lub HEIF.");
  return file.type === type ? file : new File([file], file.name, { type });
}

function isPreparableLocalImage(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return (file.type.startsWith("image/") && file.type !== "image/gif") || Boolean(localImageTypes[extension]);
}

async function prepareLocalImage(file: File) {
  const source = normalizedLocalImage(file);
  if (source.size > MAX_LOCAL_IMAGE_BYTES) throw new Error("Plik źródłowy jest większy niż 50 MB.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    return source;
  }

  try {
    for (const attempt of [
      { maxSide: 1600, quality: .84 },
      { maxSide: 1400, quality: .76 },
      { maxSide: 1200, quality: .68 },
    ]) {
      const scale = Math.min(1, attempt.maxSide / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Przeglądarka nie może przygotować zdjęcia.");
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", attempt.quality));
      if (blob && blob.size <= MAX_STORED_IMAGE_BYTES) {
        const baseName = source.name.replace(/\.[^.]+$/, "") || "zdjecie";
        return new File([blob], `${baseName}.webp`, { type: "image/webp" });
      }
    }
  } finally {
    bitmap.close();
  }
  return source;
}

const ruleSections = [
  {
    title: "Publikacja w menu",
    lead: "Co decyduje o tym, czy gość zobaczy produkt.",
    rules: [
      ["Dotykačka", "Zwykły produkt musi mieć tag MENU. Sam tag PÓŁKA publikuje produkt tylko w karcie „Z PÓŁKI”, a po połączeniu z MENU dodaje tę kartę jako drugie miejsce wyświetlania."],
      ["Automatycznie", "Produkt musi być widoczny i aktywny w Dotykačce oraz nie może być usunięty ani ręcznie ukryty w naszym panelu."],
      ["Automatycznie", "Kategoria staje się zwykłą zakładką tylko wtedy, gdy zawiera co najmniej jeden aktualnie widoczny produkt z tagiem MENU."],
      ["Dotykačka", "Tag PROMO wyróżnia produkt na stronie powitalnej i na początku jego kategorii, ale nie zastępuje tagu MENU. Liczba promowanych pozycji jest dowolna."],
      ["Nasz panel", "Kolejność wszystkich polecanych pozycji ustawiamy w zakładce „Polecane”. Nie ma limitu liczby produktów."],
      ["Automatycznie", "Oznaczenie „POLECAMY” jest umieszczane po lewej stronie zdjęcia produktu, w tym samym obszarze co „Wybór naszych gości”. Jeżeli występują oba oznaczenia, system układa je jedno pod drugim."],
      ["Automatycznie", "Wyróżniony „Wybór Atelier” na początku każdej kategorii jest w całości klikalny i otwiera ten sam właściwy podgląd produktu co jego pozycja na zwykłej liście."],
      ["Nasz panel", "Ręczne ukrycie ma pierwszeństwo przed pozostałymi ustawieniami i pozostaje zapisane po kolejnej synchronizacji."],
    ],
  },
  {
    title: "Cena, dostępność i magazyn",
    lead: "Dane handlowe pozostają pod kontrolą Dotykački.",
    rules: [
      ["Dotykačka", "Cena sprzedaży zawsze pochodzi z Dotykački — nie wpisujemy ani nie przeliczamy jej w naszym panelu."],
      ["Automatycznie", "Jeżeli produkt odlicza stan, sprzedaż poniżej stanu jest zabroniona, a stan wynosi 0 lub mniej — produkt znika z menu."],
      ["Dotykačka", "Produkty przygotowywane na miejscu mogą pozostać widoczne przy stanie 0: ustaw sprzedaż poniżej stanu jako dozwoloną lub dozwoloną z ostrzeżeniem."],
      ["Automatycznie", "Po ponownym pojawieniu się zapasu produkt wraca do menu przy następnej synchronizacji, o ile spełnia pozostałe warunki publikacji."],
      ["Automatycznie", "Zmiany ceny, widoczności, tagów, kategorii, alergenów i stanu są pobierane z Dotykački."],
      ["Dotykačka", "W kategorii „Składniki” tag INWENT jest jedyną regułą udziału produktu w inwentaryzacji: dodanie tagu włącza produkt, a jego usunięcie wyłącza produkt przy następnej synchronizacji."],
      ["Automatycznie", "Dla produktów z kategorii „Składniki” panel blokuje ręczne zaznaczanie inwentaryzacji, aby ustawienie nie rozchodziło się z tagiem INWENT w Dotykačce."],
    ],
  },
  {
    title: "Treści, zdjęcia i tłumaczenia",
    lead: "Dotykačka dostarcza sprzedaż, a nasza baza przechowuje prezentację produktu.",
    rules: [
      ["Nasz panel", "Opis z Dotykački trafia do panelu jako propozycja. Gość zobaczy dopiero opis przyjęty lub napisany w naszym panelu, więc nie powielamy roboczej treści z POS."],
      ["Nasz panel", "Zatwierdzone opisy, tłumaczenia, zdjęcia i dodatkowe informacje zapisujemy w naszej bazie; nie znikają podczas synchronizacji z POS."],
      ["Nasz panel", "Zdjęcie można pobrać z linku albo wybrać z dysku. Plik z urządzenia jest automatycznie zmniejszany do maksymalnie 1600 px i zapisywany w formacie WebP; serwer przyjmuje najwyżej 2,5 MB."],
      ["Zawsze", "Zapis nowego opisu, parametrów lub źródła nigdy nie usuwa ani nie podmienia wcześniejszego zdjęcia. Aby zmienić obraz, najpierw klikamy „Usuń zdjęcie”, a dopiero potem importujemy nowy."],
      ["Automatycznie", "Dla produktu już opisanego kolejna dostawa nie wstrzymuje sprzedaży i nie zastępuje zatwierdzonej treści."],
      ["Nasz panel", "Przy nowym źródle można wybrać: zachowaj obecne dane, uzupełnij tylko braki albo zastąp dane informacjami z nowego źródła."],
      ["Automatycznie", "Dla win, piw, whisky, brandy, koniaków i pozycji Alko Baru system sprawdza stronę rozpoznanego dostawcy, a produkt z EAN także w bezpłatnym katalogu Open Food Facts. EAN nie jest wymagany."],
      ["Nasz panel", "Jeśli automatyczne źródła nie wystarczą, przycisk otwiera centralne okno wyszukiwania wewnątrz panelu. Wybranie wyniku od razu pobiera pola oraz zdjęcia do akceptacji, bez opuszczania edytowanego produktu."],
      ["Automatycznie", "Na stronie produktu system odczytuje dane strukturalne sklepu, tabele oraz pary etykieta–wartość, np. Kraj—Włochy lub Grona—Montepulciano. Teksty ogólne, stopka oraz polecane produkty nie mogą nadpisywać kraju, regionu, szczepu ani stylu."],
      ["Nasz panel", "Znalezione opisy, parametry, adresy źródeł i zdjęcia są wyłącznie propozycją. Zdjęcie wybieramy tylko dla produktu bez obrazu; istniejące pozostaje chronione podczas akceptowania pozostałych danych."],
      ["Dotykačka", "Przy cieście dostawca decyduje o oznaczeniu pracowni. Dokładne przypisanie „FONTANNA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ” oznacza wypiek Capuccino Cafe; inne ciasta oraz własne wyroby nie otrzymują tego oznaczenia."],
      ["Automatycznie", "Przy wypieku Capuccino Cafe karta pokazuje subtelny logotyp i przycisk „Ciasto z Capuccino Cafe”. Dotknięcie otwiera opis sopockiej pracowni, bez opuszczania menu."],
      ["Automatycznie", "Na początku całej karty „Na słono” pokazujemy Andrzeja Andrzejczaka — Dr Meat — jako autora receptur i opiekuna jakości. Portret oraz rozwijana opowieść dotyczą całej karty, nie pojedynczego dania."],
      ["Automatycznie", "Jeden produkt może mieć historię wielu dostawców. Jako aktualnego traktujemy dostawcę z najnowszego rozpoznanego przyjęcia, zachowując wcześniejsze źródła i ich dane."],
      ["Nasz panel", "Historycznych dostawców uzupełniamy jednorazowo dwoma raportami XLSX z Dotykački: „Lista przyjęć na magazyn” oraz „Przyjęcie magazynowe”. Najpierw sprawdzamy pliki, a dopiero potem zatwierdzamy import."],
      ["Automatycznie", "Po dodaniu lub zmianie polskiej treści system tłumaczy na angielski nazwę i zatwierdzony opis produktu oraz kraj, region, styl i walory smakowe wina. Tłumaczenie wykonuje się raz i zostaje zapisane w naszej bazie."],
      ["Nasz panel", "Automatyczne tłumaczenie jest domyślnie włączone. Można je wyłączyć przy konkretnym produkcie, jeśli chcemy zachować własną wersję angielską."],
    ],
  },
  {
    title: "Zakładki i kolejność",
    lead: "Kategorie pochodzą z POS, ale kolejność dla gościa kontrolujemy tutaj.",
    rules: [
      ["Dotykačka", "Kategorie produktów z tagiem MENU stają się zakładkami cyfrowej karty. Dla produktów oznaczonych wyłącznie PÓŁKA ich kategorie są tylko nagłówkami wewnątrz „Z PÓŁKI”."],
      ["Nasz panel", "Kolejność zakładek można ustawić ręcznie i zmieniać sezonowo bez przebudowy kategorii w POS."],
      ["Automatycznie", "System podpowiada kolejność według pory roku, pory dnia i aktywnych promocji, ale nigdy nie publikuje jej bez akceptacji."],
      ["Nasz panel", "Wewnątrz kategorii można przeciągać produkty, używać strzałek i tworzyć logiczne podgrupy."],
      ["Automatycznie", "W edycji kolejności widoczne są tylko pozycje aktualnie publikowane w menu; produkty ukryte nie wydłużają listy roboczej."],
      ["Automatycznie", "Jeżeli nie zapisano własnego układu, używana jest kolejność z Dotykački oraz logiczne grupowanie, np. wody, napoje gazowane i lemoniady."],
      ["Nasz panel", "Ręcznie zapisana kolejność i nazwy podgrup pozostają po kolejnych synchronizacjach."],
      ["Automatycznie", "W zakładce „Na słono” system proponuje podgrupy Sałaty, Kanapki i Talerzyki; można je ręcznie zmienić w kolejności produktów."],
    ],
  },
  {
    title: "Oferty sezonowe i specjalne",
    lead: "Dodatkowe karty powstają z aktualnej oferty, bez dublowania bazy produktów.",
    rules: [
      ["Dotykačka", "Produkt sezonowy musi spełniać zwykłe warunki publikacji, mieć tag MENU oraz jeden z tagów: LATO, JESIEŃ, ZIMA albo WIOSNA."],
      ["Nasz panel", "W zakładce „Oferty czasowe” wybieramy aktywny sezon. Ustawienie „Brak” wyłącza okno oferty sezonowej."],
      ["Automatycznie", "Oferta sezonowa otwiera się w osobnym oknie, które gość może schować. Przycisk przy lewej krawędzi pozwala otworzyć ją ponownie w dowolnej chwili."],
      ["Automatycznie", "Przy każdej pozycji w ofercie sezonowej pokazujemy mniejszą nazwę jej stałej kategorii."],
      ["Automatycznie", "Oferta sezonu pojawia się tylko wtedy, gdy istnieje co najmniej jeden aktualnie widoczny produkt z właściwym tagiem."],
      ["Dotykačka", "Produkty wydarzeniowe i okazjonalne oznaczamy tagami MENU oraz SPECJAL."],
      ["Nasz panel", "Ofertę specjalną włączamy osobno i nadajemy jej własną nazwę, np. „Wybór naszego artysty”. Nazwa angielska powstaje automatycznie przez DeepL."],
      ["Automatycznie", "Produkt z oferty czasowej nadal pozostaje bez zmian w swojej zwykłej kategorii. Wyłączenie dodatkowej karty nie ukrywa produktu z menu."],
    ],
  },
  {
    title: "Kody PLU",
    lead: "Kody ułatwiają obsłudze szybkie odnalezienie właściwej butelki lub produktu.",
    rules: [
      ["Dotykačka", "Kod katalogowy wpisujemy w PLU jako trzy litery i liczbę bez spacji, np. WIN45, WHI12, GIN7 lub VOD3."],
      ["Automatycznie", "Kody koncesyjne A, B, C i 0 są rozpoznawane osobno i nie są pokazywane gościowi jako kod produktu."],
      ["Nasz panel", "Widoczność kodów w menu włącza się osobno dla wybranych kategorii; dla win jest domyślnie włączona."],
      ["Dotykačka", "Butelka i kieliszek tego samego wina, a także shot i butelka tego samego alkoholu, otrzymują wspólny kod katalogowy."],
      ["Automatycznie", "Jeżeli produkt zawiera kilka pasujących kodów katalogowych, panel pokaże ostrzeżenie do poprawienia PLU w Dotykačce."],
    ],
  },
  {
    title: "Kawa i dodatki",
    lead: "Oferta kawowa pozostaje wygodna dla gościa i aktualna cenowo.",
    rules: [
      ["Dotykačka", "Dodatki do kaw przypisujemy przez połączenia / dodatki produktu. Każdy dodatek jest produktem z własną ceną w Dotykačce."],
      ["Automatycznie", "Sekcja „Dopasuj swoją kawę” pobiera nazwy, dostępność i aktualne ceny dodatków z Dotykački; nie prowadzimy drugiego cennika."],
      ["Dotykačka", "Kawę sprzedawaną w ziarnach oznaczamy dwoma tagami: MENU oraz ZIARNO."],
      ["Automatycznie", "Produkty z tagiem ZIARNO trafiają na koniec zakładki Kawy do sekcji „Zabierz naszą kawę do domu”."],
      ["Dotykačka", "Chemex, AeroPress i Drip należą do podgrupy „Kawy alternatywne”. Dostępne ziarna przypisujemy do tych produktów jako dodatki z grupy „ZIARNA DO KAW ALTERNATYWNYCH”."],
      ["Automatycznie", "Wybór metody i ziarna jest pokazany raz dla całej podgrupy kaw alternatywnych. Menu sugeruje najpierw metodę, ale oba wybory są aktywne od początku. Nazwy, profile smakowe, opisy i tłumaczenia są pobierane oraz aktualizowane systemowo."],
      ["Automatycznie", "Karty AeroPressu, Chemexa i Dripa mają własne ilustracje i podglądy metod. Przy brakującym zdjęciu ziarna pokazujemy neutralną ikonę niebieskiego kubka, bez osobnej reklamy producenta."],
      ["Automatycznie", "W strefie kelnera dotknięcie „+” przy produkcie mającym dodatki otwiera wybór wariantu dla jednej właśnie dodawanej sztuki. Produkty bez dodatków trafiają do zamówienia od razu."],
      ["Automatycznie", "Przy jednej kawie można połączyć dowolną liczbę modyfikacji z grupy „DODATKI DO KAWY”, na przykład inne mleko i dodatkowe espresso."],
      ["Automatycznie", "Dostępne smaki syropów Leśne Życie są pobierane z aktualnego stanu magazynowego i pokazywane przy kawie, matchy, herbacie oraz lemoniadzie."],
      ["Zawsze", "Przy kawie, matchy i herbacie smak korzysta z ceny dodatku „Syrop smakowy”. Przy lemoniadzie można połączyć maksymalnie dwa smaki, a ich koszt jest już zawarty w cenie lemoniady. Produkt Leśne Życie z tagiem PÓŁKA pozostaje osobną pełną butelką z własną ceną."],
      ["Nasz panel", "Syrop Leśne Życie może mieć osobne tło podglądu. Miniatura pozostaje zdjęciem butelki, a fotografia głównego składnika wypełnia prawą połowę podglądu i nie zastępuje butelki."],
      ["Automatycznie", "Każda konfiguracja jest osobną linią zamówienia. Dwie latte mogą więc wystąpić oddzielnie: jedna standardowa, a druga np. ze zmianą mleka na kokosowe."],
      ["Automatycznie", "Cena dodatku jest doliczana do ceny jednej skonfigurowanej pozycji. Nazwa wariantu oraz jego cena pochodzą z aktualnych połączeń produktów w Dotykačce."],
      ["Zawsze", "W strefie kelnera przy kawie alternatywnej wybór dokładnie jednego ziarna jest obowiązkowy. Gość może oglądać metodę i ziarno w dowolnej kolejności, ponieważ zamówienie przekazuje obsłudze."],
    ],
  },
  {
    title: "Wina i alkohole",
    lead: "Jedna czytelna karta trunku może łączyć kilka sposobów sprzedaży.",
    rules: [
      ["Dotykačka", "Butelkę i kieliszek tworzymy jako osobne produkty z osobnymi cenami; cena butelki nie wynika z iloczynu kieliszków ani shotów."],
      ["Dotykačka", "Produkt butelkowy nazywamy samą nazwą wina. Tylko przy drugim produkcie dopisujemy „— na kieliszki”, aby obsługa rozpoznawała go w POS."],
      ["Dotykačka", "Produkt kieliszkowy musi mieć dopisek „— na kieliszki”, tag KIELISZEK i ten sam kod WIN co właściwa butelka; oba produkty łączymy także recepturą."],
      ["Automatycznie", "Produkty z tym samym kodem WIN są łączone w menu w jedną kartę. Nazwa i opis pochodzą z butelki, a poprawnie oznaczony produkt kieliszkowy dodaje wyłącznie ikonę i osobną cenę."],
      ["Automatycznie", "Aktywny, poprawnie powiązany wariant kieliszkowy oznacza wino otwarte teraz: karta pokazuje cenę kieliszka i butelki oraz umieszcza je w sekcji „Dzisiaj na kieliszki”."],
      ["Automatycznie", "Jeśli wariant kieliszkowy istnieje, ale jest wyłączony, wino pozostaje w rotacji. Gość widzi zwykłe „Butelka” — bez obietnicy otwarcia na życzenie. O otwarciu kolejnego wina decyduje wyłącznie obsługa, zależnie od liczby już otwartych butelek."],
      ["Automatycznie", "Dopiero całkowity brak wariantu kieliszkowego oznacza wino, którego nigdy nie sprzedajemy na kieliszki. Tylko wtedy karta wyświetla „Tylko butelka”."],
      ["Automatycznie", "Dotknięcie wina otwiera na środku ekranu jego pełny opis, pochodzenie, szczep, styl, aromaty oraz ceny kieliszka i butelki."],
      ["Automatycznie", "Podgląd wina powtarza aktualne oznaczenia wynikające z reguł: „Wybór naszych gości”, „Polecamy”, „Na kieliszki”, „Wegańskie” i „0%”."],
      ["Automatycznie", "Pozycja z „kieliszek” lub „na kieliszki” w nazwie jest zawsze ukrywana jako samodzielny produkt. Pojawi się przy butelce po uzupełnieniu wspólnego kodu WINxxx i tagu KIELISZEK; EAN jest pomocny, ale opcjonalny."],
      ["Nasz panel", "Przy winie przechowujemy: krótki opis, kraj, region, szczep, kolor, poziom słodyczy, styl, aromaty i potwierdzenie wegańskości."],
      ["Nasz panel", "Kolor wina i musowanie są niezależnymi cechami. Kolor wybieramy jako biały, czerwony, różowy albo pomarańczowy, natomiast musowanie osobno jako spokojne, musujące lub naturalnie musujące."],
      ["Automatycznie", "Po rozdzieleniu cech system przeniósł wcześniejsze oznaczenia „musujące” z nazwy, stylu i cech źródłowych do osobnego pola, nie zmieniając prawidłowo wpisanych kolorów."],
      ["Automatycznie", "Filtr „Podanie” dotyczy wyłącznie kieliszka albo butelki. „Wegańskie” i „0%” są osobnymi, łączącymi się cechami, dlatego można wyszukać np. wino 0% na kieliszki."],
      ["Automatycznie", "Filtr pokazuje tylko dostępne możliwości. Kraj, którego nie ma w aktualnej ofercie, nie pojawia się na liście."],
      ["Automatycznie", "„Wybór naszych gości” otrzymują trzy najlepiej sprzedające się dostępne wina z ostatnich 30 dni. Raport jest sumowany z odcinków dobowych i odświeżany najwyżej co 6 godzin; dostępność przelicza się przy każdej synchronizacji."],
      ["Nasz panel", "Wegańskość oznaczamy jako potwierdzoną wyłącznie na podstawie producenta lub wiarygodnego źródła."],
      ["Automatycznie", "Pojemności butelki nie publikujemy w menu ani w podglądzie szczegółów. Kod WIN wyświetlamy osobno od nazwy."],
      ["Dotykačka", "W kategorii WHISKEY pozycja bez tagu BUTELKA oznacza porcję 50 ml. Dopiero osobny produkt z tagiem BUTELKA może reprezentować sprzedaż całej butelki i mieć własną cenę."],
      ["Automatycznie", "Przy porcji whisky, bourbonu, koniaku lub brandy menu pokazuje ikonę szklanki do whisky i napis „50 ml”, bez dodatkowego słowa „szklaneczka”. Nazwa samej kategorii nadal pochodzi z Dotykački."],
      ["Nasz panel", "Przy pozycji Alko Baru zapisujemy rodzaj, alkohol bazowy, profil smaku, sposób podania, moc, pochodzenie i objętość. Wyszukiwarka potrafi zaproponować te pola oraz zdjęcia na podstawie strony produktu."],
      ["Automatycznie", "W menu gościa i kelnera Alko Bar ma te same filtry: Rodzaj, Baza, Profil smaku, Podanie oraz Alkoholowe/0%. Brakujące wartości mogą być wnioskowane z nazwy, opisu i podgrupy, ale ręczny zapis ma pierwszeństwo."],
    ],
  },
  {
    title: "Alergeny, kawa i herbata",
    lead: "Informacje dodatkowe pojawiają się tylko wtedy, gdy są potrzebne.",
    rules: [
      ["Dotykačka", "Alergeny uzupełniamy przy produkcie w POS. Przycisk z alergenami pojawia się tylko wtedy, gdy produkt ma co najmniej jeden alergen."],
      ["Dotykačka", "Dodatki do kawy — inne mleko, dodatkowe espresso i pozostałe modyfikacje — mają własne ceny i dostępność w POS."],
      ["Nasz panel", "Przy herbatach uzupełniamy opis, rodzaj, temperaturę wody oraz rekomendowany czas parzenia."],
      ["Zawsze", "Informacja w menu nie zastępuje rozmowy z obsługą w przypadku silnej alergii."],
    ],
  },
  {
    title: "Strefa kelnera i zamówienia",
    lead: "Współdzielony tablet pozostaje menu gościa, a obsługa otrzymuje krótką i bezpieczną sesję roboczą.",
    rules: [
      ["Zawsze", "Trzy szybkie dotknięcia logotypu w lewym górnym rogu otwierają ekran PIN-u. Nie pokazujemy gościom osobnego przycisku ani podpowiedzi prowadzącej do strefy kelnera."],
      ["Dotykačka", "Lista pracowników pochodzi wyłącznie z Dotykački. W panelu „Pracownicy” pokazujemy tylko osoby aktywne i nieusunięte; wyłączenie pracownika w POS odbiera mu dostęp po synchronizacji."],
      ["Nasz panel", "Administrator nadaje pracownikowi indywidualny PIN w ekranie „Pracownicy”. Nasza baza nie przechowuje PIN-u — zapisuje wyłącznie jego nieodwracalny, losowo solony skrót scrypt."],
      ["Automatycznie", "Po pięciu błędnych próbach logowania urządzenie jest czasowo blokowane. Sesja kelnera jest krótka, podpisana i dostępna tylko dla aktywnego pracownika."],
      ["Dotykačka", "Nazwy i identyfikatory stolików są synchronizowane z Dotykački. Kelner wybiera stolik i liczbę gości przed sprawdzeniem zamówienia."],
      ["Automatycznie", "Katalog kelnera stosuje te same reguły dostępności co menu gościa. Produkt z tagiem PÓŁKA można dodać tylko przy stanie większym od zera; pusty, zerowy lub ujemny stan ukrywa go w obu widokach."],
      ["Dotykačka", "Osobny widok „Poza menu” zawiera aktywne, nieusunięte produkty oznaczone w Dotykačce jako wyświetlane, które nie mają tagu MENU ani PÓŁKA. Kelner może je zamówić, ale nigdy nie trafiają one do karty gościa ani panelu redakcyjnego produktów menu."],
      ["Nasz panel", "W obrębie zwykłej kategorii kelner może podejrzeć ukryte produkty z tagiem MENU. Ukrywanie i ponowne ujawnianie jest dostępne wyłącznie pracownikom, którym administrator nadał imienne uprawnienie; domyślnie jest ono wyłączone."],
      ["Automatycznie", "Każda zmiana widoczności wykonana przez pracownika wymaga wybrania przyczyny i trafia do „Historii widoczności” z nazwą pracownika, produktem oraz czasem. Ręczne ukrycie administratora ma pierwszeństwo i nie może zostać cofnięte w strefie kelnera."],
      ["Automatycznie", "Każdy produkt ma sterowanie ilością. Przed wysłaniem można zmienić ilości, usunąć pozycje, dopisać uwagę do konkretnej konfiguracji oraz uwagę do całego zamówienia."],
      ["Dotykačka", "Tagi WARM/CIEPŁO i COLD/ZIMNO albo wspólny tag WARM COLD określają dostępność wersji ciepłej i zimnej także dla produktów w kategoriach ALKOHOLE i DRINKI. Jeżeli produkt ma oba warianty, kelner obowiązkowo wskazuje sposób przygotowania dla dodawanej sztuki."],
      ["Dotykačka", "Tag TOGO udostępnia kelnerowi opcję „Zapakuj na wynos”. Domyślnie produkt pozostaje zamówieniem na miejscu, a w menu gościa nie pokazujemy ikony na wynos."],
      ["Automatycznie", "Filtry win, whisky i Alko Baru działają w strefie kelnera według tych samych cech co w menu gościa."],
      ["Automatycznie", "Przy pełnej butelce piwa, wina, whisky lub wódki zamawianej między 21:58 a 06:02 system pokazuje ostrzeżenie o zakazie sprzedaży na wynos. Reguła nie dotyczy produktów 0% ani porcji."],
      ["Nasz panel", "Pytania ankiety definiujemy, porządkujemy, włączamy i wyłączamy w ekranie „Pracownicy”. Dostępne są pytania Tak/Nie oraz wybór jednej z własnych odpowiedzi; pytanie może być obowiązkowe."],
      ["Automatycznie", "Jeżeli ankieta ma aktywne pytania, pojawia się jako ostatni krok po podsumowaniu koszyka. Odpowiedzi są zapisywane ze szkicem zamówienia bez danych osobowych gościa."],
      ["Zawsze", "Wysłanie z tabletu ma utworzyć lub uzupełnić otwarte zamówienie w Dotykačce i wydrukować właściwe bony zgodnie z konfiguracją POS. Nie może wykonywać płatności, zamykać rachunku ani wystawiać paragonu fiskalnego."],
      ["Zawsze", "Paragon fiskalny powstaje dopiero podczas zatwierdzenia i zamknięcia zamówienia w głównym POS. Po poprawnym wysłaniu zamówienia sesja kelnera zostanie zakończona, a tablet wróci do menu gościa."],
      ["Nasz panel", "Przycisk „Rozliczenie” w strefie pracownika otwiera protokół kasy dla dnia, zmiany i wskazanej kasy. Pracownik przepisuje raport gotówki i kart z Dotykački oraz kwotę z odrębnego raportu terminala."],
      ["Automatycznie", "Rozliczenie uwzględnia korekty karta–gotówka, napiwki pozostawione w firmie, wydatki z kasy, gotówkę pozostawioną na kolejny dzień i środki w numerowanej kopercie. Każda różnica wymaga wyjaśnienia, a policzona gotówka musi w całości zostać rozdzielona pomiędzy kasę i kopertę."],
      ["Nasz panel", "Napiwek można podzielić pomiędzy dowolnych aktywnych pracowników z Dotykački. Panel „Rozliczenia” pokazuje kwoty do wypłaty per osoba, zawartość kopert, wydatki i różnice oraz pozwala zatwierdzić protokół lub skierować go do korekty."],
      ["Zawsze", "Zatwierdzenie rozliczenia i oznaczenie napiwków jako wypłaconych pozostawia wpis w historii. Moduł jest protokołem operacyjnym i nie zmienia zamkniętych paragonów ani sposobów płatności w POS."],
      ["Zawsze", "Wysyłanie do POS jest obecnie technicznie zablokowane do czasu zakończenia testów integracyjnych. Można bezpiecznie sprawdzać logowanie, wybór produktów, warianty, podsumowanie i ankietę."],
    ],
  },
  {
    title: "Wydarzenia i obsługa systemu",
    lead: "Menu promuje również miejsce, nie tylko produkty.",
    rules: [
      ["Strona WWW", "Zakładka pokazuje automatycznie wyłącznie nadchodzące wydarzenia z kalendarza martabanaszek.pl. Po dotknięciu wydarzenia otwiera opis i bilet informacyjny bez sprzedaży online."],
      ["Automatycznie", "Lista wydarzeń, opisy i ich wersje angielskie odświeżają się bez obsługi tabletu. Komunikat „Zamów bilet do stolika” kieruje gościa do obsługi."],
      ["Automatycznie", "Synchronizacja z Dotykačką wykonuje się co 2 minuty; dodatkowo można ją wymusić przyciskiem w panelu."],
      ["Zawsze", "Najpierw zmieniamy dane sprzedażowe w Dotykačce, a dopiero potem uzupełniamy warstwę prezentacyjną w naszym panelu."],
      ["Zawsze", "Nie prowadzimy drugiej ręcznej bazy cen ani stanów magazynowych."],
    ],
  },
] as const;

const recognizedMenuTags = [
  {
    tag: "MENU",
    aliases: "—",
    area: "Publikacja podstawowa",
    effect: "Dopuszcza produkt do cyfrowej karty, jeżeli spełnia również warunki widoczności, aktywności i dostępności.",
    condition: "Wymagany dla zwykłych produktów. Nie dodajemy go do produktów publikowanych wyłącznie przez PÓŁKA.",
    kind: "core",
  },
  {
    tag: "PROMO",
    aliases: "—",
    area: "Polecane",
    effect: "Wyróżnia produkt na stronie powitalnej i przesuwa go na początek jego zwykłej kategorii.",
    condition: "Działa tylko razem z tagiem MENU; nie zastępuje go.",
    kind: "offer",
  },
  {
    tag: "LATO",
    aliases: "—",
    area: "Oferta sezonowa",
    effect: "Dodaje produkt do wysuwanego okna oferty letniej po wybraniu sezonu Lato w panelu.",
    condition: "Wymaga tagu MENU i zwykłej widoczności produktu.",
    kind: "season",
  },
  {
    tag: "JESIEŃ",
    aliases: "—",
    area: "Oferta sezonowa",
    effect: "Dodaje produkt do wysuwanego okna oferty jesiennej po wybraniu sezonu Jesień w panelu.",
    condition: "Wymaga tagu MENU i zwykłej widoczności produktu.",
    kind: "season",
  },
  {
    tag: "ZIMA",
    aliases: "—",
    area: "Oferta sezonowa",
    effect: "Dodaje produkt do wysuwanego okna oferty zimowej po wybraniu sezonu Zima w panelu.",
    condition: "Wymaga tagu MENU i zwykłej widoczności produktu.",
    kind: "season",
  },
  {
    tag: "WIOSNA",
    aliases: "—",
    area: "Oferta sezonowa",
    effect: "Dodaje produkt do wysuwanego okna oferty wiosennej po wybraniu sezonu Wiosna w panelu.",
    condition: "Wymaga tagu MENU i zwykłej widoczności produktu.",
    kind: "season",
  },
  {
    tag: "SPECJAL",
    aliases: "—",
    area: "Oferta specjalna",
    effect: "Dodaje produkt do osobnej, nazwanej w panelu oferty, np. „Wybór naszego artysty”.",
    condition: "Wymaga tagu MENU oraz włączenia oferty specjalnej w panelu.",
    kind: "offer",
  },
  {
    tag: "KIELISZEK",
    aliases: "NA KIELISZKI, BY-GLASS",
    area: "Wina na kieliszki",
    effect: "Oznacza wariant kieliszkowy, którego cena i oznaczenie są dołączane do publicznej karty właściwej butelki.",
    condition: "Wymaga MENU, słowa „kieliszek” w nazwie i wspólnego kodu WINxxx z widoczną butelką.",
    kind: "wine",
  },
  {
    tag: "BUTELKA",
    aliases: "—",
    area: "Alkohole w całej butelce",
    effect: "Oznacza osobny produkt sprzedawany jako cała butelka w kategorii WHISKEY; bez tego tagu pozycja jest traktowana jako porcja 50 ml.",
    condition: "Butelka musi być osobnym produktem z własną ceną w Dotykačce. Obecnie nie jest oferowana, dopóki taki produkt nie zostanie świadomie dodany.",
    kind: "wine",
  },
  {
    tag: "ZIARNO",
    aliases: "—",
    area: "Kawa ziarnista",
    effect: "Przenosi paczkowaną kawę do sekcji „Zabierz naszą kawę do domu” na końcu zakładki Kawy.",
    condition: "Działa tylko razem z tagiem MENU.",
    kind: "coffee",
  },
  {
    tag: "WARM",
    aliases: "CIEPŁO · WARM COLD · CIEPŁO ZIMNO",
    area: "Temperatura podania",
    effect: "Oznacza, że produkt można zamówić na ciepło. Jeżeli produkt ma także COLD, kelner musi wskazać temperaturę przed dodaniem pozycji.",
    condition: "Działa razem z tagiem MENU. Jako jedyny tag temperatury ustawia wariant ciepły automatycznie.",
    kind: "offer",
  },
  {
    tag: "COLD",
    aliases: "ZIMNO · WARM COLD · CIEPŁO ZIMNO",
    area: "Temperatura podania",
    effect: "Oznacza, że produkt można zamówić na zimno. Jeżeli produkt ma także WARM, kelner musi wskazać temperaturę przed dodaniem pozycji.",
    condition: "Działa razem z tagiem MENU. Jako jedyny tag temperatury ustawia wariant zimny automatycznie.",
    kind: "offer",
  },
  {
    tag: "TOGO",
    aliases: "—",
    area: "Pakowanie na wynos",
    effect: "Dodaje w menu kelnera tekstową opcję „Zapakuj na wynos”. Zwykłe dodanie produktu nadal oznacza zamówienie na miejscu.",
    condition: "Działa razem z tagiem MENU. Nie dodaje żadnego oznaczenia ani ikony w menu gościa i nie wymusza dodatkowego pytania.",
    kind: "offer",
  },
  {
    tag: "INWENT",
    aliases: "—",
    area: "Inwentaryzacja składników",
    effect: "Automatycznie obejmuje produkt z kategorii „Składniki” inwentaryzacją w naszym systemie.",
    condition: "Działa wyłącznie w kategorii „Składniki”. Usunięcie tagu wyłącza produkt z kolejnych zleceń po synchronizacji.",
    kind: "inventory",
  },
  {
    tag: "PÓŁKA",
    aliases: "POLKA",
    area: "Z półki",
    effect: "Dodaje produkt do zakładki „Z PÓŁKI” i grupuje go tam według jego kategorii z Dotykački.",
    condition: "Może działać samodzielnie bez MENU. Z tagiem MENU produkt pozostaje także we wszystkich zwykłych sekcjach wynikających z pozostałych tagów; przy zerowym stanie jego kopia w „Z PÓŁKI” znika.",
    kind: "offer",
  },
] as const;

function visible(product: Product) {
  if (!product.menuTagged || product.deleted) return false;
  const regularStockVisible = !(product.stockDeduct && product.stockOverdraft === "DISABLE" && Number(product.stockQuantity ?? 0) <= 0);
  return (hasTag(product.tags, "MENU") && regularStockVisible && menuProductVisibleForGuest(product.display, product.manualHidden, product.waiterVisibilityOverride))
    || (isShelfProduct(product.tags) && product.display && !product.manualHidden && shelfHasPositiveStock(product.stockQuantity));
}

function visibilityLabel(product: Product) {
  const regularStockVisible = !(product.stockDeduct && product.stockOverdraft === "DISABLE" && Number(product.stockQuantity ?? 0) <= 0);
  const regular = hasTag(product.tags, "MENU") && regularStockVisible && menuProductVisibleForGuest(product.display, product.manualHidden, product.waiterVisibilityOverride);
  const shelf = isShelfProduct(product.tags) && product.display && !product.manualHidden && shelfHasPositiveStock(product.stockQuantity);
  if (regular && shelf) return "Widoczny w menu i Z PÓŁKI";
  if (shelf) return "Widoczny w Z PÓŁKI";
  if (regular) return "Widoczny w menu";
  return "Ukryty w menu";
}

function normalizedProductSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLocaleLowerCase("pl")
    .replace(/\s+/g, " ")
    .trim();
}

function formatVisibilityDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const ADMIN_TIME_ZONE = "Europe/Warsaw";

function AdminWelcomeDateTime() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const refresh = () => setNow(new Date());
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!now) return <div className="admin-welcome-datetime" aria-label="Aktualna data i godzina"><time className="admin-welcome-calendar"><span>Dzisiaj</span><strong>—</strong><small>ustalam datę</small></time><time className="admin-welcome-clock"><span>Aktualna godzina</span><strong>--:--</strong><small>Warszawa</small></time></div>;

  const dateParts = new Intl.DateTimeFormat("pl-PL", { timeZone: ADMIN_TIME_ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" }).formatToParts(now);
  const datePart = (type: "weekday" | "day" | "month" | "year") => dateParts.find((item) => item.type === type)?.value ?? "";
  const machineDate = new Intl.DateTimeFormat("sv-SE", { timeZone: ADMIN_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const currentTime = new Intl.DateTimeFormat("pl-PL", { timeZone: ADMIN_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);

  return <div className="admin-welcome-datetime" aria-label="Aktualna data i godzina">
    <time className="admin-welcome-calendar" dateTime={machineDate}><span>{datePart("weekday")}</span><strong>{datePart("day")}</strong><small>{datePart("month")} {datePart("year")}</small></time>
    <time className="admin-welcome-clock" dateTime={now.toISOString()}><span>Aktualna godzina</span><strong>{currentTime}</strong><small>Warszawa</small></time>
  </div>;
}

function productListStatus(product: Product): { kind: ProductStatusKind; className: string; label: string } {
  if (product.manualHidden) return { kind: "menu-hidden", className: "admin-dot is-menu-hidden", label: "Ukryty ręcznie tylko w naszym cyfrowym menu" };
  if (product.waiterVisibilityOverride === false) return { kind: "menu-hidden", className: "admin-dot is-menu-hidden", label: "Ukryty przez uprawnionego pracownika — szczegóły w Historii widoczności" };
  if (!visible(product)) return { kind: "dotykacka-hidden", className: "admin-dot", label: "Ukryty w menu: brak tagu MENU/PÓŁKA, ustawienia Dotykački lub brak stanu" };
  if (!product.contentApproved) return { kind: "needs-review", className: "admin-dot needs-review", label: `${visibilityLabel(product)}, ale wymaga ręcznego przeglądu i zatwierdzenia treści` };
  return { kind: "approved", className: "admin-dot is-visible", label: `${visibilityLabel(product)} — zatwierdzony` };
}

export default function AdminPanel({ administratorName }: { administratorName: string }) {
  const greetingName = administratorName.trim().split(/\s+/)[0] || "Administratorze";
  const [view, setView] = useState<AdminView>("home");
  const [products, setProducts] = useState<Product[]>([]);
  const [drinkVessels, setDrinkVessels] = useState<DrinkVessel[]>([]);
  const [wineSources, setWineSources] = useState<WineSource[]>([]);
  const [menuCategoryRows, setMenuCategoryRows] = useState<MenuCategory[]>([]);
  const [shelfGroupRows, setShelfGroupRows] = useState<ShelfGroupRow[]>([]);
  const [suggestion, setSuggestion] = useState<OrderSuggestion | null>(null);
  const [orderCategoryId, setOrderCategoryId] = useState<number | null>(null);
  const [productOrderRows, setProductOrderRows] = useState<ProductOrderRow[]>([]);
  const [productGroupOrderRows, setProductGroupOrderRows] = useState<ProductGroupOrderRow[]>([]);
  const [draggedProductGroupName, setDraggedProductGroupName] = useState<string | undefined>();
  const [draggedShelfGroupId, setDraggedShelfGroupId] = useState<number | null>(null);
  const [promotionRows, setPromotionRows] = useState<PromotionRow[]>([]);
  const [visibilityEvents, setVisibilityEvents] = useState<VisibilityEvent[]>([]);
  const [offerSettings, setOfferSettings] = useState<OfferSettings | null>(null);
  const [draggedProductId, setDraggedProductId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("");
  const [productStatusFilter, setProductStatusFilter] = useState<ProductStatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dotykackaStatus, setDotykackaStatus] = useState<DotykackaStatus | null>(null);
  const [dashboardPreferences, setDashboardPreferences] = useState<AdminDashboardTilePreference[]>(() => DEFAULT_ADMIN_DASHBOARD_PREFERENCES.map((item) => ({ ...item })));
  const [dashboardDraft, setDashboardDraft] = useState<AdminDashboardTilePreference[]>(() => DEFAULT_ADMIN_DASHBOARD_PREFERENCES.map((item) => ({ ...item })));
  const [dashboardEditing, setDashboardEditing] = useState(false);
  const [dashboardSaving, setDashboardSaving] = useState(false);
  const [dashboardSelectedTile, setDashboardSelectedTile] = useState<AdminDashboardTileId>("products");
  const [dashboardError, setDashboardError] = useState("");

  async function loadProducts(preferredId?: number) {
    setLoading(true);
    setError("");
    const response = await fetch("/api/admin/products", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { products?: Product[]; error?: string };
    if (!response.ok) {
      setError(body.error ?? "Nie udało się pobrać produktów.");
      setLoading(false);
      return;
    }
    const rows = body.products ?? [];
    setProducts(rows);
    setSelectedId((current) => preferredId ?? current ?? null);
    setLoading(false);
  }

  async function loadDrinkVessels() {
    const response = await fetch("/api/admin/drink-vessels", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { vessels?: DrinkVessel[]; error?: string };
    if (!response.ok) {
      setError(body.error ?? "Nie udało się pobrać katalogu naczyń.");
      return;
    }
    setDrinkVessels(body.vessels ?? []);
  }

  async function loadCategories() {
    setError("");
    const response = await fetch("/api/admin/categories", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { categories?: MenuCategory[]; shelfGroups?: ShelfGroupRow[]; suggestion?: OrderSuggestion; error?: string };
    if (!response.ok) return setError(body.error ?? "Nie udało się pobrać kategorii.");
    setMenuCategoryRows(body.categories ?? []);
    setShelfGroupRows(body.shelfGroups ?? []);
    setSuggestion(body.suggestion ?? null);
    setOrderCategoryId((current) => current ?? body.categories?.[0]?.id ?? null);
  }

  async function loadProductOrder(categoryId: number) {
    setError("");
    const response = await fetch(`/api/admin/product-order?categoryId=${categoryId}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { products?: ProductOrderRow[]; groups?: ProductGroupOrderRow[]; error?: string };
    if (!response.ok) return setError(body.error ?? "Nie udało się pobrać kolejności produktów.");
    setProductOrderRows(body.products ?? []);
    setProductGroupOrderRows(body.groups ?? []);
  }

  async function loadPromotions() {
    setError("");
    const response = await fetch("/api/admin/promotions", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { products?: PromotionRow[]; error?: string };
    if (!response.ok) return setError(body.error ?? "Nie udało się pobrać polecanych produktów.");
    setPromotionRows(body.products ?? []);
  }

  async function loadOffers() {
    setError("");
    const response = await fetch("/api/admin/offers", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as OfferSettings & { error?: string };
    if (!response.ok) return setError(body.error ?? "Nie udało się pobrać ustawień ofert.");
    setOfferSettings(body);
  }

  async function loadVisibilityEvents() {
    setError("");
    const response = await fetch("/api/admin/menu-visibility", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { events?: VisibilityEvent[]; error?: string };
    if (!response.ok) return setError(body.error ?? "Nie udało się pobrać historii widoczności.");
    setVisibilityEvents(body.events ?? []);
  }

  async function resetVisibilityOverride(productId: number) {
    setSaving(true); setError(""); setMessage("");
    const response = await fetch("/api/admin/menu-visibility", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się przywrócić ustawienia z Dotykački.");
    else {
      setMessage("Usunięto wyjątek pracownika. Widoczność produktu znów wynika z Dotykački i ustawień administratora.");
      await Promise.all([loadProducts(productId), loadVisibilityEvents()]);
    }
    setSaving(false);
  }

  async function loadDotykackaStatus() {
    setError("");
    const response = await fetch("/api/admin/dotykacka/status", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as DotykackaStatus & { error?: string };
    if (!response.ok) return setError(body.error ?? "Nie udało się sprawdzić połączenia.");
    setDotykackaStatus(body);
  }

  async function loadDashboardPreferences() {
    const response = await fetch("/api/admin/dashboard-preferences", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setDashboardError("Nie udało się pobrać osobistego układu. Pokazuję układ domyślny.");
      return;
    }
    const body = await response.json().catch(() => ({})) as { tiles?: unknown };
    const next = normalizedDashboardPreferences(body.tiles);
    setDashboardPreferences(next);
    setDashboardDraft(next.map((item) => ({ ...item })));
  }

  // Initial data hydration; subsequent refreshes keep the current selection.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void Promise.all([loadProducts(), loadDrinkVessels(), loadDashboardPreferences()]); }, []);

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("dotykacka");
    if (!result) return;
    window.history.replaceState({}, "", "/admin");
    queueMicrotask(() => {
      setView("connection");
      setMessage(result === "connected" ? "Połączenie z Dotykačką zostało zapisane. Wybierz magazyn i oddział." : "Nie udało się zakończyć połączenia z Dotykačką. Spróbuj ponownie.");
    });
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (view === "categories" || view === "productOrder") void loadCategories(); }, [view]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (view === "connection") void loadDotykackaStatus(); }, [view]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (view === "productOrder" && orderCategoryId) void loadProductOrder(orderCategoryId); }, [view, orderCategoryId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (view === "promotions") void loadPromotions(); }, [view]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (view === "offers") void loadOffers(); }, [view]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (view === "visibilityHistory") void loadVisibilityEvents(); }, [view]);

  const effectiveDashboardPreferences = dashboardEditing ? dashboardDraft : dashboardPreferences;
  const visibleDashboardTiles = effectiveDashboardPreferences.flatMap((preference) => {
    const tile = ADMIN_DASHBOARD_TILES.find((item) => item.id === preference.id);
    return tile && preference.visible ? [{ ...tile, ...preference }] : [];
  });
  const selectedDashboardPreference = dashboardDraft.find((item) => item.id === dashboardSelectedTile) ?? dashboardDraft[0];

  function openDashboardEditor() {
    setDashboardDraft(dashboardPreferences.map((item) => ({ ...item })));
    setDashboardSelectedTile(dashboardPreferences.find((item) => item.visible)?.id ?? dashboardPreferences[0].id);
    setDashboardError("");
    setDashboardEditing(true);
  }

  function toggleDashboardTile(id: AdminDashboardTileId) {
    setDashboardDraft((current) => {
      const selected = current.find((item) => item.id === id);
      if (selected?.visible && current.filter((item) => item.visible).length === 1) {
        setDashboardError("Na pulpicie musi pozostać co najmniej jeden widoczny kafel.");
        return current;
      }
      setDashboardError("");
      return current.map((item) => item.id === id ? { ...item, visible: !item.visible } : item);
    });
    setDashboardSelectedTile(id);
  }

  function moveDashboardTile(id: AdminDashboardTileId, direction: -1 | 1) {
    setDashboardDraft((current) => {
      const index = current.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = current.map((item) => ({ ...item }));
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function setDashboardTileBackground(background: string) {
    setDashboardDraft((current) => current.map((item) => item.id === dashboardSelectedTile ? { ...item, background } : item));
  }

  function setDashboardTileForeground(foreground: string) {
    setDashboardDraft((current) => current.map((item) => item.id === dashboardSelectedTile ? { ...item, foreground } : item));
  }

  async function saveDashboardPreferences() {
    setDashboardSaving(true); setDashboardError("");
    const response = await fetch("/api/admin/dashboard-preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ tiles: dashboardDraft }) }).catch(() => null);
    const body = await response?.json().catch(() => ({})) as { tiles?: unknown; error?: string } | undefined;
    if (!response?.ok) {
      setDashboardError(body?.error ?? "Nie udało się zapisać układu pulpitu.");
      setDashboardSaving(false);
      return;
    }
    const saved = normalizedDashboardPreferences(body?.tiles);
    setDashboardPreferences(saved);
    setDashboardDraft(saved.map((item) => ({ ...item })));
    setDashboardEditing(false);
    setMessage("Osobisty układ pulpitu został zapisany.");
    setDashboardSaving(false);
  }

  function activateDashboardTile(id: AdminDashboardTileId) {
    if (dashboardEditing) { setDashboardSelectedTile(id); return; }
    const tile = ADMIN_DASHBOARD_TILES.find((item) => item.id === id);
    if (tile?.href) window.location.assign(tile.href);
    else if (tile?.view) setView(tile.view);
  }

  const categories = useMemo(() => ["Wszystkie", ...Array.from(new Set(products.map((product) => product.category ?? "Bez kategorii")))], [products]);
  const productsMatchingMainFilters = useMemo(() => {
    const phrase = normalizedProductSearch(query);
    return products.filter((product) =>
      (!category || category === "Wszystkie" || (product.category ?? "Bez kategorii") === category)
      && (!visibilityFilter || visibilityFilter === "all" || (visibilityFilter === "visible" ? visible(product) : !visible(product)))
      && (!phrase || normalizedProductSearch(`${product.name} ${product.nameEn ?? ""} ${product.category ?? ""} ${product.tags.join(" ")}`).includes(phrase))
    );
  }, [products, query, category, visibilityFilter]);
  const productSearchReady = normalizedProductSearch(query).length >= 2 || Boolean(category) || Boolean(visibilityFilter) || productStatusFilter !== "all";
  const productStatusCounts = useMemo(() => {
    const counts: Record<ProductStatusKind, number> = { approved: 0, "needs-review": 0, "dotykacka-hidden": 0, "menu-hidden": 0 };
    productsMatchingMainFilters.forEach((product) => { counts[productListStatus(product).kind] += 1; });
    return counts;
  }, [productsMatchingMainFilters]);
  const filtered = useMemo(() => !productSearchReady ? [] : productStatusFilter === "all"
    ? productsMatchingMainFilters
    : productsMatchingMainFilters.filter((product) => productListStatus(product).kind === productStatusFilter),
  [productSearchReady, productsMatchingMainFilters, productStatusFilter]);
  const selected = products.find((product) => product.id === selectedId) ?? null;
  const auditIssues = useMemo(() => products.filter(visible).flatMap((product) => {
    const issues: AuditIssue[] = [];
    const categoryName = product.category ?? "Bez kategorii";
    const kind = sectionFor(product.category);
    const add = (issueKind: AuditIssue["kind"], message: string) => issues.push({ productId: product.id, name: product.name, category: categoryName, kind: issueKind, message });
    if (!product.imagePath && !product.imageSourceUrl) add("image", "Brak zdjęcia produktu");
    if (!product.descriptionPl?.trim()) add("description", "Brak zatwierdzonego opisu polskiego");
    if (!product.nameEn?.trim()) add("translation", "Brak angielskiej nazwy");
    if (product.descriptionPl?.trim() && !product.descriptionEn?.trim()) add("translation", "Brak angielskiego tłumaczenia opisu");
    if (kind === "wine" && !product.wineColor?.trim()) add("wine", "Brak koloru wina");
    if (/(?:^|[\s_\-/])kieliszek(?:$|[\s_\-/])/i.test(product.name) && !product.wineCode) add("wine", "Kieliszek jest ukryty: brak wspólnego kodu WINxxx w PLU");
    if (/(?:^|[\s_\-/])kielisz(?:ek|ki)(?:$|[\s_\-/])/i.test(product.name) && !product.tags.some((tag) => tag.trim().toLocaleLowerCase("pl") === "kieliszek")) add("wine", "Kieliszek jest ukryty: brak tagu KIELISZEK");
    if (kind === "beer" && !product.attributes?.alcoholPercentage?.trim()) add("beer", "Brak zawartości alkoholu");
    if (kind === "whisky" && !product.attributes?.spiritType?.trim()) add("description", "Brak rodzaju trunku (whisky, bourbon, koniak lub brandy)");
    if (kind === "cocktails" && !product.attributes?.cocktailType?.trim()) add("description", "Brak rodzaju pozycji Alko Baru — nie będzie można filtrować jej po rodzaju");
    if (kind === "cocktails" && !product.attributes?.cocktailBase?.trim()) add("description", "Brak alkoholu bazowego — nie będzie można filtrować pozycji po bazie");
    return issues;
  }), [products]);

  function openProductSearch() {
    setSelectedId(null);
    setQuery("");
    setCategory("");
    setVisibilityFilter("");
    setProductStatusFilter("all");
    setView("products");
  }

  function editAuditProduct(productId: number) {
    const product = products.find((item) => item.id === productId);
    setSelectedId(productId);
    setQuery(product?.name ?? "produkt");
    setCategory("Wszystkie");
    setVisibilityFilter("all");
    setProductStatusFilter("all");
    setView("products");
  }

  async function saveDotykackaSettings(warehouseId: string, branchId: string) {
    setSaving(true);setError("");setMessage("");
    const response = await fetch("/api/admin/dotykacka/status", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ warehouseId: warehouseId || null, branchId: branchId || null }) });
    const body = await response.json().catch(() => ({})) as { error?: string; warning?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zapisać ustawień.");
    else { setMessage("Zapisano magazyn i oddział. Możesz uruchomić pierwszą synchronizację.");await loadDotykackaStatus(); }
    setSaving(false);
  }

  async function enableStockWebhook() {
    setSaving(true);setError("");setMessage("");
    const response = await fetch("/api/admin/dotykacka/stock-webhook", { method: "POST" });
    const body = await response.json().catch(() => ({})) as { error?: string; alreadyExisted?: boolean };
    if (!response.ok) setError(body.error ?? "Nie udało się włączyć automatycznego rozpoznawania dostawców.");
    else {
      setMessage(body.alreadyExisted ? "Odbiór operacji magazynowych był już włączony." : "Włączono odbiór operacji magazynowych. Kolejne przyjęcie pozwoli sprawdzić dane przekazywane przez Dotykačkę.");
      await loadDotykackaStatus();
    }
    setSaving(false);
  }

  useEffect(() => {
    if (!selectedId) return;
    fetch(`/api/admin/products/${selectedId}/wine-sources`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { sources?: WineSource[] };
        setWineSources(response.ok ? body.sources ?? [] : []);
      })
      .catch(() => setWineSources([]));
  }, [selectedId, products]);

  async function sync() {
    setSyncing(true);
    setMessage("");
    setError("");
    const response = await fetch("/api/admin/sync", { method: "POST" });
    const body = await response.json().catch(() => ({})) as {
      error?: string;
      productsSeen?: number;
      productsImported?: number;
      salesStatus?: "ok" | "cached" | "not-configured" | "error";
      salesProductsSeen?: number;
      wineProductsWithSales?: number;
      coffeeAddonsImported?: number | null;
      waiterEmployeesImported?: number | null;
      waiterTablesImported?: number | null;
      waiterExtraProductsImported?: number;
      deliveryNotesSeen?: number;
      deliveryNoteSupplierMatches?: number;
      salesSyncedAt?: string | null;
      salesWarning?: string | null;
      translationStatus?: "ok" | "not-needed" | "not-configured" | "error";
      productsTranslated?: number;
      coffeeAddonsTranslated?: number;
      translationWarning?: string | null;
    };
    if (!response.ok) setError(body.error ?? "Synchronizacja nie powiodła się.");
    else {
      const salesMessage = body.salesStatus === "ok"
        ? ` Raport sprzedaży: ${body.salesProductsSeen ?? 0} pozycji, w tym ${body.wineProductsWithSales ?? 0} win ze sprzedażą w ostatnich 30 dniach.`
        : body.salesStatus === "cached"
          ? ` Ranking sprzedaży jest aktualny (ostatnie pobranie: ${body.salesSyncedAt ? new Date(body.salesSyncedAt).toLocaleString("pl-PL") : "dzisiaj"}).`
        : ` Uwaga: ${body.salesWarning ?? "nie pobrano raportu sprzedaży"}`;
      const supplierMessage = ` Dokumenty dostaw: ${body.deliveryNotesSeen ?? 0}; produkty rozpoznane z dokumentów: ${body.deliveryNoteSupplierMatches ?? 0}.`;
      const addonMessage = body.coffeeAddonsImported == null
        ? " Dodatki do kawy: zachowano ostatnią listę (interfejs Dotykački chwilowo niedostępny)."
        : ` Dodatki do kawy: ${body.coffeeAddonsImported} powiązań.`;
      const waiterMessage = body.waiterEmployeesImported == null || body.waiterTablesImported == null
        ? " Dane strefy kelnera: zachowano ostatnią listę pracowników lub stolików."
        : ` Strefa kelnera: ${body.waiterEmployeesImported} pracowników, ${body.waiterTablesImported} stolików i ${body.waiterExtraProductsImported ?? 0} pozycji poza menu z Dotykački.`;
      const translationMessage = body.translationStatus === "ok"
        ? ` Tłumaczenia EN: zaktualizowano ${body.productsTranslated ?? 0} produktów i ${body.coffeeAddonsTranslated ?? 0} dodatków.`
        : body.translationStatus === "not-needed"
          ? " Tłumaczenia EN są aktualne."
          : ` Uwaga: ${body.translationWarning ?? "tłumaczenia EN oczekują na ponowienie"}`;
      setMessage(`Synchronizacja zakończona: odczytano ${body.productsSeen ?? 0}, zapisano ${body.productsImported ?? 0} produktów.${salesMessage}${supplierMessage}${addonMessage}${waiterMessage}${translationMessage}`);
      await loadProducts(selectedId ?? undefined);
    }
    setSyncing(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setMessage("");
    setError("");
    const form = new FormData(event.currentTarget);
    const localImage = form.get("imageFile");
    const backdropImage = form.get("backdropFile");
    const galleryFiles = form.getAll("galleryFiles").filter((item): item is File => item instanceof File && item.size > 0);
    const staffMediaFiles = form.getAll("staffMediaFiles").filter((item): item is File => item instanceof File && item.size > 0);
    const oversizedStaffMedia = staffMediaFiles.find((file) => file.size > 95 * 1024 * 1024);
    if (oversizedStaffMedia) {
      setError(`Plik „${oversizedStaffMedia.name}” jest większy niż 95 MB. Skróć film i spróbuj ponownie.`);
      setSaving(false);
      return;
    }
    const payload: Record<string, unknown> = {};
    for (const key of editable) payload[key] = String(form.get(key) ?? "").trim() || null;
    // Non-wine forms do not render this select. Sending null used to make the
    // API reject the entire product update, including an otherwise valid text.
    payload.veganStatus = String(form.get("veganStatus") ?? selected.veganStatus ?? "UNKNOWN").trim() || "UNKNOWN";
    payload.attributes = Object.fromEntries(attributeKeys.map((key) => [key, String(form.get(`attribute_${key}`) ?? "").trim()]).filter(([, value]) => value));
    const productKind = selected.wineCode ? "wine" : sectionFor(selected.category);
    if (supportsDrinkVessel(productKind, selected.category)) {
      const vesselId = String(form.get("drinkVesselId") ?? "").trim();
      const espressoShots = String(form.get("espressoShots") ?? "").trim();
      payload.drinkVesselId = vesselId ? Number(vesselId) : null;
      payload.espressoShots = espressoShots ? Number(espressoShots) : null;
      payload.alcoholMarker = form.get("alcoholMarker") === "on";
    }
    for (const key of ["featured", "manualHidden", "autoTranslate"] as const) payload[key] = form.get(key) === "on";
    try {
      const response = await fetch(`/api/admin/products/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; warning?: string; saved?: { descriptionPl?: string | null; updatedAt?: string } };
      if (!response.ok) {
        setError(body.error ?? "Nie udało się zapisać zmian.");
        return;
      }
      const sentDescription = String(payload.descriptionPl ?? "");
      const persistedDescription = body.saved?.descriptionPl ?? "";
      if (sentDescription !== persistedDescription) {
        setError("Serwer nie potwierdził trwałego zapisu opisu. Dane pozostają w formularzu — spróbuj ponownie.");
        return;
      }
      let imageSaved = false;
      if (localImage instanceof File && localImage.size > 0) {
        try {
          const preparedImage = await prepareLocalImage(localImage);
          const upload = new FormData();
          upload.append("image", preparedImage);
          const imageResponse = await fetch(`/api/admin/products/${selected.id}/image`, { method: "POST", body: upload });
          const imageBody = await imageResponse.json().catch(() => ({})) as { error?: string };
          if (!imageResponse.ok) throw new Error(imageBody.error ?? "Nie udało się przesłać zdjęcia.");
          imageSaved = true;
        } catch (imageError) {
          setError(`Pozostałe zmiany zostały zapisane, ale zdjęcie nie: ${imageError instanceof Error ? imageError.message : "nieznany błąd"}`);
        }
      }
      let galleryImagesSaved = 0;
      if (galleryFiles.length > 0) {
        try {
          const upload = new FormData();
          for (const file of galleryFiles) upload.append("images", await prepareLocalImage(file));
          const galleryResponse = await fetch(`/api/admin/products/${selected.id}/gallery`, { method: "POST", body: upload });
          const galleryBody = await galleryResponse.json().catch(() => ({})) as { error?: string };
          if (!galleryResponse.ok) throw new Error(galleryBody.error ?? "Nie udało się przesłać zdjęć galerii.");
          galleryImagesSaved = galleryFiles.length;
        } catch (galleryError) {
          setError(`Pozostałe zmiany zostały zapisane, ale galeria nie: ${galleryError instanceof Error ? galleryError.message : "nieznany błąd"}`);
        }
      }
      let backdropSaved = false;
      if (backdropImage instanceof File && backdropImage.size > 0) {
        try {
          const upload = new FormData();
          upload.append("image", await prepareLocalImage(backdropImage));
          const backdropResponse = await fetch(`/api/admin/products/${selected.id}/backdrop`, { method: "POST", body: upload });
          const backdropBody = await backdropResponse.json().catch(() => ({})) as { error?: string };
          if (!backdropResponse.ok) throw new Error(backdropBody.error ?? "Nie udało się przesłać tła podglądu.");
          backdropSaved = true;
        } catch (backdropError) {
          setError(`Pozostałe zmiany zostały zapisane, ale tło podglądu nie: ${backdropError instanceof Error ? backdropError.message : "nieznany błąd"}`);
        }
      }
      let staffMediaSaved = 0;
      if (staffMediaFiles.length > 0) {
        try {
          const upload = new FormData();
          for (const file of staffMediaFiles) {
            const prepared = isPreparableLocalImage(file) ? await prepareLocalImage(file) : file;
            upload.append("media", prepared);
          }
          const mediaResponse = await fetch(`/api/admin/products/${selected.id}/staff-media`, { method: "POST", body: upload });
          const mediaBody = await mediaResponse.json().catch(() => ({})) as { error?: string };
          if (!mediaResponse.ok) throw new Error(mediaBody.error ?? "Nie udało się przesłać materiałów instrukcji.");
          staffMediaSaved = staffMediaFiles.length;
        } catch (mediaError) {
          setError(`Tekst instrukcji i pozostałe zmiany zostały zapisane, ale jej pliki nie: ${mediaError instanceof Error ? mediaError.message : "nieznany błąd"}`);
        }
      }
      if ((!localImage || !(localImage instanceof File) || !localImage.size || imageSaved) && (!backdropImage || !(backdropImage instanceof File) || !backdropImage.size || backdropSaved) && (!galleryFiles.length || galleryImagesSaved > 0) && (!staffMediaFiles.length || staffMediaSaved > 0)) {
        const suffix = `${imageSaved ? " Zdjęcie produktu zostało zmniejszone i zapisane na serwerze." : ""}${backdropSaved ? " Tło podglądu zostało zoptymalizowane i zapisane." : ""}${galleryImagesSaved ? ` Dodano ${galleryImagesSaved} zdjęć do galerii.` : ""}${staffMediaSaved ? ` Dodano ${staffMediaSaved} plików instrukcji.` : ""}`;
        setMessage(body.warning ? `Zapisano: ${selected.name}. ${body.warning}${suffix}` : `Zapisano: ${selected.name}.${suffix}`);
      }
      await loadProducts(selected.id);
    } catch (saveError) {
      setError(`Nie udało się połączyć z serwerem zapisu. Dane pozostają w formularzu — spróbuj ponownie. ${saveError instanceof Error ? saveError.message : ""}`.trim());
    } finally {
      setSaving(false);
    }
  }

  async function importImageFromUrl(sourceUrl: string) {
    if (!selected) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/admin/products/${selected.id}/image`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageSourceUrl: sourceUrl }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; imagePath?: string };
      if (!response.ok) throw new Error(body.error ?? "Nie udało się pobrać zdjęcia.");
      setMessage(`Zdjęcie produktu ${selected.name} zostało pobrane i zapisane w naszym zbiorze.`);
      await loadProducts(selected.id);
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : "Nie udało się pobrać zdjęcia.");
    } finally {
      setSaving(false);
    }
  }

  async function removeProductImage() {
    if (!selected || !window.confirm(`Usunąć zdjęcie produktu „${selected.name}”?`)) return;
    setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/admin/products/${selected.id}/image`, { method: "DELETE" });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Nie udało się usunąć zdjęcia produktu.");
      setMessage(`Usunięto zdjęcie produktu ${selected.name}.`);
      await loadProducts(selected.id);
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : "Nie udało się usunąć zdjęcia produktu.");
    } finally {
      setSaving(false);
    }
  }

  async function importBackdropFromUrl(sourceUrl: string) {
    if (!selected) return;
    setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/admin/products/${selected.id}/backdrop`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageSourceUrl: sourceUrl }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Nie udało się pobrać tła podglądu.");
      setMessage(`Tło podglądu produktu ${selected.name} zostało pobrane, zoptymalizowane i zapisane.`);
      await loadProducts(selected.id);
    } catch (backdropError) {
      setError(backdropError instanceof Error ? backdropError.message : "Nie udało się pobrać tła podglądu.");
    } finally {
      setSaving(false);
    }
  }

  async function removeProductBackdrop() {
    if (!selected || !window.confirm(`Usunąć tło podglądu produktu „${selected.name}”? Zdjęcie butelki pozostanie bez zmian.`)) return;
    setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/admin/products/${selected.id}/backdrop`, { method: "DELETE" });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Nie udało się usunąć tła podglądu.");
      setMessage(`Usunięto tło podglądu produktu ${selected.name}. Zdjęcie butelki pozostało bez zmian.`);
      await loadProducts(selected.id);
    } catch (backdropError) {
      setError(backdropError instanceof Error ? backdropError.message : "Nie udało się usunąć tła podglądu.");
    } finally {
      setSaving(false);
    }
  }

  async function removeGalleryImage(imagePath: string) {
    if (!selected || !window.confirm(`Usunąć to zdjęcie z galerii produktu „${selected.name}”?`)) return;
    setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/admin/products/${selected.id}/gallery`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imagePath }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Nie udało się usunąć zdjęcia z galerii.");
      setMessage(`Usunięto zdjęcie z galerii produktu ${selected.name}.`);
      await loadProducts(selected.id);
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : "Nie udało się usunąć zdjęcia z galerii.");
    } finally {
      setSaving(false);
    }
  }

  async function setPrimaryGalleryImage(imagePath: string) {
    if (!selected || selected.imagePath === imagePath) return;
    setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/admin/products/${selected.id}/gallery`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imagePath }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Nie udało się ustawić zdjęcia głównego.");
      setMessage(`Ustawiono pierwsze zdjęcie galerii produktu ${selected.name}.`);
      await loadProducts(selected.id);
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : "Nie udało się ustawić zdjęcia głównego.");
    } finally {
      setSaving(false);
    }
  }

  async function removeStaffMedia(mediaId: string) {
    if (!selected) return;
    setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/admin/products/${selected.id}/staff-media`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Nie udało się usunąć pliku instrukcji.");
      setMessage(`Usunięto plik z instrukcji produktu ${selected.name}.`);
      await loadProducts(selected.id);
    } catch (mediaError) {
      setError(mediaError instanceof Error ? mediaError.message : "Nie udało się usunąć pliku instrukcji.");
    } finally {
      setSaving(false);
    }
  }

  async function discoverProductInformation(sourceUrl?: string, sourceText?: string) {
    if (!selected) return;
    setEnriching(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/products/${selected.id}/enrichment`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(sourceUrl ? { sourceUrl } : {}), ...(sourceText ? { sourceText } : {}) }),
      });
      const body = await response.json().catch(() => ({})) as {
        error?: string;
        created?: boolean;
        message?: string;
        warnings?: string[];
        sourceUrls?: string[];
      };
      if (!response.ok) {
        setError(body.error ?? (response.status === 401
          ? "Sesja administratora wygasła. Odśwież panel i zaloguj się ponownie."
          : "Nie udało się wyszukać informacji o produkcie."));
        return;
      }
      const warning = body.warnings?.length ? ` ${body.warnings.join(" ")}` : "";
      setMessage(body.created
        ? `Znaleziono propozycję z ${body.sourceUrls?.length ?? 0} źródeł. Sprawdź dane i zdjęcia przed zatwierdzeniem.${warning}`
        : `${body.message ?? "Nie znaleziono nowych danych."}${warning}`);
      await loadProducts(selected.id);
    } catch (discoveryError) {
      setError(`Nie udało się połączyć z serwerem analizy. Spróbuj ponownie. ${discoveryError instanceof Error ? discoveryError.message : ""}`.trim());
    } finally {
      setEnriching(false);
    }
  }

  async function decideWineSource(sourceId: number, decision: "KEEP_CURRENT" | "FILL_MISSING" | "REPLACE", imageSourceUrl?: string) {
    if (!selected) return;
    setSaving(true);
    setError("");
    setMessage("");
    const response = await fetch(`/api/admin/products/${selected.id}/wine-sources`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceId, decision, imageSourceUrl: imageSourceUrl || undefined }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zapisać decyzji.");
    else {
      const label = decision === "KEEP_CURRENT" ? "pozostawiono obecny opis" : decision === "FILL_MISSING" ? "uzupełniono brakujące dane" : "zastosowano dane z nowego źródła";
      setMessage(`Źródło rozpatrzone: ${label}.`);
      await loadProducts(selected.id);
      if (decision !== "KEEP_CURRENT") window.setTimeout(() => document.querySelector(".admin-publish-zone")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    }
    setSaving(false);
  }

  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" });
    window.location.reload();
  }

  function moveCategory(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= menuCategoryRows.length) return;
    setMenuCategoryRows((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function useSuggestion() {
    if (!suggestion) return;
    const rank = new Map(suggestion.categoryIds.map((id, index) => [id, index]));
    setMenuCategoryRows((current) => [...current].sort((a, b) => (rank.get(a.id) ?? 9999) - (rank.get(b.id) ?? 9999)));
    setMessage("Sugestia została ułożona. Zapisz kolejność, aby ją opublikować.");
  }

  async function saveCategoryOrder(reset = false) {
    setSaving(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/admin/categories", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(reset ? { reset: true } : {
        categoryIds: menuCategoryRows.map((item) => item.id),
        showCodeCategoryIds: menuCategoryRows.filter((item) => item.showCatalogCodes).map((item) => item.id),
      }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zapisać kolejności.");
    else {
      setMessage(reset ? "Przywrócono kolejność z Dotykački." : "Zapisano kolejność zakładek i ustawienia kodów PLU.");
      await loadCategories();
    }
    setSaving(false);
  }

  function toggleCategoryCodes(id: number) {
    setMenuCategoryRows((current) => current.map((item) => item.id === id ? { ...item, showCatalogCodes: !item.showCatalogCodes } : item));
  }

  function moveShelfGroup(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= shelfGroupRows.length) return;
    setShelfGroupRows((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function placeShelfGroupBefore(targetId: number) {
    if (!draggedShelfGroupId || draggedShelfGroupId === targetId) return;
    setShelfGroupRows((current) => {
      const from = current.findIndex((item) => item.id === draggedShelfGroupId);
      const to = current.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDraggedShelfGroupId(null);
  }

  async function saveShelfGroupOrder(reset = false) {
    setSaving(true);setError("");setMessage("");
    const response = await fetch("/api/admin/categories", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(reset ? { resetShelf: true } : { shelfCategoryIds: shelfGroupRows.map((item) => item.id) }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zapisać kolejności grup Z PÓŁKI.");
    else {
      setMessage(reset ? "Przywrócono automatyczną kolejność grup Z PÓŁKI." : "Zapisano kolejność grup Z PÓŁKI.");
      await loadCategories();
    }
    setSaving(false);
  }

  function moveProduct(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= productOrderRows.length) return;
    setProductOrderRows((current) => { const next = [...current];[next[index], next[target]] = [next[target], next[index]];return next; });
  }

  const effectiveProductGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of productOrderRows) {
      const name = (item.menuGroup ?? item.suggestion?.pl ?? "").trim();
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const orderedNames = [
      ...productGroupOrderRows.map((group) => group.name).filter((name) => counts.has(name)),
      ...Array.from(counts.keys()).filter((name) => !productGroupOrderRows.some((group) => group.name === name)),
    ];
    return orderedNames.map((name, sortOrder) => ({ name, sortOrder, productCount: counts.get(name) ?? 0 }));
  }, [productGroupOrderRows, productOrderRows]);

  function moveProductGroup(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= effectiveProductGroups.length) return;
    const next = [...effectiveProductGroups];
    [next[index], next[target]] = [next[target], next[index]];
    setProductGroupOrderRows(next.map((group, sortOrder) => ({ ...group, sortOrder })));
  }

  function placeProductGroupBefore(targetName: string) {
    if (draggedProductGroupName === undefined || draggedProductGroupName === targetName) return;
    const from = effectiveProductGroups.findIndex((group) => group.name === draggedProductGroupName);
    const to = effectiveProductGroups.findIndex((group) => group.name === targetName);
    if (from < 0 || to < 0) return;
    const next = [...effectiveProductGroups];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setProductGroupOrderRows(next.map((group, sortOrder) => ({ ...group, sortOrder })));
    setDraggedProductGroupName(undefined);
  }

  function placeProductBefore(targetId: number) {
    if (!draggedProductId || draggedProductId === targetId) return;
    setProductOrderRows((current) => {
      const from = current.findIndex((item) => item.id === draggedProductId);const to = current.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return current;const next = [...current];const [moved] = next.splice(from, 1);next.splice(to, 0, moved);return next;
    });
    setDraggedProductId(null);
  }

  function useProductSuggestion() {
    const suggestedRows = [...productOrderRows].sort((a, b) =>
      (a.suggestion?.rank ?? 9999) - (b.suggestion?.rank ?? 9999)
      || (a.sourceOrder ?? 9999) - (b.sourceOrder ?? 9999)
      || a.name.localeCompare(b.name, "pl")
    );
    setProductOrderRows(suggestedRows);
    const suggestedGroups = Array.from(suggestedRows.reduce((groups, item) => {
      const name = (item.menuGroup ?? item.suggestion?.pl ?? "").trim();
      groups.set(name, (groups.get(name) ?? 0) + 1);
      return groups;
    }, new Map<string, number>()).entries()).map(([name, productCount], sortOrder) => ({ name, productCount, sortOrder }));
    setProductGroupOrderRows(suggestedGroups);
    setMessage("Sugestia została ułożona. Możesz ją poprawić i zapisać.");
  }

  async function saveProductOrder(reset = false) {
    if (!orderCategoryId) return;
    setSaving(true);setError("");setMessage("");
    const response = await fetch("/api/admin/product-order", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(reset ? { categoryId: orderCategoryId, reset: true } : {
      categoryId: orderCategoryId, items: productOrderRows.map((item, index) => ({ id: item.id, menuSortOrder: index, menuGroup: item.menuGroup ?? item.suggestion?.pl ?? null })),
      groups: effectiveProductGroups.map((group, sortOrder) => ({ name: group.name, sortOrder })),
    }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zapisać kolejności produktów.");
    else { setMessage(reset ? "Przywrócono układ wynikający z Dotykački i sugestii." : "Kolejność produktów i podgrupy zostały zapisane.");await loadProductOrder(orderCategoryId); }
    setSaving(false);
  }

  function movePromotion(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= promotionRows.length) return;
    setPromotionRows((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function savePromotionOrder() {
    setSaving(true); setError(""); setMessage("");
    const response = await fetch("/api/admin/promotions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productIds: promotionRows.map((item) => item.id) }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zapisać kolejności polecanych produktów.");
    else { setMessage("Kolejność polecanych produktów została zapisana."); await loadPromotions(); }
    setSaving(false);
  }

  async function saveOffers() {
    if (!offerSettings) return;
    setSaving(true);setError("");setMessage("");
    const response = await fetch("/api/admin/offers", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ season: offerSettings.season, specialEnabled: offerSettings.specialEnabled, specialNamePl: offerSettings.specialNamePl }),
    });
    const body = await response.json().catch(() => ({})) as OfferSettings & { error?: string; warning?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zapisać ustawień ofert.");
    else {
      setOfferSettings(body);
      setMessage(`Ustawienia ofert zapisane. Tablet pobierze zmianę automatycznie w ciągu minuty.${body.warning ? ` ${body.warning}` : ""}`);
    }
    setSaving(false);
  }

  return (
    <main className="admin-dashboard">
      <header className="admin-topbar">
        <img src="/logo-cafe.png" alt="Marta Banaszek atelier-café" />
        <div className="admin-top-title">
          <span className="admin-eyebrow">Cyfrowa karta kawiarni</span>
          <h1>Panel konfiguracji</h1>
        </div>
        <nav className="admin-module-links" aria-label="Główne obszary panelu">
          <a className="admin-secondary" href="/admin/instructions">Instrukcje</a>
          <a className="admin-secondary" href="/admin/workforce">Grafik</a>
          <a className="admin-secondary" href="/admin/settlements">Rozliczenia</a>
          <a className="admin-secondary" href="/admin/inventory">Inwentaryzacja</a>
          <a className="admin-secondary" href="/admin/waiters">Pracownicy</a>
          <a className="admin-secondary" href="/admin/reservations">Rezerwacje</a>
          <a className="admin-secondary" href="/admin/lighting">Oświetlenie</a>
          <a className="admin-secondary" href="/admin/rooms">Pomieszczenia</a>
        </nav>
        <div className="admin-top-actions">
          {view !== "stock" && <button className="admin-primary admin-dotykacka-action" onClick={sync} disabled={syncing}>{syncing ? "Synchronizuję…" : "Synchronizuj z Dotykačką"}</button>}
          <button className="admin-secondary" onClick={logout}>Wyloguj</button>
        </div>
      </header>

      {(message || error) && <div className={error ? "admin-status is-error" : "admin-status"}>{error || message}</div>}

      <nav className="admin-view-tabs" aria-label="Sekcje panelu">
        <button className={view === "home" ? "is-active" : ""} onClick={() => setView("home")}>Start</button>
        <button className={view === "connection" ? "is-active" : ""} onClick={() => setView("connection")}>Połączenie</button>
        <button className={view === "products" ? "is-active" : ""} onClick={openProductSearch}>Produkty</button>
        <button className={view === "stock" ? "is-active" : ""} onClick={() => setView("stock")}>Stany magazynowe</button>
        <button className={view === "categories" ? "is-active" : ""} onClick={() => setView("categories")}>Zakładki i kody PLU</button>
        <button className={view === "productOrder" ? "is-active" : ""} onClick={() => setView("productOrder")}>Podgrupy i produkty</button>
        <button className={view === "offers" ? "is-active" : ""} onClick={() => setView("offers")}>Oferty czasowe</button>
        <button className={view === "promotions" ? "is-active" : ""} onClick={() => setView("promotions")}>Polecane</button>
        <button className={view === "audit" ? "is-active" : ""} onClick={() => setView("audit")}>Kontrola karty{auditIssues.length ? ` (${auditIssues.length})` : ""}</button>
        <button className={view === "visibilityHistory" ? "is-active" : ""} onClick={() => setView("visibilityHistory")}>Historia widoczności</button>
        <button className={view === "rules" ? "is-active" : ""} onClick={() => setView("rules")}>Dokumentacja i reguły</button>
      </nav>

      {view === "home" ? <section className="admin-welcome">
        <header className="admin-welcome-hero">
          <div className="admin-welcome-copy"><span className="admin-eyebrow">Strona powitalna · Marta Banaszek atelier-café</span><h2>Witaj, {greetingName}</h2><p>Najczęściej używane moduły masz od razu pod ręką. Ten układ jest osobisty i nie zmienia pulpitu innych administratorów.</p></div>
          <AdminWelcomeDateTime/>
        </header>
        <div className="admin-dashboard-heading">
          <div><h3>Twój pulpit</h3><p>Wybierz kafel, aby przejść do modułu. Skróty, kolejność i kolory możesz ustawić po swojemu.</p></div>
          {!dashboardEditing && <button type="button" className="admin-dashboard-customize" onClick={openDashboardEditor}><Settings2 size={18} aria-hidden="true"/>Dostosuj pulpit</button>}
        </div>
        <div className={dashboardEditing ? "admin-dashboard-workspace is-editing" : "admin-dashboard-workspace"}>
          <div>
            <div className="admin-welcome-grid" aria-label="Osobiste skróty administratora">
              {visibleDashboardTiles.map((tile) => {
                const foreground = dashboardTileForeground(tile.background, tile.foreground);
                const style = { "--admin-dashboard-tile-bg": tile.background === "paper" ? "rgba(255,255,255,.94)" : tile.background, "--admin-dashboard-tile-fg": foreground } as CSSProperties;
                return <button type="button" key={tile.id} className={dashboardEditing && tile.id === dashboardSelectedTile ? "is-selected" : ""} style={style} onClick={() => activateDashboardTile(tile.id)}>
                  <span className="admin-dashboard-tile-icon"><AdminDashboardTileIcon id={tile.id}/></span>
                  <span className="admin-dashboard-tile-copy"><strong>{tile.title}</strong><small>{tile.description}</small></span>
                  <ChevronRight className="admin-dashboard-tile-arrow" size={20} aria-hidden="true"/>
                </button>;
              })}
            </div>
            <aside className="admin-welcome-note"><div><span className="admin-eyebrow">Bezpieczna praca</span><h3>Najpierw wybór, potem edycja</h3></div><p>Panel nie wskazuje pierwszego produktu z listy. Edycja rozpoczyna się dopiero po ustawieniu kryteriów i wybraniu konkretnej pozycji.</p></aside>
          </div>
          {dashboardEditing && <aside className="admin-dashboard-editor" aria-label="Zarządzanie pulpitem">
            <header><div><span className="admin-eyebrow">Osobisty układ</span><h3>Zarządzaj kaflami</h3></div><button type="button" aria-label="Zamknij bez zapisywania" onClick={() => { setDashboardEditing(false); setDashboardError(""); }}>×</button></header>
            <p>Włącz potrzebne skróty, ustaw ich kolejność i wybierz tło. Zmiana zapisze się tylko na Twoim koncie.</p>
            <div className="admin-dashboard-editor-list">
              {dashboardDraft.map((preference, index) => {
                const tile = ADMIN_DASHBOARD_TILES.find((item) => item.id === preference.id)!;
                return <article className={dashboardSelectedTile === preference.id ? "is-selected" : ""} key={preference.id} onClick={() => setDashboardSelectedTile(preference.id)}>
                  <label><input type="checkbox" checked={preference.visible} onChange={() => toggleDashboardTile(preference.id)}/><span>{tile.title}</span></label>
                  <div><button type="button" aria-label={`Przenieś ${tile.title} wyżej`} disabled={index === 0} onClick={(event) => { event.stopPropagation(); moveDashboardTile(preference.id, -1); }}><ChevronUp size={16}/></button><button type="button" aria-label={`Przenieś ${tile.title} niżej`} disabled={index === dashboardDraft.length - 1} onClick={(event) => { event.stopPropagation(); moveDashboardTile(preference.id, 1); }}><ChevronDown size={16}/></button></div>
                </article>;
              })}
            </div>
            <section className="admin-dashboard-colors"><strong>Kolory: {ADMIN_DASHBOARD_TILES.find((item) => item.id === dashboardSelectedTile)?.title}</strong><span>Kolor tła</span><div>{ADMIN_DASHBOARD_COLORS.map((color) => <button type="button" key={color.value} aria-label={color.label} aria-pressed={selectedDashboardPreference.background === color.value} style={{ background: color.value === "paper" ? "#fffdf7" : color.value }} onClick={() => setDashboardTileBackground(color.value)}/>)}</div><label>Dowolny kolor tła<input type="color" value={selectedDashboardPreference.background === "paper" ? "#fffdf7" : selectedDashboardPreference.background} onChange={(event) => setDashboardTileBackground(event.target.value)}/></label><span>Kolor tekstu i ikony</span><div className="admin-dashboard-foregrounds"><button type="button" className="is-auto" aria-label="Automatyczny kontrast" aria-pressed={selectedDashboardPreference.foreground === "auto"} onClick={() => setDashboardTileForeground("auto")}>A</button><button type="button" aria-label="Granatowy tekst" aria-pressed={selectedDashboardPreference.foreground === "#0b3442"} style={{ background: "#0b3442" }} onClick={() => setDashboardTileForeground("#0b3442")}/><button type="button" aria-label="Biały tekst" aria-pressed={selectedDashboardPreference.foreground === "#ffffff"} style={{ background: "#ffffff" }} onClick={() => setDashboardTileForeground("#ffffff")}/></div><label>Dowolny kolor tekstu<input type="color" value={selectedDashboardPreference.foreground === "auto" ? dashboardTileForeground(selectedDashboardPreference.background) : selectedDashboardPreference.foreground} onChange={(event) => setDashboardTileForeground(event.target.value)}/></label><small>Opcja „A” dobiera kontrast automatycznie. Przy własnym kolorze od razu zobaczysz rezultat na kaflu.</small></section>
            {dashboardError && <p className="admin-dashboard-editor-error" role="alert">{dashboardError}</p>}
            <footer><button type="button" className="admin-secondary" disabled={dashboardSaving} onClick={() => { const defaults = DEFAULT_ADMIN_DASHBOARD_PREFERENCES.map((item) => ({ ...item })); setDashboardDraft(defaults); setDashboardSelectedTile(defaults[0].id); setDashboardError(""); }}>Przywróć domyślny</button><button type="button" className="admin-primary" disabled={dashboardSaving} onClick={() => void saveDashboardPreferences()}>{dashboardSaving ? "Zapisuję…" : "Zapisz układ"}</button></footer>
          </aside>}
        </div>
      </section> : view === "connection" ? <DotykackaConnectionView key={`${dotykackaStatus?.cloudId ?? "loading"}-${dotykackaStatus?.warehouseId ?? ""}-${dotykackaStatus?.branchId ?? ""}-${dotykackaStatus?.stockWebhookRegistered ?? false}`} status={dotykackaStatus} saving={saving} onSave={saveDotykackaSettings} onEnableStockWebhook={enableStockWebhook} onHistoryApplied={async () => { await loadProducts(selectedId ?? undefined); }} /> : view === "stock" ? <StockLevelsView syncing={syncing} /> : view === "products" ? <section className="admin-workspace">
        <aside className="admin-products">
          <div className="admin-list-head">
            <strong>Produkty</strong><span>{filtered.length} / {products.length}</span>
          </div>
          <div className="admin-product-search-intro"><strong>Co chcesz wyświetlić?</strong><span>Wpisz minimum 2 znaki albo wybierz kategorię, widoczność lub status produktu.</span></div>
          <div className="admin-dot-filter-label">Doprecyzuj wyniki według kropki:</div>
          <div className="admin-dot-legend" aria-label="Filtr statusu produktów">
            <button type="button" className={productStatusFilter === "all" ? "is-active" : ""} aria-pressed={productStatusFilter === "all"} onClick={() => { setProductStatusFilter("all"); setSelectedId(null); }}>
              wszystkie <b>{productsMatchingMainFilters.length}</b>
            </button>
            <button type="button" className={productStatusFilter === "approved" ? "is-active" : ""} aria-pressed={productStatusFilter === "approved"} onClick={() => { setProductStatusFilter("approved"); setSelectedId(null); }}>
              <i className="admin-dot is-visible" />widoczne i zatwierdzone <b>{productStatusCounts.approved}</b>
            </button>
            <button type="button" className={productStatusFilter === "needs-review" ? "is-active" : ""} aria-pressed={productStatusFilter === "needs-review"} onClick={() => { setProductStatusFilter("needs-review"); setSelectedId(null); }}>
              <i className="admin-dot needs-review" />wymagają uwagi <b>{productStatusCounts["needs-review"]}</b>
            </button>
            <button type="button" className={productStatusFilter === "dotykacka-hidden" ? "is-active" : ""} aria-pressed={productStatusFilter === "dotykacka-hidden"} onClick={() => { setProductStatusFilter("dotykacka-hidden"); setSelectedId(null); }}>
              <i className="admin-dot" />ukryte w menu lub bez stanu <b>{productStatusCounts["dotykacka-hidden"]}</b>
            </button>
            <button type="button" className={productStatusFilter === "menu-hidden" ? "is-active" : ""} aria-pressed={productStatusFilter === "menu-hidden"} onClick={() => { setProductStatusFilter("menu-hidden"); setSelectedId(null); }}>
              <i className="admin-dot is-menu-hidden" />ukryte ręcznie w naszym menu <b>{productStatusCounts["menu-hidden"]}</b>
            </button>
          </div>
          <input className="admin-search" value={query} onChange={(event) => { setQuery(event.target.value); setSelectedId(null); }} placeholder="Nazwa produktu — min. 2 znaki…" />
          <select className="admin-select" aria-label="Widoczność produktów" value={visibilityFilter} onChange={(event) => { setVisibilityFilter(event.target.value as VisibilityFilter); setSelectedId(null); }}>
            <option value="" disabled>Wybierz widoczność…</option>
            <option value="visible">Widoczne w menu</option>
            <option value="hidden">Ukryte</option>
            <option value="all">Wszystkie</option>
          </select>
          <select className="admin-select" value={category} onChange={(event) => { setCategory(event.target.value); setSelectedId(null); }}>
            <option value="" disabled>Wybierz kategorię…</option>
            {categories.map((item) => <option value={item} key={item}>{item.trim()}</option>)}
          </select>
          <div className="admin-product-list">
            {loading && <p className="admin-muted">Pobieram produkty…</p>}
            {!loading && !error && !productSearchReady && <div className="admin-product-search-empty"><b>Lista jest pusta</b><span>Najpierw ustaw kryteria wyszukiwania powyżej.</span></div>}
            {!loading && !error && productSearchReady && filtered.length === 0 && <p className="admin-muted">Brak produktów spełniających wybrane kryteria.</p>}
            {filtered.map((product) => {
              const status = productListStatus(product);
              return <button key={product.id} className={product.id === selectedId ? "admin-product-row is-active" : "admin-product-row"} onClick={() => setSelectedId(product.id)}>
                <span>{product.name}<small>{product.category ?? "Bez kategorii"}</small></span>
                <span className={status.className} title={status.label} aria-label={status.label} />
              </button>;
            })}
          </div>
        </aside>

        <section className="admin-editor">
          {!selected && <div className="admin-empty"><h2>{productSearchReady ? "Wybierz produkt" : "Zacznij od wyszukiwania"}</h2><p>{productSearchReady ? "Wybierz konkretną pozycję z przygotowanej listy wyników." : "Określ po lewej, co ma zostać wyświetlone. Panel nie otwiera już automatycznie pierwszego produktu."}</p></div>}
          {selected && <ProductForm key={`${selected.id}-${selected.syncedAt}-${selected.contentUpdatedAt ?? "new"}`} product={selected} drinkVessels={drinkVessels} wineSources={wineSources} saving={saving} discovering={enriching} feedback={error || message} feedbackIsError={Boolean(error)} onSubmit={save} onImageImport={importImageFromUrl} onRemoveImage={removeProductImage} onBackdropImport={importBackdropFromUrl} onRemoveBackdrop={removeProductBackdrop} onRemoveGalleryImage={removeGalleryImage} onSetPrimaryGalleryImage={setPrimaryGalleryImage} onRemoveStaffMedia={removeStaffMedia} onDiscover={discoverProductInformation} onDecision={decideWineSource} />}
        </section>
      </section> : view === "categories" ? <section className="admin-category-workspace">
        <div className="admin-category-heading">
          <div><span className="admin-eyebrow">Układ karty</span><h2>Zakładki i kody PLU</h2></div>
          <p>Ustaw kolejność i zdecyduj, w których kategoriach gość zobaczy kod towaru. Rozpoznajemy wyłącznie kod: trzy litery i liczba, bez spacji.</p>
        </div>
        {suggestion && <aside className="admin-suggestion">
          <div><span className="admin-eyebrow">Sugestia · {suggestion.context}</span><p>{suggestion.reason}</p></div>
          <button className="admin-secondary" onClick={useSuggestion}>Ułóż według sugestii</button>
        </aside>}
        <div className="admin-category-list">
          {menuCategoryRows.map((item, index) => <article key={item.id}>
            <b>{index + 1}</b>
            <div><h3>{item.name}</h3><p>{item.visibleProducts} widocznych pozycji{item.promoProducts ? ` · ${item.promoProducts} z tagiem PROMO` : ""}</p></div>
            <label className="admin-code-toggle"><input type="checkbox" checked={item.showCatalogCodes} onChange={() => toggleCategoryCodes(item.id)} /><span>Pokazuj kod PLU</span></label>
            <div className="admin-order-actions">
              <button type="button" aria-label={`Przesuń ${item.name} wyżej`} disabled={index === 0} onClick={() => moveCategory(index, -1)}>↑</button>
              <button type="button" aria-label={`Przesuń ${item.name} niżej`} disabled={index === menuCategoryRows.length - 1} onClick={() => moveCategory(index, 1)}>↓</button>
            </div>
          </article>)}
          {!menuCategoryRows.length && <p className="admin-muted">Brak widocznych kategorii. Najpierw zsynchronizuj produkty z Dotykačką.</p>}
        </div>
        <section className="admin-group-order admin-shelf-group-order" aria-labelledby="shelf-group-order-heading">
          <div><span className="admin-eyebrow">Osobny układ</span><h3 id="shelf-group-order-heading">Grupy w „Z PÓŁKI”</h3><p>Pokazujemy tu wyłącznie kategorie, w których istnieje produkt z tagiem PÓŁKA — również wtedy, gdy czeka on na dodatni stan. Ustaw ich kolejność niezależnie od głównych zakładek.</p></div>
          <div>
            <div className="admin-group-order-list">
              {shelfGroupRows.map((group, index) => <article key={group.id} draggable onDragStart={() => setDraggedShelfGroupId(group.id)} onDragEnd={() => setDraggedShelfGroupId(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => placeShelfGroupBefore(group.id)}>
                <b>{index + 1}</b><div><strong>{group.name}</strong><small>{group.taggedProducts} z tagiem PÓŁKA · {group.visibleProducts} aktualnie {group.visibleProducts === 1 ? "dostępny" : "dostępnych"}</small></div>
                <div className="admin-order-actions"><button type="button" aria-label={`Przesuń ${group.name} wyżej w Z PÓŁKI`} disabled={index === 0} onClick={() => moveShelfGroup(index, -1)}>↑</button><button type="button" aria-label={`Przesuń ${group.name} niżej w Z PÓŁKI`} disabled={index === shelfGroupRows.length - 1} onClick={() => moveShelfGroup(index, 1)}>↓</button></div>
              </article>)}
              {!shelfGroupRows.length && <p className="admin-muted">Brak dostępnych produktów z tagiem PÓŁKA.</p>}
            </div>
            <div className="admin-shelf-order-actions"><button className="admin-secondary" disabled={saving} onClick={() => saveShelfGroupOrder(true)}>Przywróć układ automatyczny</button><button className="admin-primary" disabled={saving || !shelfGroupRows.length} onClick={() => saveShelfGroupOrder(false)}>{saving ? "Zapisuję…" : "Zapisz kolejność grup"}</button></div>
          </div>
        </section>
        <div className="admin-category-save">
          <button className="admin-secondary" disabled={saving} onClick={() => saveCategoryOrder(true)}>Przywróć kolejność z Dotykački</button>
          <button className="admin-primary" disabled={saving || !menuCategoryRows.length} onClick={() => saveCategoryOrder(false)}>{saving ? "Zapisuję…" : "Zapisz kolejność"}</button>
        </div>
      </section> : view === "productOrder" ? <section className="admin-category-workspace">
        <div className="admin-category-heading">
          <div><span className="admin-eyebrow">Układ wewnątrz zakładki</span><h2>Podgrupy i produkty</h2></div>
          <p>Ustaw najpierw kolejność podgrup, a niżej kolejność produktów. Ręczny układ pozostanie po synchronizacji.</p>
        </div>
        <div className="admin-product-order-toolbar">
          <label>Kategoria<select value={orderCategoryId ?? ""} onChange={(event) => setOrderCategoryId(Number(event.target.value))}>{menuCategoryRows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <button className="admin-secondary" onClick={useProductSuggestion}>Ułóż według sugestii</button>
        </div>
        <aside className="admin-suggestion"><div><span className="admin-eyebrow">Jak utworzyć podkategorię</span><p>Wpisz tę samą nazwę podkategorii przy kilku produktach, np. „Wody”. Pustą wartość zostaw przy produktach, które nie mają być grupowane.</p></div></aside>
        <section className="admin-group-order" aria-labelledby="group-order-heading">
          <div><span className="admin-eyebrow">Układ sekcji</span><h3 id="group-order-heading">Kolejność podgrup</h3><p>Ustaw kolejność podgrup niezależnie od kolejności produktów. Zmiana dotyczy tylko wybranej kategorii.</p></div>
          <div className="admin-group-order-list">
            {effectiveProductGroups.map((group, index) => <article key={group.name || "__ungrouped"} draggable onDragStart={() => setDraggedProductGroupName(group.name)} onDragEnd={() => setDraggedProductGroupName(undefined)} onDragOver={(event) => event.preventDefault()} onDrop={() => placeProductGroupBefore(group.name)}>
              <b>{index + 1}</b><div><strong>{group.name || "Produkty bez podgrupy"}</strong><small>{group.productCount} {group.productCount === 1 ? "produkt" : "produktów"}</small></div>
              <div className="admin-order-actions"><button type="button" aria-label={`Przesuń ${group.name || "produkty bez podgrupy"} wyżej`} disabled={index === 0} onClick={() => moveProductGroup(index, -1)}>↑</button><button type="button" aria-label={`Przesuń ${group.name || "produkty bez podgrupy"} niżej`} disabled={index === effectiveProductGroups.length - 1} onClick={() => moveProductGroup(index, 1)}>↓</button></div>
            </article>)}
          </div>
        </section>
        <div className="admin-order-legend"><span>Produkt</span><span>Podkategoria w menu</span><span>Kolejność</span></div>
        <div className="admin-product-order-list">
          {productOrderRows.map((item, index) => <article key={item.id} draggable onDragStart={() => setDraggedProductId(item.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => placeProductBefore(item.id)}>
            <b>{index + 1}</b><div><h3>{item.name}</h3><small>{item.suggestion ? `Sugestia: ${item.suggestion.pl}` : "Bez sugerowanej podkategorii"}</small></div>
            <input aria-label={`Podkategoria dla ${item.name}`} value={item.menuGroup ?? item.suggestion?.pl ?? ""} placeholder="Bez podkategorii" onChange={(event) => setProductOrderRows((current) => current.map((row) => row.id === item.id ? { ...row, menuGroup: event.target.value } : row))} />
            <div className="admin-order-actions"><button aria-label={`Przesuń ${item.name} wyżej`} disabled={index === 0} onClick={() => moveProduct(index, -1)}>↑</button><button aria-label={`Przesuń ${item.name} niżej`} disabled={index === productOrderRows.length - 1} onClick={() => moveProduct(index, 1)}>↓</button></div>
          </article>)}
          {!productOrderRows.length && <p className="admin-muted">W tej kategorii nie ma produktów z tagiem „menu”.</p>}
        </div>
        <div className="admin-category-save"><button className="admin-secondary" disabled={saving || !orderCategoryId} onClick={() => saveProductOrder(true)}>Przywróć układ automatyczny</button><button className="admin-primary" disabled={saving || !productOrderRows.length} onClick={() => saveProductOrder(false)}>{saving ? "Zapisuję…" : "Zapisz kolejność"}</button></div>
      </section> : view === "offers" ? <section className="admin-category-workspace admin-offers-workspace">
        <div className="admin-category-heading">
          <div><span className="admin-eyebrow">Karty zależne od czasu i wydarzeń</span><h2>Oferty sezonowe i specjalne</h2></div>
          <p>Produkty wybierasz tagami w Dotykačce. Tutaj tylko uruchamiasz właściwą kartę i nadajesz nazwę ofercie specjalnej.</p>
        </div>
        {!offerSettings ? <p className="admin-muted">Pobieram ustawienia ofert…</p> : <div className="admin-offer-settings">
          <article>
            <span className="admin-eyebrow">LATO · JESIEŃ · ZIMA · WIOSNA</span>
            <h3>Oferta sezonowa</h3>
            <p>Wybierz jeden sezon albo wyłącz kartę. Licznik obejmuje tylko produkty, które już spełniają wszystkie warunki publikacji.</p>
            <label>Aktualny sezon<select value={offerSettings.season} onChange={(event) => setOfferSettings((current) => current ? { ...current, season: event.target.value as Season } : current)}>
              <option value="">Brak — karta wyłączona</option>
              <option value="LATO">Lato ({offerSettings.seasonCounts.LATO})</option>
              <option value="JESIEŃ">Jesień ({offerSettings.seasonCounts.JESIEŃ})</option>
              <option value="ZIMA">Zima ({offerSettings.seasonCounts.ZIMA})</option>
              <option value="WIOSNA">Wiosna ({offerSettings.seasonCounts.WIOSNA})</option>
            </select></label>
            <small>Jeśli wybrany sezon nie ma widocznych produktów, dodatkowa karta nie pojawi się w menu.</small>
          </article>
          <article>
            <span className="admin-eyebrow">TAG SPECJAL · {offerSettings.specialCount} pozycji</span>
            <h3>Oferta specjalna</h3>
            <p>Nazwij okazjonalny wybór. System automatycznie przygotuje angielską wersję nazwy przy zapisie.</p>
            <label className="admin-offer-toggle"><input type="checkbox" checked={offerSettings.specialEnabled} onChange={(event) => setOfferSettings((current) => current ? { ...current, specialEnabled: event.target.checked } : current)} /><span>Włącz kartę oferty specjalnej</span></label>
            <label>Nazwa po polsku<input maxLength={80} value={offerSettings.specialNamePl} placeholder="np. Wybór naszego artysty" onChange={(event) => setOfferSettings((current) => current ? { ...current, specialNamePl: event.target.value } : current)} /></label>
            {offerSettings.specialNameEn && <small>Wersja EN: {offerSettings.specialNameEn}</small>}
          </article>
        </div>}
        <aside className="admin-suggestion"><div><span className="admin-eyebrow">Jak to działa</span><p>Produkty pozostają także w swoich zwykłych kategoriach. Zmiany tagów pobiera synchronizacja co 2 minuty, a ustawienia tej strony tablet odczytuje automatycznie w ciągu minuty.</p></div></aside>
        <div className="admin-category-save"><button className="admin-primary" disabled={saving || !offerSettings} onClick={saveOffers}>{saving ? "Zapisuję…" : "Zapisz i opublikuj ustawienia"}</button></div>
      </section> : view === "promotions" ? <section className="admin-category-workspace">
        <div className="admin-category-heading">
          <div><span className="admin-eyebrow">Strona powitalna i początek kategorii</span><h2>Polecane produkty</h2></div>
          <p>Lista nie ma limitu. Trafiają tu aktualnie widoczne produkty z tagiem PROMO w Dotykačce oraz pozycje oznaczone jako polecane w naszym panelu.</p>
        </div>
        <div className="admin-category-list">
          {promotionRows.map((item, index) => <article key={item.id}>
            <b>{index + 1}</b>
            <div><h3>{item.name}</h3><p>{item.category ?? "Bez kategorii"} · {item.source}</p></div>
            <div className="admin-order-actions"><button type="button" disabled={index === 0} onClick={() => movePromotion(index, -1)}>↑</button><button type="button" disabled={index === promotionRows.length - 1} onClick={() => movePromotion(index, 1)}>↓</button></div>
          </article>)}
          {!promotionRows.length && <p className="admin-muted">Brak aktualnie widocznych polecanych produktów.</p>}
        </div>
        <div className="admin-category-save"><button className="admin-primary" disabled={saving || !promotionRows.length} onClick={savePromotionOrder}>{saving ? "Zapisuję…" : "Zapisz kolejność polecanych"}</button></div>
      </section> : view === "audit" ? <section className="admin-category-workspace admin-audit-workspace">
        <div className="admin-category-heading">
          <div><span className="admin-eyebrow">Spójność oferty</span><h2>Kontrola karty</h2></div>
          <p>System sprawdza wyłącznie aktualnie publikowane produkty. Kliknij wpis, aby od razu przejść do miejsca wymagającego uzupełnienia.</p>
        </div>
        <div className={auditIssues.length ? "admin-audit-summary" : "admin-audit-summary is-clean"}>
          <strong>{auditIssues.length ? `${auditIssues.length} rzeczy do uzupełnienia` : "Karta jest kompletna"}</strong>
          <span>{auditIssues.length ? `${new Set(auditIssues.map((issue) => issue.productId)).size} produktów wymaga uwagi` : "Nie znaleźliśmy braków objętych aktualnymi regułami."}</span>
        </div>
        <div className="admin-audit-list">
          {auditIssues.map((issue, index) => <button type="button" key={`${issue.productId}-${issue.kind}-${index}`} onClick={() => editAuditProduct(issue.productId)}>
            <span data-kind={issue.kind}>{issue.kind === "image" ? "Zdjęcie" : issue.kind === "description" ? "Opis" : issue.kind === "translation" ? "EN" : issue.kind === "wine" ? "Wino" : "Piwo"}</span>
            <div><strong>{issue.name}</strong><small>{issue.category}</small></div>
            <p>{issue.message}</p><b>Edytuj →</b>
          </button>)}
        </div>
      </section> : view === "visibilityHistory" ? <section className="admin-category-workspace admin-visibility-workspace">
        <div className="admin-category-heading">
          <div><span className="admin-eyebrow">Kontrola zmian pracowników</span><h2>Historia widoczności menu</h2></div>
          <p>Rejestr pokazuje kto, kiedy i z jakiego powodu ukrył albo ponownie udostępnił produkt w karcie gościa. Uprawnienie nadajesz osobno każdemu pracownikowi w ekranie „Pracownicy”.</p>
        </div>
        <div className={visibilityEvents.length ? "admin-audit-summary" : "admin-audit-summary is-clean"}>
          <strong>{visibilityEvents.length ? `${visibilityEvents.length} ostatnich zmian` : "Brak zmian wykonanych przez pracowników"}</strong>
          <span>Domyślnie pracownik nie ma prawa zmieniać widoczności. Raport przechowuje maksymalnie 500 najnowszych wpisów na ekranie.</span>
        </div>
        <div className="admin-visibility-list">
          {visibilityEvents.map((event) => <article key={event.id}>
            <span className={event.visible ? "is-shown" : "is-hidden"}>{event.visible ? "UJAWNIONO" : "UKRYTO"}</span>
            <div className="admin-visibility-product">
              <strong>{event.productName}</strong>
              <small>{event.categoryName}</small>
            </div>
            <div className="admin-visibility-person">
              <strong>{event.employeeName}</strong>
              <small>{formatVisibilityDate(event.createdAt)}</small>
            </div>
            <p>{event.reason}</p>
            {event.productId && <div className="admin-visibility-actions"><button type="button" className="admin-secondary" onClick={() => editAuditProduct(event.productId!)}>Otwórz produkt</button><button type="button" className="admin-secondary" disabled={saving} onClick={() => void resetVisibilityOverride(event.productId!)}>Przywróć wg Dotykački</button></div>}
          </article>)}
          {!visibilityEvents.length && <p className="admin-muted">Historia pojawi się po pierwszej zmianie wykonanej przez uprawnionego pracownika.</p>}
        </div>
      </section> : <RulesView />}
    </main>
  );
}

type StockCategoryOption = { id: string; name: string; count: number };

function StockLevelsView({ syncing }: { syncing: boolean }) {
  const [products, setProducts] = useState<StockLevelProduct[]>([]);
  const [categories, setCategories] = useState<StockCategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [refreshMessage, setRefreshMessage] = useState("");
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [stockState, setStockState] = useState<StockStateFilter>("all");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    fetch("/api/admin/stock-levels", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { products?: StockLevelProduct[]; categories?: StockCategoryOption[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Nie udało się pobrać stanów magazynowych.");
        if (!active) return;
        setProducts(body.products ?? []);
        setCategories(body.categories ?? []);
      })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : "Nie udało się pobrać stanów magazynowych."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  const selectedCategory = categories.find((category) => category.id === categoryId) ?? null;
  const groupProducts = useMemo(() => categoryId ? products.filter((product) => product.categoryId === categoryId) : [], [products, categoryId]);
  const tags = useMemo(() => usedStockTags(groupProducts), [groupProducts]);
  const filtered = useMemo(() => filterStockLevels(groupProducts, { query, category: "", state: stockState, tags: selectedTags }), [groupProducts, query, stockState, selectedTags]);
  const counts = useMemo(() => groupProducts.reduce((result, product) => {
    const quantity = stockQuantityValue(product.stockQuantity);
    if (quantity === null) result.unknown += 1;
    else if (quantity === 0) result.zero += 1;
    else if (quantity > 0) result.positive += 1;
    else result.negative += 1;
    return result;
  }, { zero: 0, positive: 0, negative: 0, unknown: 0 }), [groupProducts]);
  const selectedSyncedAt = groupProducts.reduce<string | null>((latest, product) => !latest || product.syncedAt > latest ? product.syncedAt : latest, null);

  function toggleTag(key: string) {
    setSelectedTags((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function refresh() {
    if (!categoryId || refreshing || syncing) return;
    setRefreshing(true);
    setLoadError("");
    setRefreshMessage("");
    try {
      const response = await fetch("/api/admin/stock-levels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ categoryId }),
      });
      const body = await response.json().catch(() => ({})) as { updatedCount?: number; category?: { name?: string }; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Nie udało się odświeżyć wybranej grupy.");
      setRefreshMessage(`Zaktualizowano ${body.updatedCount ?? 0} pozycji w grupie „${body.category?.name ?? selectedCategory?.name ?? "wybranej"}”.`);
      setReload((value) => value + 1);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Nie udało się odświeżyć wybranej grupy.");
    } finally {
      setRefreshing(false);
    }
  }

  return <section className="admin-stock-workspace">
    <div className="admin-category-heading admin-stock-heading">
      <div><span className="admin-eyebrow">Magazyn Dotykačka</span><h2>Stany magazynowe</h2></div>
      <div className="admin-stock-heading-actions"><p>Wybierz jedną grupę. Tylko jej stany zostaną pobrane z Dotykački i pokazane poniżej — bez uruchamiania pełnej synchronizacji całej karty.</p></div>
    </div>

    <div className="admin-stock-sync-panel">
      <label>Grupa do wyświetlenia i synchronizacji<select required value={categoryId} onChange={(event) => { setCategoryId(event.target.value);setQuery("");setStockState("all");setSelectedTags(new Set());setRefreshMessage(""); }}><option value="">Wybierz grupę…</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name} · {category.count} pozycji</option>)}</select></label>
      <button className="admin-primary admin-dotykacka-action" type="button" disabled={!categoryId || syncing || refreshing} onClick={() => void refresh()}>{syncing || refreshing ? "Aktualizuję grupę…" : "Odśwież wybraną grupę"}</button>
    </div>

    {loadError && <div className="admin-alert">{loadError}</div>}
    {refreshMessage && <div className="admin-status">{refreshMessage}</div>}
    {loading ? <p className="admin-muted">Pobieram grupy produktów…</p> : !categoryId ? <aside className="admin-stock-category-required"><strong>Najpierw wybierz grupę produktów</strong><p>Wybór jest wymagany zarówno do wyświetlenia wyników, jak i do pobrania aktualnych stanów z Dotykački.</p></aside> : <>
    <div className="admin-stock-summary" aria-label="Podsumowanie stanów wybranej grupy">
      <button type="button" className={stockState === "all" ? "is-active" : ""} onClick={() => setStockState("all")}><span>Wszystkie</span><strong>{groupProducts.length}</strong></button>
      <button type="button" className={stockState === "zero" ? "is-active is-zero" : "is-zero"} onClick={() => setStockState("zero")}><span>Stan zero</span><strong>{counts.zero}</strong></button>
      <button type="button" className={stockState === "positive" ? "is-active is-positive" : "is-positive"} onClick={() => setStockState("positive")}><span>Stan dodatni</span><strong>{counts.positive}</strong></button>
      <button type="button" className={stockState === "negative" ? "is-active is-negative" : "is-negative"} onClick={() => setStockState("negative")}><span>Stan ujemny</span><strong>{counts.negative}</strong></button>
      <button type="button" className={stockState === "unknown" ? "is-active" : ""} onClick={() => setStockState("unknown")}><span>Brak danych</span><strong>{counts.unknown}</strong></button>
    </div>

    <div className="admin-stock-filters">
      <label>Szukaj<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nazwa lub tag…" /></label>
      <label>Stan<select value={stockState} onChange={(event) => setStockState(event.target.value as StockStateFilter)}><option value="all">Wszystkie stany</option><option value="zero">Tylko zero</option><option value="positive">Tylko dodatnie</option><option value="negative">Tylko ujemne</option><option value="unknown">Brak danych</option></select></label>
    </div>

    <section className="admin-stock-tags" aria-label="Filtruj według tagów używanych przez produkty">
      <header><div><span className="admin-eyebrow">Tagi używane</span><strong>{tags.length} tagów przypisanych do produktów</strong></div>{selectedTags.size > 0 && <button type="button" onClick={() => setSelectedTags(new Set())}>Wyczyść filtry</button>}</header>
      <div>{tags.map((tag) => <button type="button" key={tag.key} className={selectedTags.has(tag.key) ? "is-active" : ""} aria-pressed={selectedTags.has(tag.key)} onClick={() => toggleTag(tag.key)}>{tag.label}<b>{tag.count}</b></button>)}</div>
      {!tags.length && !loading && <p>Żaden aktywny produkt nie ma obecnie przypisanego tagu w Dotykačce.</p>}
    </section>

    <div className="admin-stock-result-head"><strong>{selectedCategory?.name} · {filtered.length} pozycji</strong><span>{selectedSyncedAt ? `Dane z ${new Date(selectedSyncedAt).toLocaleString("pl-PL")}` : "Brak daty ostatniej synchronizacji"}</span></div>
    <div className="admin-stock-table" role="table" aria-label={`Stany magazynowe grupy ${selectedCategory?.name ?? "wybranej"}`}>
      <div className="is-head" role="row"><span>Produkt</span><span>Kategoria</span><span>Tagi</span><span>Stan</span></div>
      {filtered.map((product) => {
        const quantity = stockQuantityValue(product.stockQuantity);
        return <div role="row" key={product.id} className={quantity === 0 ? "is-zero" : quantity !== null && quantity < 0 ? "is-negative" : ""}>
          <span data-label="Produkt"><strong>{product.name}</strong>{!product.display && <small>Niewidoczny w Dotykačce</small>}</span>
          <span data-label="Kategoria">{product.category ?? "Bez kategorii"}</span>
          <span data-label="Tagi" className="admin-stock-row-tags">{product.tags.length ? product.tags.map((tag) => <i key={tag}>{tag}</i>) : <small>bez tagów</small>}</span>
          <span data-label="Stan" className="admin-stock-quantity"><strong>{formatStockQuantity(product.stockQuantity)}</strong><small>{product.unit?.trim() || "brak jednostki"}</small></span>
        </div>;
      })}
      {!filtered.length && !loadError && <p className="admin-muted">Brak produktów spełniających wybrane filtry.</p>}
    </div></>}
  </section>;
}

function DotykackaConnectionView({ status, saving, onSave, onEnableStockWebhook, onHistoryApplied }: { status: DotykackaStatus | null; saving: boolean; onSave: (warehouseId: string, branchId: string) => void; onEnableStockWebhook: () => void; onHistoryApplied: () => Promise<void> }) {
  const [warehouseId, setWarehouseId] = useState(status?.warehouseId ?? "");
  const [branchId, setBranchId] = useState(status?.branchId ?? "");
  if (!status) return <section className="admin-connection-workspace"><p className="admin-muted">Sprawdzam połączenie…</p></section>;
  return <section className="admin-connection-workspace">
    <div className="admin-category-heading"><div><span className="admin-eyebrow">Integracja</span><h2>Połączenie z Dotykačką</h2></div><p>Tutaj łączymy cyfrowe menu z właściwą chmurą, magazynem i oddziałem kawiarni. Dane dostępowe nigdy nie są pokazywane w panelu.</p></div>
    <article className={`admin-connection-card ${status.connected && !status.connectionError ? "is-connected" : ""}`}>
      <div className="admin-connection-state"><span /> <div><strong>{status.connected && !status.connectionError ? "Dotykačka połączona" : status.connectionError ? "Połączenie wymaga uwagi" : "Dotykačka niepołączona"}</strong><p>{status.connected ? `Chmura: ${status.cloudId ?? "rozpoznana"}` : "Zaloguj się do Dotykački i wybierz chmurę firmy."}</p></div></div>
      {!status.connected && <a className="admin-primary admin-connect-link" href="/api/admin/dotykacka/connect">Połącz z Dotykačką</a>}
      {status.connected && <a className="admin-secondary admin-connect-link" href="/api/admin/dotykacka/connect">Połącz ponownie</a>}
    </article>
    {status.connectionError && <div className="admin-alert">Dotykačka odpowiedziała błędem: {status.connectionError}</div>}
    {!status.connectorConfigured && <div className="admin-alert">Na serwerze brakuje danych aplikacji integracyjnej. Uzupełnij Client ID i Client Secret.</div>}
    {status.connected && !status.connectionError && !status.branchId && <div className="admin-alert">Nie wybrano oddziału. Produkty i stany mogą się synchronizować, ale odznaka „Wybór naszych gości” nie zadziała bez raportu sprzedaży oddziału.</div>}
    {status.connected && !status.connectionError && <form className="admin-connection-settings" onSubmit={(event) => { event.preventDefault();onSave(warehouseId, branchId); }}>
      <div><span className="admin-eyebrow">Zakres synchronizacji</span><h3>Wybierz właściwe miejsca</h3><p>Magazyn odpowiada za dostępność produktów. Oddział jest potrzebny do analizy sprzedaży i oznaczenia „Wybór naszych gości”.</p></div>
      <label>Magazyn<select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} required><option value="">Wybierz magazyn…</option>{status.warehouses.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>Oddział<select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Bez analizy sprzedaży</option>{status.branches.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <button className="admin-primary" disabled={saving || !warehouseId}>{saving ? "Zapisuję…" : "Zapisz ustawienia"}</button>
    </form>}
    {status.connected && !status.connectionError && status.warehouseId && <article className={`admin-connection-card ${status.stockWebhookRegistered ? "is-connected" : ""}`}>
      <div className="admin-connection-state"><span /><div><strong>Automatyczne rozpoznawanie dostawców</strong><p>{status.stockWebhookRegistered ? "Odbiór operacji magazynowych jest włączony." : "Włącz odbiór kolejnych przyjęć magazynowych z Dotykački."}</p></div></div>
      {!status.stockWebhookRegistered && <button type="button" className="admin-primary" disabled={saving} onClick={onEnableStockWebhook}>{saving ? "Włączam…" : "Włącz automatycznie"}</button>}
      {status.stockWebhookRegistered && <div className="admin-connection-state"><div><strong>{status.stockEvents?.received ?? 0} odebranych zdarzeń</strong><p>{status.stockEvents?.assigned ?? 0} przypisanych automatycznie · {status.stockEvents?.unresolved ?? 0} do diagnostyki{status.stockEvents?.lastEventAt ? ` · ostatnie ${new Date(status.stockEvents.lastEventAt).toLocaleString("pl-PL")}` : ""}</p></div></div>}
    </article>}
    {status.connected && !status.connectionError && <HistoricalSupplierImport onApplied={onHistoryApplied} />}
    <div className="admin-connection-steps"><h3>Co wydarzy się dalej</h3><ol><li><b>1</b><span>System pobierze kategorie i produkty oznaczone tagiem MENU albo PÓŁKA.</span></li><li><b>2</b><span>Ceny, widoczność i stany magazynowe będą aktualizowane z Dotykački.</span></li><li><b>3</b><span>Opisy, zdjęcia i układ pozostaną bezpiecznie w naszej bazie menu.</span></li></ol></div>
  </section>;
}

function HistoricalSupplierImport({ onApplied }: { onApplied: () => Promise<void> }) {
  const [receipts, setReceipts] = useState<File | null>(null);
  const [movements, setMovements] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<HistoricalImportResult | null>(null);
  const [error, setError] = useState("");

  async function submit(mode: "preview" | "apply") {
    if (!receipts || !movements) return setError("Wybierz oba raporty XLSX.");
    setBusy(true); setError("");
    const form = new FormData();
    form.append("receipts", receipts);
    form.append("movements", movements);
    form.append("mode", mode);
    try {
      const response = await fetch("/api/admin/dotykacka/historical-suppliers", { method: "POST", body: form });
      const body = await response.json().catch(() => ({})) as HistoricalImportResult & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Nie udało się przeanalizować raportów.");
      setResult(body);
      if (mode === "apply") await onApplied();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Nie udało się przeanalizować raportów.");
    } finally {
      setBusy(false);
    }
  }

  const readyToApply = result && !result.applied && result.linkedPurchaseLines > 0 && result.unresolvedReportLines === 0;
  return <section className="admin-history-import">
    <header><div><span className="admin-eyebrow">Jednorazowe uzupełnienie</span><h3>Historyczni dostawcy</h3></div><p>Wgraj dwa raporty za ten sam okres. System połączy dokumenty, towary i dostawców, ale nie zmieni cen, stanów ani opisów.</p></header>
    <div className="admin-history-files">
      <label>1. Lista przyjęć na magazyn<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setReceipts(event.target.files?.[0] ?? null); setResult(null); }} /><small>Krótki raport z kolumnami „Dokument dostawy”, „ID dostawcy” i „Dostawca”.</small></label>
      <label>2. Przyjęcie magazynowe<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setMovements(event.target.files?.[0] ?? null); setResult(null); }} /><small>Szczegółowy raport z produktami, EAN, PLU, ilością i wartością przyjęcia.</small></label>
    </div>
    {error && <div className="admin-alert">{error}</div>}
    {result && <div className={`admin-history-result ${result.applied ? "is-applied" : ""}`}>
      <strong>{result.applied ? "Historia dostawców została zapisana" : "Pliki są gotowe do importu"}</strong>
      <div><span><b>{result.receiptDocuments}</b> dokumentów</span><span><b>{result.suppliersFound}</b> dostawców</span><span><b>{result.linkedPurchaseLines} / {result.purchaseLines}</b> połączonych pozycji</span><span><b>{result.catalogProductsMatched}</b> produktów w naszej bazie</span><span><b>{result.multipleSupplierProducts}</b> produktów od kilku dostawców</span></div>
      {result.catalogProductsUnmatched > 0 && <p>{result.catalogProductsUnmatched} historycznych nazw nie odpowiada obecnym produktom w menu. To normalne dla wycofanych pozycji; nie zostaną zapisane przy żadnym aktualnym produkcie.</p>}
      {result.unresolvedReportLines > 0 && <p className="is-warning">Nie udało się jednoznacznie przypisać {result.unresolvedReportLines} pozycji raportu. Import jest zablokowany, aby nie przypisać błędnego dostawcy.</p>}
    </div>}
    <footer>
      <button type="button" className="admin-secondary" disabled={busy || !receipts || !movements} onClick={() => submit("preview")}>{busy ? "Analizuję…" : "Sprawdź pliki"}</button>
      {readyToApply && <button type="button" className="admin-primary" disabled={busy} onClick={() => submit("apply")}>{busy ? "Importuję…" : `Importuj do ${result.catalogProductsMatched} produktów`}</button>}
    </footer>
  </section>;
}

function RulesView() {
  return <section className="admin-rules-workspace">
    <div className="admin-rules-heading">
      <div><span className="admin-eyebrow">Instrukcja działania</span><h2>Reguły cyfrowego menu</h2></div>
      <p>To wspólna instrukcja dla osób administrujących kartą. Pokazuje, które dane zmieniamy w Dotykačce, które w naszym panelu i co system wykonuje sam.</p>
    </div>
    <aside className="admin-rules-legend" aria-label="Znaczenie oznaczeń">
      <span data-kind="pos">Dotykačka</span><span data-kind="panel">Nasz panel</span><span data-kind="auto">Automatycznie</span><span data-kind="always">Zawsze</span>
    </aside>
    <section className="admin-tag-reference" aria-labelledby="admin-tag-reference-title">
      <header>
        <div><span className="admin-eyebrow">Słownik Dotykački</span><h3 id="admin-tag-reference-title">Tagi rozpoznawane przez system</h3></div>
        <p>Wielkość liter nie ma znaczenia. Tagi sumują swoje działanie: <strong>MENU</strong> publikuje produkt w zwykłych sekcjach, <strong>PÓŁKA</strong> dodaje go do karty „Z PÓŁKI”, a <strong>INWENT</strong> steruje inwentaryzacją kategorii „Składniki”.</p>
      </header>
      <div className="admin-tag-table-scroll">
        <table>
          <thead><tr><th scope="col">Tag</th><th scope="col">Zastosowanie</th><th scope="col">Co robi w menu</th><th scope="col">Warunek działania</th></tr></thead>
          <tbody>
            {recognizedMenuTags.map((entry) => <tr key={entry.tag} data-kind={entry.kind}>
              <th scope="row"><code>{entry.tag}</code>{entry.aliases !== "—" && <small>także: {entry.aliases}</small>}</th>
              <td><strong>{entry.area}</strong></td>
              <td>{entry.effect}</td>
              <td>{entry.condition}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <aside className="admin-tag-notice">
        <strong>Tagi z Dotykački, które nie sterują cyfrowym menu</strong>
        <p><code>BAR</code>, <code>0</code> oraz <code>Koncesja A</code>, <code>Koncesja B</code> i <code>Koncesja C</code> mogą występować przy produktach, ale aplikacja nie traktuje ich jako poleceń. Oznaczenie 0% wynika z kodu koncesyjnego <code>0</code> w PLU albo z nazwy, stylu lub opisowego tagu produktu, a kody A/B/C/0 są odczytywane z PLU.</p>
      </aside>
    </section>
    <div className="admin-rules-grid">
      {ruleSections.map((section, sectionIndex) => <article className="admin-rule-section" key={section.title}>
        <header><b>{String(sectionIndex + 1).padStart(2, "0")}</b><div><h3>{section.title}</h3><p>{section.lead}</p></div></header>
        <ol>{section.rules.map(([kind, text], index) => <li key={`${kind}-${index}`}><span data-kind={kind === "Dotykačka" ? "pos" : kind === "Nasz panel" ? "panel" : kind === "Automatycznie" ? "auto" : "always"}>{kind}</span><p>{text}</p></li>)}</ol>
      </article>)}
    </div>
    <p className="admin-rules-footer">Ostatnia aktualizacja zasad: 20 września 2026. Reguły aktualizujemy razem z rozwojem systemu.</p>
  </section>;
}

const proposalLabels: Record<string, string> = {
  descriptionPl: "Opis", country: "Kraj", region: "Region", grapes: "Szczep",
  wineStyle: "Styl", wineColor: "Kolor", sparklingType: "Musowanie", sweetness: "Poziom słodyczy",
  veganStatus: "Wegańskie", tastingNotes: "Aromaty", alcoholPercentage: "Alkohol",
  beerStyle: "Styl piwa", origin: "Pochodzenie", volume: "Objętość",
  spiritType: "Rodzaj trunku", spiritStyle: "Styl", ageStatement: "Wiek", caskType: "Beczka", tasteProfile: "Profil smaku",
  cocktailType: "Rodzaj drinka", cocktailBase: "Alkohol bazowy", servingStyle: "Sposób podania",
};

function sourceKindLabel(kind: string) {
  if (kind === "SUPPLIER_WEBSITE") return "strona dostawcy";
  if (kind === "OPEN_FOOD_FACTS") return "Open Food Facts";
  if (kind === "MULTIPLE_SOURCES") return "strona dostawcy + bezpłatne źródła";
  if (kind === "MANUAL_URL") return "wskazana strona produktu";
  if (kind === "MANUAL_TEXT") return "wklejona treść strony produktu";
  if (kind === "WEB_SEARCH") return "wyszukiwanie internetowe";
  if (kind === "SUPPLIER_AND_WEB") return "strona dostawcy + internet";
  if (kind === "DOTYKACKA") return "Dotykačka";
  return kind.toLocaleLowerCase("pl");
}

function sourceHostname(value: string) {
  try { return new URL(value).hostname; } catch { return "źródło internetowe"; }
}

function ProductForm({ product, drinkVessels, wineSources, saving, discovering, feedback, feedbackIsError, onSubmit, onImageImport, onRemoveImage, onBackdropImport, onRemoveBackdrop, onRemoveGalleryImage, onSetPrimaryGalleryImage, onRemoveStaffMedia, onDiscover, onDecision }: {
  product: Product;
  drinkVessels: DrinkVessel[];
  wineSources: WineSource[];
  saving: boolean;
  discovering: boolean;
  feedback: string;
  feedbackIsError: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onImageImport: (sourceUrl: string) => Promise<void>;
  onRemoveImage: () => Promise<void>;
  onBackdropImport: (sourceUrl: string) => Promise<void>;
  onRemoveBackdrop: () => Promise<void>;
  onRemoveGalleryImage: (imagePath: string) => Promise<void>;
  onSetPrimaryGalleryImage: (imagePath: string) => Promise<void>;
  onRemoveStaffMedia: (mediaId: string) => Promise<void>;
  onDiscover: (sourceUrl?: string, sourceText?: string) => void;
  onDecision: (sourceId: number, decision: "KEEP_CURRENT" | "FILL_MISSING" | "REPLACE", imageSourceUrl?: string) => void;
}) {
  const [descriptionPl, setDescriptionPl] = useState(product.descriptionPl ?? "");
  const [imageSourceUrl, setImageSourceUrl] = useState(product.imageSourceUrl ?? "");
  const [backdropSourceUrl, setBackdropSourceUrl] = useState("");
  const [drinkVesselId, setDrinkVesselId] = useState(product.drinkVesselId ? String(product.drinkVesselId) : "");
  const [espressoShots, setEspressoShots] = useState(product.espressoShots === null ? "" : String(product.espressoShots));
  const [alcoholMarker, setAlcoholMarker] = useState(Boolean(product.alcoholMarker));
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [selectedImages, setSelectedImages] = useState<Record<number, string>>({});
  const [manualSourceUrl, setManualSourceUrl] = useState("");
  const [manualSourceText, setManualSourceText] = useState("");
  const [manualSearchOpen, setManualSearchOpen] = useState(false);
  const [manualSearchQuery, setManualSearchQuery] = useState(productSearchTitle(product.name));
  const [manualSearchResults, setManualSearchResults] = useState<ProductSearchCandidate[]>([]);
  const [manualSearchBusy, setManualSearchBusy] = useState(false);
  const [manualSearchError, setManualSearchError] = useState("");
  const [manualSearchNextPage, setManualSearchNextPage] = useState(0);
  const [manualSearchKey, setManualSearchKey] = useState("");
  const [manualSearchResultPage, setManualSearchResultPage] = useState(0);
  const productKind = product.wineCode ? "wine" : sectionFor(product.category);
  const forestLifeSyrup = isForestLifeSyrupCategory(product.category);
  const galleryImages = Array.from(new Set([product.imagePath, ...(product.galleryPaths ?? [])].filter((imagePath): imagePath is string => Boolean(imagePath)))).slice(0, 5);
  const selectedDrinkVessel = drinkVessels.find((vessel) => String(vessel.id) === drinkVesselId) ?? null;
  const attributes = product.attributes ?? {};
  const informationDiscoveryEnabled = true;
  const searchKind = productKind === "wine" ? "wino" : productKind === "whisky" ? "whisky koniak brandy" : productKind === "beer" ? "piwo" : productKind === "cocktails" ? "alkohol drink koktajl skład profil smakowy zdjęcie" : "produkt";

  useEffect(() => {
    document.documentElement.dataset.adminFormDirty = "false";
    return () => { document.documentElement.dataset.adminFormDirty = "false"; };
  }, [product.id]);

  function markFormDirty() {
    setHasUnsavedChanges(true);
    document.documentElement.dataset.adminFormDirty = "true";
  }

  async function runManualSearch(firstPage?: number) {
    const query = manualSearchQuery.trim();
    if (!query || manualSearchBusy) return;
    const searchKey = `"${query}" ${searchKind}`;
    const page = firstPage ?? (manualSearchKey === searchKey ? manualSearchNextPage : 0);
    setManualSearchBusy(true);
    setManualSearchError("");
    try {
      const response = await fetch(`/api/admin/product-search?q=${encodeURIComponent(searchKey)}&page=${page}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = await response.json().catch(() => ({})) as { results?: ProductSearchCandidate[]; error?: string };
      if (!response.ok) {
        if (page === 0) setManualSearchResults([]);
        setManualSearchError(body.error ?? (response.status === 401
          ? "Sesja administratora wygasła. Odśwież panel i zaloguj się ponownie."
          : page > 0 ? "Nie znaleziono kolejnej strony wyników." : "Nie udało się wyszukać produktu."));
      } else {
        setManualSearchResults(body.results ?? []);
        setManualSearchKey(searchKey);
        setManualSearchNextPage(page + 1);
        setManualSearchResultPage(page);
        if (!body.results?.length) setManualSearchError(page > 0 ? "Nie znaleziono kolejnych wyników." : "Nie znaleziono wyników. Zmień zapytanie i spróbuj ponownie.");
      }
    } catch (searchError) {
      if (page === 0) setManualSearchResults([]);
      setManualSearchError(`Nie udało się połączyć z wyszukiwarką. ${searchError instanceof Error ? searchError.message : "Spróbuj ponownie."}`);
    } finally {
      setManualSearchBusy(false);
    }
  }

  function openManualSearch() {
    setManualSearchOpen(true);
    setManualSearchResults([]);
    setManualSearchNextPage(0);
    setManualSearchKey("");
    setManualSearchResultPage(0);
    window.setTimeout(() => { void runManualSearch(0); }, 0);
  }

  function chooseManualSearchResult(result: ProductSearchCandidate) {
    setManualSourceUrl(result.url);
    setManualSearchOpen(false);
    void onDiscover(result.url);
  }

  function analyzeManualSourceUrl(rawUrl: string) {
    const sourceUrl = rawUrl.trim();
    try {
      const parsed = new URL(sourceUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    } catch {
      return false;
    }
    setManualSourceUrl(sourceUrl);
    void onDiscover(sourceUrl);
    return true;
  }
  return (
    <form onSubmit={onSubmit} onInput={markFormDirty} noValidate>
      <div className="admin-editor-title">
        <div><span className="admin-eyebrow">{product.category ?? "Bez kategorii"}</span><h2>{product.name}</h2></div>
        <div className={visible(product) ? "admin-visibility is-visible" : "admin-visibility"}>{visibilityLabel(product)}</div>
      </div>

      <div className="admin-source-card">
        <span><b>Cena z Dotykački</b>{product.price ? `${product.price} ${product.currency}` : "—"}</span>
        <span><b>Stan</b>{product.stockDeduct ? (product.stockQuantity ?? "0") : "niekontrolowany"}</span>
        <span><b>Sprzedaż · 30 dni</b>{product.salesSyncedAt ? product.salesCount30d : "raport niepobrany"}</span>
        <span><b>Sprzedaż poniżej stanu</b>{product.stockOverdraft === "DISABLE" ? "zabroniona" : product.stockOverdraft === "WARN" ? "dozwolona z ostrzeżeniem" : "dozwolona"}</span>
        <span><b>Widoczność POS</b>{product.display && !product.deleted ? "tak" : "nie"}</span>
        <span><b>Tag „MENU”</b>{hasTag(product.tags, "MENU") ? "tak" : "nie"}</span>
        <span><b>Tag „PÓŁKA”</b>{isShelfProduct(product.tags) ? "tak" : "nie"}</span>
        {product.allergens.length > 0 && <span><b>Alergeny z POS</b>{product.allergens.join(", ")}</span>}
        <span><b>Identyfikator</b>{product.dotykackaId}</span>
        <span><b>Kod katalogowy</b>{product.catalogCode ?? product.wineCode ?? "brak"}</span>
        {product.licenseCodes.length > 0 && <span><b>Kod koncesyjny</b>{product.licenseCodes.join(", ")}</span>}
        {product.pluCodes.length > 0 && <span><b>Wszystkie PLU</b>{product.pluCodes.join(", ")}</span>}
        {product.eanCodes.length > 0 && <span><b>EAN</b>{product.eanCodes.join(", ")}</span>}
        <span><b>Ostatni dostawca</b>{product.supplierName ?? "jeszcze nierozpoznany"}</span>
      </div>

      {product.catalogCodeCandidates.length > 1 && <div className="admin-alert">W produkcie znaleziono kilka kodów katalogowych: {product.catalogCodeCandidates.join(", ")}. System używa pierwszego — popraw PLU w Dotykačce.</div>}

      {informationDiscoveryEnabled && <details className="admin-wine-sources admin-research-zone" open={wineSources.some((source) => source.status === "PENDING") || undefined}>
        <summary><b>Strefa robocza</b> · informacje i zdjęcia do sprawdzenia {wineSources.some((source) => source.status === "PENDING")&&<span>{wineSources.filter((source) => source.status === "PENDING").length}</span>}</summary>
        <fieldset>
        <legend>Wyszukiwanie danych o produkcie <small>nie są jeszcze treścią menu</small></legend>
        <p className="admin-muted">{productKind === "cocktails" ? "Dla pozycji Alko Baru szukamy rodzaju, alkoholu bazowego, profilu smaku, sposobu podania, pochodzenia, procentu alkoholu, pojemności oraz zdjęć. Najpierw sprawdzamy stronę rozpoznanego dostawcy, a następnie inne publiczne źródła. Żadna propozycja nie trafia do menu bez Twojej decyzji." : "Najpierw sprawdzamy stronę rozpoznanego dostawcy, a przy dostępnym EAN także bezpłatny katalog Open Food Facts. EAN pomaga, ale jego brak nie zatrzymuje procesu. Żadna propozycja nie trafia do menu bez Twojej decyzji."}</p>
        <div className="admin-enrichment-actions">
          <button type="button" className="admin-primary" disabled={discovering || saving} onClick={() => onDiscover()}>{discovering ? "Szukam informacji…" : "Sprawdź bezpłatne źródła"}</button>
          <button type="button" className="admin-secondary" aria-haspopup="dialog" onClick={openManualSearch}>Szukaj ręcznie</button>
          {product.supplierName && <span>Rozpoznany dostawca: <b>{product.supplierName}</b></span>}
        </div>
        <div className="admin-source-url-import">
          <label>Adres znalezionej strony produktu<input type="url" value={manualSourceUrl} onChange={(event) => setManualSourceUrl(event.target.value)} onPaste={(event) => {
            const pastedUrl = event.clipboardData.getData("text").trim();
            if (analyzeManualSourceUrl(pastedUrl)) event.preventDefault();
          }} onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              analyzeManualSourceUrl(manualSourceUrl);
            }
          }} placeholder="https://strona-producenta.pl/produkt…" /></label>
          <button type="button" className="admin-secondary" disabled={discovering || saving || !manualSourceUrl.trim()} onClick={() => analyzeManualSourceUrl(manualSourceUrl)}>{discovering ? "Analizuję stronę…" : "Pobierz dane z tej strony"}</button>
          <label className="admin-source-text">Wklejona treść strony<textarea rows={8} value={manualSourceText} onChange={(event) => setManualSourceText(event.target.value)} placeholder="Dla strony chronionej przed automatycznym odczytem skopiuj opis produktu i tabelę jego cech, a następnie wklej je tutaj." /></label>
          <button type="button" className="admin-secondary" disabled={discovering || saving || manualSourceText.trim().length < 30} onClick={() => onDiscover(manualSourceUrl.trim() || undefined, manualSourceText.trim())}>Odczytaj wklejoną treść</button>
          <small>Wklejenie pełnego adresu lub naciśnięcie Enter od razu rozpoczyna analizę strony. Dane zawsze trafiają najpierw do zatwierdzenia.</small>
        </div>
        {wineSources.length === 0 && <p className="admin-empty-sources">Nie wyszukiwano jeszcze dodatkowych informacji dla tego produktu.</p>}
        {wineSources.map((source) => {
          const proposal = source.proposedContent ?? {};
          const candidates = proposal.imageCandidates ?? (proposal.imageSourceUrl ? [{ url: proposal.imageSourceUrl, sourceUrl: source.sourceUrl ?? proposal.imageSourceUrl }] : []);
          const preserveCurrentImage = Boolean(product.imagePath || product.imageSourceUrl);
          const chosenImage = preserveCurrentImage ? "" : selectedImages[source.id] ?? (candidates.length === 1 ? candidates[0].url : "");
          const sourceUrls = Array.from(new Set([...(proposal.sourceUrls ?? []), source.sourceUrl, source.supplierWebsite].filter((url): url is string => Boolean(url))));
          const proposalEntries: Array<[string, string]> = [
            ...Object.entries(proposal).flatMap(([key, value]) =>
              !["imageSourceUrl", "imageCandidates", "sourceUrls", "attributes"].includes(key) && typeof value === "string" && value.trim()
                ? [[key, value] as [string, string]]
                : []),
            ...Object.entries(proposal.attributes ?? {}).filter((entry): entry is [string, string] => Boolean(entry[1]?.trim())),
          ];
          return <article key={source.id}>
            <div className="admin-source-heading">
              <strong>{source.supplierName ?? "Dostawca nierozpoznany"}</strong>
              <span>{sourceKindLabel(source.sourceKind)} · {[source.ean && `EAN ${source.ean}`, source.supplierProductCode && `kod dostawcy ${source.supplierProductCode}`].filter(Boolean).join(" · ") || "dopasowanie po nazwie produktu"}</span>
              <small>{new Date(source.fetchedAt).toLocaleDateString("pl-PL")}</small>
            </div>
            {sourceUrls.length > 0 && <div className="admin-source-links"><b>Sprawdzone adresy</b>{sourceUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">{url}</a>)}</div>}
            {proposalEntries.length > 0 && <dl className="admin-source-proposal">{proposalEntries.map(([key, value]) => <div key={key}><dt>{proposalLabels[key] ?? key}</dt><dd>{value}</dd></div>)}</dl>}
            {candidates.length > 0 && <div className="admin-image-candidates">
              <b>{preserveCurrentImage ? "Znalezione zdjęcia — obecne zdjęcie pozostanie bez zmian" : candidates.length > 1 ? "Wybierz zdjęcie do zapisania" : "Znalezione zdjęcie"}</b>
              <div>{candidates.map((candidate) => <label key={candidate.url} className={chosenImage === candidate.url ? "is-selected" : ""}>
                {!preserveCurrentImage && <input type="radio" name={`source-image-${source.id}`} value={candidate.url} checked={chosenImage === candidate.url} onChange={() => setSelectedImages((current) => ({ ...current, [source.id]: candidate.url }))} />}
                <img src={candidate.url} alt="Kandydat zdjęcia produktu" />
                <span>{candidate.label || sourceHostname(candidate.sourceUrl)}</span>
              </label>)}</div>
            </div>}
            {source.status === "PENDING" ? <div className="admin-source-decisions">
              <button type="button" disabled={saving} onClick={() => onDecision(source.id, "KEEP_CURRENT")}>Odrzuć propozycję</button>
              <button type="button" disabled={saving || (!preserveCurrentImage && candidates.length > 1 && !chosenImage)} onClick={() => onDecision(source.id, "FILL_MISSING", chosenImage || undefined)}>Uzupełnij tylko braki</button>
              <button type="button" disabled={saving || (!preserveCurrentImage && candidates.length > 1 && !chosenImage)} onClick={() => onDecision(source.id, "REPLACE", chosenImage || undefined)}>Zastosuj wybrane dane</button>
            </div> : <span className="admin-source-result">{source.decision === "KEEP_CURRENT" ? "Propozycja odrzucona — zachowano obecne dane" : "Źródło zaakceptowane — dane przeniesiono do pól publikacyjnych poniżej"}</span>}
          </article>;
        })}
        </fieldset>
      </details>}

      {manualSearchOpen && <div className="admin-search-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setManualSearchOpen(false); }}>
        <section className="admin-search-dialog" role="dialog" aria-modal="true" aria-labelledby="manual-product-search-title">
          <header><div><span className="admin-eyebrow">Wyszukiwanie produktu</span><h3 id="manual-product-search-title">Znajdź właściwe źródło</h3><p>Najpierw pokazujemy polskie strony, a następnie pozostałe źródła.</p></div><button type="button" onClick={() => setManualSearchOpen(false)} aria-label="Zamknij wyszukiwanie">×</button></header>
          <div className="admin-search-dialog-form">
            <input autoFocus value={manualSearchQuery} onChange={(event) => { setManualSearchQuery(event.target.value); setManualSearchResults([]); setManualSearchNextPage(0); setManualSearchKey(""); setManualSearchResultPage(0); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void runManualSearch(); } }} aria-label="Zapytanie wyszukiwania" />
            <button type="button" className="admin-primary" disabled={manualSearchBusy || !manualSearchQuery.trim()} onClick={() => void runManualSearch()}>{manualSearchBusy ? "Szukam…" : manualSearchResults.length ? "Kolejne wyniki" : "Szukaj"}</button>
          </div>
          {manualSearchError && <p className="admin-search-dialog-error">{manualSearchError}</p>}
          <div className="admin-search-results">
            {manualSearchResults.length > 0 && <p className="admin-search-results-page">Strona wyników {manualSearchResultPage + 1}</p>}
            {manualSearchResults.map((result) => <article key={result.url}>
              <div className="admin-search-result-image">{result.imageUrl ? <img src={result.imageUrl} alt="" /> : <span>WWW</span>}</div>
              <div><small>{sourceHostname(result.url)}</small><h4>{result.title}</h4>{result.description && <p>{result.description}</p>}<code>{result.url}</code></div>
              <button type="button" className="admin-secondary" disabled={discovering || saving} onClick={() => chooseManualSearchResult(result)}>Wybierz</button>
            </article>)}
          </div>
          <footer>Po wybraniu wyniku okno zamknie się, a propozycja pojawi się w strefie roboczej produktu. Gdy bezpłatna wyszukiwarka ma chwilowy limit, <a href={manualProductSearchUrl(manualSearchQuery, productKind === "wine" ? "wine" : productKind === "beer" ? "beer" : "product")} target="_blank" rel="noreferrer">otwórz wyniki Google</a>, a następnie wklej adres właściwej karty produktu.</footer>
        </section>
      </div>}

      <section className="admin-publish-zone">
      <header className="admin-publish-heading"><span>Treść publicznego menu</span><div><h3>Dane publikacyjne</h3><p>Te pola odpowiadają temu, co zobaczy gość. Po zaakceptowaniu propozycji z wyszukiwania wartości pojawiają się tutaj automatycznie; możesz je jeszcze poprawić i zapisać.</p></div></header>
      {productKind === "food" && galleryImages.length > 0 ? <div className="admin-gallery-preview">
        <div className="admin-gallery-heading"><span>Galeria „Na słono”</span><b>{galleryImages.length}/5 zdjęć</b></div>
        <div>{galleryImages.map((imagePath, index) => <figure key={imagePath}>
          <img src={imagePath} alt={`${product.name} — zdjęcie ${index + 1}`} />
          <figcaption><span>{index === 0 ? "Zdjęcie główne" : `Zdjęcie ${index + 1}`}</span><button type="button" className={index === 0 ? "admin-gallery-primary is-primary" : "admin-gallery-primary"} aria-pressed={index === 0} disabled={saving || index === 0} onClick={() => void onSetPrimaryGalleryImage(imagePath)}>{index === 0 ? "✓ Pierwsze w menu" : "Ustaw jako pierwsze"}</button><button type="button" className="admin-image-remove" disabled={saving} onClick={() => void onRemoveGalleryImage(imagePath)}>Usuń</button></figcaption>
        </figure>)}</div>
      </div> : (product.imagePath || product.imageSourceUrl) && <div className="admin-image-preview">
        <img src={product.imagePath ?? product.imageSourceUrl ?? ""} alt={`Podgląd: ${product.name}`} />
        <div><span>{product.imagePath ? "Własna kopia zdjęcia zapisana na serwerze" : "Podgląd zdjęcia źródłowego"}</span><button type="button" className="admin-image-remove" disabled={saving} onClick={() => void onRemoveImage()}>Usuń zdjęcie</button></div>
      </div>}

      <fieldset className="admin-content-fields">
        <legend>Zdjęcie i opis produktu</legend>
        <p className="admin-field-help">{productKind === "food" ? "Zdjęcie pobrane z linku staje się zdjęciem głównym. Z urządzenia możesz dodać kilka zdjęć naraz — galeria mieści łącznie maksymalnie 5." : product.imagePath || product.imageSourceUrl ? "Obecne zdjęcie jest chronione. Aby wstawić inne, najpierw użyj przycisku „Usuń zdjęcie” przy podglądzie." : "Możesz wkleić adres zdjęcia albo wybrać plik ze swojego urządzenia."}</p>
        <div className="admin-form-grid">
          <label>Nazwa angielska<input name="nameEn" defaultValue={product.nameEn ?? ""} /></label>
          {!(product.imagePath || product.imageSourceUrl) && <div className="admin-wide admin-image-url-row">
            <label>Link do zdjęcia — pobierzemy kopię<input name="imageSourceUrl" type="url" placeholder="https://…" value={imageSourceUrl} onChange={(event) => setImageSourceUrl(event.target.value)} /></label>
            <button type="button" className="admin-secondary" disabled={saving || !imageSourceUrl.trim()} onClick={() => void onImageImport(imageSourceUrl.trim())}>{saving ? "Pobieram…" : "Pobierz i zapisz zdjęcie"}</button>
            <small>Zdjęcie zapisuje się od razu w naszym zbiorze, niezależnie od pozostałych pól formularza.</small>
          </div>}
          {productKind === "food" ? <label className="admin-wide admin-file-field">Dodaj zdjęcia do galerii<input name="galleryFiles" type="file" multiple disabled={galleryImages.length >= 5} accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif" /><small>{galleryImages.length >= 5 ? "Galeria jest pełna. Usuń zdjęcie, aby dodać inne." : `Możesz dodać jeszcze ${5 - galleryImages.length} ${5 - galleryImages.length === 1 ? "zdjęcie" : "zdjęcia"}.`} Każdy plik może mieć do 50 MB; system automatycznie go zmniejszy i zoptymalizuje.</small></label> : !(product.imagePath || product.imageSourceUrl) && <label className="admin-wide admin-file-field">Albo wybierz zdjęcie z dysku<input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif" /><small>Zdjęcie źródłowe może mieć do 50 MB. System automatycznie zmniejszy je do 1600 px i zapisze plik nie większy niż około 2,4 MB.</small></label>}
          {product.sourceDescription && <div className="admin-wide admin-description-proposal"><span className="admin-eyebrow">Propozycja z Dotykački</span><p>{product.sourceDescription}</p><button type="button" className="admin-secondary" onClick={() => { setDescriptionPl(product.sourceDescription ?? ""); markFormDirty(); }}>Użyj jako opisu w menu</button></div>}
          <label className="admin-wide">Opis polski<textarea name="descriptionPl" rows={4} value={descriptionPl} onChange={(event) => setDescriptionPl(event.target.value)} placeholder="Opis widoczny dla gościa — możesz go poprawić przed publikacją" /></label>
          <label className="admin-wide">Opis angielski<textarea name="descriptionEn" rows={4} defaultValue={product.descriptionEn ?? ""} /></label>
        </div>
        <div className="admin-checks"><label><input type="checkbox" name="autoTranslate" defaultChecked={product.autoTranslate !== false} /> Automatycznie aktualizuj wersję angielską po zmianie polskiej treści</label></div>
        <p className="admin-field-help">Tłumaczenie obejmuje nazwę i opis produktu oraz kraj, region, styl i walory smakowe wina. Nazwy własne win pozostają bez zmian.</p>
      </fieldset>

      {forestLifeSyrup && <fieldset className="admin-syrup-backdrop-fieldset">
        <legend>Tło podglądu syropu <small>oddzielne od zdjęcia butelki</small></legend>
        <p className="admin-field-help">Miniatura i zdjęcie główne pozostają bez zmian. Dodaj, podmień albo usuń wyłącznie fotografię tła. Najlepiej sprawdzi się kadr głównego składnika bez butelki i napisów.</p>
        {(product.detailBackdropPath || product.detailBackdropSourceUrl) && <div className="admin-syrup-backdrop-preview">
          <div>{product.detailBackdropPath && <img className="admin-syrup-backdrop-photo" src={product.detailBackdropPath} alt="Tło podglądu" />}{(product.imagePath || product.imageSourceUrl) && <img className="admin-syrup-backdrop-bottle" src={product.imagePath ?? product.imageSourceUrl ?? ""} alt={`Butelka ${product.name}`} />}<span>LEŚNE ŻYCIE</span></div>
          <button type="button" className="admin-image-remove" disabled={saving} onClick={() => void onRemoveBackdrop()}>Usuń tło</button>
        </div>}
        <div className="admin-form-grid">
          <div className="admin-wide admin-image-url-row">
            <label>Link do nowego zdjęcia tła<input type="url" placeholder="https://…" value={backdropSourceUrl} onChange={(event) => setBackdropSourceUrl(event.target.value)} /></label>
            <button type="button" className="admin-secondary" disabled={saving || !backdropSourceUrl.trim()} onClick={() => void onBackdropImport(backdropSourceUrl.trim())}>{saving ? "Pobieram…" : product.detailBackdropPath || product.detailBackdropSourceUrl ? "Pobierz i podmień tło" : "Pobierz i ustaw jako tło"}</button>
            <small>System zapisze własną, zoptymalizowaną kopię. Nowe tło zastąpi poprzednie, ale nie zmieni zdjęcia butelki.</small>
          </div>
          <label className="admin-wide admin-file-field">{product.detailBackdropPath || product.detailBackdropSourceUrl ? "Podmień tło plikiem z urządzenia" : "Dodaj tło z urządzenia"}<input name="backdropFile" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif" /><small>Zdjęcie zostanie proporcjonalnie zmniejszone do maksymalnie 1600 px bez wycinania tła.</small></label>
        </div>
      </fieldset>}

      <fieldset>
        <legend>Prezentacja w karcie</legend>
        <div className="admin-checks">
          <label><input type="checkbox" name="featured" defaultChecked={product.featured ?? false} /> Polecana pozycja</label>
          <label><input type="checkbox" name="manualHidden" defaultChecked={product.manualHidden ?? false} /> Ukryj ręcznie</label>
        </div>
      </fieldset>

      {productKind === "wine" && <fieldset>
        <legend>Dane wina <small>wypełnij tylko dla win</small></legend>
        <div className="admin-form-grid">
          <label>Kraj<input name="country" defaultValue={product.country ?? ""} /></label>
          <label>Region<input name="region" defaultValue={product.region ?? ""} /></label>
          <label>Szczep / szczepy<input name="grapes" defaultValue={product.grapes ?? ""} /></label>
          <label>Styl<input name="wineStyle" placeholder="np. wytrawne, świeże" defaultValue={product.wineStyle ?? ""} /></label>
          <label>Kolor<select name="wineColor" defaultValue={product.wineColor ?? ""}><option value="">Nie określono</option><option>Białe</option><option>Czerwone</option><option>Różowe</option><option>Pomarańczowe</option></select></label>
          <label>Musowanie<select name="sparklingType" defaultValue={product.sparklingType ?? ""}><option value="">Spokojne (niemusujące)</option><option value="SPARKLING">Musujące</option><option value="NATURALLY_SPARKLING">Naturalnie musujące</option></select></label>
          <label>Poziom słodyczy<select name="sweetness" defaultValue={product.sweetness ?? ""}><option value="">Nie określono</option><option>Wytrawne</option><option>Półwytrawne</option><option>Półsłodkie</option><option>Słodkie</option></select></label>
          <label>Zawartość alkoholu<input name="attribute_alcoholPercentage" placeholder="np. 13%" defaultValue={attributes.alcoholPercentage ?? ""} /></label>
          <label>Objętość butelki<input name="attribute_volume" placeholder="np. 750 ml" defaultValue={attributes.volume ?? ""} /></label>
          <label>Wino wegańskie<select name="veganStatus" defaultValue={product.veganStatus ?? "UNKNOWN"}><option value="UNKNOWN">Brak potwierdzenia</option><option value="YES">Tak — potwierdzone</option><option value="NO">Nie</option></select></label>
          <label className="admin-wide">Walory smakowe<textarea name="tastingNotes" rows={3} placeholder="np. cytrusy · zielone jabłko · mineralność" defaultValue={product.tastingNotes ?? ""} /></label>
        </div>
      </fieldset>}

      {supportsDrinkVessel(productKind, product.category) && <fieldset className="admin-drink-vessel-config">
        <legend>Naczynie i oznaczenia <small>espresso oraz alkohol</small></legend>
        <p className="admin-field-help">Pojemność jest przypisana do ikony naczynia. Cyfra oznacza liczbę espresso, a znak % informuje, że napój zawiera alkohol.</p>
        <div className="admin-form-grid">
          <div className="admin-drink-vessel-picker" role="radiogroup" aria-label="Wybierz naczynie dla napoju">
            <label className={!drinkVesselId ? "is-selected is-empty" : "is-empty"}>
              <span><i>Bez<br/>ikony</i></span>
              <strong>Bez ikony</strong>
              <small>Nie pokazuj naczynia</small>
              <input type="radio" name="drinkVesselId" value="" checked={!drinkVesselId} onChange={(event) => setDrinkVesselId(event.target.value)} />
            </label>
            {drinkVessels.map((vessel) => {
              const selected = String(vessel.id) === drinkVesselId;
              return <label className={selected ? "is-selected" : ""} key={vessel.id}>
                <span>{vessel.iconPath ? <img src={vessel.iconPath} alt="" /> : <i>Ikona<br/>wkrótce</i>}</span>
                <strong>{vessel.name}</strong>
                <small>{vessel.capacityMl} ml</small>
                <input type="radio" name="drinkVesselId" value={vessel.id} checked={selected} onChange={(event) => setDrinkVesselId(event.target.value)} />
              </label>;
            })}
          </div>
          <label>Liczba espresso<select name="espressoShots" value={espressoShots} onChange={(event) => setEspressoShots(event.target.value)}><option value="">Bez oznaczenia</option><option value="0">0 espresso</option><option value="1">1 espresso</option><option value="2">2 espresso</option></select></label>
          <label className="admin-alcohol-marker"><input type="checkbox" name="alcoholMarker" checked={alcoholMarker} onChange={(event) => setAlcoholMarker(event.target.checked)} /><span><b>%</b> Napój z alkoholem</span></label>
          {selectedDrinkVessel && <div className="admin-drink-vessel-preview" aria-label={`Podgląd: ${selectedDrinkVessel.name}, ${selectedDrinkVessel.capacityMl} ml${espressoShots !== "" ? `, ${espressoShots} espresso` : ""}${alcoholMarker ? ", zawiera alkohol" : ""}`}>
            <span>{selectedDrinkVessel.iconPath ? <img src={selectedDrinkVessel.iconPath} alt="" /> : <i>ikona<br/>wkrótce</i>}{espressoShots !== "" && <b>{espressoShots}</b>}{alcoholMarker && <em className="admin-drink-vessel-alcohol">%</em>}</span><strong>{selectedDrinkVessel.capacityMl} ml</strong><small>{selectedDrinkVessel.name}</small>
          </div>}
          {!drinkVessels.length && <aside className="admin-wide admin-drink-vessel-empty">Katalog naczyń jest gotowy, ale pusty. Ikony i pojemności dodamy po otrzymaniu zdjęć.</aside>}
        </div>
      </fieldset>}

      {productKind !== "wine" && <ProductFeatureFields kind={productKind} attributes={attributes} />}

      <section className="admin-staff-manual-zone">
        <header><span>TYLKO DLA PERSONELU</span><div><h3>Instrukcja przygotowania</h3><p>Ta treść nie pojawia się w menu gościa. Pracownik otworzy ją trzema szybkimi dotknięciami zdjęcia produktu w ekranie zamówień.</p></div></header>
        <label>Opis, manual i wskazówki<textarea name="staffInstructions" rows={8} defaultValue={product.staffInstructions ?? ""} maxLength={12000} placeholder={"Przykład:\n• szkło: highball\n• lód: 5 dużych kostek\n• kolejność składników i proporcje\n• dekoracja oraz sposób podania"}/></label>
        {(product.staffMedia?.length ?? 0) > 0 && <div className="admin-staff-media-gallery">{product.staffMedia?.map((media) => <figure key={media.id}>{media.type === "IMAGE" ? <img src={media.path} alt={media.name}/> : <video src={media.path} muted playsInline controls preload="metadata"/>}<figcaption>{media.name}</figcaption><button type="button" aria-label={`Usuń ${media.name}`} disabled={saving} onClick={() => void onRemoveStaffMedia(media.id)}>×</button></figure>)}</div>}
        <label className="admin-staff-media-upload">Dodaj zdjęcia lub filmy<input name="staffMediaFiles" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,image/gif,video/quicktime,video/x-m4v,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif,.gif,.mov,.m4v,.mp4,.webm" disabled={(product.staffMedia?.length ?? 0) >= 8}/><small>Do 8 plików na produkt. Film MOV, MP4 lub WebM może mieć do 95 MB i zostanie automatycznie zmniejszony oraz przekonwertowany do zgodnego MP4.</small></label>
      </section>

      <div className="admin-savebar">
        <div className={`admin-save-state ${feedbackIsError ? "is-error" : saving ? "is-saving" : hasUnsavedChanges ? "is-dirty" : "is-saved"}`} aria-live="polite">
          <i aria-hidden="true" />
          <div>
            <strong>{feedbackIsError ? "Zapis nie powiódł się" : saving ? "Trwa zapisywanie…" : hasUnsavedChanges ? "Masz niezapisane zmiany" : product.contentApproved ? "Zmiany są zapisane" : "Produkt czeka na pierwszy zapis"}</strong>
            <span>{feedback || `Treść pozostanie w naszej bazie po synchronizacji z Dotykačką.${product.contentUpdatedAt ? ` Ostatni trwały zapis: ${new Date(product.contentUpdatedAt).toLocaleString("pl-PL")}.` : ""}`}</span>
          </div>
        </div>
        <button type="submit" className="admin-primary admin-save-button" disabled={saving}>{saving ? "Zapisuję…" : "Zapisz zmiany"}</button>
      </div>
      </section>
    </form>
  );
}

function ProductFeatureFields({ kind, attributes }: { kind: string; attributes: Record<string, string> }) {
  const input = (name: typeof attributeKeys[number], label: string, placeholder?: string) => <label key={name}>{label}<input name={`attribute_${name}`} defaultValue={attributes[name] ?? ""} placeholder={placeholder} /></label>;
  const wide = (name: typeof attributeKeys[number], label: string, placeholder?: string) => <label className="admin-wide" key={name}>{label}<textarea name={`attribute_${name}`} rows={2} defaultValue={attributes[name] ?? ""} placeholder={placeholder} /></label>;
  const fields = kind === "whisky" ? [
    input("spiritType", "Rodzaj trunku", "np. whisky szkocka, bourbon, koniak, brandy"),
    input("spiritStyle", "Styl", "np. single malt, blended"),
    input("origin", "Kraj lub region pochodzenia"),
    input("ageStatement", "Wiek", "np. 12 lat lub bez oznaczenia wieku"),
    input("alcoholPercentage", "Zawartość alkoholu", "np. 40%"),
    input("tasteProfile", "Dominujący profil smaku", "np. owocowy, waniliowo-karmelowy, dymny"),
    input("caskType", "Rodzaj beczki", "np. bourbon i sherry"),
    input("volume", "Pojemność produktu źródłowego", "nie zmienia porcji 50 ml w menu"),
  ] : kind === "beer" ? [
    input("alcoholPercentage", "Zawartość alkoholu", "np. 5,2%"),
    input("beerStyle", "Styl / rodzaj piwa", "np. lager, stout, IPA"),
    input("origin", "Kraj lub region pochodzenia"),
    input("volume", "Sposób podania / objętość", "np. 0,33 l"),
  ] : kind === "tea" ? [
    input("teaType", "Rodzaj herbaty", "np. czarna, zielona, ziołowa"),
    input("origin", "Kraj lub region pochodzenia"),
    input("brewTemperature", "Temperatura parzenia", "np. 80°C"),
    input("brewTime", "Czas parzenia", "np. 2–3 min"),
  ] : kind === "coffee" || kind === "matcha" ? [
    input("coffeeOrigin", "Pochodzenie / mieszanka"),
    input("coffeeProfile", "Profil smakowy"),
    wide("coffeeModifiers", "Dostępne modyfikacje", "np. mleko owsiane · dodatkowe espresso"),
  ] : kind === "cakes" ? [
    input("producer", "Producent"),
    wide("dietaryInfo", "Cechy szczególne", "np. wegańskie · bez glutenu"),
  ] : kind === "cocktails" ? [
    input("cocktailType", "Rodzaj pozycji", "np. spritz, koktajl klasyczny, sour, shot, alkohol na butelkę"),
    input("cocktailBase", "Alkohol bazowy", "np. gin · wódka · rum; pierwszy składnik traktujemy jako dominujący"),
    input("tasteProfile", "Profil smakowy", "np. wytrawny · cytrusowy · gorzki"),
    input("servingStyle", "Sposób podania", "np. coupe albo highball; wybierz główny sposób"),
    input("alcoholPercentage", "Zawartość alkoholu", "np. 40% dla czystego alkoholu; opcjonalnie dla koktajlu"),
    input("origin", "Kraj lub region pochodzenia", "szczególnie dla alkoholi butelkowych"),
    input("volume", "Pojemność / porcja", "np. 40 ml, 700 ml"),
  ] : kind === "cold" || kind === "zero" ? [
    input("volume", "Objętość / wariant"),
    input("origin", "Producent lub pochodzenie"),
    wide("dietaryInfo", "Cechy szczególne"),
  ] : [
    input("producer", "Producent / autor produktu"),
    wide("dietaryInfo", "Cechy szczególne", "np. wegańskie · bez glutenu"),
  ];
  return <fieldset><legend>Cechy produktu</legend><p className="admin-field-help">Pokazujemy wyłącznie pola pasujące do tej kategorii. Puste informacje nie pojawią się w menu.</p><div className="admin-form-grid">{fields}</div></fieldset>;
}
