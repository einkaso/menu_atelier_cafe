# Lokalny agent oświetlenia

Ten katalog zawiera lokalnego agenta urządzeń BleBox w sieci Atelier. Inwentaryzacja działa wyłącznie w prywatnej podsieci IPv4, używa tylko żądań `GET`, nie podąża za przekierowaniami i odczytuje wyłącznie zamkniętą listę endpointów BleBox. Sterowanie jest osobnym przepływem: agent pobiera krótkotrwałe polecenia dla zatwierdzonych kanałów przekaźnikowych, wysyła jawny stan `ON` albo `OFF` i potwierdza efekt ponownym odczytem.

## Inwentaryzacja

```bash
node bridge/lighting/discover.mjs --cidr 192.168.1.0/24 --pretty
```

Wynik rozdziela:

- urządzenia `relay`, `dimmer` i `rgbw`, które technicznie mogą sterować wyjściami;
- urządzenia `input`, które mogą być później źródłem scen;
- urządzenia `unsupported`, których agent nie może sterować;
- każde fizyczne wyjście wraz z aktualnym stanem i możliwościami.

Każdy znaleziony element ma `approval: "REQUIRED"`. Samo wykrycie urządzenia nie dodaje go do panelu i nie pozwala nim sterować. Administrator zatwierdza konkretne wyjścia jako światła, nadaje im nazwy oraz przypisuje pomieszczenie. Identyfikacją urządzenia jest stabilne `stableId`; adres IP może się zmienić i jest tylko bieżącą trasą w sieci.

Nie należy zapisywać wynikowego pliku z adresami i identyfikatorami urządzeń w repozytorium. Agent wysyła inwentaryzację do chronionego endpointu administratora, a część wykonawcza akceptuje wyłącznie urządzenia i kanały zwrócone jako zatwierdzone przez serwer. Polecenie typu `toggle` nie jest obsługiwane.

## Monitoring zamrażarek

`temperature-monitor.mjs` odczytuje sondy „Zamrażarka mała” i „Zamrażarka duża” co 30 sekund oraz wysyła je podpisanym tokenem bridge do aplikacji. Konfiguracja agenta:

```dotenv
BLEBOX_TEMPERATURE_HOST=192.168.1.48
LIGHTING_BRIDGE_SERVER_URL=https://menu.martabanaszek.pl
LIGHTING_BRIDGE_TOKEN=jednorazowo-wygenerowany-token-agenta
TEMPERATURE_REPORT_INTERVAL_MS=30000
BLEBOX_DISCOVERY_CIDR=192.168.1.0/24
```

Alarm w panelu pracownika włącza się dla wartości `-8°C` lub wyższej. Odczyt starszy niż 5 minut jest pokazywany jako osobne ostrzeżenie o braku aktualnych danych.

Produkcyjna usługa uruchamia `agent.mjs`. Agent co 10 minut wykonuje odczytową inwentaryzację sieci, raportuje heartbeat i odświeża stan zatwierdzonych punktów. Samo wykrycie nie aktywuje żadnego wyjścia — zatwierdzenie odbywa się w `/admin/lighting`.
