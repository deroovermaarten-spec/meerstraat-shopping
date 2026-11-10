# Meerstraat Boodschappen

Een gedeelde boodschappenlijst voor het gezin. Iedereen heeft een eigen account, alles staat in een echte database en de app werkt op elke gsm.

- **Deze week:** één veld om te zoeken of toe te voegen, vaste items met één tik erbij, producten per afdeling, filteren per winkel en afvinken in de winkel.
- **Vaste items:** wat je bijna elke week koopt, met één of meer winkels (Colruyt, Aldi, Hema, Kruidvat).
- **Historiek:** elke afgesloten week, en met + zet je een product terug op de lijst.
- **Statistieken:** wat je het meest koopt, per winkel en per persoon.

Gebouwd als statische website (HTML, CSS en JavaScript, zonder build-stap) op **Netlify**, met **Supabase** voor de logins en de database (Postgres).

## Eenmalige installatie

### 1. Database (Supabase)

1. Maak een gratis project op [supabase.com](https://supabase.com), met als regio Frankfurt of Ireland.
2. Open **SQL Editor → New query**, plak de inhoud van [`supabase/schema.sql`](supabase/schema.sql) en klik op **Run**.
3. Bij **Authentication → Sign In / Providers → Email** kun je **Confirm email** uitzetten. Dan hoeven gezinsleden geen bevestigingsmail te openen. Laat je het aan, dan moeten ze eerst op de link in die mail klikken.
4. Ga naar **Authentication → URL Configuration** en vul je Netlify-adres in als **Site URL**, bijvoorbeeld `https://meerstraat-shopping.netlify.app`.
5. Kopieer bij **Project Settings → API** de **Project URL** en de **anon public key** naar [`config.js`](config.js).

De anon key mag publiek zijn. De regels in de database zorgen ervoor dat alleen leden van een gezin de gegevens van dat gezin kunnen zien of aanpassen.

### 2. Website (Netlify)

De repo is privé, daarom staat de site op Netlify (gratis) in plaats van GitHub Pages.

1. Maak een account op [netlify.com](https://www.netlify.com) en kies **Add new site → Import an existing project → GitHub**.
2. Geef Netlify toegang tot de repo `meerstraat-shopping`.
3. Laat **Build command** leeg en zet **Publish directory** op `.` (dat staat ook al in [`netlify.toml`](netlify.toml)).
4. Klik op **Deploy**. Bij **Site configuration → Change site name** kies je bijvoorbeeld `meerstraat-shopping`.

Elke push naar `main` zet de nieuwe versie automatisch online.

### 3. Gezin aanmaken

1. Open de site, kies **Account maken** en daarna **Nieuw gezin**.
2. Tik rechtsboven op je naam om de **gezinscode** te zien.
3. De andere gezinsleden maken een eigen account aan, kiezen **Aansluiten bij gezin** en vullen die code in.

Zet de site op je startscherm. Op de iPhone gaat dat via Delen → Zet op beginscherm, op Android via het menu → App installeren. Dan opent ze als een gewone app.

## Lokaal testen

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Bestanden

| Bestand | Wat |
| --- | --- |
| `index.html` | Pagina en navigatie |
| `app.js` | Alle app-logica: login, gezin, lijst, vaste items, historiek, statistieken |
| `styles.css` | Vormgeving (licht en donker) |
| `config.js` | Jouw Supabase-adres en publieke sleutel |
| `supabase/schema.sql` | Tabellen, toegangsregels en functies (gezin maken, aansluiten, week afsluiten) |
