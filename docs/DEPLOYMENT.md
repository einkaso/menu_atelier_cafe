# Wdrożenie menu Marta Banaszek Café

Plik `RELEASE` jest obowiązkowym, stałym identyfikatorem całego buildu. Nie wolno generować wersji osobno przez `Date.now()` w konfiguracji Next.js: konfiguracja może zostać oceniona w kilku procesach, a różne wersje klienta, API i service workera powodują pętlę przeładowań PWA.

> Uwaga: bieżąca produkcja nie korzysta z Docker Compose. Działa jako usługa
> `banaszek-menu.service` z `/opt/banaszek-menu` na porcie 8080. Poniższa sekcja
> Docker opisuje wariant alternatywny; właściwy przebieg produkcyjny opisano dalej.

## Wymagania wariantu Docker

- Docker z obsługą Compose
- subdomena `menu.martabanaszek.pl`
- HTTPS i reverse proxy do `127.0.0.1:3000`
- trwałe miejsce na wolumeny Dockera

## Konfiguracja

1. Skopiować `.env_example` jako `.env` tylko wtedy, gdy lokalny `.env` jeszcze nie istnieje.
2. Wygenerować silne wartości `POSTGRES_PASSWORD` i `SYNC_SECRET`.
3. Wpisać `DOTYKACKA_REFRESH_TOKEN`, `DOTYKACKA_CLOUD_ID` oraz opcjonalnie `DOTYKACKA_WAREHOUSE_ID`.
4. Bezpłatne wyszukiwanie danych o winach i piwach korzysta ze strony dostawcy, Open Food Facts po EAN oraz analizy adresu wskazanego ręcznie; nie wymaga dodatkowego klucza API.
5. Opcjonalnie można wpisać `BRAVE_SEARCH_API_KEY`, aby uruchomić pełne automatyczne wyszukiwanie całego internetu.
6. Uruchomić `docker compose up -d --build`.
7. Sprawdzić `GET /api/health`.

Sekrety pozostają wyłącznie w pliku `.env` na serwerze. Plik nie może trafić do repozytorium ani kopii katalogu publicznego.

## Pierwsza synchronizacja

Wywołać `POST /api/sync/dotykacka` z nagłówkiem `Authorization: Bearer <SYNC_SECRET>`.

Na serwerze systemd skopiować jednostki `ops/systemd/banaszek-menu-sync.*` do
`/etc/systemd/system/`, wykonać `systemctl daemon-reload` i włączyć timer przez
`systemctl enable --now banaszek-menu-sync.timer`. Timer uruchamia synchronizację
i uzupełnianie angielskich tłumaczeń co 2 minuty. Klucz DeepL pozostaje wyłącznie
w chronionym pliku `/etc/banaszek-menu/menu.env` jako `DEEPL_API_KEY`.
Synchronizator pobiera produkty oznaczone etykietą skonfigurowaną w `DOTYKACKA_MENU_TAG` (domyślnie `menu`).

## Kopie zapasowe

Należy wykonywać codzienny `pg_dump` bazy `menu` oraz kopię wolumenu `menu_uploads`. Kopie powinny być przechowywane poza serwerem aplikacji.

## Faktyczne wdrożenie produkcyjne (systemd)

1. Przygotować i przetestować `/opt/banaszek-menu-next` jako `menuapp`, bez kopiowania sekretów z `/etc/banaszek-menu/menu.env`.
2. Zatrzymać `banaszek-menu-sync.timer` i poczekać na koniec ewentualnego oneshotu.
3. Zatrzymać `banaszek-menu.service`.
4. Wykonać świeży `pg_dump --format=custom menu`, archiwum `/var/lib/banaszek-menu/uploads` i zweryfikować je przez `pg_restore -l` oraz `gzip -t`.
5. Zachować pełną kopię `/opt/banaszek-menu` jako wersję rollback z datą UTC.
6. Z katalogu staged, z env usługi, wykonać `npm run db:migrate`.
7. Atomowo zamienić katalog staged z bieżącym, uruchomić usługę i sprawdzić `http://127.0.0.1:8080/api/health` oraz publiczną domenę.
8. Dopiero po poprawnych healthcheckach ponownie uruchomić timer synchronizacji.

Migracje dla prowadzenia kasy i kont administratorów są addytywne. Rollback kodu nie wymaga cofania bazy. Odtworzenie bazy usuwa późniejsze dane i wymaga osobnej decyzji.
