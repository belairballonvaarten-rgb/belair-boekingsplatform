// Automatische koppeling met de WordPress-website (plugin "Belair
// Beschikbaarheid") — zonder dat er nog op een knop gedrukt moet worden.
//
// Voorheen gebeurde dit enkel manueel, via de "Nu synchroniseren"-knop in de
// leveringen-app (die stuurt naar dezelfde WordPress-endpoint, zie
// server.js -> app.post('/api/sync-website', ...) daar). Dit bestand doet
// exact hetzelfde, maar dan rechtstreeks vanuit het boekingsplatform zelf
// (dat toch al rechtstreeks bij dezelfde database kan), en wordt automatisch
// aangeroepen na elke wijziging die de beschikbaarheid kan beïnvloeden (zie
// plandWebsiteSync() in routes/boekingen.js en routes/klant-bevestiging.js).
//
// Bewust NIET drooggetrokken met de leveringen-app-versie van deze functie
// (elke app blijft z'n eigen kopie behouden, zelfde aanpak als elders tussen
// deze twee apps) — zo blijft deze koppeling ook werken als de leveringen-app
// er ooit even uitligt of losgekoppeld wordt.
const db = require('../db');

// Zelfde statuslijst als routes/sync.js (GEPLANDE_STATUSSEN) en het
// Dashboard — enkel "definitief genoeg" geplande boekingen zijn interessant
// voor de website-beschikbaarheid, geen kale aanvragen. Bewust hier
// gedupliceerd i.p.v. geïmporteerd vanuit routes/sync.js, om een routes-bestand
// niet als afhankelijkheid van een utils-bestand te moeten gebruiken — hou
// deze lijst gelijk met die daar als je er ooit een status aan toevoegt/wijzigt.
const GEPLANDE_STATUSSEN = [
  'geaccepteerd', 'ingepland', 'bevestigd', 'betaalverzoek_verstuurd',
  'betaald_deels', 'betaald_volledig', 'gefactureerd', 'voldaan_manueel',
];

function naarDatumString(waarde) {
  if (!waarde) return '';
  return new Date(waarde).toISOString().slice(0, 10);
}

// Stuurt de huidige, geplande boekingen naar de WordPress-website. Gooit een
// fout als de koppeling niet geconfigureerd is of de website niet bereikbaar
// is/een foutstatus teruggeeft — zie plandWebsiteSync() hieronder voor de
// "vuur-en-vergeet"-variant die je vanuit een route-handler aanroept.
async function synchroniseerWebsiteBeschikbaarheid({ fullSync = false } = {}) {
  const siteUrl = process.env.WORDPRESS_SITE_URL;
  const syncKey = process.env.WORDPRESS_SYNC_SECRET;
  if (!siteUrl || !syncKey) {
    const fout = new Error('Website-koppeling is niet geconfigureerd (WORDPRESS_SITE_URL / WORDPRESS_SYNC_SECRET ontbreken bij Render)');
    fout.nietGeconfigureerd = true;
    throw fout;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 2);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { rows } = await db.query(
    `SELECT b.id, b.gewenste_datum_start, b.gewenste_datum_einde, bp.producten_namen
     FROM boekingen b
     LEFT JOIN (
       SELECT bp.boeking_id,
              string_agg(p.naam || CASE WHEN bp.aantal > 1 THEN ' (x' || bp.aantal || ')' ELSE '' END, ', ' ORDER BY p.naam) AS producten_namen
       FROM boeking_producten bp JOIN producten p ON p.id = bp.product_id
       GROUP BY bp.boeking_id
     ) bp ON bp.boeking_id = b.id
     WHERE b.status = ANY($1) AND b.gewenste_datum_einde >= $2`,
    [GEPLANDE_STATUSSEN, cutoffStr]
  );

  const bookings = rows
    .filter((d) => d.producten_namen)
    .map((d) => ({
      booking_id: d.id,
      item: d.producten_namen,
      delivery_date: naarDatumString(d.gewenste_datum_start),
      collection_date: naarDatumString(d.gewenste_datum_einde) || naarDatumString(d.gewenste_datum_start),
    }));

  const wpRes = await fetch(siteUrl.replace(/\/$/, '') + '/wp-json/belair/v1/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Belair-Sync-Key': syncKey },
    body: JSON.stringify({ bookings, full_sync: fullSync }),
  });
  const wpData = await wpRes.json().catch(() => null);
  if (!wpRes.ok || !wpData) {
    throw new Error(`Website antwoordde met een fout (${wpRes.status})`);
  }
  return { verstuurd: bookings.length, ...wpData };
}

// Enkel eenmaal waarschuwen als de koppeling niet geconfigureerd staat —
// anders komt bij elke boekingswijziging dezelfde regel in de logs, zonder
// dat dat nuttig is (Jonas moet dit sowieso 1x instellen bij Render).
let waarschuwingNietGeconfigureerdGetoond = false;

// "Vuur-en-vergeet": roep dit aan het einde van een route-handler aan (NIET
// met await) na elke wijziging die de beschikbaarheid kan beïnvloeden (nieuwe
// boeking, datum/product/status-wijziging, verwijderen, klant-zelfbevestiging).
// Faalt de website-sync (bv. tijdelijk niet bereikbaar), dan mag dat de
// eigenlijke opslag-actie op het platform nooit blokkeren of laten mislukken —
// vandaar dat elke fout hier enkel gelogd wordt.
function plandWebsiteSync() {
  synchroniseerWebsiteBeschikbaarheid().catch((err) => {
    if (err.nietGeconfigureerd) {
      if (!waarschuwingNietGeconfigureerdGetoond) {
        waarschuwingNietGeconfigureerdGetoond = true;
        console.warn('Automatische website-sync overgeslagen:', err.message);
      }
      return;
    }
    console.warn('Automatische website-sync (beschikbaarheid) mislukt:', err.message);
  });
}

module.exports = { synchroniseerWebsiteBeschikbaarheid, plandWebsiteSync };
