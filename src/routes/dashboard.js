const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { geocodeAdres, ONS_MAGAZIJN_ADRES } = require('../utils/afstand');

const router = express.Router();
router.use(vereistIngelogd);

// Statussen die "definitief genoeg" zijn om op het Dashboard als geplande
// levering/afhaling te tonen — een kale aanvraag ('nieuw'/'in_behandeling')
// hoort nog in de Aanvragen-inbox thuis, niet in de planning van vandaag.
const GEPLANDE_STATUSSEN = [
  'geaccepteerd', 'ingepland', 'bevestigd', 'betaalverzoek_verstuurd',
  'betaald_deels', 'betaald_volledig', 'gefactureerd', 'voldaan_manueel',
];

const DASHBOARD_SELECT = `
  SELECT b.id, b.status, b.leveringswijze, b.leveringsadres,
         b.gewenste_datum_start, b.gewenste_datum_einde,
         b.voorkeur_tijdstip_levering, b.voorkeur_tijdstip_afhaling,
         b.notities,
         k.id AS klant_id, k.naam AS klant_naam, k.telefoon AS klant_telefoon,
         k.adres AS klant_adres, k.postcode AS klant_postcode, k.gemeente AS klant_gemeente,
         l.leveringstijd, l.afhaaltijd, l.checklist_status, l.lat, l.lng, l.geocode_adres,
         bp_namen.producten_namen
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
  WHERE b.status = ANY($1)
`;

// Zelfde adreslogica als bij de CSV-export/afstandsberekening in boekingen.js:
// 'afhaling' (klant haalt zelf op) heeft geen leveringsadres nodig, en anders
// valt het leveringsadres terug op het adres van de klant zelf.
function bepaalAdres(b) {
  if (b.leveringswijze === 'afhaling') return null;
  return b.leveringsadres
    || [b.klant_adres, [b.klant_postcode, b.klant_gemeente].filter(Boolean).join(' ')]
      .filter(Boolean).join(', ');
}

// Geocodeert (en cachet in de leveringen-tabel) de locatie van elke boeking met
// een leveringsadres, voor de kaart bovenaan het Dashboard. Spaarzaam met de
// Google-quota: enkel geocoderen als het adres nog niet eerder gecached is, of
// intussen gewijzigd. Faalt de geocodering (geen sleutel, adres niet gevonden),
// dan krijgt die kaart gewoon geen marker — de rest van het Dashboard blijft werken.
async function zorgVoorGeocodering(rijen) {
  if (!process.env.GOOGLE_MAPS_API_KEY) return rijen;
  for (const rij of rijen) {
    const adres = bepaalAdres(rij);
    if (!adres) continue;
    if (rij.lat != null && rij.geocode_adres === adres) continue;
    try {
      const locatie = await geocodeAdres(adres);
      await db.query(
        'UPDATE leveringen SET lat = $1, lng = $2, geocode_adres = $3 WHERE boeking_id = $4',
        [locatie.lat, locatie.lng, adres, rij.id]
      );
      rij.lat = locatie.lat;
      rij.lng = locatie.lng;
      rij.geocode_adres = adres;
    } catch (err) {
      console.warn(`[dashboard] kon adres niet geocoderen voor boeking ${rij.id}:`, err.message);
    }
  }
  return rijen;
}

// In-memory cache voor de locatie van ons eigen magazijn — verandert nooit
// binnen een lopende serverinstantie, dus geen reden om dit telkens opnieuw
// op te vragen bij Google.
let magazijnLocatieCache = null;

async function haalMagazijnLocatieOp() {
  if (magazijnLocatieCache) return magazijnLocatieCache;
  if (!process.env.GOOGLE_MAPS_API_KEY) return null;
  try {
    magazijnLocatieCache = await geocodeAdres(ONS_MAGAZIJN_ADRES);
    return magazijnLocatieCache;
  } catch (err) {
    console.warn('[dashboard] kon magazijnadres niet geocoderen:', err.message);
    return null;
  }
}

router.get('/', asyncHandler(async (req, res) => {
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(req.query.datum || '')
    ? req.query.datum
    : new Date().toISOString().slice(0, 10);

  const [{ rows: leveringen }, { rows: ophalingen }, magazijn] = await Promise.all([
    db.query(`${DASHBOARD_SELECT} AND b.gewenste_datum_start = $2 ORDER BY k.naam`, [GEPLANDE_STATUSSEN, datum]),
    db.query(`${DASHBOARD_SELECT} AND b.gewenste_datum_einde = $2 ORDER BY k.naam`, [GEPLANDE_STATUSSEN, datum]),
    haalMagazijnLocatieOp(),
  ]);

  await Promise.all([zorgVoorGeocodering(leveringen), zorgVoorGeocodering(ophalingen)]);

  res.json({
    datum,
    leveringen,
    ophalingen,
    magazijn: magazijn ? { adres: ONS_MAGAZIJN_ADRES, ...magazijn } : null,
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || null,
  });
}));

// Eenvoudige aanpassing van het geplande leverings-/afhaaltijdstip vanop het
// Dashboard — dit is het tijdstip dat Jonas' team effectief aanhoudt (los van
// voorkeur_tijdstip_levering/afhaling, dat is wat de klant oorspronkelijk
// vroeg). Slaat op in de leveringen-tabel, dezelfde die later gekoppeld wordt
// aan de leveringen-app, zodat dit straks meteen mee overkomt.
router.put('/:boekingId/tijdstip', asyncHandler(async (req, res) => {
  const { type, datum, tijd } = req.body;
  if (!['levering', 'afhaling'].includes(type)) {
    return res.status(400).json({ fout: 'type moet "levering" of "afhaling" zijn' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum || '') || !/^\d{2}:\d{2}$/.test(tijd || '')) {
    return res.status(400).json({ fout: 'datum en tijd zijn verplicht (datum: YYYY-MM-DD, tijd: UU:MM)' });
  }
  const kolom = type === 'levering' ? 'leveringstijd' : 'afhaaltijd';
  const tijdstip = `${datum} ${tijd}`;

  const { rows } = await db.query(
    `UPDATE leveringen SET ${kolom} = $1 WHERE boeking_id = $2 RETURNING *`,
    [tijdstip, req.params.boekingId]
  );
  if (rows[0]) return res.json(rows[0]);

  // Zou normaal altijd al moeten bestaan (aangemaakt bij acceptatie van de
  // boeking), maar voor de zekerheid: als het record toch ontbreekt, meteen aanmaken.
  const { rows: nieuw } = await db.query(
    `INSERT INTO leveringen (boeking_id, ${kolom}) VALUES ($1, $2) RETURNING *`,
    [req.params.boekingId, tijdstip]
  );
  res.status(201).json(nieuw[0]);
}));

module.exports = router;
