# Microsoft 365 koppelen — bulk e-mail versturen vanuit het platform

Met deze koppeling kan je in **Boekingenoverzicht** boekingen aanvinken en in
één keer een mail sturen naar die klanten — en die mail vertrekt dan écht
vanuit jouw eigen mailadres (bv. jonas@belair-fun.be), niet vanuit een of
ander extern systeem. Je hoeft hiervoor niet telkens in te loggen: je stelt
dit één keer in, en het blijft werken.

Dit moet je zelf, één keer, doen in Azure (het gratis beheerscentrum van
Microsoft voor je 365-account). Het klinkt technischer dan het is — volg
gewoon de stappen hieronder in volgorde. Het duurt ongeveer 10-15 minuten.
Als je bedrijf een IT-partner heeft die jullie Microsoft 365 beheert, mag je
deze pagina ook gewoon doorsturen — zij kunnen dit voor je doen.

**Wat je nodig hebt:** een Microsoft 365-account met een "Global
Administrator"-rol (of iemand die die rol wel heeft) op jullie
bedrijfsabonnement. Als je niet zeker bent of je die rol hebt: probeer
gewoon stap 1, dan zie je het vanzelf.

---

## Stap 1 — Naar Azure Portal

1. Ga naar **https://portal.azure.com** en log in met je gewone Microsoft
   365-werkaccount (hetzelfde account/wachtwoord als je mailbox).
2. Typ bovenaan in de zoekbalk: **App-registraties** (of "App registrations"
   als alles in het Engels staat) en klik dat aan.

## Stap 2 — Een nieuwe "app" aanmaken

Dit is geen echte app die je installeert — het is gewoon een naam/toegang die
Microsoft aanmaakt zodat het boekingsplatform veilig met je mailbox mag
praten.

1. Klik op **+ Nieuwe registratie** ("+ New registration").
2. Naam: vul iets in zoals `Belair Boekingsplatform` (de naam maakt verder
   niet uit, je ziet ze enkel zelf terug).
3. Bij "Ondersteunde accounttypes" laat je de standaardkeuze staan ("Enkel
   accounts in deze organisatiemap").
4. Bij "Redirect URI" vul je niets in — laat leeg.
5. Klik op **Registreren** ("Register").

Je krijgt nu een overzichtspagina van je nieuwe app-registratie. Hou dit
tabblad open, je hebt er zo meteen 2 waarden van nodig.

## Stap 3 — Twee waarden noteren (Tenant ID en Client ID)

Op diezelfde overzichtspagina (die je net na stap 2 ziet) staan twee lange
codes, ongeveer zo: `a1b2c3d4-5678-...`

- **Map-id (tenant)** / "Directory (tenant) ID" — kopieer deze.
- **Toepassings-id (client)** / "Application (client) ID" — kopieer deze.

Zet deze twee ergens even opzij (bv. in een kladbestand) — daar komt zo
meteen nog een derde waarde bij.

## Stap 4 — Een "wachtwoord" voor de app aanmaken (Client Secret)

1. Klik in het linkermenu op **Certificaten en geheimen** ("Certificates &
   secrets").
2. Klik op **+ Nieuw clientgeheim** ("+ New client secret").
3. Omschrijving: bv. `Boekingsplatform mail`. Vervaldatum: kies gerust de
   langste optie die er staat (24 maanden), zodat je dit niet snel opnieuw
   moet doen.
4. Klik op **Toevoegen** ("Add").
5. Er verschijnt nu een nieuwe regel met een code onder **Waarde**
   ("Value"). **Kopieer deze meteen** — dit is de enige keer dat Microsoft
   ze toont, ze is daarna niet meer zichtbaar (je moet dan een nieuwe
   aanmaken).

Dit is je **Client Secret** — samen met de Tenant ID en Client ID uit stap 3
heb je nu alle 3 de codes.

## Stap 5 — Toestemming geven om mail te versturen

1. Klik in het linkermenu op **API-machtigingen** ("API permissions").
2. Klik op **+ Een machtiging toevoegen** ("+ Add a permission").
3. Kies **Microsoft Graph**.
4. Kies **Toepassingsmachtigingen** ("Application permissions") — *niet*
   "Delegated permissions".
5. Typ in het zoekveld: `Mail.Send` en vink die aan.
6. Klik op **Machtigingen toevoegen** ("Add permissions").
7. Je ziet nu `Mail.Send` in de lijst staan, met een geel
   waarschuwingsteken — dat betekent dat het nog goedgekeurd moet worden.
   Klik op **Beheerderstoestemming verlenen voor [jouw organisatie]**
   ("Grant admin consent for ..."), en bevestig. Het gele teken wordt een
   groen vinkje. **Zonder deze goedkeuring werkt het versturen niet.**

## Stap 6 — De 3 codes doorgeven aan Render

De codes uit stap 3 en 4 moet je nu instellen als omgevingsvariabelen op
Render (dezelfde plek waar `DATABASE_URL` en `SESSION_SECRET` al staan):

1. Ga naar je service op **https://dashboard.render.com**.
2. Ga naar **Environment**.
3. Voeg deze 4 waarden toe:

   | Naam | Waarde |
   |---|---|
   | `AZURE_TENANT_ID` | de "Map-id (tenant)" uit stap 3 |
   | `AZURE_CLIENT_ID` | de "Toepassings-id (client)" uit stap 3 |
   | `AZURE_CLIENT_SECRET` | de code uit stap 4 |
   | `AZURE_SENDER_EMAIL` | het mailadres waar de mails vanaf moeten vertrekken, bv. `jonas@belair-fun.be` |

4. Sla op. Render herstart de service automatisch — dat duurt even (1-2
   minuten).

## Klaar

Zodra Render herstart is, zie je in **Boekingenoverzicht** dat de knop
"✉️ Bulk e-mail versturen" een echt opstel-scherm toont in plaats van de
melding dat de koppeling nog ontbreekt. Vink een paar boekingen aan, klik op
de knop, vul onderwerp en tekst in (met `{{naam}}` als je automatisch de
klantnaam wil invullen) en verstuur.

**Even opletten:**
- Klanten zonder gekend e-mailadres worden overgeslagen — het platform toont
  dat duidelijk per boeking, er wordt niets fout of stil overgeslagen.
- Elke verstuurde mail wordt ook automatisch bijgehouden in het dossier van
  die boeking (bij "Communicatie"), zodat je achteraf kan terugvinden wat er
  verstuurd is.
- De `AZURE_CLIENT_SECRET` vervalt na de gekozen periode (stap 4). Als het
  versturen plots niet meer lukt na maanden, is dat de meest waarschijnlijke
  oorzaak — dan maak je gewoon een nieuw geheim aan (stap 4) en werk je de
  waarde bij op Render (stap 6).
