# Grafik, ewidencja czasu pracy i rezerwacje

Stan dokumentu: 21 września 2026 r.

## Nawigacja modułu

- Wszystkie widoki administratora używają wspólnego czarnego nagłówka, jednakowego logo i przycisku „Menu główne” skrajnie po lewej na podstronach. Strona główna panelu pokazuje kolejno: Instrukcje, Grafik, Rozliczenia, Inwentaryzacja, Pracownicy i Rezerwacje; synchronizacja z Dotykačką oraz wylogowanie pozostają po prawej.
- Podstrony pracownika „Instrukcje”, „Grafik”, „Rezerwacje” i „Inwentaryzacja” rozpoczynają się od przycisków „Wyloguj” oraz „← Menu”, a następnie pokazują większe logo i nazwę bieżącego obszaru. Widok inwentaryzacji nie wyświetla dodatkowego pływającego zestawu skrótów na dole.
- Główny widok kelnera pokazuje po lewej „Wyloguj” i „← Menu”, następnie logo oraz „Rachunek dla gościa”, a dalej kolejno: Grafik, Rezerwacje, Inwentaryzacja i Rozliczanie. Nazwa zalogowanego pracownika oraz zatwierdzone napiwki są prezentowane razem po prawej.
- Administrator otwiera zarządzanie zespołem przez przycisk „Pracownicy” w górnym pasku. Panel pracowników zawiera dostępy, karty QR, ustawienia grafiku, podziękowania na rachunku oraz dane kontaktowe.
- Grafik administratora jest dostępny pod `/admin/workforce`. Przycisk „+ Dodaj zmianę” znajduje się w nagłówku sekcji „KROK 2 — Ułóż i opublikuj grafik” i jest wyróżniony ciemnoniebieskim tłem oraz białym napisem.
- Przycisk „+ Dodaj zmianę” jest nieaktywny tylko wtedy, gdy nie ma żadnego aktywnego pracownika oznaczonego „Grafik: TAK”. Panel pokazuje wtedy komunikat prowadzący do ustawień pracowników.
- Skaner czasu pracy uruchamia się z panelu „Pracownicy” przyciskiem „Uruchom skaner QR”. Kody QR są obsługiwane w tym samym panelu, a nie w formularzu układania grafiku.

## Uprawnienia i źródła danych

- Lista aktywnych pracowników, ich identyfikatory i kody kreskowe pochodzą z Dotykački. Synchronizacja zapisuje pole `barcode` w `waiter_employees`.
- Grafik i rezerwacje są dostępne pracownikowi dopiero po zalogowaniu własnym PIN-em. Pełny plan zespołu, raport godzin, kody QR, korekty i konfiguracja kalendarzy są dostępne wyłącznie administratorowi.
- Kod QR jest generowany lokalnie. Zawiera identyfikator oraz kod kreskowy pracownika podpisane HMAC. Zmiana kodu w Dotykačce unieważnia poprzednią kartę QR.
- Karty QR są wyświetlane i pobierane w panelu „Pracownicy”. Z tego samego miejsca administrator może wydrukować wszystkie karty oraz uruchomić tablet ze skanerem.
- Jeżeli pracownik nie ma kodu kreskowego, administrator może wybrać „Wygeneruj i wyślij do Dotykački”. Aplikacja tworzy losowy kod `MBE-…`, zapisuje go w rekordzie pracownika przez API Dotykački, weryfikuje odczyt i dopiero wtedy tworzy lokalną kartę QR.
- Przed zapisem aplikacja ponownie odczytuje pracownika z Dotykački. Istniejący kod nie jest nadpisywany, a aktualizacja używa ETag, aby nie zastąpić równoczesnej zmiany wykonanej w Zdalnym Zarządzaniu.
- `WORKFORCE_QR_SECRET` może być osobnym sekretem. Bez niego podpis używa `ADMIN_SESSION_SECRET`.

## Panel pracowników

- Każdy pracownik jest pokazany jako osobny, wyraźnie obramowany blok z ciemnoniebieskim nagłówkiem. Etykieta „Grafik: TAK/NIE” pozwala od razu rozpoznać stan planowania.
- Kafel „Uwzględniać w grafiku?” zapisuje decyzję natychmiast po wybraniu „Tak” albo „Nie”. Wyłączenie wymaga potwierdzenia administratora.
- Sekcja „Informacje o pracowniku” jest domyślnie zwinięta. Zawiera stawkę za godzinę w PLN, numer telefonu oraz adres e-mail. Pola przyjmują stawkę od 0 do 10 000 zł z maksymalnie dwoma miejscami po przecinku, telefon do 40 znaków i prawidłowy adres e-mail do 254 znaków.
- Stawka godzinowa jest obecnie informacją administracyjną. System nie wylicza z niej automatycznie wynagrodzenia ani nie dopisuje go do rozliczenia kasowego.
- Dane kontaktowe i ustawienie grafiku są przechowywane lokalnie w aplikacji. Synchronizacja pracowników z Dotykačką aktualizuje dane źródłowe, ale nie nadpisuje tych pól.
- Pola formularzy używają jasnego tła i ciemnoniebieskiego tekstu. Poszczególne osoby mają większy odstęp, obramowanie i osobny pasek nagłówka, aby ich ustawienia nie zlewały się ze sobą.

## Instrukcje dla pracowników

- Administrator może dołączyć do instrukcji maksymalnie 10 zdjęć lub dokumentów PDF. Pojedynczy plik może mieć do 25 MB; zdjęcia są optymalizowane przed zapisaniem.
- Załączniki są dostępne wyłącznie po zalogowaniu jako administrator lub pracownik. Pracownik otwiera zdjęcia i PDF-y bezpośrednio w czytniku instrukcji.
- Dodanie albo usunięcie załącznika aktywnej instrukcji tworzy jej nową wersję i zeruje potwierdzenia bieżącej wersji. Pracownicy muszą ponownie zapoznać się z całym materiałem.
- Pliki są przechowywane w trwałym katalogu `uploads/staff-instructions` i powinny być uwzględniane w kopii zapasowej razem z pozostałymi przesłanymi materiałami.

## Dyspozycje i grafik

- Pracownik zgłasza dyspozycję dla całego tygodnia, wskazuje dostępne dni, opcjonalne przedziały godzinowe i minimalną/maksymalną liczbę zmian.
- W panelu „Pracownicy” administrator określa osobno, czy daną osobę uwzględniać w grafiku. Wyłączenie blokuje nowe dyspozycje i planowanie zmian po stronie interfejsu oraz API, ale nie usuwa wcześniejszych zmian, godzin, rozliczeń ani napiwków.
- Rozwijana sekcja informacji pracownika przechowuje stawkę godzinową, numer telefonu i adres e-mail. Dane nie są nadpisywane podczas synchronizacji z Dotykačką i są dostępne wyłącznie administratorom.
- Tydzień dyspozycji musi zaczynać się w poniedziałek i być oddalony o co najmniej siedem dni. Administrator może planować dowolny tydzień.
- Administrator widzi dyspozycje całego zespołu, godziny pracy lokalu i wydarzenia z prywatnego kanału ICS. Pracownik nie otrzymuje danych administracyjnych ani wydarzeń.
- Zapis planu tworzy szkic. Publikacja udostępnia każdemu wyłącznie jego zmiany. Kolejna publikacja zwiększa numer wersji i powoduje komunikat o aktualizacji kalendarza.
- Podczas układania grafiku administrator widzi w jednym kontekście godziny lokalu, aktywne rezerwacje z danego tygodnia oraz wydarzenia z prywatnego kalendarza.
- Przycisk „Pokaż, z kim pracuję” pobiera skład wyłącznie dla dni, w których zalogowany pracownik ma zmianę.

### Skutek ustawienia „Grafik: NIE”

- Pracownik znika z listy osób dostępnych przy dodawaniu nowej zmiany i nie może zapisać nowej dyspozycji.
- Serwer ponownie sprawdza stan pracownika podczas zapisu szkicu i publikacji. Nie można obejść blokady przez ręczne wywołanie API.
- Jeżeli pracownik występuje już w otwartym szkicu, jego wiersz zostaje oznaczony jako „wyłączony z planowania”. Przed kolejnym zapisem lub publikacją trzeba usunąć tę zmianę albo przypisać ją innej osobie.
- Wcześniej opublikowany grafik nie jest automatycznie kasowany. Dzięki temu historia i istniejące potwierdzenia pozostają spójne; blokada dotyczy dalszego planowania.
- Pracownik nadal widzi ewidencję czasu, może zgłaszać korekty wcześniejszych godzin i pozostaje obecny w raportach miesięcznych oraz rozliczeniach okresowych. W raporcie godzin otrzymuje dopisek „poza grafikiem”.
- Rozliczenia kasowe i napiwki nie filtrują pracowników według ustawienia `include_in_schedule`.

### Typowy przebieg układania grafiku

1. W panelu „Pracownicy” ustaw „Grafik: TAK” dla osób, które mogą być planowane.
2. Pracownicy zapisują dyspozycje na tydzień dostępny do zgłoszeń.
3. Administrator otwiera „Grafik”, sprawdza dyspozycje, godziny lokalu, rezerwacje i wydarzenia.
4. W sekcji „KROK 2” wybiera „+ Dodaj zmianę”, pracownika, dzień oraz godziny.
5. „Zapisz szkic” zachowuje plan bez udostępniania go pracownikom.
6. „Opublikuj grafik” udostępnia zmiany i zwiększa wersję przy każdej kolejnej publikacji.

## Kalendarz pracownika

- Każdy pracownik ma prywatny, podpisany adres iCalendar. Nie wymaga on sesji PIN i dlatego nie wolno go udostępniać innym osobom.
- iPhone może subskrybować adres przez `webcal:`. Publikowane aktualizacje zachowują identyfikatory zdarzeń i numer wersji grafiku.
- Pracownik może też pobrać jednorazowy plik `.ics`. Kliknięcie opcji kalendarza zapisuje potwierdzenie aktualizacji bieżącej wersji.
- Adres `webcal://` służy do subskrypcji w aplikacji Kalendarz. Jeżeli formularz konfiguracyjny wymaga bezpiecznego URL, należy użyć tego samego adresu ze schematem `https://`; aplikacja normalizuje wejściowy `webcal:` do HTTPS przed pobraniem.

## Odbicia QR i korekty

- Pierwsze uruchomienie trybu `/admin/workforce/kiosk` wymaga aktywnej sesji administratora. Tablet otrzymuje osobny, podpisany dostęp urządzenia na 180 dni, uruchamia tylną kamerę i próbuje utrzymać włączony ekran; dzięki temu wygaśnięcie zwykłej 12-godzinnej sesji administratora nie zatrzymuje ewidencji.
- Pierwszy skan rozpoczyna pracę, kolejny ją kończy. Dwa odczyty w ciągu 20 sekund są blokowane, a wyjścia nie można odbić wcześniej niż minutę po wejściu.
- Każde odbicie trafia do audytu `work_time_events`; sparowany czas pracy do `work_time_entries`. Miesięczne sumy są liczone w minutach.
- Otwarta sesja dłuższa niż 12 godzin albo zakończona zmiana bez pokrywającego się odbicia wywołuje komunikat po następnym logowaniu PIN-em.
- Pracownik składa wniosek o dopisanie godzin z datą, przedziałem i powodem. Dopiero akceptacja administratora tworzy zatwierdzony wpis czasu.

## Rezerwacje

- Rezerwacja przechowuje imię i kontakt gościa, liczbę osób, początek i koniec, opis miejsca/stolika, specjalne życzenie oraz osobę, która ją dodała.
- Anulowanie jest operacją statusową i pozostawia ślad audytowy. Historia rezerwacji nie jest fizycznie kasowana.
- Na dwie godziny przed terminem każdy pracownik otrzymuje jednorazowy komunikat. Potwierdzenie jest przechowywane osobno dla pracownika i rezerwacji.
- Od godziny przed terminem aż do przygotowania stolika komunikat wraca przy każdym nowym logowaniu. Można zamknąć go na bieżącą sesję, aby obsłużyć zamówienie.
- Stolik oraz specjalne życzenie mają niezależne statusy gotowości wraz z imieniem pracownika i czasem potwierdzenia.

## Kalendarz rezerwacji na iPhone

- Administrator może podać prywatny adres ICS istniejącego współdzielonego kalendarza. Adres jest szyfrowany AES-256-GCM w bazie.
- Import z istniejącego kalendarza jest wykonywany automatycznie razem z cykliczną synchronizacją aplikacji, zwykle co około 2 minuty. Przycisk „Odśwież rezerwacje teraz” wymusza dodatkowy odczyt. Zdarzenia są aktualizowane po UID; nazwa, liczba osób, kontakt, miejsce i opis są rozpoznawane z pól zdarzenia, a niepełne rekordy należy uzupełnić w module.
- Aplikacja zachowuje osobny, prywatny kalendarz subskrypcyjny `webcal:` jako kanał awaryjny i podgląd techniczny.
- Kanał subskrypcyjny wysyła `REFRESH-INTERVAL` oraz walidatory `ETag` i `Last-Modified`, aby klient kalendarza mógł wykryć zmianę bez pobierania niezmienionej treści. Jest to zalecenie dla klienta, nie mechanizm push: rzeczywisty harmonogram odświeżania wybiera iOS. Natychmiastowe dwukierunkowe zmiany wymagają połączenia CalDAV, a nie subskrypcji ICS.
- W panelu administratora można jednorazowo połączyć zapis CalDAV z tym samym kalendarzem iCloud. Wymagany jest adres konta Apple i hasło przeznaczone dla aplikacji; aplikacja nigdy nie prosi o główne hasło Apple. Poświadczenia oraz odkryty adres kalendarza są szyfrowane AES-256-GCM.
- Po połączeniu CalDAV utworzenie, edycja lub anulowanie rezerwacji przez administratora albo pracownika zapisuje zmianę bezpośrednio w kalendarzu iCloud. Cykliczna synchronizacja ponawia zapis wszystkich rezerwacji z aplikacji, więc chwilowy błąd sieci nie wymaga działania użytkownika. Dotychczasowi odbiorcy wspólnego kalendarza nie muszą usuwać ani ponownie dodawać subskrypcji.
- Dopóki CalDAV nie jest połączony, panel pokazuje wyraźne ostrzeżenie, a zapis rezerwacji nie może być opisany jako wysłany do iCloud. Publiczny ICS zapewnia odczyt, ale nie daje prawa zapisu.
- Wydarzenia zapisane przez aplikację mają stały UID `atelier-reservation-<id>@atelier-cafe`. Importer rozpoznaje ten UID i aktualizuje ten sam rekord po zmianie wykonanej na iPhonie, zamiast tworzyć duplikat. Edycja zaimportowanej rezerwacji w aplikacji wyszukuje jej oryginalny zasób CalDAV po UID i aktualizuje go pod dotychczasowym adresem.
- Brak świeżo zapisanej rezerwacji w zbiorczym odczycie iCloud nie jest od razu traktowany jako jej usunięcie. Obowiązuje 30-minutowy okres ochronny, a późniejsze anulowanie wymaga dodatkowego sprawdzenia jej pliku pod stałym adresem CalDAV. Błąd połączenia lub opóźnienie indeksowania iCloud nigdy nie anuluje rezerwacji.
- Import nie zgaduje danych. Jeśli tytuł lub notatka kalendarza nie zawierają liczby osób, kontaktu albo miejsca, odpowiednie pola pozostają puste. Pełna notatka z wydarzenia jest zachowywana. Interfejs pokazuje wtedy informację o braku danych, ale nie zapisuje fikcyjnych wartości takich jak „1 osoba”.
- Kliknięcie „Edytuj” przewija do podświetlonego formularza edycji. Przyciski nagłówka i czynności rezerwacji mają kontrastowe tło oraz widoczny fokus na komputerze i tablecie.

## Dane sprzedażowe i rekomendacje obsady

- Pierwsza reguła planistyczna oznacza wydarzenie jako wymagające co najmniej dwóch osób na zmianie.
- Tabele i interfejs planera są przygotowane do dalszej analizy obrotów Dotykački według dnia tygodnia i godzin. Automatyczny model obsady nie publikuje ani nie modyfikuje grafiku samodzielnie; ostateczna decyzja zawsze należy do administratora.

## Model danych i migracje

- Migracja `0037_staff_instructions.sql` tworzy instrukcje i potwierdzenia pracowników.
- Migracja `0038_workforce_planning.sql` tworzy dyspozycje, grafiki, zmiany, potwierdzenia kalendarzy, odbicia i korekty czasu pracy.
- Migracja `0039_reservations.sql` tworzy rezerwacje, powiadomienia i audyt zdarzeń.
- Migracja `0040_staff_instruction_attachments.sql` dodaje zdjęcia i dokumenty PDF do instrukcji.
- Migracja `0041_employee_thank_you_message.sql` dodaje indywidualny tekst podziękowania pracownika.
- Migracja `0042_employee_profile_and_scheduling.sql` dodaje pola `include_in_schedule`, `hourly_rate`, `contact_phone` i `contact_email` do `waiter_employees`.
- Migracja `0043_icloud_calendar_writeback.sql` dodaje zaszyfrowaną konfigurację zapisu CalDAV do iCloud.
- Migracja `0044_reservation_unknown_fields.sql` pozwala pozostawić nieznane pola importowanej rezerwacji puste.
- Wszystkie powyższe migracje są addytywne. Przed uruchomieniem nowej wersji aplikacji należy wykonać `npm run db:migrate`.

## Kontrola po wdrożeniu

1. Otwórz panel „Pracownicy” i sprawdź, czy każda osoba ma etykietę „Grafik: TAK”.
2. Rozwiń „Informacje o pracowniku”, zapisz testową stawkę lub dane kontaktowe i odśwież stronę.
3. Ustaw testowej osobie „Grafik: NIE” i potwierdź, że znika z listy „+ Dodaj zmianę”.
4. Sprawdź, czy ta sama osoba nadal występuje w miesięcznych godzinach i rozliczeniach.
5. Przywróć „Grafik: TAK”, dodaj zmianę, zapisz szkic i opublikuj testowy grafik.
6. Zweryfikuj widok pracownika, prywatny kalendarz ICS oraz działanie skanera QR.
