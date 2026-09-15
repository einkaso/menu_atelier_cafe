# Menu Atelier Café

Publiczne, dwujęzyczne menu i zaplecze operacyjne Marta Banaszek Atelier-Café. Aplikacja synchronizuje katalog z Dotykačką, udostępnia panel administracyjny, strefę kelnera, obsługę zamówień, rozliczeń kasowych i etapowej inwentaryzacji.

## Stos technologiczny

- Next.js 16, React 19 i TypeScript
- PostgreSQL 17 oraz Drizzle ORM
- opcjonalny runtime Vinext/Cloudflare dla środowiska Sites
- Docker Compose lub natywna usługa Node.js

## Wymagania

- Node.js `>=22.13.0` i npm
- PostgreSQL 17 albo Docker z obsługą Compose
- dla skryptów Sites na Linuksie: `flock`, `curl`, `sha256sum` i GNU `timeout`

## Instalacja lokalna

```bash
npm ci
```

Utwórz lokalną konfigurację tylko wtedy, gdy plik `.env` jeszcze nie istnieje:

```bash
test -e .env || cp .env_example .env
```

Następnie zastąp wszystkie wartości `replace-with-...` własnymi, losowymi danymi. Nie nadpisuj istniejącego `.env`. Prawdziwych haseł, tokenów, kluczy API, identyfikatorów prywatnych wdrożeń ani danych klientów nie wolno commitować.

Pełna lista wymaganych i opcjonalnych ustawień znajduje się w [`.env_example`](.env_example). Zmienne `NEXT_PUBLIC_*` trafiają do kodu przeglądarki i nie mogą zawierać sekretów.

## Uruchomienie deweloperskie

```bash
npm run dev
```

Domyślny adres lokalny to `http://localhost:3000`.

## PostgreSQL i migracje

`DATABASE_URL` jest wymagany przez aplikację i polecenia Drizzle. Po skonfigurowaniu pustej bazy uruchom:

```bash
npm run db:migrate
```

Nowe migracje po zmianach w `db/schema.ts` generuje:

```bash
npm run db:generate
```

## Docker Compose

Po przygotowaniu `.env`:

```bash
docker compose up --build
```

Aplikacja będzie dostępna pod `http://localhost:3000`. Wolumeny `menu_postgres` i `menu_uploads` przechowują bazę oraz zdjęcia poza obrazem kontenera.

## Kontrola jakości

```bash
npm run lint
npm run build:server
npm test
```

`npm test` wykonuje także build Vinext. Pomocnicze skrypty Sites używają projektowego katalogu `.sites-runtime/`, który jest lokalny i ignorowany przez Git.

## Bezpieczeństwo integracji

- Sekrety są używane wyłącznie po stronie serwera i pochodzą z ignorowanego `.env` lub chronionej konfiguracji usługi.
- `WAITER_POS_ACTIONS_ENABLED` i `DOTYKACKA_INVENTORY_WRITE_ENABLED` są domyślnie wyłączone.
- Prywatny `.openai/hosting.json` nie jest publikowany. Dla nowego środowiska skopiuj `.openai/hosting.example.json` do `.openai/hosting.json` i uzupełnij go lokalnie.
- `public/uploads/` jest przeznaczony na dane runtime i pozostaje poza repozytorium z wyjątkiem `.gitkeep`.
- Endpoint synchronizacji wymaga `SYNC_SECRET`; webhook może używać osobnego `DOTYKACKA_WEBHOOK_SECRET`.

## Rachunek dla gościa i ankiety

W strefie kelnera przycisk „Rachunek dla gościa” pobiera z Dotykački zamknięte rachunki z ostatnich 12 godzin. Kelner może wybrać dowolny stolik na dowolnym tablecie. Widok gościa korzysta z końcowego zamówienia w POS, dlatego uwzględnia pozycje zmienione w Dotykačce po pierwotnym wysłaniu zamówienia. Przekazanie tabletu wylogowuje kelnera, a „Zakończ” usuwa krótką sesję rachunku i wraca do menu gościa.

Ankieta przed zamówieniem pozostaje w `waiter_survey_questions`. Osobna ankieta po rachunku i jej odpowiedzi używają tabel `guest_survey_questions` oraz `guest_survey_responses`, tworzonych przez migrację `0028_guest_receipts.sql`.

Kod QR wymaga ustawienia zmiennej `GOOGLE_REVIEW_URL` na dokładny, publiczny link „napisz opinię” z profilu Google firmy. Bez tej zmiennej rachunek i ankieta działają, ale kod QR jest ukryty.

Szczegóły wdrożenia znajdują się w [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), a zasady integracji magazynowej w [`docs/DOTYKACKA_INVENTORY_INTEGRATION.md`](docs/DOTYKACKA_INVENTORY_INTEGRATION.md).

## Licencja i publikacja

Repozytorium nie zawiera pliku licencji. Przed redystrybucją kodu poza projekt należy ustalić warunki z właścicielem repozytorium.
