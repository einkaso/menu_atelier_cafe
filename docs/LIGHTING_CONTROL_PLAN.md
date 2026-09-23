# Panel sterowania oświetleniem Atelier

Stan dokumentu: 21 września 2026 r.

## Decyzja architektoniczna

Panel powstaje w istniejącej strefie pracownika pod adresem `/kelner/oswietlenie`, ale przeglądarka i serwer `menu.martabanaszek.pl` nie łączą się bezpośrednio ze sterownikami BleBox.

W sieci Atelier działa mały agent lokalny. Agent sam nawiązuje wychodzące połączenie HTTPS z serwerem menu, pobiera oczekujące polecenia, wykonuje je w lokalnej sieci na wcześniej skonfigurowanych urządzeniach BleBox i odsyła odczytany stan. Nie otwieramy żadnego portu na routerze lokalu i nie udostępniamy adresów sterowników przeglądarce.

```text
tablet pracownika
  -> HTTPS -> menu.martabanaszek.pl
               -> PostgreSQL: konfiguracja, polecenia, stany i audyt
               <- wychodzące HTTPS -> agent w Atelier
                                        -> lokalne HTTP -> BleBox
                                        <- stan urządzeń <- BleBox
```

Jest to zgodne z modelem BleBox: publiczne API sterowników działa w sieci lokalnej, a producent nie udostępnia publicznego API swojej chmury. Bezpieczeństwo dostępu do urządzeń musi zapewniać sieć lokalna. Źródła techniczne:

- [portal API BleBox](https://technical.blebox.eu/);
- [switchBox API](https://technical.blebox.eu/openapi_switchbox/openAPI_switchBox_20200831.html);
- [switchBoxD API](https://technical.blebox.eu/openapi_switchboxd/openAPI_switchBoxD_20200831.html);
- [wLightBox API](https://technical.blebox.eu/openapi_wlightbox/openAPI_wLightBox_20200229.html).

Rekomendowany agent to niewielki program Node.js 22 bez zewnętrznych zależności, uruchomiony jako usługa systemd na Raspberry Pi lub innym stale włączonym komputerze w Atelier. Home Assistant pozostaje możliwą alternatywą tylko wtedy, gdy już działa w lokalu; nie jest potrzebny do pierwszej wersji.

## Zakres pierwszej wersji

Pierwsza wersja obejmuje:

- responsywną mapę lokalu z punktami światła;
- aktualny, potwierdzony stan każdego punktu;
- włączanie i wyłączanie;
- jasność 0–100% dla urządzeń, które faktycznie ją obsługują;
- grupy pomieszczeń i kilka zatwierdzonych scen;
- bezpieczne „Wyłącz wszystko” wymagające przytrzymania;
- informację o poleceniu w toku, błędzie i nieaktualnym stanie;
- imienny audyt: pracownik, punkt, poprzedni stan, żądany stan, wynik i czas;
- panel administratora do konfiguracji urządzeń, punktów, mapy, grup, scen i uprawnień;
- ekran diagnostyczny agenta oraz urządzeń.

Poza pierwszą wersją pozostają harmonogramy, sterowanie spoza panelu pracownika, automatyka zależna od obecności lub światła dziennego, edytor dowolnych efektów RGB oraz lokalny panel awaryjny działający bez Internetu. Harmonogramy zapisane w samych urządzeniach BleBox mogą nadal działać niezależnie.

## Zachowanie panelu pracownika

Na głównej stronie `/kelner` w pasku narzędzi pojawi się link „Oświetlenie”. Ten sam link trzeba uwzględnić we wspólnej nawigacji podstron pracowniczych w `app/kelner/staff-navigation.tsx`.

Widok `/kelner/oswietlenie` składa się z:

1. paska stanu: „Agent połączony”, czas ostatniej aktualizacji i ostrzeżenie o nieaktualnych danych;
2. przycisków scen: „Otwarcie”, „Dzień”, „Wieczór”, „Sprzątanie”, „Zamknięcie”;
3. mapy lokalu z punktami światła;
4. skrótów do grup, np. Sala, Bar, Witryna i Zaplecze;
5. przycisku „Wyłącz wszystko”, aktywowanego przytrzymaniem przez około 1,5 sekundy.

Kolory punktów:

- żółty: światło włączone;
- szary: światło wyłączone;
- pulsujący niebieski: oczekiwanie na potwierdzenie;
- czerwony: błąd albo urządzenie niedostępne;
- obrys ostrzegawczy: stan jest starszy niż przyjęty limit świeżości.

Dotknięcie punktu otwiera dolny panel sterowania. Dla zwykłego przekaźnika są to dwa jednoznaczne polecenia „Włącz” i „Wyłącz”; nie wysyłamy komendy `toggle`, bo przy opóźnieniu lub ponowieniu mogłaby dać odwrotny wynik. Dla ściemniacza suwak pokazuje wartość potwierdzoną przez urządzenie. Polecenie jasności jest wysyłane po puszczeniu suwaka, a nie przy każdym pikselu ruchu.

Interfejs nie uznaje operacji za zakończoną po samym kliknięciu. Najpierw pokazuje stan oczekiwania, a dopiero odczyt zwrotny BleBox zmienia stan na wykonany. Przy braku potwierdzenia wraca do ostatniej znanej wartości i pokazuje błąd.

## Mapa lokalu

W pierwszej wersji mapa nie powinna przyjmować surowego SVG przesłanego przez administratora. Bezpieczniejszy i prostszy wariant dla obecnej aplikacji to:

- plan tła jako PNG lub WebP zapisany w trwałym katalogu `public/uploads/lighting`;
- opcjonalne obrysy pomieszczeń jako dane geometryczne JSON;
- pozycje punktów jako znormalizowane współrzędne `x` i `y` z zakresu 0–1;
- renderowanie punktów jako elementów HTML nad planem, z zachowaniem proporcji obrazu.

Dzięki współrzędnym względnym mapa skaluje się na iPadzie, telefonie i komputerze. Administrator włącza tryb rozmieszczania, wybiera punkt i dotyka miejsca na planie. Edycja skomplikowanych kształtów pomieszczeń nie jest warunkiem pilotażu; grupę pomieszczenia można przypisać formularzem.

## Agent lokalny

Kod agenta należy umieścić w `bridge/lighting/`. Agent korzysta z wbudowanego `fetch` Node.js 22, dlatego nie potrzebuje osobnego stosu aplikacyjnego ani dostępu do bazy.

Agent realizuje cztery zadania:

1. wysyła heartbeat z wersją programu i stanem połączenia;
2. długim odpytywaniem pobiera polecenia oczekujące, z limitem około 25 sekund;
3. wykonuje tylko typowane operacje na urządzeniach obecnych w zatwierdzonej konfiguracji;
4. cyklicznie odczytuje stan wszystkich wyjść oraz odsyła wyniki i błędy.

Nie przyjmujemy z serwera ani przeglądarki dowolnego URL-a lub ścieżki HTTP. Adapter BleBox składa żądania z zatwierdzonego hosta, rozpoznanego typu API, kanału i zamkniętego zbioru operacji. Host musi być prywatnym adresem IPv4 z sieci lokalu; nie wolno używać przekierowań HTTP ani łączyć się poza dozwolonym zakresem.

Każda instalacja agenta otrzymuje jednorazowo wygenerowany długi token. Serwer przechowuje wyłącznie jego skrót. Token znajduje się na urządzeniu w chronionym pliku `/etc/banaszek-lighting/bridge.env`. Komunikacja z serwerem zawsze używa HTTPS.

Proponowane tempo odczytu:

- co 2 sekundy przez krótki czas po poleceniu;
- co 10 sekund, gdy panel jest aktywny i nic się nie zmienia;
- co 30 sekund w spoczynku;
- po 45 sekundach bez heartbeat agent jest oznaczany jako niedostępny.

Wartości te są konfiguracją, nie stałą częścią protokołu, i należy je dostroić podczas pilotażu tak, aby nie przeciążać Wi-Fi ani sterowników.

## Obsługiwane urządzenia

Nie należy zakładać możliwości na podstawie nazwy handlowej. Podczas inwentaryzacji agent odczytuje z każdego urządzenia co najmniej stabilny identyfikator, nazwę, typ API, poziom API, wersję sprzętu, firmware i dostępne kanały. Adapter zostaje wybrany według faktycznej odpowiedzi urządzenia.

Pierwszy zestaw adapterów:

- `switchBox`: odczyt i absolutne ustawienie przekaźnika;
- `switchBoxD`: dwa niezależne kanały przekaźnikowe;
- `wLightBox`: odczyt kanałów/koloru, włączanie, wyłączanie i jasność zależnie od trybu wyjścia.

Każdy adapter ma jawnie zadeklarowane możliwości: `onOff`, `dimming`, opcjonalnie `rgbw`. Panel pokazuje tylko kontrolki wspierane przez konkretny punkt. Kolor RGBW w pierwszej wersji jest dostępny wyłącznie poprzez zapisane sceny, jeżeli inwentaryzacja potwierdzi takie urządzenia.

## Model danych

Następna migracja po obecnej `0045` powinna dodać następujące obszary. Ostateczny podział tabel można uprościć podczas implementacji, ale nie wolno łączyć konfiguracji, bieżącego stanu i historii w jeden mutowalny rekord.

### Konfiguracja

- `lighting_bridges`: nazwa instalacji, skrót tokenu, aktywność, wersja agenta, ostatni heartbeat i błąd;
- `lighting_devices`: bridge, stabilne ID BleBox, prywatny adres, typ i poziom API, firmware, nazwa, aktywność;
- `lighting_rooms`: nazwa pomieszczenia, kolejność, opcjonalna geometria mapy;
- `lighting_outputs`: urządzenie, kanał, etykieta, możliwość sterowania, pomieszczenie, współrzędne mapy, minimalna/maksymalna jasność i aktywność;
- `lighting_layouts`: plik planu, proporcje i numer wersji;
- `lighting_groups` oraz `lighting_group_members`;
- `lighting_scenes` oraz `lighting_scene_actions`.

### Stan i kolejka

- `lighting_output_states`: ostatni stan potwierdzony, stan żądany, czas odczytu, jakość/staleness i ostatni błąd;
- `lighting_commands`: UUID, autor, rodzaj operacji, status, termin ważności, czas przejęcia i zakończenia;
- `lighting_command_items`: docelowy punkt, poprzedni stan, żądany stan, wynik i komunikat błędu.

Statusy polecenia: `QUEUED -> CLAIMED -> SUCCEEDED | PARTIAL | FAILED | EXPIRED`. Przejęcie używa krótkiego lease, aby restart agenta nie gubił poleceń. Każde polecenie ma klucz idempotencji, a serwer nie tworzy kilku aktywnych poleceń o tej samej wartości dla jednego punktu.

Polecenia grup i scen są jedną operacją nadrzędną z osobnymi wynikami dla każdego punktu. Nie wykonujemy automatycznego „rollbacku” całej sceny, ponieważ w międzyczasie stan mógł zostać zmieniony fizycznym przyciskiem. Panel pokazuje wynik częściowy i wskazuje punkty, których nie udało się ustawić.

### Uprawnienia

Do `waiter_employees` należy dodać `can_control_lighting`, domyślnie `false`. Administrator nadaje uprawnienie imiennie w istniejącym ekranie „Pracownicy”. `currentWaiter()` zwraca to pole, a każde API sterowania sprawdza je ponownie po stronie serwera.

Administratorzy zarządzają konfiguracją przez istniejącą sesję `isAdmin()`. Samo zalogowanie PIN-em pracownika nie uprawnia do konfiguracji urządzeń, mapy ani scen.

## API aplikacji

Endpointy pracownika:

- `GET /api/waiter/lighting` — mapa, dostępne sceny i grupy, potwierdzone stany i stan agenta;
- `POST /api/waiter/lighting/commands` — jedno typowane polecenie dla punktu, grupy lub sceny;
- `GET /api/waiter/lighting/commands/:id` — wynik polecenia, jeżeli panel nie otrzymał go jeszcze przy odświeżeniu stanu.

Endpointy administratora:

- `GET/PATCH /api/admin/lighting/config` — układ, pomieszczenia, punkty i urządzenia;
- `GET/POST/PATCH /api/admin/lighting/scenes` — sceny i grupy;
- `GET /api/admin/lighting/diagnostics` — agent, urządzenia, świeżość stanu i ostatnie błędy;
- osobna operacja rejestracji/rotacji tokenu agenta, która pokazuje pełny token tylko raz.

Endpointy agenta:

- `POST /api/lighting/bridge/heartbeat`;
- `POST /api/lighting/bridge/commands/claim` — długie odpytywanie i przejęcie pracy;
- `POST /api/lighting/bridge/commands/:id/result`;
- `POST /api/lighting/bridge/states` — paczka odczytanych stanów.

Żądania pracownika mają limit częstotliwości, walidację Zod i sprawdzają aktualność sesji. Odpowiedzi nie zawierają prywatnych adresów IP, tokenów, surowych ścieżek API ani konfiguracji sieciowej.

## Zmiany w obecnym projekcie

Planowany układ plików:

```text
app/kelner/oswietlenie/
  page.tsx
  lighting-client.tsx
  lighting.css
app/admin/lighting/
  page.tsx
  lighting-admin-client.tsx
  lighting-admin.css
app/api/waiter/lighting/...
app/api/admin/lighting/...
app/api/lighting/bridge/...
lib/lighting/
  types.ts
  validation.ts
  commands.ts
  state.ts
  bridge-auth.ts
bridge/lighting/
  agent.mjs
  blebox-adapters.mjs
  config.mjs
  README.md
ops/systemd/banaszek-lighting-bridge.service
tests/lighting-control.test.mjs
tests/lighting-ui.test.mjs
```

Ponadto zmienią się:

- `db/schema.ts` i nowa migracja Drizzle;
- `lib/waiter-auth.ts`, aby zwracać uprawnienie do oświetlenia;
- `app/kelner/waiter-client.tsx` i `app/kelner/staff-navigation.tsx`, aby dodać wejście do modułu;
- `app/admin/admin-panel.tsx`, aby dodać moduł administratora;
- `app/admin/waiters/waiter-admin-client.tsx`, aby nadać uprawnienie pracownikowi;
- `.env_example`, dokumentacja wdrożenia i skrypt przygotowania trwałego katalogu mapy.

## Bezpieczeństwo i reguły niezawodności

1. Sterowniki BleBox pozostają niewidoczne z Internetu; bez przekierowania portów i bez publicznego reverse proxy.
2. Przeglądarka wysyła wyłącznie identyfikator punktu oraz typowane wartości. Nigdy nie podaje IP, URL-a, kanału ani komendy BleBox.
3. Agent łączy się wyłącznie z zatwierdzonymi prywatnymi adresami i nie podąża za przekierowaniami HTTP.
4. Wszystkie polecenia są absolutne (`ON`, `OFF`, konkretna jasność), idempotentne i mają krótki termin ważności. Nie używamy `toggle`.
5. Stan wyświetlany jako wykonany zawsze pochodzi z odczytu urządzenia, nie tylko z odpowiedzi kolejki.
6. Fizyczne przyciski pozostają podstawowym sterowaniem awaryjnym. Agent cyklicznie wykrywa ich użycie i aktualizuje panel.
7. Sceny mają ograniczoną współbieżność, aby nie wysłać kilkudziesięciu zapytań równocześnie przez Wi-Fi.
8. Błędne urządzenie nie blokuje pozostałych elementów sceny; wynik może być częściowy.
9. Historia poleceń jest niemutowalna z poziomu zwykłego panelu. Dane diagnostyczne można później retencjonować, ale audyt użytkowników należy zachować.
10. Wyłączenie uprawnienia pracownika działa natychmiast przy następnym wywołaniu API, nawet jeśli jego krótka sesja nadal jest ważna.

## Etapy realizacji

### Etap 0 — inwentaryzacja na miejscu

Potrzebne dane:

- lista lub zrzuty urządzeń z wBox;
- przypisanie każdego kanału do rzeczywistego światła;
- adres IP, stabilny identyfikator, typ i poziom API, firmware;
- informacja, czy punkt jest zwykły, ściemniany czy RGBW;
- plan lokalu albo czytelny szkic z nazwami pomieszczeń;
- decyzja, na jakim stale włączonym urządzeniu uruchomić agenta.

Na routerze należy utworzyć rezerwacje DHCP. Nie konfigurujemy publicznego dostępu. Wynikiem etapu jest podpisana tabela punktów oraz plan z numerami zgodnymi z tabelą.

### Etap 1 — laboratoryjny adapter BleBox

Najpierw podłączamy dwa rzeczywiste punkty: jeden przekaźnikowy i jeden ściemniany. Budujemy adaptery oraz narzędzie diagnostyczne uruchamiane lokalnie. Testujemy odczyt stanu, `ON`, `OFF`, jasność, fizyczny przycisk, timeout, restart urządzenia i brak Wi-Fi.

Kryterium przejścia: 100 kolejnych operacji bez rozbieżności między stanem panelu testowego a urządzeniem oraz poprawne wykrycie każdej celowo wywołanej awarii.

### Etap 2 — fundament serwera i agent

Dodajemy migrację, konfigurację, autoryzację agenta, kolejkę z lease, raportowanie stanu i audyt. Agent działa przez systemd i automatycznie wraca po restarcie komputera oraz sieci.

Kryterium przejścia: polecenia nie giną przy restarcie agenta, wygasłe polecenia nie są wykonywane, a ponowienie tej samej komendy nie zmienia poprawnego stanu.

### Etap 3 — panel administracyjny

Administrator rejestruje urządzenia i kanały, wgrywa plan, rozmieszcza punkty, przypisuje możliwości, buduje grupy i sceny oraz widzi diagnostykę. Konfiguracja ma walidację konfliktów: jeden fizyczny kanał nie może przypadkiem stać się dwoma aktywnymi punktami.

Kryterium przejścia: cały pilotaż można skonfigurować z UI bez ręcznej edycji bazy.

### Etap 4 — panel pracownika

Dodajemy mapę, sterowanie punktami, grupami i scenami, komunikaty oczekiwania/błędu, przytrzymanie „Wyłącz wszystko” oraz uprawnienie imienne. Widok jest projektowany przede wszystkim pod iPada i obsługę dotykiem.

Kryterium przejścia: pracownik bez uprawnienia nie widzi modułu i dostaje `403` przy ręcznym wywołaniu API; osoba uprawniona widzi zawsze potwierdzony albo jawnie oznaczony nieaktualny stan.

### Etap 5 — pilotaż w Atelier

Najpierw aktywujemy 2–4 punkty i jedną scenę. Przez kilka dni porównujemy audyt z zachowaniem fizycznych świateł. Następnie dodajemy pozostałe punkty partiami według pomieszczeń.

Obowiązkowe testy:

- jednoczesne polecenia z dwóch tabletów;
- użycie fizycznego przycisku w trakcie otwartego panelu;
- chwilowy brak Internetu, Wi-Fi i zasilania agenta;
- restart routera, agenta, aplikacji i pojedynczego BleBoxa;
- częściowa awaria podczas sceny;
- kilkukrotne szybkie użycie suwaka;
- wygaśnięcie sesji pracownika;
- cofnięcie uprawnienia zalogowanej osobie;
- przywrócenie systemu po wdrożeniu poprzedniej wersji aplikacji.

### Etap 6 — pełne uruchomienie

Po podpisaniu mapy i wyników testów aktywujemy wszystkie zatwierdzone punkty. Dokumentacja produkcyjna otrzymuje listę urządzeń, opis komputera agenta, procedurę rotacji tokenu, restartu usługi, kopii konfiguracji i ręcznego trybu awaryjnego.

## Kolejność prac w repozytorium

Najbezpieczniejszy podział na małe, przeglądalne zmiany:

1. modele danych, migracja i typy;
2. adaptery BleBox z fixture'ami odpowiedzi dwóch urządzeń pilotażowych;
3. protokół oraz uwierzytelnienie agenta;
4. kolejka poleceń, stan i audyt;
5. panel diagnostyczny administratora;
6. konfigurator urządzeń i mapy;
7. uprawnienia pracowników;
8. mapa i sterowanie pojedynczym punktem;
9. grupy, sceny i „Wyłącz wszystko”;
10. systemd, dokumentacja wdrożeniowa i testy awarii.

## Warunki rozpoczęcia implementacji

Kod można zacząć od fundamentów niezależnie od lokalu, ale prawidłowe adaptery i UI wymagają czterech materiałów:

1. zrzutów listy urządzeń z wBox;
2. odpowiedzi informacyjnej i odpowiedzi stanu z co najmniej jednego switchBoxa oraz jednego ściemniacza;
3. tabeli „urządzenie/kanał -> lampa/pomieszczenie”;
4. szkicu planu Atelier.

Nie należy wdrażać sterowania dla wszystkich punktów przed pilotażem. Najpierw trzeba potwierdzić rzeczywiste typy i poziomy API, ponieważ BleBox publikuje różne wersje endpointów, a dostępne pola zależą również od wersji sprzętu.
