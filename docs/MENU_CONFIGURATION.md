# Konfiguracja menu i reguły produktów

Stan dokumentu: 20 września 2026 r.

Ten dokument opisuje bieżące zasady konfiguracji produktów. Dane sprzedażowe — nazwa źródłowa, cena, stawka VAT, widoczność, stan magazynowy, receptury i połączenia dodatków — pochodzą z Dotykački. Nasz panel przechowuje warstwę prezentacyjną: opisy, tłumaczenia, zdjęcia, galerie, parametry filtrów, kolejność oraz instrukcje dla pracowników.

## Publikacja i kategorie

- Tag `MENU` publikuje produkt w zwykłej karcie. Tag `PÓŁKA` publikuje pełny produkt w karcie „Z PÓŁKI” tylko przy dodatnim stanie; połączenie obu tagów pokazuje go w obu miejscach.
- Produkt musi być aktywny, widoczny i nieusunięty w Dotykačce oraz nie może być ręcznie ukryty w panelu.
- Kategorie ciast i deserów są łączone zarówno dla gościa, jak i w widoku kelnerskim w jedną kartę `NA SŁODKO`. Dotyczy to także listy pozycji chwilowo ukrytych dla gościa.
- Kategorie drinków i pozostałych alkoholi obsługiwanych jako koktajle są łączone w kartę `Alko Bar`.
- Produkty bez tagu `MENU` i `PÓŁKA` nie trafiają do karty gościa. Aktywne pozycje spoza menu mogą być dostępne kelnerowi w osobnej sekcji „Poza menu”.
- Wyróżniony „Wybór Atelier” na górze kategorii jest klikalny na całej powierzchni i otwiera dokładnie ten sam podgląd opisu, zdjęć, parametrów, ceny i alergenów co zwykła karta tego produktu.

## Doraźna zmiana widoczności przez obsługę

- W zwykłej kategorii strefy kelnera można przełączyć się z aktualnej oferty na ukrytą listę produktów z tagiem `MENU`. Widok „Poza menu” pozostaje osobny i pokazuje wyłącznie aktywne produkty POS bez tagu `MENU` ani `PÓŁKA`; nie pokazuje produktów wyłączonych w Dotykačce.
- Prawo do ukrywania i ujawniania pozycji jest domyślnie wyłączone. Administrator nadaje je imiennie na stronie „Kelnerzy i PIN-y”. Sam PIN kelnerski nie daje tego uprawnienia.
- Każda zmiana wymaga wyboru przyczyny. System zapisuje produkt, poprzedni i nowy stan, pracownika oraz dokładny czas w panelu „Historia widoczności”.
- Ręczne ukrycie wykonane przez administratora ma pierwszeństwo i pracownik nie może go cofnąć.
- Administrator może z raportu usunąć wyjątek pracownika i jednym kliknięciem przywrócić widoczność wynikającą z Dotykački.
- Doraźna zmiana dotyczy cyfrowej karty gościa i nie modyfikuje ustawienia produktu w Dotykačce. Dzięki temu administrator zachowuje źródłową konfigurację POS oraz pełny ślad zmian.

## PLU i kody produktów

Kody koncesyjne i katalogowe zapisujemy jako osobne wartości PLU.

| Kod | Znaczenie |
| --- | --- |
| `A`, `B`, `C`, `0` | kod koncesyjny; `0` oznacza produkt bezalkoholowy |
| `WIN` | wino |
| `WHI` | whisky |
| `GIN` | gin |
| `RUM` | rum |
| `VOD` | wódka |
| `TEQ` | tequila |
| `LIK` | likier |
| `BRA` | brandy lub koniak |

Kod katalogowy ma format trzech liter i od jednej do pięciu cyfr, np. `WIN45` albo `WHI12`. Butelka i kieliszek tego samego wina otrzymują wspólny kod `WIN`. Automatyczne łączenie porcji 50 ml z butelką działa obecnie dla kodów `WHI` i `BRA`; pozostałe prefiksy są rozpoznawane katalogowo, ale nie tworzą automatycznie wspólnej karty dwóch wariantów.

## Tagi sterujące systemem

| Tag | Działanie |
| --- | --- |
| `MENU` | publikuje w zwykłej karcie |
| `PÓŁKA` | publikuje pełną butelkę/opakowanie w „Z PÓŁKI”, wyłącznie przy stanie większym od zera |
| `PROMO` | wyróżnia produkt, ale nie zastępuje `MENU` |
| `LATO`, `JESIEŃ`, `ZIMA`, `WIOSNA` | kwalifikuje widoczny produkt `MENU` do aktywnej oferty sezonowej |
| `SPECJAL` | kwalifikuje widoczny produkt `MENU` do oferty specjalnej |
| `KIELISZEK` | wraz z nazwą zawierającą „kieliszek” lub „na kieliszki” oznacza wariant kieliszkowy wina |
| `BUTELKA` | oznacza wariant całej butelki alkoholu |
| `ZIARNO` | oznacza paczkowaną kawę do sekcji „Zabierz naszą kawę do domu” |
| `WARM` | produkt można zamówić na ciepło |
| `COLD` | produkt można zamówić na zimno |
| `TOGO` | w strefie kelnera udostępnia opcję „Zapakuj na wynos” |
| `INWENT` | w kategorii `Składniki` automatycznie obejmuje produkt inwentaryzacją |

Jeżeli produkt ma jednocześnie `WARM` i `COLD`, kelner wybiera temperaturę dla dodawanej sztuki. Przy jednym z tych tagów wariant jest ustalony automatycznie. `TOGO` nie pokazuje ikony w menu gościa i nie wymusza pytania — domyślnie zamówienie jest na miejscu, a kelner może świadomie wybrać pakowanie na wynos.

Tagi `BABY` i `BABYONLY` nie są obsługiwane; z tego wdrożenia zrezygnowano.

## Inwentaryzacja składników

- W kategorii `Składniki` o udziale produktu w inwentaryzacji decyduje wyłącznie tag `INWENT` w Dotykačce.
- Dodanie tagu `INWENT` automatycznie włącza produkt do kolejnych zleceń inwentaryzacyjnych po synchronizacji. Usunięcie tagu automatycznie go wyłącza.
- Wielkość liter nie ma znaczenia, ale tag musi mieć dokładne brzmienie `INWENT`; dłuższe lub podobne tagi nie są uznawane.
- Panel administratora pokazuje dla kategorii `Składniki` stan wynikający z tagu i blokuje ręczne przełączanie. Zapobiega to rozbieżności między panelem a Dotykačką.
- Reguła nie publikuje składnika w menu gościa ani w menu kelnerskim. Do publikacji nadal potrzebny jest odpowiedni tag `MENU` albo `PÓŁKA`.

## Alko Bar

Każdy produkt może mieć następujące parametry redakcyjne:

- rodzaj pozycji, np. spritz, sour, highball, shot, koktajl klasyczny lub alkohol na butelkę;
- baza, np. gin, wódka, rum, whisky, tequila, prosecco albo aperitif;
- profil smaku, np. wytrawny, słodki, gorzki, cytrusowy, owocowy, kremowy lub korzenny;
- sposób podania, np. szkło koktajlowe, highball, kieliszek do wina, shot albo butelka;
- zawartość alkoholu, pochodzenie i objętość.

W menu gościa i w menu kelnerskim obowiązują te same filtry: `Rodzaj`, `Baza`, `Profil smaku`, `Podanie` oraz `Alkoholowe / 0%`. Listy wartości powstają z aktualnie widocznych produktów, więc pusty wariant nie jest pokazywany.

Jeżeli administrator nie wpisał jeszcze parametrów, system może wnioskować rodzaj, bazę, smak i podanie z nazwy, opisu oraz podgrupy produktu. Wartości zapisane w panelu mają zawsze pierwszeństwo nad wnioskowaniem. Audyt treści wskazuje brak rodzaju albo bazy, ponieważ bez nich produkt nie będzie w pełni filtrowalny.

Wyszukiwanie informacji dla Alko Baru używa nazwy produktu i fraz dotyczących alkoholu, drinka, składu, profilu smakowego oraz zdjęcia. Po wybraniu strony system próbuje odczytać opis, rodzaj, bazę, smak, podanie, moc, pochodzenie, pojemność i zdjęcia. Wynik jest propozycją: administrator decyduje, czy uzupełnić braki, czy zastąpić dane, a zdjęcie wybiera tylko wtedy, gdy produkt nie ma jeszcze własnego obrazu.

## Wina i mocne alkohole

- Wariant kieliszkowy wina musi jednocześnie mieć odpowiednią nazwę, tag `KIELISZEK` i wspólny kod `WIN` z butelką.
- Aktywny wariant kieliszkowy oznacza ofertę „Dzisiaj na kieliszki”. Wyłączony wariant pozostawia zwykły napis „Butelka”; o otwarciu kolejnej butelki decyduje obsługa, nie gość.
- Dopiero całkowity brak wariantu kieliszkowego oznacza „Tylko butelka”.
- Filtry win obejmują kolor, smak, musowanie, podanie, kraj, `0%` i potwierdzoną wegańskość.
- Dla whisky, bourbonu, koniaku i brandy panel przechowuje rodzaj, styl, pochodzenie, wiek, beczkę, profil smaku, moc i objętość. Te same filtry są dostępne gościowi i kelnerowi.
- Pełna butelka piwa, wina, whisky albo wódki sprzedawana między 21:58 a 06:02 wywołuje w strefie kelnera ostrzeżenie o zakazie sprzedaży alkoholu na wynos. Reguła nie dotyczy pozycji 0% ani porcji/kieliszków.

### Shoty z butelki 0,7 l

- `1800 Tequila` prowadzona magazynowo jest ukrytym produktem w litrach. Opakowanie zakupowe `Butelka 0,7 l` zwiększa jej stan o `0,7 l` za każdą przyjętą butelkę.
- Widoczna pozycja `1800 Tequila` jest shotem `50 ml`. Nie odejmuje własnego stanu w sztukach; receptura każdej sprzedanej sztuki odejmuje dokładnie `0,05 l` z ukrytego produktu magazynowego.
- `ABSOLUT Elyx` działa według tej samej reguły: ukryta butelka magazynowa `0,7 l` i widoczny shot `50 ml`, który odejmuje `0,05 l`.
- `BACARDI RISERVA OCHO RUM` (EAN `7610113001516`) również korzysta z ukrytej butelki `0,7 l` i widocznego shota `50 ml` z odpisem `0,05 l`.
- `BACARDI Spiced Rum` (EAN `7610113007518`) ma ten sam model butelki `0,7 l` i shota `50 ml`.
- `Bombay Sapphire Sunset` (EAN `7640175743284`) ma ten sam model: ukryta butelka magazynowa `0,7 l` i widoczny shot `50 ml`. Przy pierwszej migracji istniejący stan w sztukach jest przeliczany na litry (`1 butelka = 0,7 l`).
- Każda pozycja sprzedażowa skonfigurowana tym mechanizmem jako porcja `50 ml` otrzymuje automatycznie grupę `Shoty · 50 ml` oraz parametry `cocktailType=Shot`, `servingStyle=Shot` i `volume=50 ml`. Nazwa produktu nie musi zawierać słowa „shot” ani pojemności — grupa wynika z zapisanej porcji.
- Konfigurację można sprawdzić skryptem `node scripts/configure-bottled-shot.mjs`. Wybór produktu określa `BOTTLED_SHOT_TARGET` (`1800-tequila`, `absolut-elyx`, `bacardi-reserva-ocho`, `bacardi-spiced` albo `bombay-sapphire-sunset`). Zapis wymaga równocześnie `BOTTLED_SHOT_APPLY=true` i `DOTYKACKA_BOTTLED_SHOT_WRITE_ENABLED=true`; przed zmianą powstaje prywatna kopia konfiguracji. Po udanym zapisie skrypt aktualizuje też odpowiadające pozycje w lokalnym katalogu aplikacji.

## Instrukcje dla pracowników

- Panel administratora `Instrukcje` służy do tworzenia szkiców, wysyłania aktywnych instrukcji, śledzenia potwierdzeń i archiwizacji materiałów nieobowiązujących.
- Kliknięcie `Wyślij do pracowników` powoduje, że instrukcja staje się obowiązkowa dla wszystkich aktywnych pracowników. Każdy nowy pracownik automatycznie otrzymuje wszystkie instrukcje mające status `PUBLISHED`; nie trzeba przypisywać ich ręcznie.
- Pracownik widzi licznik oraz obowiązkowy komunikat w strefie kelnera. Instrukcję może odłożyć tylko jeden raz i maksymalnie o dwie godziny. Po tym czasie komunikat wraca bez możliwości ponownego odłożenia.
- Potwierdzenie jest możliwe dopiero po otwarciu instrukcji i przewinięciu jej do końca. Zapisywane są pracownik, wersja instrukcji i czas oświadczenia o zapoznaniu się z treścią.
- Zapisanie i ponowne wysłanie aktywnej instrukcji zwiększa jej numer wersji i wymaga nowego potwierdzenia od wszystkich pracowników.
- Status `ARCHIVED` pozostawia materiał w archiwum katalogu, ale nie wymusza jego przeczytania ani przez obecnych, ani przez nowych pracowników.

## Piwo z beczki

- Surowiec `Bosman KEG 30l` jest prowadzony w litrach i nie jest produktem sprzedażowym. Ma magazynowe opakowanie `KEG 30 l`, dlatego przyjęcie jednej beczki zwiększa stan o 30 litrów.
- `BOSMAN 0,5l` i `BOSMAN 0,3l` są produktami sprzedażowymi z wyłączonym bezpośrednim odpisem własnego stanu. Stan pomniejsza wyłącznie ich receptura.
- Przy sprzedaży dużego piwa receptura odejmuje `0,515 l` z `Bosman KEG 30l`: 0,5 l wydanej porcji oraz 3% straty. Przy małym piwie odejmuje `0,309 l`: 0,3 l oraz 3% straty.
- Produkty sprzedażowe nie podlegają osobnej inwentaryzacji. Inwentaryzujemy wyłącznie surowiec KEG w litrach; pełna, nieotwarta beczka to 30 l.
- Konfigurację można bezpiecznie sprawdzić skryptem `node scripts/configure-draught-beer.mjs`. Zapis wymaga jednocześnie `DRAUGHT_BEER_APPLY=true` i `DOTYKACKA_DRAUGHT_BEER_WRITE_ENABLED=true`; przed zmianą powstaje prywatna kopia konfiguracji.

## Kawy alternatywne i syropy

- AeroPress, Chemex, Drip i V60 są rozpoznawane jako metody kaw alternatywnych.
- W menu gościa sugerowana kolejność to: najpierw metoda, potem ziarno. Oba wybory są jednak aktywne od początku i gość może zacząć od ziarna.
- W strefie kelnera ziarno jest obowiązkowe przed dodaniem kawy do zamówienia; można wybrać dokładnie jedno ziarno oraz dowolną liczbę dodatków z grupy `DODATKI DO KAWY`.
- Ziarna alternatywne pobieramy z grupy dodatków zawierającej słowo „ziarno” lub „ziarna”; grupy paczek „do domu”, „opakowanie” i „paczka” są wykluczone.
- Karty metod pokazują ilustracje, nazwę i cenę bez zmiany rozmiaru przycisku. Podgląd metody może zawierać lokalny film, plakat i krótki opis.
- Przy brakującym zdjęciu ziarna kawy alternatywnej pokazujemy neutralną ikonę niebieskiego kubka zamiast standardowej filiżanki. Nie publikujemy osobnej reklamy producenta kubka.
- Dostępne syropy Leśne Życie są pobierane z ich kategorii i dodatniego stanu. Przy kawie, matchy i herbacie są płatnym dodatkiem zgodnie z ceną pozycji „Syrop smakowy”. Przy lemoniadzie można wybrać maksymalnie dwa smaki bez dopłaty, ponieważ ich koszt jest już zawarty w cenie lemoniady. Pełna butelka z tagiem `PÓŁKA` pozostaje osobnym produktem z własną ceną.
- Wszystkie produkty z kategorii `Syropy Leśne Życie` są zawsze synchronizowane do panelu administratora, również przy stanie zerowym i bez tagu `MENU`. Dzięki temu można wcześniej dodać im zdjęcia i opisy. W menu gościa oraz na liście smaków nadal pokazujemy tylko pozycje z dodatnim stanem.
- Każdy syrop może otrzymać oddzielne `tło podglądu`: fotografię głównego składnika bez butelki i napisów. W edycji produktu można samodzielnie dodać plik lub link, bezpośrednio podmienić istniejące tło oraz je usunąć. Zdjęcie butelki nadal służy jako miniatura i pozostaje na pierwszym planie, a fotografia składnika wypełnia prawą połowę okna produktu. Brak tła przywraca granatowe pole; zapis, podmiana lub usunięcie tła nigdy nie zmienia zdjęcia butelki. Syropy wyszukuje się zwykłą wyszukiwarką albo filtrem kategorii — panel nie wyświetla osobnego stałego skrótu.
- Wszystkie obecne i przyszłe produkty z kategorii `Syropy Leśne Życie` automatycznie korzystają z jednego układu. Butelka jest wyświetlana o kolejne 20% większa (łącznie około 44% względem układu pierwotnego), wyśrodkowana poziomo i przesunięta w dół o 8% własnej wysokości, aby jej dolna krawędź znajdowała się bliżej ceny. Nie należy ręcznie przygotowywać różnych rozmiarów butelek dla poszczególnych smaków.

## Zdjęcia, galerie i instrukcje pracownicze

- Panel przyjmuje JPG, PNG, WebP, AVIF, HEIC i HEIF, w tym zdjęcia z iPhone’a.
- Plik z urządzenia może mieć do 50 MB. System koryguje orientację, zmniejsza obraz do maksymalnie 1600 px i optymalizuje go do około 2,4 MB.
- Zdjęcie główne można usunąć, a po usunięciu zastąpić nowym. Dla pozycji „Na słono” galeria zawiera maksymalnie pięć zdjęć; administrator wskazuje zdjęcie pierwsze.
- Tła podglądu syropów są przechowywane osobno od zdjęć głównych i galerii. System zachowuje pełny kadr fotografii, zmniejsza ją do maksymalnie 1600 px i nie uruchamia mechanizmu wycinania jasnego tła przeznaczonego dla butelek.
- Wyszukiwarka internetowa może zaproponować kilka zdjęć. Jeżeli produkt nie ma zdjęcia, administrator wybiera fotografię do pierwszego zapisu. Jeżeli zdjęcie jest już zapisane, akceptacja nowego opisu lub parametrów zawsze je zachowuje — niezależnie od nowych propozycji. Aby zastąpić obraz, trzeba najpierw kliknąć „Usuń zdjęcie”, a dopiero potem zaimportować nowy.
- Instrukcja dla pracownika może zawierać tekst, zdjęcia JPG/PNG/WebP/AVIF/HEIC/HEIF/GIF oraz filmy MP4/WebM. Otwiera się po trzech dotknięciach zdjęcia produktu w strefie kelnera.

## Korekty napiwków pracowników

- Napiwki zapisane podczas rozliczenia zmiany pozostają danymi źródłowymi i nie są nadpisywane ani kasowane.
- Administrator może w panelu „Rozliczenia” dopisać napiwek albo zapisać korektę pomniejszającą dla konkretnego aktywnego pracownika. Każdy wpis wymaga daty, kwoty i powodu.
- Ręczny wpis od razu wpływa na saldo napiwków pracownika oraz na kwotę widoczną w jego strefie kelnerskiej. Korekta pomniejszająca może rozliczyć błąd wcześniejszego podziału.
- Niewypłacony ręczny wpis można wycofać, podając obowiązkowy powód. System zachowuje pierwotny wpis, administratora, czas i informację o wycofaniu.
- Wpisu oznaczonego jako wypłacony nie można usunąć. Ewentualną pomyłkę rozlicza się przeciwną korektą z opisem, dzięki czemu historia finansowa pozostaje pełna.
- Oznaczenie napiwków jako wypłaconych obejmuje zarówno zatwierdzone kwoty z rozliczeń, jak i aktywne ręczne korekty składające się na saldo pracownika.

## Kontrola po zmianach

Po zmianie tagów, ceny, widoczności, stanu, receptury albo połączeń dodatków uruchom synchronizację z Dotykačką. Następnie sprawdź produkt w panelu administratora, menu gościa i menu kelnerskim. Przy produktach filtrowanych sprawdź również, czy nowe wartości pojawiły się w filtrach i czy połączenie kilku filtrów zwraca właściwe wyniki.

Wbudowana, skrócona wersja tych reguł jest dostępna w panelu administratora w sekcji „Zasady”.
