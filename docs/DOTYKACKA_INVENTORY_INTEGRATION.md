# Projekt etapowej inwentaryzacji z Dotykačka API v2

Stan realizacji: 15 września 2026. Źródłem możliwości technicznych są wyłącznie oficjalne materiały Dotykački/Dotypos. Zbudowany jest obieg zlecenia, liczenia, korekty, zatwierdzania, audytu i raportu odchyleń. Kod integracji magazynowej istnieje, ale zapis produkcyjny jest domyślnie zablokowany przez `DOTYKACKA_INVENTORY_WRITE_ENABLED` do kontrolowanego testu.

## Które produkty liczymy

Samo ustawienie Dotykački „pomniejszaj magazyn” nie oznacza, że pozycja jest fizycznym towarem do policzenia. Gotowe napoje, takie jak frappe czy latte smakowe, mogą pomniejszać wirtualny stan i schodzić poniżej zera, choć powstają ze składników.

Administrator jawnie zaznacza w panelu „Produkty podlegające inwentaryzacji” wyłącznie fizyczne towary i składniki. Nowe zadanie zawiera tylko zaznaczone produkty. Ustawienie jest zachowywane między synchronizacjami Dotykački.

## Wniosek

API pozwala ustawić absolutny stan wybranych produktów w magazynie przez:

`POST /v2/clouds/:cloudId/warehouses/:warehouseId/stock-takings`

Przesłane `quantity` jest nowym stanem, a nie różnicą. Produkty pominięte w `items` pozostają bez zmiany. Operacja jest asynchroniczna i jest zakończona dopiero po statusie `FINISHED` z `statusWebhookUrl`.

## Odczyt i identyfikacja

- magazyny: `GET /v2/clouds/:cloudId/warehouses` i `GET .../warehouses/:warehouseId`;
- przypisanie oddział–magazyn: `GET /v2/clouds/:cloudId/warehouse-branches` (`_branchId`, `_warehouseId`, `visible`, `subscribed`);
- stan przed spisem: `GET /v2/clouds/:cloudId/warehouses/:warehouseId/products`;
- produkt: bezwzględnie numeryczne `Product.id`; endpoint inwentaryzacji nie dokumentuje `externalId` jako zamiennika;
- ostatnie daty spisu: `POST /v2/clouds/:cloudId/warehouses/:warehouseId/stock-taking-dates`, body `{ "_productIds": [1, 2] }`.

## Model zapisu

```json
{
  "note": "inventory_export_id=...",
  "stockTakingDate": "2026-09-15T10:00:00.000Z",
  "items": [
    { "_productId": 123, "quantity": 12.5 }
  ]
}
```

`stockTakingDate` nie może być przyszłe i musi być późniejsze niż ostatnia inwentaryzacja każdego produktu. `quantity` należy wysyłać jako JSON number w jednostce `Product.unit`. Kartony i inne `stock-packaging` trzeba przed wysłaniem przeliczyć do jednostki produktu. Różnica nie jest polem API; system zachowuje lokalnie `counted - expected`.

## Autoryzacja i limity

Połączenie używa Client ID/Secret i refresh tokenu. Access token uzyskuje się przez `POST /v2/signin/token`, `Authorization: User {refreshToken}`, body `{ "_cloudId": cloudId }`; dalsze wywołania używają Bearer tokenu. Publiczny connector ma scope `*`; dokumentacja nie podaje osobnego scope `warehouse.write`. Brak domeny/licencji/uprawnień należy obsłużyć jako 403. Polski manual wskazuje licencję KOMPLET lub wyższą i limit 150 zapytań / 30 minut.

## Idempotencja i bezpieczny przebieg

Endpoint `stock-takings` nie dokumentuje `Idempotency-Key`, ETag ani zewnętrznego identyfikatora operacji. Dlatego:

1. zatwierdzony etap jest niezmiennym snapshotem z UUID i SHA-256 payloadu;
2. na parę cloud+warehouse może być wysyłana tylko jedna operacja;
3. stany lokalne: `READY → SENDING → PROCESSING → FINISHED | FAILED | UNKNOWN`;
4. po odpowiedzi przechowujemy `_stockTransactionId` i `statusWebhookUrl`;
5. nie powtarzamy POST po timeoutcie w ciemno — najpierw uzgadniamy `stock-taking-dates` oraz aktualne stany;
6. przed wysłaniem ponownie sprawdzamy wersje stanów i daty ostatnich inwentaryzacji;
7. zapis produkcyjny pozostaje niedostępny do testu na chmurze testowej i osobnej zgody właściciela.

## Najważniejsza zasada: zatwierdzamy etapy, nie cały magazyn

Pełny spis całego magazynu może istnieć jako kampania nadrzędna, ale nie jest wymagany. Podstawową, samodzielną jednostką jest **etap**, na przykład:

- „Wina — lodówka barowa”;
- „Wina — zaplecze”;
- „Piwa Cieszyn”;
- „Składniki codzienne — 16 września”.

Każdy etap ma własny zakres produktów, osobę liczącą, miejsca liczenia, datę zakończenia, decyzję administratora i osobny status wysyłki. Można go zatwierdzić oraz wysłać bez czekania na pozostałe grupy lub miejsca. Jeżeli etap obejmuje całą kategorię, każda pozycja z utrwalonego zakresu musi być jawnie potwierdzona: ilością (również zero), statusem „nie znaleziono” albo wyłączeniem przez administratora z podaniem przyczyny.

## Role i przebieg

1. Administrator wybiera aktywnego pracownika z Dotykački, kategorię/grupę, opcjonalne konkretne produkty, miejsce i termin. Zlecenie daje pracownikowi czasowy dostęp wyłącznie do tego etapu; nie wymaga nadania pełnej roli administratora.
2. System utrwala listę produktów oraz oczekiwane stany z Dotykački w chwili rozpoczęcia.
3. Pracownik w strefie obsługi widzi dla każdej pozycji: zdjęcie, nazwę, EAN, kod WIN/kod katalogowy/PLU, jednostkę i oczekiwany stan.
4. Liczenie odbywa się wkładami według miejsca. Pracownik może wpisać 4 sztuki w lodówce pierwszej, później dopisać 2 sztuki w drugiej; wynik produktu to suma 6. Każdy wkład można poprawiać do zakończenia etapu, a historia zmian pozostaje w audycie.
5. Pracownik kończy etap. Od tej chwili nie może go zmieniać, a etap otrzymuje status „czeka na zatwierdzenie”.
6. Administrator porównuje stan oczekiwany, policzony i różnicę. Może poprawić ilość z obowiązkową notatką, cofnąć etap do pracownika lub zatwierdzić.
7. Zatwierdzenie zamraża payload. Dopiero osobna, jednoznaczna akcja administratora „Zatwierdź i wyślij” tworzy inwentaryzację w Dotykačce dla produktów tego etapu.
8. System pokazuje wynik asynchroniczny Dotykački. Etap jest zakończony dopiero po `FINISHED`; `FAILED` i niepewny timeout wymagają uzgodnienia, nie automatycznego ponowienia.

Proponowane stany etapu:

`DRAFT → ASSIGNED → IN_PROGRESS → SUBMITTED → CHANGES_REQUESTED | APPROVED → SENDING → PROCESSING → FINISHED | FAILED | UNKNOWN`

Etap można anulować przed wysłaniem. Po zatwierdzeniu każda zmiana tworzy nową wersję; nic nie nadpisuje protokołu zatwierdzonego przez administratora.

## Dane, które zachowujemy lokalnie

- zlecenie, zakres kategorii/grupy i utrwalona lista produktów;
- osoba zlecająca, licząca, zatwierdzająca oraz czasy wszystkich decyzji;
- migawka oczekiwanego stanu oraz jego wersja/czas;
- dla każdego produktu: zdjęcie, EAN, WIN/kod katalogowy/PLU i jednostka z chwili spisu;
- wkłady ilościowe według miejsca, suma policzona i pełna historia edycji;
- różnica ilościowa i wartościowa;
- klasyfikacja przyczyny: `BRAK`, `NADWYŻKA`, `ZEPSUCIE`, `STŁUCZENIE`, `PRZETERMINOWANIE`, `ZUŻYCIE_WEWNĘTRZNE`, `BŁĄD_DOSTAWY`, `BŁĄD_EWIDENCJI`, `INNE`;
- komentarz i opcjonalny materiał dowodowy;
- niezmienny payload, hash, identyfikator transakcji Dotykački i historia statusów.

Dotykačka dostaje wyłącznie zatwierdzoną ilość absolutną. Przyczyny, lokalizacje, autorzy i historia korekt pozostają w naszym systemie, ponieważ to one służą analizie niepokojących zdarzeń.

## Ochrona przed nieaktualnym spisem

Przed wysłaniem system ponownie odczytuje stany i daty ostatnich inwentaryzacji. Jeżeli produkt został już zinwentaryzowany po rozpoczęciu etapu albo jego stan zmienił się w trakcie liczenia, etap otrzymuje ostrzeżenie i wymaga decyzji administratora lub ponownego policzenia. W testach integracyjnych trzeba potwierdzić, jak Dotykačka rozlicza sprzedaż/dostawę pomiędzy `stockTakingDate` a chwilą asynchronicznego przetworzenia. Do czasu potwierdzenia etapy powinny być krótkie i kończone poza intensywną sprzedażą.

## Raporty i wykrywanie problemów

Pierwszy zestaw raportów powinien obejmować:

- różnice według produktu, kategorii, miejsca i okresu;
- powtarzalność odchyleń, np. ten sam alkohol brakujący w 3 z 5 ostatnich spisów;
- straty ilościowe i wartościowe z podziałem na przyczynę;
- zepsucia/przeterminowania według produktu oraz trendu;
- etapy opóźnione, cofnięte, niezatwierdzone i zakończone błędem;
- „produkty alarmowe” po przekroczeniu ustalonej liczby zdarzeń lub wartości strat.

Alert nie powinien automatycznie oskarżać pracownika. Ma wskazywać wzorzec wymagający sprawdzenia: receptury i rozchodu składników, dostaw, pomyłek jednostek, strat jakościowych albo rzeczywistego braku.

## Składniki i harmonogramy — następny etap projektu

Rekomendacja: częstotliwość przechowujemy w naszym systemie, przypisaną do produktu lub grupy (`DAILY`, `WEEKLY`, `BIWEEKLY`, później także własny interwał). Dotykačka pozostaje źródłem produktów i stanów oraz miejscem końcowej korekty, ale udokumentowane API nie zapewnia naszego obiegu zlecenie–pracownik–akceptacja ani raportów przyczyn.

Reguła wylicza `nextDueAt`, tolerancję opóźnienia i sugerowaną osobę/miejsce. Produkty niewidoczne w menu, ale obecne w kategorii składników Dotykački, mogą należeć do tego samego mechanizmu etapów. Szczegóły częstotliwości i raportowania wymagają osobnej decyzji przed implementacją.

## Proponowany minimalny model danych

- `inventory_campaigns` — opcjonalny pełny spis lub akcja kontrolna;
- `inventory_stages` — samodzielnie zatwierdzany zakres;
- `inventory_stage_items` — utrwalony produkt, oczekiwana i policzona ilość;
- `inventory_count_entries` — edytowalne wkłady według miejsca;
- `inventory_events` — nieusuwalny audyt decyzji i zmian;
- `inventory_schedules` — przyszłe reguły dla składników;
- `inventory_exports` — jeden zamrożony payload i stan operacji Dotykački.

## Decyzje przyjęte w pierwszej wersji

1. Pracownik widzi oczekiwany stan od początku; wariant „w ciemno” można dodać później.
2. Każda niezerowa różnica wymaga przyczyny. Administrator może poprawić wynik tylko z obowiązkową notatką.
3. Administrator proponuje listę miejsc w zleceniu, a pracownik może dopisać własne miejsce.
4. Zatwierdzenie nie wysyła danych automatycznie. Wysyłka jest osobną akcją i wymaga włączonego przełącznika środowiskowego.
5. Harmonogram składników, progi alarmów i ewentualna zasada drugiej osoby pozostają zakresem następnego etapu.

## Błędy

Natychmiastowe: 400 walidacja, 401 token, 403 domena/chmura/licencja/uprawnienia, 404 zasób, 409 konflikt, 429 limit, 5xx błąd usługi. Status asynchroniczny: `PROCESSING`, `FINISHED`, `FAILED`. Udokumentowane powody `FAILED`: `STOCK_TAKING_DATE_IN_FUTURE`, `PRODUCT_DOES_NOT_EXIST`, `PRODUCT_STOCK_TAKING_IN_FUTURE`, `PRODUCT_STOCK_TAKING_AFTER_DATE`, `UNEXPECTED`.

## Źródła oficjalne

- https://docs.api.dotypos.com/entity/warehouse/
- https://docs.api.dotypos.com/entity/warehouse-branches/
- https://docs.api.dotypos.com/entity/product/
- https://docs.api.dotypos.com/entity/stock-packaging/
- https://docs.api.dotypos.com/api-reference/enums/units/
- https://docs.api.dotypos.com/api-reference/general/data-types/
- https://docs.api.dotypos.com/api-reference/general/etags/
- https://docs.api.dotypos.com/api-reference/general/common-error-responses/
- https://docs.api.dotypos.com/authorization/
- https://docs.api.dotypos.com/getting-started/
- https://manual.dotykacka.pl/api-dotykacka.html
- https://dotykacka.cz/api
