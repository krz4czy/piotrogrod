# Piotrogród

Kooperacyjny ogród dla dwojga na telefon. Jedno z was jest Ogrodnikiem, drugie Zielarką. Rośliny rosną dopiero wtedy, gdy oboje o nie zadbacie. Gra działa w przeglądarce, w pionie, bez instalacji.

**Graj:** https://krz4czy.github.io/piotrogrod/

## Jak grać

1. Jedna osoba stuka **Nowa gra**, wybiera rolę i odczytuje pięcioznakowy kod pokoju.
2. Druga stuka **Dołącz**, wpisuje kod i wybiera drugą rolę.
3. Oboje wchodzicie do ogrodu. Lewy kciuk prowadzi postać, prawe przyciski robią resztę (stronę joysticka zmienisz w ustawieniach).

Połączenie zestawia publiczny broker PeerJS. Ruch między telefonami idzie przez WebRTC, więc strona musi być po HTTPS. Adres powyżej to spełnia.

## Lokalnie

```bash
npm ci
npm run dev
```

Serwer nasłuchuje na porcie **4738**. `npm run build` składa wersję do `dist/`. `npm run selftest` sprawdza symulację ogrodu bez przeglądarki.
