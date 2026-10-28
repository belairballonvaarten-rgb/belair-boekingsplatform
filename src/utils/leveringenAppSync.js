// Gedeelde sync-logica met de leveringen-app (de chauffeurs-/crew-app) —
// verhuisd uit routes/sync.js zodat zowel de knop "Nu synchroniseren"
// (handmatig, zie routes/sync.js) als de automatische triggers hieronder
// dezelfde functie gebruiken, in plaats van twee keer (mogelijk uit elkaar
// lopende) kopieën van dezelfde query/push-logica.
//
// Op vraag van Jonas (de "zwakke schakel" in de koppeling): de planning/
// boekingsgegevens gingen tot nu enkel naar de leveringen-app als hij zelf
// op "Nu synchroniseren" klikte — vergat hij dat na een laatste-minuut-
// wijziging (ander voertuig, andere volgorde, ander tijdstip), dan reed de
// ploeg verder op verouderde info. plantAutoSync() hieronder wordt daarom
// aangeroepen vanuit elke plek die zoiets wijzigt (zie routes/planning.js,
// routes/dashboard.js, routes/boekingen.js), en startPeriodiekeSync() is een
// vangnet: mocht een wijziging toch ergens gemist zijn in die triggers, dan
// loopt de achterstand nooit langer op dan het periodieke interval.
const db = require('../db');
const { EFFECTIEVE_DATUM_SQL } = require('./effectieveDatum');

// Zelfde statuslijst als het Dashboard: enkel "definitief genoeg" geplande
// boekingen zijn interessant voor de leveringen-app, geen kale aanvragen.
const GEPLANDE_STATUSSEN = [
  'geaccepteerd', 'ingepland', 'bevestigd', 'betaalverzoek_verstuurd',
  'betaald_deels', 'betaald_volledig', 'gefactureerd', 'voldaan_manueel',
];

// Zelfde adreslogica als op het Dashboard: bij zelfafhaling is er geen
// leveringsadres nodig; anders valt het terug op het adres van de klant zelf.
function bepaalAdres(b) {
  if (b.leveringswijze === 'afhaling') return '';
  return b.leveringsadres
    || [b.klant_adres, [b.klant_postcode, b.klant_gemeente].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

// pg geeft DATE/TIMESTAMPTZ-kolommen terug als JS Date-objecten — dit werkt
// zowel op zo'n Date als op een string, en geeft in beide gevallen YYYY-MM-DD.
function naarDatum(waarde) {
  if (!waarde) return '';
  return new Date(waarde).toISOString().slice(0, 10);
}

// Zelfde, maar dan de tijdcomponent (HH:MM) — voor leveringstijd/afhaaltijd.
function naarTijd(waarde) {
  if (!waarde) return '';
  return new Date(waarde).toISOString().slice(11, 16);
}

function isGeconfigureerd() {
  return !!(process.env.LEVERINGEN_APP_URL && process.env.LEVERINGEN_APP_SYNC_SECRET);
}

// Voert de volledige sync in één keer uit: huidige planning ophalen en
// doorsturen naar de leveringen-app, en meteen ook de "voltooid"-status
// terugkoppelen (zie de uitleg die hier vroeger bij routes/sync.js stond).
// Gooit een Error (met .status) bij een probleem, zodat de aanroeper zelf
// bepaalt hoe dat getoond/gelogd wordt (nette foutmelding bij de knop,
// gewoon een console.warn bij de automatische triggers hieronder).
async function voerSyncUit() {
  const url = process.env.LEVERINGEN_APP_URL;
  const sleutel = process.env.LEVERINGEN_APP_SYNC_SECRET;
  if (!url || !sleutel) {
    const fout = new Error('Koppeling met de leveringen-app is nog niet geconfigureerd (LEVERINGEN_APP_URL / LEVERINGEN_APP_SYNC_SECRET ontbreken bij Render).');
    fout.status = 501;
    throw fout;
  }

  // Zelfde venster als de bestaande WordPress-sync: vanaf 2 dagen geleden tot
  // in de toekomst, zodat net afgelopen leveringen nog even meekomen.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 2);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { rows } = await db.query(
    `SELECT b.id, b.leveringswijze, b.leveringsadres,
            b.gewenste_datum_start, b.gewenste_datum_einde,
            ${EFFECTIEVE_DATUM_SQL.levering} AS effectieve_leverdatum,
            ${EFFECTIEVE_DATUM_SQL.afhaling} AS effectieve_afhaaldatum,
            k.naam AS klant_naam, k.telefoon AS klant_telefoon, k.email AS klant_email,
            k.adres AS klant_adres, k.postcode AS klant_postcode, k.gemeente AS klant_gemeente,
            l.leveringstijd, l.afhaaltijd, l.voertuig_levering, l.voertuig_afhaling,
            l.volgorde_levering, l.volgorde_afhaling,
            bp_namen.producten_namen,
            COALESCE(bp_totalen.totaal, 0) AS totaal
     FROM boekingen b
     JOIN klanten k ON k.id = b.klant_id
     LEFT JOIN leveringen l ON l.boeking_id = b.id
     LEFT JOIN (
       SELECT bp.boeking_id,
              string_agg(p.naam || CASE WHEN bp.aantal > 1 THEN ' (x' || bp.aantal || ')' ELSE '' END, ', ' ORDER BY p.naam) AS producten_namen
       FROM boeking_producten bp
       JOIN producten p ON p.id = bp.product_id
       GROUP BY bp.boeking_id
     ) bp_namen ON bp_namen.boeking_id = b.id
     LEFT JOIN (
       SELECT boeking_id, SUM(prijs * aantal) AS totaal
       FROM boeking_producten
       GROUP BY boeking_id
     ) bp_totalen ON bp_totalen.boeking_id = b.id
     WHERE b.status = ANY($1) AND b.gewenste_datum_einde >= $2
     ORDER BY b.gewenste_datum_start`,
    [GEPLANDE_STATUSSEN, cutoffStr]
  );

  const boekingen = rows.map((b) => ({
    boekingsnummer: b.id,
    klant: b.klant_naam,
    telefoon: b.klant_telefoon || '',
    email: b.klant_email || '',
    adres: bepaalAdres(b),
    // "datum"/"afhaaldatum" zijn de EFFECTIEVE dag waarop de ploeg moet rijden
    // (standaard de huurperiode, maar een bewust afwijkende leverdatum/
    // afhaaldatum — migratie 056, in te stellen in het dossier — weegt
    // zwaarder), niet zomaar gewenste_datum_start/-einde — anders bleef deze
    // sync de huurperiode doorsturen terwijl de ploeg op een andere dag rijdt.
    datum: naarDatum(b.effectieve_leverdatum),
    tijdslot: naarTijd(b.leveringstijd),
    afhaaldatum: naarDatum(b.effectieve_afhaaldatum),
    afhaaltijd: naarTijd(b.afhaaltijd),
    artikelen: b.producten_namen || '',
    bedrag: Number(b.totaal || 0),
    voertuig: b.voertuig_levering || null,
    voertuigAfhaling: b.voertuig_afhaling || null,
    volgordeLevering: b.volgorde_levering != null ? b.volgorde_levering : null,
    volgordeAfhaling: b.volgorde_afhaling != null ? b.volgorde_afhaling : null,
  }));
  // Voor de terugkoppeling nadien: welke boekingsnummer hoort bij welke
  // boeking_id, zodat de status-lijst van de app rechtstreeks in "leveringen"
  // bijgewerkt kan worden.
  const boekingIdPerNummer = new Map(rows.map((b) => [String(b.id), b.id]));

  let pushResultaat;
  try {
    const respons = await fetch(url.replace(/\/$/, '') + '/api/sync/boekingsplatform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Belair-Sync-Key': sleutel },
      body: JSON.stringify({ boekingen }),
    });
    const data = await respons.json().catch(() => null);
    if (!respons.ok || !data) {
      const fout = new Error(`De leveringen-app antwoordde met een fout (${respons.status})`);
      fout.status = 502;
      fout.data = data;
      throw fout;
    }
    pushResultaat = data;
  } catch (err) {
    if (err.status) throw err;
    const fout = new Error('Kon de leveringen-app niet bereiken: ' + err.message);
    fout.status = 502;
    throw fout;
  }

  // Meteen na het versturen ook de huidige status ophalen — zo komt een
  // "geplaatst"/"afgerond"-markering die de crew in de app zet (levering
  // effectief gebeurd / ook al opgehaald) terug zichtbaar op het eigen
  // Dashboard, zonder dat dit een aparte, tweede knop moet zijn. Faalt dit
  // (bv. oudere app-versie zonder dit endpoint), dan blijft de rest van de
  // synchronisatie gewoon geslaagd — enkel de terugkoppeling wordt overgeslagen.
  let statusTeruggekoppeld = 0;
  try {
    const statusResp = await fetch(url.replace(/\/$/, '') + '/api/sync/boekingsplatform/status', {
      headers: { 'X-Belair-Sync-Key': sleutel },
    });
    if (statusResp.ok) {
      const statusData = await statusResp.json();
      for (const rij of statusData.leveringen || []) {
        const boekingId = boekingIdPerNummer.get(String(rij.boekingsnummer));
        if (!boekingId) continue;
        const leveringVoltooid = rij.status === 'geplaatst' || rij.status === 'afgerond';
        const afhalingVoltooid = rij.status === 'afgerond';
        const { rows: bijgewerkt } = await db.query(
          `UPDATE leveringen SET levering_voltooid = $1, afhaling_voltooid = $2 WHERE boeking_id = $3 RETURNING id`,
          [leveringVoltooid, afhalingVoltooid, boekingId]
        );
        if (!bijgewerkt.length) {
          await db.query(
            `INSERT INTO leveringen (boeking_id, levering_voltooid, afhaling_voltooid) VALUES ($1, $2, $3)`,
            [boekingId, leveringVoltooid, afhalingVoltooid]
          );
        }
        statusTeruggekoppeld++;
      }
    }
  } catch (err) {
    console.warn('[sync] kon status niet terugkoppelen vanuit de leveringen-app:', err.message);
  }

  return { verstuurd: boekingen.length, statusTeruggekoppeld, ...pushResultaat };
}

// Debounce: meerdere wijzigingen kort na elkaar (bv. drie keer na elkaar een
// stop verslepen in Planning) leiden tot ÉÉN sync-aanroep een paar seconden
// later, niet één per tussentijdse wijziging. `reden` is enkel voor in de
// logging, zodat een mislukte auto-sync in de serverlogs te herleiden is tot
// waar hij vandaan kwam.
const AUTO_SYNC_DEBOUNCE_MS = 8000;
let autoSyncTimer = null;

function plantAutoSync(reden) {
  if (!isGeconfigureerd()) return; // nog niet gekoppeld bij Render -> niets te doen
  if (autoSyncTimer) clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => {
    autoSyncTimer = null;
    voerSyncUit().catch((err) => {
      console.warn(`[auto-sync leveringen-app] mislukt (trigger: ${reden || '?'}):`, err.message);
    });
  }, AUTO_SYNC_DEBOUNCE_MS);
  if (typeof autoSyncTimer.unref === 'function') autoSyncTimer.unref(); // mag het process niet openhouden
}

// Periodieke vangnet-sync, los van plantAutoSync hierboven — voor het geval
// een wijziging toch ergens gemist is in de triggers die plantAutoSync
// aanroepen: zo loopt de achterstand nooit langer op dan dit interval. Eén
// keer opgestart vanuit server.js.
const PERIODIEKE_SYNC_MS = 5 * 60 * 1000; // 5 minuten

function startPeriodiekeSync() {
  const timer = setInterval(() => {
    if (!isGeconfigureerd()) return;
    voerSyncUit().catch((err) => {
      console.warn('[periodieke sync leveringen-app] mislukt:', err.message);
    });
  }, PERIODIEKE_SYNC_MS);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

module.exports = { voerSyncUit, plantAutoSync, startPeriodiekeSync, isGeconfigureerd };
