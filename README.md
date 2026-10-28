# Piotrogród

Autor: Patryk Majchrzak

Kooperacyjny ogród dla dwojga na telefon. Jedno z was jest Ogrodnikiem, drugie Zielarką. Rośliny rosną dopiero wtedy, gdy oboje o nie zadbacie. Gra działa w przeglądarce, w pionie, bez instalacji.

**Graj:** https://krz4czy.github.io/piotrogrod/

## Jak grać

1. Jedna osoba stuka **Nowy świat**, wpisuje nazwę i wybiera rolę. Pojawia się kod świata.
2. Druga stuka **Dołącz do świata**, wpisuje kod raz i wybiera drugą rolę. Potem świat jest na liście **Moje światy** na obu telefonach.
3. Każde z was może wejść samo. Partner śpi wtedy w domu, a deszcz albo drzemka powoli nadrabiają brakującą rolę. Gdy wejdziecie oboje, zapisy się łączą i gracie na żywo.

Połączenie na żywo zestawia PeerJS. Zapis świata leży na telefonie, nie w chmurze. Żeby zapisy same się złączyły, oboje musicie być w świecie choć przez chwilę. Jeśli tak się nie zdarzy, z pauzy wyślijcie plik (**Wyślij świat** / **Wczytaj świat**). Link kopiuje się tylko przy małym ogrodzie; większy trzeba wysłać plikiem. Dwie karty w tej samej przeglądarce to jeden telefon. Krótka gra bez trwałego świata zostaje pod **Gra na chwilę**.

## Lokalnie

```bash
npm ci
npm run dev
```

Serwer nasłuchuje na porcie **4738**. `npm run build` składa wersję do `dist/`. `npm run selftest` sprawdza symulację ogrodu bez przeglądarki.
