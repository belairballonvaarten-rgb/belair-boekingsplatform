# Dropbox koppelen — foto's + dagelijkse back-up

Met deze koppeling doet het platform twee dingen vanzelf, elk uur:

1. **Leveringsfoto's** (genomen door de chauffeur bij plaatsing/afhaling in
   de leveringen-app) worden gekopieerd naar een map in jouw Dropbox:
   `Belair-Fun leveringsfoto's`, met een submap per boeking (datum + klant).
2. **Een dagelijkse back-up** van de volledige planning (alle boekingen) als
   één JSON-bestand per dag, in de map `Belair-Fun backups`.

Je hoeft dit maar **één keer** in te stellen. Het klinkt technischer dan het
is — volg gewoon de stappen hieronder in volgorde. Duurt ongeveer 10 minuten.

**Belangrijk om vooraf te weten:** dit kopieert een foto exact zoals ze nu al
in de databank van de leveringen-app staat. Of dat ook de volle, originele
kwaliteit is, hangt af van wat die andere app (de leveringen-app, niet dit
boekingsplatform) zelf opslaat op het moment dat de chauffeur de foto neemt —
als die app de foto al verkleint vóór opslag, kan deze koppeling dat niet
meer "terughalen". Wil je dat met zekerheid vermijden, dan moet dat in de
leveringen-app zelf aangepast worden.

---

## Stap 1 — Een Dropbox-"app" aanmaken

Dit is geen app die je installeert — het is gewoon een naam/toegang die
Dropbox aanmaakt zodat het boekingsplatform veilig in jouw Dropbox mag
schrijven, **enkel in zijn eigen map** (niet je hele Dropbox).

1. Ga naar **https://www.dropbox.com/developers/apps/create** en log in met
   je gewone Dropbox-account.
2. Bij "Choose an API": kies **Scoped access**.
3. Bij "Choose the type of access you need": kies **App folder** — dan mag
   het platform enkel in zijn eigen, aparte map schrijven (`Apps/Belair
   Boekingsplatform` in je Dropbox), niet ergens anders.
4. Geef een naam, bv. `Belair Boekingsplatform`.
5. Klik op **Create app**.

## Stap 2 — Rechten instellen (Permissions)

1. Je komt nu op de instellingenpagina van je nieuwe app. Klik bovenaan op
   het tabblad **Permissions**.
2. Vink aan: **files.content.write** en **files.content.read**.
3. Klik onderaan op **Submit**.

## Stap 3 — App key en App secret noteren

1. Klik op het tabblad **Settings**.
2. Je ziet daar **App key** en **App secret** (bij dat laatste moet je op
   "Show" klikken). Kopieer beide ergens even opzij (bv. een kladbestand) —
   je hebt ze zo meteen nog eens nodig, en bij stap 5.

## Stap 4 — Eenmalig toestemming geven (en een code krijgen)

1. Vervang in de link hieronder `JOUW_APP_KEY` door de App key uit stap 3,
   en open die volledige link in je browser:

   ```
   https://www.dropbox.com/oauth2/authorize?client_id=JOUW_APP_KEY&response_type=code&token_access_type=offline
   ```

2. Dropbox vraagt om in te loggen (als dat nog niet was) en toestemming te
   geven aan de app. Klik op **Allow/Toestaan**.
3. Je krijgt nu een code te zien op het scherm (een reeks letters/cijfers).
   Kopieer die code.

## Stap 5 — De code omwisselen voor een "refresh token"

Dit is de enige iets-technischere stap: de code uit stap 4 is maar even
geldig en moet omgewisseld worden voor een token dat nooit verloopt (tot jij
het zelf intrekt). Twee manieren, kies wat je het makkelijkst is:

**Optie A — stuur het me door:** stuur me gewoon de App key, App secret (uit
stap 3) en de code (uit stap 4) door in de chat, dan doe ik deze stap voor je
en geef ik je meteen de juiste waarde voor stap 6 terug.

**Optie B — zelf doen:** open een terminal/PowerShell en voer dit uit (met
je eigen App key/App secret/code ingevuld):

```
curl https://api.dropboxapi.com/oauth2/token \
  -d code=JOUW_CODE \
  -d grant_type=authorization_code \
  -d client_id=JOUW_APP_KEY \
  -d client_secret=JOUW_APP_SECRET
```

Je krijgt een antwoord terug met daarin `"refresh_token": "..."` — dat lange
stuk tekst (zonder de aanhalingstekens) is wat je nodig hebt bij stap 6.

## Stap 6 — De 3 waarden doorgeven aan Render

1. Ga naar je service op **https://dashboard.render.com**.
2. Ga naar **Environment**.
3. Voeg deze 3 waarden toe:

   | Naam | Waarde |
   |---|---|
   | `DROPBOX_APP_KEY` | de App key uit stap 3 |
   | `DROPBOX_APP_SECRET` | de App secret uit stap 3 |
   | `DROPBOX_REFRESH_TOKEN` | het refresh token uit stap 5 |

4. Sla op. Render herstart de service automatisch — dat duurt even (1-2
   minuten).

## Klaar

Zodra Render herstart is, begint het platform vanzelf (elk uur, en meteen al
bij het opstarten) nieuwe leveringsfoto's en de dagelijkse planning-back-up
naar je Dropbox te kopiëren — geen knop nodig. De eerste ronde kan dus tot
een uur op zich laten wachten na het herstarten.

**Even opletten:**
- Ook **bestaande** foto's (van vóór deze koppeling) worden gesynct, niet
  enkel nieuwe — maar in porties van maximaal 25 per uur, om Dropbox niet te
  overbelasten. Heb je een grote achterstand aan foto's staan, dan kan het
  dus even duren (bv. 200 foto's ≈ 8 uur) voor alles ingehaald is — nieuwe
  foto's komen daarna gewoon telkens binnen het uur mee.
- Als iets één keer mislukt (bv. tijdelijk geen internet), probeert het
  platform dat vanzelf opnieuw bij de volgende ronde — je hoeft zelf niets te
  doen.
