# Dropbox koppelen — foto's + dagelijkse back-up

Dit gaat over **twee aparte projecten/services bij Render**, die wel
dezelfde Dropbox-"app" (dezelfde 3 geheime waarden) gebruiken:

1. **Leveringsfoto's in volle kwaliteit** — dit gebeurt in de
   **leveringen-app** (de crew-app waarin de chauffeur foto's neemt bij
   plaatsing/afhaling). Die stuurt de originele, niet-verkleinde foto
   rechtstreeks naar een map in jouw Dropbox op het moment van fotograferen.
2. **Een dagelijkse back-up van de volledige planning** (alle boekingen) als
   JSON-bestand, elk uur gecontroleerd/aangemaakt — dit gebeurt **hier**, in
   dit boekingsplatform, in de map `Belair-Fun backups`.

**Heb je al eerder Dropbox ingesteld bij de leveringen-app?** Kijk dat eerst
na (stap 6 hieronder, maar dan bij de leveringen-app-service op Render) — zo
ja, dan staan de 3 waarden daar al, en moet je ze hier bij dit
boekingsplatform gewoon hergebruiken (stap 6), **zonder** stap 1 t.e.m. 5
opnieuw te doen. Twijfel je, dan kost het geen kwaad om gewoon alles
hieronder te volgen — Dropbox laat gewoon dezelfde app-sleutel meermaals
gebruiken.

Je hoeft dit maar **één keer** in te stellen (voor allebei de services samen,
als je stap 1 t.e.m. 5 nog niet eerder deed). Het klinkt technischer dan het
is — volg gewoon de stappen hieronder in volgorde. Duurt ongeveer 10 minuten.

---

## Stap 1 — Een Dropbox-"app" aanmaken

Dit is geen app die je installeert — het is gewoon een naam/toegang die
Dropbox aanmaakt zodat de software veilig in jouw Dropbox mag schrijven,
**enkel in zijn eigen map** (niet je hele Dropbox).

1. Ga naar **https://www.dropbox.com/developers/apps/create** en log in met
   je gewone Dropbox-account.
2. Bij "Choose an API": kies **Scoped access**.
3. Bij "Choose the type of access you need": kies **App folder** — dan mag
   enkel in zijn eigen, aparte map geschreven worden (`Apps/Belair-Fun` in je
   Dropbox), niet ergens anders.
4. Geef een naam, bv. `Belair-Fun`.
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

## Stap 6 — De 3 waarden doorgeven aan Render — **bij BEIDE services**

Voeg deze 3 waarden toe bij **zowel** de leveringen-app-service **als** de
boekingsplatform-service op Render (dezelfde 3 waarden, gewoon tweemaal
instellen):

1. Ga naar de service op **https://dashboard.render.com**.
2. Ga naar **Environment**.
3. Voeg deze 3 waarden toe:

   | Naam | Waarde |
   |---|---|
   | `DROPBOX_APP_KEY` | de App key uit stap 3 |
   | `DROPBOX_APP_SECRET` | de App secret uit stap 3 |
   | `DROPBOX_REFRESH_TOKEN` | het refresh token uit stap 5 |

4. Sla op. Render herstart de service automatisch — dat duurt even (1-2
   minuten). Herhaal dit voor de andere service.

## Klaar

- Bij de **leveringen-app**: vanaf nu stuurt elke nieuw genomen foto (bij
  plaatsing/afhaling) automatisch de originele, niet-verkleinde versie naar
  een map in je Dropbox — genoemd naar datum + klant. **Enkel nieuwe foto's
  vanaf nu**, geen bestaande foto's met terugwerkende kracht (die stonden al
  verkleind opgeslagen, het origineel bestaat daarvan nergens meer om alsnog
  op te halen).
- Bij dit **boekingsplatform**: begint elk uur (en meteen al bij het
  opstarten) automatisch de dagelijkse planning-back-up te controleren/maken
  in de map `Belair-Fun backups` — geen knop nodig.

**Even opletten:**
- Als iets één keer mislukt (bv. tijdelijk geen internet op locatie), wordt
  dat gewoon stilzwijgend overgeslagen voor die ene foto/dag — er is geen
  her-probeer-mechanisme voor een mislukte foto-upload, enkel voor de
  dagelijkse back-up (die controleert gewoon elk uur opnieuw of vandaag al
  gebeurd is).
