"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { sectionFor } from "../../lib/menu-categories";
import { manualProductSearchUrl, productSearchTitle } from "../../lib/manual-product-search";
import { hasTag, isShelfProduct, shelfHasPositiveStock } from "../../lib/menu-tags";

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
  featured: boolean | null;
  featuredSortOrder: number | null;
  contentApproved: boolean | null;
  hideWhenOutOfStock: boolean | null;
  manualHidden: boolean | null;
  country: string | null;
  region: string | null;
  grapes: string | null;
  wineStyle: string | null;
  wineColor: string | null;
  sparklingType: "SPARKLING" | "NATURALLY_SPARKLING" | null;
  sweetness: string | null;
  veganStatus: "YES" | "NO" | "UNKNOWN";
  tastingNotes: string | null;
  attributes: Record<string, string> | null;
  staffInstructions: string | null;
  staffMedia: StaffManualMedia[] | null;
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
type VisibilityFilter = "visible" | "hidden" | "all";
type ProductStatusKind = "approved" | "needs-review" | "dotykacka-hidden" | "menu-hidden";
type ProductStatusFilter = "all" | ProductStatusKind;

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

const editable = ["nameEn", "descriptionPl", "descriptionEn", "imageSourceUrl", "country", "region", "grapes", "wineStyle", "wineColor", "sparklingType", "sweetness", "veganStatus", "tastingNotes", "staffInstructions"] as const;
const attributeKeys = ["alcoholPercentage", "beerStyle", "origin", "teaType", "brewTemperature", "brewTime", "coffeeOrigin", "coffeeProfile", "coffeeModifiers", "producer", "dietaryInfo", "cocktailBase", "tasteProfile", "volume", "spiritType", "spiritStyle", "ageStatement", "caskType"] as const;

const MAX_LOCAL_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_STORED_IMAGE_BYTES = 2_400_000;

async function prepareLocalImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) throw new Error("Wybierz zdjęcie JPG, PNG, WebP lub AVIF.");
  if (file.size > MAX_LOCAL_IMAGE_BYTES) throw new Error("Plik źródłowy jest większy niż 15 MB.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Nie udało się odczytać tego zdjęcia. Zapisz je jako JPG lub PNG i spróbuj ponownie.");
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
        const baseName = file.name.replace(/\.[^.]+$/, "") || "zdjecie";
        return new File([blob], `${baseName}.webp`, { type: "image/webp" });
      }
    }
  } finally {
    bitmap.close();
  }
  throw new Error("Nie udało się zmniejszyć zdjęcia poniżej bezpiecznego limitu 2,5 MB.");
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
    ],
  },
  {
    title: "Treści, zdjęcia i tłumaczenia",
    lead: "Dotykačka dostarcza sprzedaż, a nasza baza przechowuje prezentację produktu.",
    rules: [
      ["Nasz panel", "Opis z Dotykački trafia do panelu jako propozycja. Gość zobaczy dopiero opis przyjęty lub napisany w naszym panelu, więc nie powielamy roboczej treści z POS."],
      ["Nasz panel", "Zatwierdzone opisy, tłumaczenia, zdjęcia i dodatkowe informacje zapisujemy w naszej bazie; nie znikają podczas synchronizacji z POS."],
      ["Nasz panel", "Zdjęcie można pobrać z linku albo wybrać z dysku. Plik z urządzenia jest automatycznie zmniejszany do maksymalnie 1600 px i zapisywany w formacie WebP; serwer przyjmuje najwyżej 2,5 MB."],
      ["Automatycznie", "Dla produktu już opisanego kolejna dostawa nie wstrzymuje sprzedaży i nie zastępuje zatwierdzonej treści."],
      ["Nasz panel", "Przy nowym źródle można wybrać: zachowaj obecne dane, uzupełnij tylko braki albo zastąp dane informacjami z nowego źródła."],
      ["Automatycznie", "Dla win i piw system najpierw sprawdza stronę rozpoznanego dostawcy, a produkt z EAN także w bezpłatnym katalogu Open Food Facts. EAN nie jest wymagany."],
      ["Nasz panel", "Jeśli automatyczne źródła nie wystarczą, przycisk otwiera centralne okno wyszukiwania wewnątrz panelu. Wybranie wyniku od razu pobiera pola oraz zdjęcia do akceptacji, bez opuszczania edytowanego produktu."],
      ["Automatycznie", "Na stronie produktu system odczytuje dane strukturalne sklepu, tabele oraz pary etykieta–wartość, np. Kraj—Włochy lub Grona—Montepulciano. Teksty ogólne, stopka oraz polecane produkty nie mogą nadpisywać kraju, regionu, szczepu ani stylu."],
      ["Nasz panel", "Znalezione opisy, parametry, adresy źródeł i zdjęcia są wyłącznie propozycją. Przed publikacją wybieramy właściwe zdjęcie i akceptujemy uzupełnienie danych."],
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
      ["Automatycznie", "Wybór ziarna jest pokazany raz dla całej podgrupy kaw alternatywnych. Nazwy, profile smakowe, opisy i tłumaczenia są pobierane oraz aktualizowane systemowo."],
      ["Automatycznie", "W strefie kelnera dotknięcie „+” przy produkcie mającym dodatki otwiera wybór wariantu dla jednej właśnie dodawanej sztuki. Produkty bez dodatków trafiają do zamówienia od razu."],
      ["Automatycznie", "Każda konfiguracja jest osobną linią zamówienia. Dwie latte mogą więc wystąpić oddzielnie: jedna standardowa, a druga np. ze zmianą mleka na kokosowe."],
      ["Automatycznie", "Cena dodatku jest doliczana do ceny jednej skonfigurowanej pozycji. Nazwa wariantu oraz jego cena pochodzą z aktualnych połączeń produktów w Dotykačce."],
      ["Zawsze", "Przy kawie alternatywnej wybór ziarna jest obowiązkowy. System nie pozwala dodać tej pozycji ani wysłać nieistniejącego dodatku lub dwóch wariantów z tej samej grupy."],
    ],
  },
  {
    title: "Wina i alkohole",
    lead: "Jedna czytelna karta trunku może łączyć kilka sposobów sprzedaży.",
    rules: [
      ["Dotykačka", "Butelkę i kieliszek tworzymy jako osobne produkty z osobnymi cenami; cena butelki nie wynika z iloczynu kieliszków ani shotów."],
      ["Dotykačka", "Produkt butelkowy nazywamy samą nazwą wina. Tylko przy drugim produkcie dopisujemy „kieliszek”, aby obsługa rozpoznawała go w POS."],
      ["Dotykačka", "Produkt kieliszkowy oznaczamy tagiem KIELISZEK i łączymy recepturą z właściwą butelką."],
      ["Automatycznie", "Produkty z tym samym kodem WIN są łączone w menu w jedną kartę. Nazwa i opis pochodzą z butelki, a produkt kieliszkowy dodaje wyłącznie ikonę i osobną cenę."],
      ["Automatycznie", "Dotknięcie wina otwiera na środku ekranu jego pełny opis, pochodzenie, szczep, styl, aromaty oraz ceny kieliszka i butelki."],
      ["Automatycznie", "Podgląd wina powtarza aktualne oznaczenia wynikające z reguł: „Wybór naszych gości”, „Polecamy”, „Na kieliszki”, „Wegańskie” i „0%”."],
      ["Automatycznie", "Pozycja z „kieliszek” w nazwie jest zawsze ukrywana jako samodzielny produkt. Pojawi się przy butelce po uzupełnieniu wspólnego kodu WINxxx i tagu KIELISZEK; EAN jest pomocny, ale opcjonalny."],
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
      ["Dotykačka", "Lista pracowników pochodzi wyłącznie z Dotykački. W panelu „Kelnerzy i PIN-y” pokazujemy tylko osoby aktywne i nieusunięte; wyłączenie pracownika w POS odbiera mu dostęp po synchronizacji."],
      ["Nasz panel", "Administrator nadaje pracownikowi indywidualny PIN w ekranie „Kelnerzy i PIN-y”. Nasza baza nie przechowuje PIN-u — zapisuje wyłącznie jego nieodwracalny, losowo solony skrót scrypt."],
      ["Automatycznie", "Po pięciu błędnych próbach logowania urządzenie jest czasowo blokowane. Sesja kelnera jest krótka, podpisana i dostępna tylko dla aktywnego pracownika."],
      ["Dotykačka", "Nazwy i identyfikatory stolików są synchronizowane z Dotykački. Kelner wybiera stolik i liczbę gości przed sprawdzeniem zamówienia."],
      ["Automatycznie", "Katalog kelnera stosuje te same reguły dostępności co menu gościa. Produkt z tagiem PÓŁKA można dodać tylko przy stanie większym od zera; pusty, zerowy lub ujemny stan ukrywa go w obu widokach."],
      ["Dotykačka", "Osobny widok „Poza menu” zawiera aktywne, nieusunięte produkty oznaczone w Dotykačce jako wyświetlane, które nie mają tagu MENU ani PÓŁKA. Kelner może je zamówić, ale nigdy nie trafiają one do karty gościa ani panelu redakcyjnego produktów menu."],
      ["Automatycznie", "Każdy produkt ma sterowanie ilością. Przed wysłaniem można zmienić ilości, usunąć pozycje, dopisać uwagę do konkretnej konfiguracji oraz uwagę do całego zamówienia."],
      ["Nasz panel", "Pytania ankiety definiujemy, porządkujemy, włączamy i wyłączamy w ekranie „Kelnerzy i PIN-y”. Dostępne są pytania Tak/Nie oraz wybór jednej z własnych odpowiedzi; pytanie może być obowiązkowe."],
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
    tag: "PÓŁKA",
    aliases: "POLKA",
    area: "Z półki",
    effect: "Dodaje produkt do zakładki „Z PÓŁKI” i grupuje go tam według jego kategorii z Dotykački.",
    condition: "Może działać samodzielnie bez MENU. Z tagiem MENU produkt pozostaje także we wszystkich zwykłych sekcjach wynikających z pozostałych tagów; przy zerowym stanie jego kopia w „Z PÓŁKI” znika.",
    kind: "offer",
  },
] as const;

function visible(product: Product) {
  if (!product.menuTagged || !product.display || product.deleted || product.manualHidden) return false;
  const regularStockVisible = !(product.stockDeduct && product.stockOverdraft === "DISABLE" && Number(product.stockQuantity ?? 0) <= 0);
  return (hasTag(product.tags, "MENU") && regularStockVisible)
    || (isShelfProduct(product.tags) && shelfHasPositiveStock(product.stockQuantity));
}

function visibilityLabel(product: Product) {
  const regularStockVisible = !(product.stockDeduct && product.stockOverdraft === "DISABLE" && Number(product.stockQuantity ?? 0) <= 0);
  const regular = hasTag(product.tags, "MENU") && regularStockVisible;
  const shelf = isShelfProduct(product.tags) && shelfHasPositiveStock(product.stockQuantity);
  if (regular && shelf) return "Widoczny w menu i Z PÓŁKI";
  if (shelf) return "Widoczny w Z PÓŁKI";
  if (regular) return "Widoczny w menu";
  return "Ukryty w menu";
}

function productListStatus(product: Product): { kind: ProductStatusKind; className: string; label: string } {
  if (product.manualHidden) return { kind: "menu-hidden", className: "admin-dot is-menu-hidden", label: "Ukryty ręcznie tylko w naszym cyfrowym menu" };
  if (!visible(product)) return { kind: "dotykacka-hidden", className: "admin-dot", label: "Ukryty przez ustawienia Dotykački lub brak stanu" };
  if (!product.contentApproved) return { kind: "needs-review", className: "admin-dot needs-review", label: `${visibilityLabel(product)}, ale wymaga ręcznego przeglądu i zatwierdzenia treści` };
  return { kind: "approved", className: "admin-dot is-visible", label: `${visibilityLabel(product)} — zatwierdzony` };
}

export default function AdminPanel() {
  const [view, setView] = useState<"connection" | "products" | "categories" | "productOrder" | "offers" | "promotions" | "audit" | "rules">("products");
  const [products, setProducts] = useState<Product[]>([]);
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
  const [offerSettings, setOfferSettings] = useState<OfferSettings | null>(null);
  const [draggedProductId, setDraggedProductId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Wszystkie");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("visible");
  const [productStatusFilter, setProductStatusFilter] = useState<ProductStatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dotykackaStatus, setDotykackaStatus] = useState<DotykackaStatus | null>(null);

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
    setSelectedId((current) => preferredId ?? current ?? rows[0]?.id ?? null);
    setLoading(false);
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

  async function loadDotykackaStatus() {
    setError("");
    const response = await fetch("/api/admin/dotykacka/status", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as DotykackaStatus & { error?: string };
    if (!response.ok) return setError(body.error ?? "Nie udało się sprawdzić połączenia.");
    setDotykackaStatus(body);
  }

  // Initial data hydration; subsequent refreshes keep the current selection.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadProducts(); }, []);

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

  const categories = useMemo(() => ["Wszystkie", ...Array.from(new Set(products.map((product) => product.category ?? "Bez kategorii")))], [products]);
  const productsMatchingMainFilters = useMemo(() => {
    const phrase = query.trim().toLocaleLowerCase("pl");
    return products.filter((product) =>
      (category === "Wszystkie" || (product.category ?? "Bez kategorii") === category)
      && (visibilityFilter === "all" || (visibilityFilter === "visible" ? visible(product) : !visible(product)))
      && (!phrase || `${product.name} ${product.nameEn ?? ""} ${product.tags.join(" ")}`.toLocaleLowerCase("pl").includes(phrase))
    );
  }, [products, query, category, visibilityFilter]);
  const productStatusCounts = useMemo(() => {
    const counts: Record<ProductStatusKind, number> = { approved: 0, "needs-review": 0, "dotykacka-hidden": 0, "menu-hidden": 0 };
    productsMatchingMainFilters.forEach((product) => { counts[productListStatus(product).kind] += 1; });
    return counts;
  }, [productsMatchingMainFilters]);
  const filtered = useMemo(() => productStatusFilter === "all"
    ? productsMatchingMainFilters
    : productsMatchingMainFilters.filter((product) => productListStatus(product).kind === productStatusFilter),
  [productsMatchingMainFilters, productStatusFilter]);
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
    if (/(?:^|[\s_\-/])kieliszek(?:$|[\s_\-/])/i.test(product.name) && !product.tags.some((tag) => tag.trim().toLocaleLowerCase("pl") === "kieliszek")) add("wine", "Kieliszek jest ukryty: brak tagu KIELISZEK");
    if (kind === "beer" && !product.attributes?.alcoholPercentage?.trim()) add("beer", "Brak zawartości alkoholu");
    if (kind === "whisky" && !product.attributes?.spiritType?.trim()) add("description", "Brak rodzaju trunku (whisky, bourbon, koniak lub brandy)");
    return issues;
  }), [products]);

  function editAuditProduct(productId: number) {
    setSelectedId(productId);
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
    const staffMediaFiles = form.getAll("staffMediaFiles").filter((item): item is File => item instanceof File && item.size > 0);
    const payload: Record<string, unknown> = {};
    for (const key of editable) payload[key] = String(form.get(key) ?? "").trim() || null;
    // Non-wine forms do not render this select. Sending null used to make the
    // API reject the entire product update, including an otherwise valid text.
    payload.veganStatus = String(form.get("veganStatus") ?? selected.veganStatus ?? "UNKNOWN").trim() || "UNKNOWN";
    payload.attributes = Object.fromEntries(attributeKeys.map((key) => [key, String(form.get(`attribute_${key}`) ?? "").trim()]).filter(([, value]) => value));
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
      let staffMediaSaved = 0;
      if (staffMediaFiles.length > 0) {
        try {
          const upload = new FormData();
          for (const file of staffMediaFiles) {
            const prepared = file.type.startsWith("image/") && file.type !== "image/gif" ? await prepareLocalImage(file) : file;
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
      if ((!localImage || !(localImage instanceof File) || !localImage.size || imageSaved) && (!staffMediaFiles.length || staffMediaSaved > 0)) {
        const suffix = `${imageSaved ? " Zdjęcie produktu zostało zmniejszone i zapisane na serwerze." : ""}${staffMediaSaved ? ` Dodano ${staffMediaSaved} plików instrukcji.` : ""}`;
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
        <div>
          <span className="admin-eyebrow">Cyfrowa karta kawiarni</span>
          <h1>Zarządzanie menu</h1>
        </div>
        <div className="admin-top-actions">
          <a className="admin-secondary" href="/admin/waiters">Kelnerzy i PIN-y</a>
          <a className="admin-secondary" href="/admin/settlements">Rozliczenia</a>
          <a className="admin-secondary" href="/admin/inventory">Inwentaryzacja</a>
          <button className="admin-primary" onClick={sync} disabled={syncing}>{syncing ? "Synchronizuję…" : "Synchronizuj z Dotykačką"}</button>
          <button className="admin-secondary" onClick={logout}>Wyloguj</button>
        </div>
      </header>

      {(message || error) && <div className={error ? "admin-status is-error" : "admin-status"}>{error || message}</div>}

      <nav className="admin-view-tabs" aria-label="Sekcje panelu">
        <button className={view === "connection" ? "is-active" : ""} onClick={() => setView("connection")}>Połączenie</button>
        <button className={view === "products" ? "is-active" : ""} onClick={() => setView("products")}>Produkty</button>
        <button className={view === "categories" ? "is-active" : ""} onClick={() => setView("categories")}>Zakładki i kody PLU</button>
        <button className={view === "productOrder" ? "is-active" : ""} onClick={() => setView("productOrder")}>Podgrupy i produkty</button>
        <button className={view === "offers" ? "is-active" : ""} onClick={() => setView("offers")}>Oferty czasowe</button>
        <button className={view === "promotions" ? "is-active" : ""} onClick={() => setView("promotions")}>Polecane</button>
        <button className={view === "audit" ? "is-active" : ""} onClick={() => setView("audit")}>Kontrola karty{auditIssues.length ? ` (${auditIssues.length})` : ""}</button>
        <button className={view === "rules" ? "is-active" : ""} onClick={() => setView("rules")}>Dokumentacja i reguły</button>
      </nav>

      {view === "connection" ? <DotykackaConnectionView key={`${dotykackaStatus?.cloudId ?? "loading"}-${dotykackaStatus?.warehouseId ?? ""}-${dotykackaStatus?.branchId ?? ""}-${dotykackaStatus?.stockWebhookRegistered ?? false}`} status={dotykackaStatus} saving={saving} onSave={saveDotykackaSettings} onEnableStockWebhook={enableStockWebhook} onHistoryApplied={async () => { await loadProducts(selectedId ?? undefined); }} /> : view === "products" ? <section className="admin-workspace">
        <aside className="admin-products">
          <div className="admin-list-head">
            <strong>Produkty</strong><span>{filtered.length} / {products.length}</span>
          </div>
          <div className="admin-dot-filter-label">Doprecyzuj wyniki według kropki:</div>
          <div className="admin-dot-legend" aria-label="Filtr statusu produktów">
            <button type="button" className={productStatusFilter === "all" ? "is-active" : ""} aria-pressed={productStatusFilter === "all"} onClick={() => setProductStatusFilter("all")}>
              wszystkie <b>{productsMatchingMainFilters.length}</b>
            </button>
            <button type="button" className={productStatusFilter === "approved" ? "is-active" : ""} aria-pressed={productStatusFilter === "approved"} onClick={() => setProductStatusFilter("approved")}>
              <i className="admin-dot is-visible" />widoczne i zatwierdzone <b>{productStatusCounts.approved}</b>
            </button>
            <button type="button" className={productStatusFilter === "needs-review" ? "is-active" : ""} aria-pressed={productStatusFilter === "needs-review"} onClick={() => setProductStatusFilter("needs-review")}>
              <i className="admin-dot needs-review" />wymagają uwagi <b>{productStatusCounts["needs-review"]}</b>
            </button>
            <button type="button" className={productStatusFilter === "dotykacka-hidden" ? "is-active" : ""} aria-pressed={productStatusFilter === "dotykacka-hidden"} onClick={() => setProductStatusFilter("dotykacka-hidden")}>
              <i className="admin-dot" />ukryte przez Dotykačkę lub brak stanu <b>{productStatusCounts["dotykacka-hidden"]}</b>
            </button>
            <button type="button" className={productStatusFilter === "menu-hidden" ? "is-active" : ""} aria-pressed={productStatusFilter === "menu-hidden"} onClick={() => setProductStatusFilter("menu-hidden")}>
              <i className="admin-dot is-menu-hidden" />ukryte ręcznie w naszym menu <b>{productStatusCounts["menu-hidden"]}</b>
            </button>
          </div>
          <input className="admin-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Szukaj produktu…" />
          <select className="admin-select" aria-label="Widoczność produktów" value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value as VisibilityFilter)}>
            <option value="visible">Widoczne w menu</option>
            <option value="hidden">Ukryte</option>
            <option value="all">Wszystkie</option>
          </select>
          <select className="admin-select" value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
          <div className="admin-product-list">
            {loading && <p className="admin-muted">Pobieram produkty…</p>}
            {!loading && !error && filtered.length === 0 && <p className="admin-muted">Brak produktów spełniających wybrane kryteria.</p>}
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
          {!selected && <div className="admin-empty"><h2>Wybierz produkt</h2><p>Po lewej pojawią się towary oznaczone w Dotykačce atrybutem „menu”.</p></div>}
          {selected && <ProductForm key={`${selected.id}-${selected.syncedAt}-${selected.contentUpdatedAt ?? "new"}`} product={selected} wineSources={wineSources} saving={saving} discovering={enriching} feedback={error || message} feedbackIsError={Boolean(error)} onSubmit={save} onImageImport={importImageFromUrl} onRemoveImage={removeProductImage} onRemoveStaffMedia={removeStaffMedia} onDiscover={discoverProductInformation} onDecision={decideWineSource} />}
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
      </section> : <RulesView />}
    </main>
  );
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
        <div><span className="admin-eyebrow">Słownik Dotykački</span><h3 id="admin-tag-reference-title">Tagi rozpoznawane przez menu</h3></div>
        <p>Wielkość liter nie ma znaczenia. Tagi sumują swoje działanie: <strong>MENU</strong> publikuje produkt w zwykłych sekcjach, a <strong>PÓŁKA</strong> dodaje go również do karty „Z PÓŁKI”. Sam tag PÓŁKA publikuje produkt tylko w tej karcie.</p>
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
    <p className="admin-rules-footer">Ostatnia aktualizacja zasad: 14 września 2026. Reguły aktualizujemy razem z rozwojem systemu.</p>
  </section>;
}

const proposalLabels: Record<string, string> = {
  descriptionPl: "Opis", country: "Kraj", region: "Region", grapes: "Szczep",
  wineStyle: "Styl", wineColor: "Kolor", sparklingType: "Musowanie", sweetness: "Poziom słodyczy",
  veganStatus: "Wegańskie", tastingNotes: "Aromaty", alcoholPercentage: "Alkohol",
  beerStyle: "Styl piwa", origin: "Pochodzenie", volume: "Objętość",
  spiritType: "Rodzaj trunku", spiritStyle: "Styl", ageStatement: "Wiek", caskType: "Beczka", tasteProfile: "Profil smaku",
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

function ProductForm({ product, wineSources, saving, discovering, feedback, feedbackIsError, onSubmit, onImageImport, onRemoveImage, onRemoveStaffMedia, onDiscover, onDecision }: {
  product: Product;
  wineSources: WineSource[];
  saving: boolean;
  discovering: boolean;
  feedback: string;
  feedbackIsError: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onImageImport: (sourceUrl: string) => Promise<void>;
  onRemoveImage: () => Promise<void>;
  onRemoveStaffMedia: (mediaId: string) => Promise<void>;
  onDiscover: (sourceUrl?: string, sourceText?: string) => void;
  onDecision: (sourceId: number, decision: "KEEP_CURRENT" | "FILL_MISSING" | "REPLACE", imageSourceUrl?: string) => void;
}) {
  const [descriptionPl, setDescriptionPl] = useState(product.descriptionPl ?? "");
  const [imageSourceUrl, setImageSourceUrl] = useState(product.imageSourceUrl ?? "");
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
  const attributes = product.attributes ?? {};
  const informationDiscoveryEnabled = true;
  const searchKind = productKind === "wine" ? "wino" : productKind === "whisky" ? "whisky koniak brandy" : productKind === "beer" ? "piwo" : "produkt";

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
        <p className="admin-muted">Najpierw sprawdzamy stronę rozpoznanego dostawcy, a przy dostępnym EAN także bezpłatny katalog Open Food Facts. EAN pomaga, ale jego brak nie zatrzymuje procesu. Żadna propozycja nie trafia do menu bez Twojej decyzji.</p>
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
          const chosenImage = selectedImages[source.id] ?? (candidates.length === 1 ? candidates[0].url : "");
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
              <b>{candidates.length > 1 ? "Wybierz zdjęcie do zapisania" : "Znalezione zdjęcie"}</b>
              <div>{candidates.map((candidate) => <label key={candidate.url} className={chosenImage === candidate.url ? "is-selected" : ""}>
                <input type="radio" name={`source-image-${source.id}`} value={candidate.url} checked={chosenImage === candidate.url} onChange={() => setSelectedImages((current) => ({ ...current, [source.id]: candidate.url }))} />
                <img src={candidate.url} alt="Kandydat zdjęcia produktu" />
                <span>{candidate.label || sourceHostname(candidate.sourceUrl)}</span>
              </label>)}</div>
            </div>}
            {source.status === "PENDING" ? <div className="admin-source-decisions">
              <button type="button" disabled={saving} onClick={() => onDecision(source.id, "KEEP_CURRENT")}>Odrzuć propozycję</button>
              <button type="button" disabled={saving || (candidates.length > 1 && !chosenImage)} onClick={() => onDecision(source.id, "FILL_MISSING", chosenImage)}>Uzupełnij tylko braki</button>
              <button type="button" disabled={saving || (candidates.length > 1 && !chosenImage)} onClick={() => onDecision(source.id, "REPLACE", chosenImage)}>Zastosuj wybrane dane</button>
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
      {(product.imagePath || product.imageSourceUrl) && <div className="admin-image-preview">
        <img src={product.imagePath ?? product.imageSourceUrl ?? ""} alt={`Podgląd: ${product.name}`} />
        <div><span>{product.imagePath ? "Własna kopia zdjęcia zapisana na serwerze" : "Podgląd zdjęcia źródłowego"}</span><button type="button" className="admin-image-remove" disabled={saving} onClick={() => void onRemoveImage()}>Usuń zdjęcie</button></div>
      </div>}

      <fieldset className="admin-content-fields">
        <legend>Zdjęcie i opis produktu</legend>
        <p className="admin-field-help">Możesz wkleić adres zdjęcia albo wybrać plik ze swojego urządzenia. Wybrany plik ma pierwszeństwo przed linkiem.</p>
        <div className="admin-form-grid">
          <label>Nazwa angielska<input name="nameEn" defaultValue={product.nameEn ?? ""} /></label>
          <div className="admin-wide admin-image-url-row">
            <label>Link do zdjęcia — pobierzemy kopię<input name="imageSourceUrl" type="url" placeholder="https://…" value={imageSourceUrl} onChange={(event) => setImageSourceUrl(event.target.value)} /></label>
            <button type="button" className="admin-secondary" disabled={saving || !imageSourceUrl.trim()} onClick={() => void onImageImport(imageSourceUrl.trim())}>{saving ? "Pobieram…" : "Pobierz i zapisz zdjęcie"}</button>
            <small>Zdjęcie zapisuje się od razu w naszym zbiorze, niezależnie od pozostałych pól formularza.</small>
          </div>
          <label className="admin-wide admin-file-field">Albo wybierz zdjęcie z dysku<input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp,image/avif" /><small>Maksymalnie 15 MB przed przygotowaniem. System zmniejszy zdjęcie do 1600 px i zapisze plik nie większy niż 2,5 MB.</small></label>
          {product.sourceDescription && <div className="admin-wide admin-description-proposal"><span className="admin-eyebrow">Propozycja z Dotykački</span><p>{product.sourceDescription}</p><button type="button" className="admin-secondary" onClick={() => { setDescriptionPl(product.sourceDescription ?? ""); markFormDirty(); }}>Użyj jako opisu w menu</button></div>}
          <label className="admin-wide">Opis polski<textarea name="descriptionPl" rows={4} value={descriptionPl} onChange={(event) => setDescriptionPl(event.target.value)} placeholder="Opis widoczny dla gościa — możesz go poprawić przed publikacją" /></label>
          <label className="admin-wide">Opis angielski<textarea name="descriptionEn" rows={4} defaultValue={product.descriptionEn ?? ""} /></label>
        </div>
        <div className="admin-checks"><label><input type="checkbox" name="autoTranslate" defaultChecked={product.autoTranslate !== false} /> Automatycznie aktualizuj wersję angielską po zmianie polskiej treści</label></div>
        <p className="admin-field-help">Tłumaczenie obejmuje nazwę i opis produktu oraz kraj, region, styl i walory smakowe wina. Nazwy własne win pozostają bez zmian.</p>
      </fieldset>

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

      {productKind !== "wine" && <ProductFeatureFields kind={productKind} attributes={attributes} />}

      <section className="admin-staff-manual-zone">
        <header><span>TYLKO DLA PERSONELU</span><div><h3>Instrukcja przygotowania</h3><p>Ta treść nie pojawia się w menu gościa. Pracownik otworzy ją trzema szybkimi dotknięciami zdjęcia produktu w ekranie zamówień.</p></div></header>
        <label>Opis, manual i wskazówki<textarea name="staffInstructions" rows={8} defaultValue={product.staffInstructions ?? ""} maxLength={12000} placeholder={"Przykład:\n• szkło: highball\n• lód: 5 dużych kostek\n• kolejność składników i proporcje\n• dekoracja oraz sposób podania"}/></label>
        {(product.staffMedia?.length ?? 0) > 0 && <div className="admin-staff-media-gallery">{product.staffMedia?.map((media) => <figure key={media.id}>{media.type === "IMAGE" ? <img src={media.path} alt={media.name}/> : <video src={media.path} muted playsInline controls preload="metadata"/>}<figcaption>{media.name}</figcaption><button type="button" aria-label={`Usuń ${media.name}`} disabled={saving} onClick={() => void onRemoveStaffMedia(media.id)}>×</button></figure>)}</div>}
        <label className="admin-staff-media-upload">Dodaj zdjęcia lub filmy<input name="staffMediaFiles" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.avif,.gif,.mp4,.webm" disabled={(product.staffMedia?.length ?? 0) >= 8}/><small>Do 8 plików na produkt. Zdjęcia zostaną zmniejszone; film MP4 lub WebM może mieć maksymalnie 25 MB.</small></label>
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
    input("cocktailBase", "Alkohol bazowy"),
    input("alcoholPercentage", "Zawartość alkoholu", "jeżeli chcemy ją pokazywać"),
    input("tasteProfile", "Profil smakowy", "np. wytrawny · cytrusowy"),
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
