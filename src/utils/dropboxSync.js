// Koppeling met Dropbox — op vraag van Jonas, voor twee dingen (zie
// SETUP-DROPBOX.md voor de eenmalige opzet die hij zelf, één keer, moet doen):
//
// 1) Leveringsfoto's — genomen door de chauffeur bij plaatsing/afhaling in de
//    leveringen-app (crew-app), die rechtstreeks in deze gedeelde databank
//    schrijft (tabel leveringen_fotos, zie routes/boekingen.js) — worden hier
//    automatisch gekopieerd naar een Dropbox-map. BELANGRIJK: dit kopieert de
//    foto exact zoals ze nu al in de databank staat. Of dat ook de volle,
//    originele resolutie is, hangt af van wat de leveringen-app zelf bij het
//    fotograferen opslaat (dat is een ander project, niet dit boekingsplatform)
//    — als die app de foto al verkleint vóór opslag, kan deze sync dat niet
//    meer "terughalen". Wil Jonas dat met zekerheid ook de oorspronkelijke,
//    onverkleinde foto naar Dropbox gaat, dan moet dat in de leveringen-app
//    zelf gebeuren, op het moment van fotograferen.
//
// 2) Een dagelijkse back-up van de huidige planning (alle boekingen + hun
//    producten/levering) als één JSON-bestand per dag, als extra vangnet
//    naast de databank zelf.
//
// Gebruikt de kale Dropbox HTTP-API via de ingebouwde fetch (geen extra
// npm-package nodig — zelfde aanpak als wordpressSync.js/eenvoudigFactureren.js
// hiernaast) met een "refresh token"-opzet: dat token verloopt nooit (tot
// Jonas het zelf intrekt in Dropbox), en wordt hier bij elke nodige aanroep
// omgewisseld voor een kortlevend access-token (geldig enkele uren — we
// cachen het dus even i.p.v. bij elke upload opnieuw aan te vragen).
const db = require('../db');

const FOTO_MAP = "/Belair-Fun leveringsfoto's";
const BACKUP_MAP = '/Belair-Fun backups';

function isGeconfigureerd() {
  return !!(process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET && process.env.DROPBOX_REFRESH_TOKEN);
}

let gecachedToken = null; // { token, verlooptOp }

async function haalAccessToken() {
  // 60s marge, zodat een token dat net zou verlopen tijdens een lopende
  // upload niet alsnog voor een mislukte aanroep zorgt.
  if (gecachedToken && gecachedToken.verlooptOp > Date.now() + 60_000) {
    return gecachedToken.token;
  }
  const resp = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
      client_id: process.env.DROPBOX_APP_KEY,
      client_secret: process.env.DROPBOX_APP_SECRET,
    }),
  });
  if (!resp.ok) {
    throw new Error(`Dropbox-token ophalen mislukt (${resp.status}): ${await resp.text()}`);
  }
  const data = await resp.json();
  gecachedToken = { token: data.access_token, verlooptOp: Date.now() + data.expires_in * 1000 };
  return gecachedToken.token;
}

// Uploadt ruwe bytes naar een vast pad in Dropbox — overschrijft als dat pad
// al bestaat (handig bij een herhaalde poging na een eerder mislukte upload,
// bv. de dagelijkse back-up die telkens hetzelfde pad voor "vandaag" gebruikt).
async function uploadBestand(dropboxPad, buffer) {
  const token = await haalAccessToken();
  const resp = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({ path: dropboxPad, mode: 'overwrite', mute: true }),
    },
    body: buffer,
  });
  if (!resp.ok) {
    throw new Error(`Dropbox-upload mislukt (${resp.status}) voor ${dropboxPad}: ${await resp.text()}`);
  }
  return resp.json();
}

async function bestaatAlInDropbox(dropboxPad) {
  const token = await haalAccessToken();
  const resp = await fetch('https://api.dropboxapi.com/2/files/get_metadata', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: dropboxPad }),
  });
  return resp.ok;
}

// Dropbox-paden mogen geen "/" bevatten in een bestands-/mapnaam, en we
// willen geen rare tekens (klantnamen met leestekens e.d.) — simpele,
// veilige vervanging; lang genoeg voor een leesbare mapnaam, niet langer.
function veiligeNaam(tekst) {
  return String(tekst || '').replace(/[/\\:*?"<>|]/g, '-').trim().slice(0, 80) || 'onbekend';
}

function naarDatum(waarde) {
  if (!waarde) return 'onbekende-datum';
  return new Date(waarde).toISOString().slice(0, 10);
}

// Zoekt leveringsfoto's die nog niet naar Dropbox gekopieerd zijn
// (dropbox_pad IS NULL, zie migratie 059) en uploadt ze één voor één, per
// boeking/datum in een eigen submap. Bewust NIET binnen één transactie: elke
// foto die lukt wordt meteen als "gesynct" gemarkeerd, zodat een foto die om
// wat voor reden dan ook mislukt (bv. tijdelijk geen internet) niet blokkeert
// dat de andere, al gelukte, niet telkens opnieuw geprobeerd worden — en de
// mislukte komt vanzelf terug bij de volgende periodieke ronde.
async function syncFotosNaarDropbox() {
  if (!isGeconfigureerd()) return;
  const { rows } = await db.query(
    `SELECT lf.id, lf.fase, lf.naam, lf.data_url, lf.aangemaakt_op,
            k.naam AS klant_naam, b.gewenste_datum_start
     FROM leveringen_fotos lf
     JOIN leveringen l ON l.id = lf.leveringen_id
     JOIN boekingen b ON b.id = l.boeking_id
     JOIN klanten k ON k.id = b.klant_id
     WHERE lf.dropbox_pad IS NULL
     ORDER BY lf.aangemaakt_op
     LIMIT 25`
  );
  for (const foto of rows) {
    try {
      const komma = foto.data_url.indexOf(',');
      if (komma === -1) throw new Error('data_url heeft geen geldig "data:...;base64,"-formaat');
      const header = foto.data_url.slice(0, komma);
      const base64 = foto.data_url.slice(komma + 1);
      const buffer = Buffer.from(base64, 'base64');
      const extensie = /image\/png/.test(header) ? 'png' : 'jpg';
      const submap = `${naarDatum(foto.gewenste_datum_start)} - ${veiligeNaam(foto.klant_naam)}`;
      const bestandsnaam = `${foto.fase || 'foto'}-${veiligeNaam(foto.naam) || foto.id.slice(0, 8)}.${extensie}`;
      const pad = `${FOTO_MAP}/${submap}/${bestandsnaam}`;
      await uploadBestand(pad, buffer);
      await db.query('UPDATE leveringen_fotos SET dropbox_pad = $1 WHERE id = $2', [pad, foto.id]);
    } catch (err) {
      console.warn(`[dropboxSync] foto ${foto.id} overslaan (komt terug bij volgende ronde):`, err.message);
    }
  }
}

// Eén JSON-bestand per kalenderdag met de volledige huidige planning (alle
// boekingen + hun producten + leveringsgegevens), als extra vangnet naast de
// databank zelf. Overschrijft het bestand van vandaag als het al bestaat (bv.
// een tweede ronde dezelfde dag na een herstart) — dus altijd de meest
// recente stand voor die dag, geen opeenstapeling van meerdere versies.
async function backupPlanningNaarDropbox() {
  if (!isGeconfigureerd()) return;
  const vandaag = naarDatum(new Date());
  const pad = `${BACKUP_MAP}/planning-${vandaag}.json`;

  // Niet elke periodieke ronde (elk uur) opnieuw uploaden als het bestand van
  // vandaag al bestaat — enkel de eerste keer per dag dat dit draait.
  if (await bestaatAlInDropbox(pad)) return;

  const { rows: boekingen } = await db.query(
    `SELECT b.*, k.naam AS klant_naam, k.email AS klant_email, k.telefoon AS klant_telefoon
     FROM boekingen b JOIN klanten k ON k.id = b.klant_id
     ORDER BY b.gewenste_datum_start`
  );
  const { rows: producten } = await db.query('SELECT * FROM boeking_producten ORDER BY boeking_id');
  const { rows: leveringen } = await db.query('SELECT * FROM leveringen ORDER BY boeking_id');

  const inhoud = JSON.stringify({ gemaakt_op: new Date().toISOString(), boekingen, producten, leveringen }, null, 2);
  await uploadBestand(pad, Buffer.from(inhoud, 'utf8'));
}

// Vangnet-achtige periodieke ronde (zelfde opzet als startPeriodiekeSync() in
// leveringenAppSync.js): elk uur een foto-sync-rondje (nieuwe foto's komen
// toch maar af en toe binnen, geen haast) en een check of de planning-back-up
// van vandaag al gebeurd is. Fouten hier mogen de server nooit laten crashen
// — gewoon loggen en bij de volgende ronde opnieuw proberen.
function startPeriodiekeDropboxSync() {
  if (!isGeconfigureerd()) return;
  const taak = async () => {
    try {
      await syncFotosNaarDropbox();
    } catch (err) {
      console.warn('[dropboxSync] periodieke foto-sync mislukt:', err.message);
    }
    try {
      await backupPlanningNaarDropbox();
    } catch (err) {
      console.warn('[dropboxSync] periodieke planning-back-up mislukt:', err.message);
    }
  };
  taak(); // meteen bij opstart ook al eens proberen, niet pas na een uur wachten
  setInterval(taak, 60 * 60 * 1000);
}

module.exports = {
  isGeconfigureerd,
  syncFotosNaarDropbox,
  backupPlanningNaarDropbox,
  startPeriodiekeDropboxSync,
};
