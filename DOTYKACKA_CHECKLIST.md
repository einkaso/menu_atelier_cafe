# Dotykačka — lista przygotowania cyfrowego menu

Ten dokument jest stale aktualizowaną listą ustawień, które trzeba wykonać lub sprawdzić w Dotykačce przed uruchomieniem cyfrowego menu.

## Nowe: kolejność produktów i alergeny

- [ ] Uzupełnić alergeny przy produktach w Dotykačce. Menu pokaże przycisk „Alergeny i skład” tylko wtedy, gdy POS zwróci co najmniej jeden alergen.
- [ ] Ustawić rozsądną kolejność produktów w kategoriach. Będzie ona punktem wyjścia; panel menu pozwoli później zapisać własny układ i podgrupy bez zmieniania POS.
- [ ] Po zmianie produktów, alergenów lub kolejności uruchomić synchronizację z Dotykačką.
- [ ] Sprawdzić, czy `banaszek-menu-sync.timer` jest aktywny; automatyczna synchronizacja i tłumaczenia wykonują się co 2 minuty.
- [ ] Po zakończonej synchronizacji tablet pobierze zmiany po powrocie do aplikacji albo automatycznie w ciągu 60 sekund.

## Kody PLU i oznaczenia alkoholi

- [ ] Wprowadzać kod koncesyjny i kod katalogowy jako dwa osobne PLU, np. `B` oraz `WIN45`.
- [ ] Dla nowych alkoholi używać prefiksów: `WIN`, `WHI`, `GIN`, `RUM`, `VOD`, `TEQ`, `LIK`, `BRA`.
- [ ] Ten sam trunek sprzedawany jako kieliszek/shot i butelka powinien otrzymać ten sam kod katalogowy.
- [ ] Pozycja wina na kieliszek musi mieć w PLU wspólny kod `WINxx`. EAN jest zalecany jako pomoc w identyfikacji i wyszukiwaniu informacji, ale nie jest wymagany — dotyczy to szczególnie win z małych winnic.
- [ ] Najpierw przetestować jeden produkt z kodem w PLU; dopiero po prawidłowej synchronizacji usuwać kod `WINxx` z nazwy.
- [ ] Jeśli panel pokaże kilka kodów katalogowych przy jednym produkcie, pozostawić tylko właściwy kod w Dotykačce.
- [ ] W panelu „Kolejność zakładek” zaznaczyć „Pokazuj kod PLU” przy kategoriach, w których kod ma być widoczny dla gościa. Dla win ustawienie jest domyślnie włączone.
- [ ] Kod katalogowy wpisywać bez spacji w formacie trzech liter i liczby, np. `WIN45` lub `WHI12`.

**Ważne:** nie wykonujemy od razu masowych zmian. Najpierw uruchamiamy połączenie API i testujemy po jednym produkcie z każdego rodzaju.

## 1. Dostęp i licencja

- [ ] Potwierdzić, że posiadana licencja Dotykački obsługuje receptury (KOMPLET lub wyższa).
- [ ] Dla piwa lanego prowadzić surowiec KEG w litrach i utworzyć opakowanie magazynowe odpowiadające pojemności beczki (Bosman: 30 l).
- [ ] Produktom sprzedażowym piwa lanego wyłączyć bezpośrednie odliczanie z magazynu; odpis realizuje receptura z uwzględnieniem straty (Bosman 0,5 l: 0,515 l, Bosman 0,3 l: 0,309 l).
- [ ] W kategorii `Składniki` oznaczać tagiem `INWENT` wszystkie i tylko te surowce, które mają trafiać do zleceń inwentaryzacyjnych. Usunięcie tagu wyłącza produkt po następnej synchronizacji.
- [ ] Uzyskać `DOTYKACKA_REFRESH_TOKEN` z prawem odczytu produktów, kategorii i magazynu.
- [ ] Ustalić `DOTYKACKA_CLOUD_ID`.
- [ ] Ustalić `DOTYKACKA_WAREHOUSE_ID` właściwego magazynu kawiarni.
- [ ] Potwierdzić, czy kawiarnia korzysta z jednego, czy z kilku magazynów.
- [ ] Sprawdzić, czy API zwraca etykiety produktów, widoczność oraz aktualny stan magazynowy.

## 2. Kategorie — przyszłe zakładki menu

- [ ] Przejrzeć wszystkie kategorie w Dotykačce i usunąć lub ukryć nieużywane.
- [ ] Ustalić ostateczne nazwy kategorii źródłowych. Aplikacja łączy ciasta i desery w kartę `NA SŁODKO` w menu gościa i kelnera, a drinki oraz obsługiwane kategorie alkoholi w `Alko Bar`.
- [ ] Ustawić kategorie w kolejności, w jakiej mają występować na tablecie.
- [ ] Sprawdzić poprawność polskich nazw, wielkich liter i literówek.
- [ ] Sprawdzić, które kategorie mają być widoczne w menu.
- [ ] Po pierwszej synchronizacji sprawdzić, czy każda kategoria utworzyła właściwą zakładkę.
- [ ] Uzupełnić w panelu aplikacji angielskie nazwy kategorii, jeśli automatyczne tłumaczenie będzie wymagało korekty.

## 3. Ogólne zasady publikowania produktów

- [ ] Utworzyć i stosować dokładnie jedną etykietę `menu` dla produktów przeznaczonych do cyfrowej karty.
- [ ] Sprawdzić, czy etykieta `menu` jest zapisana wszędzie identycznie, bez dodatkowych spacji.
- [ ] Przypisać każdy publikowany produkt do właściwej kategorii.
- [ ] Sprawdzić nazwę, cenę brutto, stawkę VAT i widoczność każdego produktu.
- [ ] Dla produktów magazynowych włączyć kontrolowanie stanu, jeżeli ich dostępność ma zależeć od magazynu.
- [ ] Nie usuwać produktów sezonowych — wyłączać ich widoczność albo korzystać ze stanu magazynowego.
- [ ] Uzgodnić, które produkty mają znikać automatycznie przy stanie `0`.
- [ ] Po pierwszej synchronizacji porównać liczbę produktów z etykietą `menu` w Dotykačce i w panelu aplikacji.

## 4. Ciasta i produkty sezonowe

- [ ] Pozostawić w Dotykačce pełny katalog ciast kupowanych od różnych producentów.
- [ ] Każde ciasto przeznaczone kiedykolwiek do publikacji oznaczyć etykietą `menu`.
- [ ] Ciasta dostępne danego dnia ustawiać jako widoczne; niedostępne ukrywać albo ustawiać ich stan na `0`.
- [ ] Sprawdzić, czy sprzedaż porcji ciasta prawidłowo zmniejsza jego stan.
- [ ] Produkt ze stanem `0` jest automatycznie ukrywany tylko wtedy, gdy w Dotykačce ma ustawione „Sprzedaż poniżej stanu magazynowego: wyłączona”.
- [ ] Produkty przygotowywane na miejscu mogą pozostać widoczne przy stanie `0`, jeżeli sprzedaż poniżej stanu jest dozwolona lub dozwolona z ostrzeżeniem.
- [ ] Zdjęcia, opisy i tłumaczenia ciast uzupełniać w panelu naszej aplikacji, a nie w Dotykačce.

## 4A. Produkty promowane na stronie powitalnej

- [ ] Utworzyć i stosować dokładnie jedną etykietę `promo` dla aktualnie promowanych produktów.
- [ ] Pamiętać, że sam tag `promo` nie publikuje produktu — produkt musi mieć również tag `menu`.
- [ ] Liczba produktów promowanych jest dowolna; tag `promo` nadajemy wszystkim pozycjom, które aktualnie chcemy wyróżnić.
- [ ] Sprawdzić, czy produkt ma prawidłową cenę, opis i zdjęcie przed dodaniem tagu `promo`.
- [ ] Dodać tag `promo`, aby produkt pojawił się na stronie powitalnej i został wyróżniony w swojej kategorii.
- [ ] Usunąć tag `promo` po zakończeniu promocji; produkt z tagiem `menu` pozostanie wtedy w zwykłej karcie.
- [ ] Sprawdzić, czy produkt ukryty w POS albo bez tagu `menu` nie pojawia się w promocjach nawet wtedy, gdy zachował tag `promo`.

## 4B. Kolejność kategorii w menu

- [ ] Kategorie nadal tworzymy i nazywamy w Dotykačce.
- [ ] Kolejność widoczną dla gości ustawiamy w panelu aplikacji w sekcji „Kolejność zakładek”.
- [ ] Można zachować kolejność źródłową z Dotykački, ustawić ją ręcznie albo zaakceptować sugestię systemu.
- [ ] Sugestia uwzględnia porę roku, porę dnia oraz aktywne produkty z tagiem `promo`, ale nigdy nie publikuje zmiany bez akceptacji.
- [ ] Kategoria bez żadnego widocznego produktu z tagiem `menu` nie pojawi się jako zakładka niezależnie od ustawionej kolejności.

## 5. Wina sprzedawane w butelkach

- Kod `WINxx` zapisujemy w polu PLU produktu w Dotykačce. Nie dopisujemy go już do nazwy; aplikacja odczytuje go z PLU i pokazuje osobno.
- Butelka i kieliszek tego samego wina używają wspólnego kodu `WINxx`; opis i dane wina są współdzielone przez oba produkty.
- Uzupełniaj EAN oraz dostawcę przy przyjęciu towaru, jeśli są dostępne — aplikacja zapisuje oba identyfikatory. Brak EAN nie blokuje publikacji.
- Dla win, piw, whisky, brandy, koniaków i pozycji Alko Baru panel może wyszukać dane oraz zdjęcia produktu. Najpierw sprawdza stronę rozpoznanego dostawcy, a produkt posiadający EAN także w katalogu Open Food Facts.
- EAN i kod dostawcy zwiększają trafność wyszukiwania, ale system potrafi szukać również po nazwie produktu i dostawcy.
- Jeżeli bezpłatne źródła nie wystarczą, otwórz wyszukiwanie ręczne, wybierz właściwą stronę producenta lub sklepu i wklej jej adres w panelu. System sam odczyta z niej pola i zdjęcia.
- Znalezione opisy, parametry, zdjęcia i adresy źródeł pozostają propozycją. Administrator decyduje, czy odrzucić dane, uzupełnić tylko braki czy zastosować propozycję. Już zapisane zdjęcie pozostaje bez zmian niezależnie od zdjęć znalezionych w nowym źródle; aby je zastąpić, najpierw trzeba kliknąć „Usuń zdjęcie”, a dopiero potem zaimportować nowe.
- Zmiana dostawcy ani utworzenie kolejnego produktu z tym samym `WINxx` nie blokuje publikacji. Aplikacja automatycznie wykorzystuje wcześniej przygotowaną kartę wina.
- Nowe źródło może automatycznie uzupełnić puste pola, ale nie zastępuje istniejącego opisu.
- W panelu funkcja **Aktualizuj o nowe/inne dane** pozwala opcjonalnie wrócić do nowych źródeł i wybrać:
  - **Zostaw obecny opis** — cała dotychczasowa karta pozostaje bez zmian.
  - **Uzupełnij tylko braki** — nowe dane trafiają wyłącznie do pustych pól.
  - **Zaktualizuj z tego źródła** — niepuste dane z nowego źródła zastępują odpowiednie pola.
- Historia dostawców i podjętych decyzji pozostaje zapisana przy produkcie.

- [ ] Sprawdzić, czy każde wino ma osobny produkt odpowiadający konkretnej butelce.
- [ ] Sprawdzić cenę sprzedaży całej butelki.
- [ ] Włączyć odliczanie całej butelki ze stanu magazynowego.
- [ ] Rozważyć zablokowanie sprzedaży poniżej stanu magazynowego.
- [ ] Przypisać produkt do kategorii `Wina` i oznaczyć etykietą `menu`.
- [ ] Dane takie jak kraj, region, szczep, kolor, poziom słodyczy, styl i aromaty uzupełniać w panelu naszej aplikacji.
- [ ] Dla nowego wina, piwa, mocnego alkoholu lub pozycji Alko Baru użyć funkcji „Sprawdź bezpłatne źródła”; gdy potrzeba, wkleić adres znalezionej strony produktu. Sprawdzić adresy źródłowe i propozycje przed akceptacją.
- [ ] Status „wegańskie” ustawiać na „Tak — potwierdzone” wyłącznie na podstawie wyraźnej informacji producenta lub wiarygodnego źródła.
- [ ] Sprawdzić, czy filtr win pokazuje dostępne kombinacje: kolor, smak, musowanie, kieliszek/butelka, 0%, wegańskie oraz kraj.
- [ ] W panelu menu, w zakładce „Połączenie”, wybrać właściwy oddział Dotykački. Bez oddziału aplikacja nie może pobrać raportu sprzedaży.
- [ ] Po synchronizacji sprawdzić komunikat raportu: liczbę pozycji sprzedażowych oraz liczbę win ze sprzedażą w ostatnich 30 dniach.
- [ ] Oznaczenie „Wybór naszych gości” jest wyliczane automatycznie z liczby sprzedanych sztuk z ostatnich 30 dni. Ze względu na limit API okres jest pobierany w odcinkach dobowych i sumowany przez aplikację.
- [ ] System wskazuje najwyżej 3 najlepiej sprzedające się wina spośród pozycji aktualnie dostępnych; po wyczerpaniu zapasu ranking przelicza się bez ręcznej zmiany.
- [ ] Lista krajów w filtrze jest dynamiczna: pokazuje wyłącznie kraje pasujące do aktualnie dostępnych win i pozostałych wybranych filtrów.

## 6. Wina „Dzisiaj na kieliszki”

- [ ] Ostatecznie potwierdzić wielkość standardowego kieliszka — proponowane `150 ml`.
- [ ] Wybrać jedno wino do pierwszego testu, bez przygotowywania od razu całej karty.
- [ ] Dla testowego wina utworzyć osobny produkt sprzedażowy: `[nazwa wina] — kieliszek 150 ml`.
- [ ] Produkt butelkowy nazywać samą nazwą wina, bez dopisku „butelka”. Dopisek „kieliszek” w drugim produkcie służy obsłudze POS i nie tworzy osobnej nazwy ani opisu w menu.
- [ ] Przypisać produkt kieliszkowy do tej samej kategorii `Wina`.
- [ ] Dodać do produktu kieliszkowego etykietę `menu`.
- [ ] Dodać do produktu kieliszkowego drugą etykietę `kieliszek`.
- [ ] EAN uzupełnić, jeżeli producent go nadał; brak EAN nie blokuje oferty kieliszkowej.
- [ ] Ustawić osobną cenę brutto za kieliszek.
- [ ] Wyłączyć bezpośrednie odliczanie produktu kieliszkowego z magazynu.
- [ ] Utworzyć recepturę produktu kieliszkowego, której składnikiem jest właściwa butelka.
- [ ] Dla butelki `750 ml` i kieliszka `150 ml` ustawić w recepturze zużycie `0,2` butelki.
- [ ] Włączyć widoczność produktu kieliszkowego tylko wtedy, gdy dane wino jest aktualnie oferowane na kieliszki.
- [ ] Wyłączyć widoczność produktu kieliszkowego po zakończeniu oferty.
- [ ] Aplikacja dodatkowo ukrywa ofertę kieliszkową, gdy powiązana butelka o tym samym kodzie `WINxx` nie jest dostępna w menu.
- [ ] Sprawdzić w aplikacji, czy produkt pojawił się w oknie „Dzisiaj na kieliszki”, a nie jako osobna zakładka.
- [ ] Wykonać testową sprzedaż jednego kieliszka i sprawdzić, czy stan butelki spadł o `0,2`.
- [ ] Wykonać łącznie pięć sprzedaży testowych i sprawdzić, czy stan spadł dokładnie o jedną butelkę.
- [ ] Sprawdzić, czy sprzedaż całej butelki nadal odejmuje `1` butelkę.
- [ ] Ustalić procedurę korekty magazynu dla rozlania, degustacji, zepsucia albo niewykorzystanej końcówki otwartej butelki.
- [ ] Dopiero po udanym teście skonfigurować pozostałe wina sprzedawane na kieliszki.

## 7. Kawa i dodatki

- [ ] Sprawdzić ceny podstawowych kaw.
- [ ] Utrzymywać dodatki do kaw jako produkty z aktualnymi cenami w Dotykačce.
- [ ] Przypisać grupę `DODATKI DO KAWY` do każdej kawy przez „Połączenia / dodatki”. Aplikacja pobierze wyłącznie tę grupę do sekcji „Dopasuj swoją kawę”; grupy `KAWY` nie należy używać jako listy dodatków.
- [ ] Sprawdzić po synchronizacji: dodatkowe espresso, wszystkie rodzaje mleka, bitą śmietanę, syrop, dodatkowe mleko i DCAF.
- [ ] Kawy paczkowane przeznaczone do sprzedaży na wynos oznaczać jednocześnie tagami `MENU` oraz `ZIARNO`.
- [ ] AeroPress, Chemex, Drip i V60 utrzymywać w podgrupie kaw alternatywnych, a dostępne ziarna w grupie dodatków zawierającej słowo `ZIARNO` lub `ZIARNA`.
- [ ] Sprawdzić w menu gościa, że metoda i ziarno są aktywne od początku. Interfejs sugeruje metodę jako krok pierwszy, ale pozwala zacząć od ziarna.
- [ ] Sprawdzić w menu kelnerskim, że przed dodaniem kawy alternatywnej wybrano dokładnie jedno ziarno, a następnie można dołączyć dowolną liczbę zwykłych dodatków do kawy.
- [ ] Syropy Leśne Życie przeznaczone jako dodatek utrzymywać z włączonym stanem magazynowym. Pełne butelki sprzedawane z półki oznaczać tagiem `PÓŁKA`.

## 7A. Alko Bar i warianty obsługi

- [ ] Uzupełnić w panelu rodzaj pozycji, bazę, profil smaku, sposób podania, moc, pochodzenie i objętość. System może zaproponować wartości z nazwy, opisu lub znalezionej strony, ale ręczny zapis ma pierwszeństwo.
- [ ] Sprawdzić te same filtry w menu gościa i kelnera: rodzaj, baza, profil smaku, podanie oraz alkoholowe/0%.
- [ ] Dla produktów oferowanych na ciepło i zimno używać tagów `WARM` i `COLD`. Oba tagi wymuszają wybór wariantu w strefie kelnera.
- [ ] Tag `TOGO` dodaje kelnerowi opcję „Zapakuj na wynos”; bez jej wybrania produkt pozostaje domyślnie zamówieniem na miejscu. Tag nie dodaje ikony w menu gościa.
- [ ] Dla pełnych butelek alkoholu sprawdzić ostrzeżenie działające od 21:58 do 06:02. Pozycje 0% oraz porcje nie uruchamiają ostrzeżenia.
- [ ] Nie używać tagów `BABY` ani `BABYONLY` — funkcja została wycofana i tagi nie sterują menu.

## 7B. Zdjęcia produktów

- [ ] Zdjęcia z urządzenia mogą być JPG, PNG, WebP, AVIF, HEIC lub HEIF i mieć do 50 MB. Aplikacja koryguje orientację, zmniejsza je do maksymalnie 1600 px i optymalizuje do około 2,4 MB.
- [ ] Dla „Na słono” można zapisać maksymalnie pięć zdjęć oraz wskazać, które ma być pierwsze.
- [ ] Nowy opis, link źródłowy ani akceptacja nowych danych nie mogą usunąć lub podmienić wcześniej zapisanego zdjęcia. Aby wstawić inne, najpierw używamy przycisku „Usuń zdjęcie”, a dopiero potem importujemy nowe.

## 8. Herbata

- [ ] Zweryfikować listę aktualnie sprzedawanych herbat i ich ceny.
- [ ] Każdą publikowaną herbatę przypisać do kategorii `Herbata` i oznaczyć etykietą `menu`.
- [ ] Opisy, temperaturę wody i czas parzenia uzupełniać w panelu naszej aplikacji.

## 9. Test końcowy przed publikacją

- [ ] Zmienić testowo cenę jednego produktu w Dotykačce i sprawdzić zmianę w menu.
- [ ] Wyłączyć widoczność jednego produktu i sprawdzić, czy zniknął z menu.
- [ ] Ustawić stan testowego produktu na `0` i sprawdzić regułę ukrywania.
- [ ] Włączyć ponownie produkt i sprawdzić jego powrót.
- [ ] Sprawdzić wszystkie zakładki i kolejność kategorii.
- [ ] Sprawdzić polską oraz angielską wersję menu.
- [ ] Sprawdzić co najmniej jedno wino na butelkę i jedno na kieliszek.
- [ ] Sprawdzić jeden produkt ze zdjęciem i jedną pozycję polecaną.
- [ ] Sprawdzić jeden produkt Alko Baru w filtrach gościa i kelnera oraz zapisać mu nowy opis, upewniając się, że wcześniejsze zdjęcie pozostało bez zmian.
- [ ] Dopiero po przejściu całej listy zastąpić dotychczasowy plik PDF nową aplikacją.

## Decyzje do podjęcia

- [ ] Czy standardowy kieliszek wina ma mieć `150 ml`?
- [ ] Czy każde wino ma być dostępne w butelce, a tylko wybrane okresowo na kieliszki?
- [ ] Jak często aplikacja ma automatycznie synchronizować dane — proponowane co 5 minut oraz dodatkowo ręcznie z panelu.
- [ ] Kto z obsługi może włączać i wyłączać pozycje „na kieliszki”?
- [ ] Czy pozycja kieliszkowa ma znikać wyłącznie po ręcznym wyłączeniu, czy również na podstawie stanu magazynowego?
