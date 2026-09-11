# Belair-boekingsplatform — API (Fase 1)

Custom boekingsplatform voor Belair-Fun, ter vervanging van bookingonline.co.uk.
Dit is de backend/API. Focus van deze eerste versie: het **interne planningstool**
(aanvragen beheren, boekingen opvolgen) — de koppeling met de website
(aanvraagformulier op belair-fun.be) komt in een latere fase.

## Wat zit erin

- `src/db/migrations/001_init.sql` — het volledige databaseschema (klanten, producten,
  keuringen, boekingen met statusflow, leveringen, betalingen, e-mailtemplates)
- `src/routes/` — de API-endpoints (zie hieronder)
- `src/utils/beschikbaarheid.js` — de beschikbaarheidslogica (max. boekingen per dag +
  buffer-dagen tussen boekingen)
- `scripts/migrate.js` — voert de migraties uit tegen je database

Dit is **enkel de backend/API**. Er is nog geen beheerscherm (front-end) — dat is de
volgende stap. Je kan de API nu al testen met een tool als Postman/Insomnia, of met
`curl`.

## Lokaal opzetten

1. **Node.js 20+** en **PostgreSQL** moeten geïnstalleerd zijn.
2. Installeer de dependencies:
   ```
   npm install
   ```
3. Kopieer `.env.example` naar `.env` en vul in (zeker `DATABASE_URL`, `ADMIN_EMAIL`,
   `ADMIN_PASSWORD`):
   ```
   cp .env.example .env
   ```
4. Maak een lege database aan (pas de naam aan als je iets anders koos in `.env`):
   ```
   createdb belair_boekingen
   ```
5. Voer de migraties uit:
   ```
   npm run migrate
   ```
6. Start de server:
   ```
   npm start
   ```
   Bij de eerste opstart wordt automatisch een admin-account aangemaakt met de
   `ADMIN_EMAIL`/`ADMIN_PASSWORD` uit je `.env`.
7. Test of alles draait:
   ```
   curl http://localhost:3000/api/gezondheid
   ```

## Deployen op Render.com

1. Push deze repo naar GitHub.
2. Op Render.com: **New > PostgreSQL** — kies de starter-tier, noteer de "Internal
   Database URL".
3. **New > Web Service** — koppel je GitHub-repo.
   - Build command: `npm install`
   - Start command: `npm start`
4. Zet de environment variables in Render (Settings > Environment):
   - `DATABASE_URL` = de Internal Database URL van je Render-database
   - `SESSION_SECRET` = een lange willekeurige string
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` = jouw inloggegevens voor het beheerscherm
   - `CORS_ORIGIN` = `https://belair-fun.be` (pas aan zodra de website-koppeling
     aan bod komt)
5. Na de eerste deploy: open een Render "Shell" op de service en voer éénmalig
   `npm run migrate` uit (of voeg dit tijdelijk toe als build-stap).

## API-overzicht

Alle routes onder `/api/klanten`, `/api/producten` en `/api/boekingen` vereisen een
ingelogde sessie (`POST /api/auth/login`).

- `POST /api/auth/login` `{ email, wachtwoord }`
- `POST /api/auth/logout`
- `GET  /api/klanten?zoek=...`
- `POST /api/klanten` `{ naam, klant_type, btw_nummer, adres, postcode, gemeente, telefoon, email }`
- `GET  /api/producten?zichtbaarheid=&categorie=`
- `POST /api/producten` (zie velden in `src/routes/producten.js`)
- `POST /api/producten/:id/keuringen` `{ type_keuring, vervaldatum }`
- `GET  /api/producten/waarschuwingen/vervalt-binnenkort?dagen=30`
- `GET  /api/boekingen?status=&vanaf=&tot=&klant_id=`
- `GET  /api/boekingen/:id` — volledig detail incl. producten, historiek, levering, betaling
- `POST /api/boekingen` — nieuwe aanvraag/boeking aanmaken (zie velden in
  `src/routes/boekingen.js`; controleert automatisch beschikbaarheid)
- `POST /api/boekingen/:id/status` `{ status, opmerking }` — accepteren/weigeren/inplannen/...
  volgens de toegelaten statusovergangen
- `POST /api/boekingen/beschikbaarheid-check` `{ product_id, gewenste_datum_start, gewenste_datum_einde, aantal }`

### Statusflow van een boeking

```
nieuw → in_behandeling → geaccepteerd → ingepland → bevestigd
                       ↘ geweigerd            → betaalverzoek_verstuurd
                                               → betaald_deels → betaald_volledig → gefactureerd
```

Bij overgang naar `geaccepteerd` wordt automatisch een leveringsrecord aangemaakt
(koppeling met de leveringen-app, komt in een latere fase verder uitgewerkt).

## Wat nog moet gebeuren (zie de openstaande taken)

- Beheerscherm (front-end webapp): aanvragen-inbox, accepteren/weigeren, boekingenoverzicht
- Verdere koppeling met de leveringen-app (nu enkel een leeg leveringsrecord)
- E-mailtemplates versturen bij statuswijziging
- Betaal-/factuuropvolging (tabel bestaat al, nog geen UI/logica)
- Website-integratie (aanvraagformulier + WordPress-plugin) — **bewust uitgesteld**
