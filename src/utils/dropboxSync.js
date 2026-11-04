// Koppeling met Dropbox — dagelijkse back-up van de huidige planning (alle
// boekingen + hun producten/levering) als één JSON-bestand per dag, als
// extra vangnet naast de databank zelf. Zie SETUP-DROPBOX.md voor de
// eenmalige opzet die Jonas zelf, één keer, moet doen.
//
// LET OP, dit bestand doet NIET de leveringsfoto's — die horen bij de
// leveringen-app (crew-app), niet hier. Eerst zat hier ook een foto-sync die
// las wat al in de gedeelde databank stond (tabel leveringen_fotos), maar
// die kan NOOIT meer dan de daar al verkleinde (900px/62%-kwaliteit) foto
// leveren — de leveringen-app verkleint de foto immers al vóór opslag, dus
// het origineel bestaat nergens anders meer om alsnog in volle kwaliteit
// door te sturen. Voor "foto's in Dropbox in volle kwaliteit" is de
// leveringen-app zelf aangepast: die stuurt nu, los van de normale opslag
// hier, de ORIGINELE (niet-verkleinde) foto rechtstreeks naar Dropbox op het
// moment van fotograferen (zie server.js/public/index.html in dat project).
//
// Gebruikt de kale Dropbox HTTP-API via de ingebouwde fetch (geen extra
// npm-package nodig — zelfde aanpak als wordpressSync.js/eenvoudigFactureren.js
// hiernaast) met een "refresh token"-opzet: dat token verloopt nooit (tot
// Jonas het zelf intrekt in Dropbox), en wordt hier bij elke nodige aanroep
// omgewisseld voor een kortlevend access-token (geldig enkele uren — we
// cachen het dus even i.p.v. bij elke upload opnieuw aan te vragen). Dezelfde
// 3 omgevingsvariabelen (DROPBOX_APP_KEY/_APP_SECRET/_REFRESH_TOKEN) worden
// hergebruikt bij de leveringen-app — gewoon dezelfde 3 waarden op beide
// Render-services instellen, niet twee keer een eigen Dropbox-app aanmaken.
const db = require('../db');

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
// en voor de dagelijkse back-up die telkens hetzelfde pad voor "vandaag" gebruikt).
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

function naarDatum(waarde) {
  if (!waarde) return 'onbekende-datum';
  return new Date(waarde).toISOString().slice(0, 10);
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
// leveringenAppSync.js): elk uur een check of de planning-back-up van
// vandaag al gebeurd is. Fouten hier mogen de server nooit laten crashen —
// gewoon loggen en bij de volgende ronde opnieuw proberen.
function startPeriodiekeDropboxSync() {
  if (!isGeconfigureerd()) return;
  const taak = async () => {
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
  backupPlanningNaarDropbox,
  startPeriodiekeDropboxSync,
};
