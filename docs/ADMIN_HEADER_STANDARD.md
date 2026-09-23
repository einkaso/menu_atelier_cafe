# Standard nagłówka modułów administracyjnych

Każdy osobny moduł panelu administracyjnego używa komponentu
`AdminSectionHeader`. Kolejność elementów jest stała:

1. logo Marta Banaszek atelier-café,
2. nazwa obszaru i nazwa modułu,
3. niezależne przyciski narzędzi danego modułu,
4. na prawym końcu paska osobny przycisk `Menu główne`.

Przyciski narzędziowe muszą mieć widoczne odstępy. Nie wolno łączyć ich
wspólną ramką, linią ani segmentowanym kontenerem. Przycisk powrotu pozostaje
oddzielony od narzędzi i zawsze prowadzi do `/admin`.

Na węższym ekranie logo i nazwa pozostają pierwszym rzędem, a narzędzia oraz
`Menu główne` przechodzą niżej w tej samej kolejności. Nowe moduły nie powinny
tworzyć własnych wariantów nagłówka ani zmieniać kolejności elementów przez CSS.
