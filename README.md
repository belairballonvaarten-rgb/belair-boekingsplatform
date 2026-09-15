# Belair-boekingsplatform (Fase 1)

Custom boekingsplatform voor Belair-Fun, ter vervanging van bookingonline.co.uk.
Focus van deze eerste versie: het **interne planningstool** (aanvragen beheren,
boekingen opvolgen) — de koppeling met de website (aanvraagformulier op
belair-fun.be) komt in een latere fase.

## Wat zit erin

- `src/db/migrations/001_init.sql` — het volledige databaseschema (klanten, producten,
  keuringen, boekingen met statusflow, leveringen, betalingen, e-mailtemplates)
- `src/routes/` — de API-endpoints (zie hieronder)
- `src/utils/beschikbaarheid.js` — de beschikbaarheidslogica (max. boekingen per dag +
  buffer-dagen tussen boekingen)
- `scripts/migrate.js` — voert de migraties uit tegen je database
- `public/` — het beheerscherm zelf (inloggen, aanvragen-inbox, boekingenoverzicht,
  nieuwe boeking aanmaken). Gewone HTML/CSS/JS, geen framework — wordt automatisch
  mee geserveerd door dezelfde server. Gewoon naar de hoofd-URL surfen (lokaal
  `http://localhost:3000`) opent het inlogscherm.

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

## Naar je eigen GitHub-repo pushen

Deze map is al een git-repository (met de volledige historiek van de bouw). Je hoeft
dus geen `git init` te doen — enkel een nieuwe, lege repository aanmaken op GitHub
(geen README/`.gitignore` aanvinken bij het aanmaken, anders krijg je een conflict)
en die te koppelen:

```
git remote add origin https://github.com/belairballonvaarten-rgb/belair-boekingsplatform.git
git branch -M main
git push -u origin main
```

## Deployen op Render.com

1. Zorg dat de repo op GitHub staat (zie hierboven).
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
5. Migraties gebeuren automatisch: `npm start` voert eerst `scripts/migrate.js` uit
   en start daarna pas de server (zie `package.json`). Handig, want Render's gratis
   compute-tier heeft geen Shell-toegang — je hoeft dus niets manueel te draaien.
   De eerste opstart zal wél nog steeds even loggen dat de migratie bezig is;
   dat is normaal.

## Bulk e-mail versturen (Microsoft 365)

"Bulk e-mail versturen" in Boekingenoverzicht verstuurt mail vanuit je eigen
Microsoft 365-mailadres, via de Microsoft Graph API (`src/utils/mailer.js`).
Zie **[SETUP-MICROSOFT365.md](./SETUP-MICROSOFT365.md)** voor de volledige
stap-voor-stap opzet in Azure — dit moet je éénmalig doen. Zonder deze opzet
toont het platform gewoon netjes dat de koppeling nog ontbreekt.

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

- Verdere koppeling met de leveringen-app (nu enkel een leeg leveringsrecord)
- E-mailtemplates versturen bij statuswijziging
- Betaal-/factuuropvolging (tabel bestaat al, nog geen UI/logica)
- Website-integratie (aanvraagformulier + WordPress-plugin) — **bewust uitgesteld**
