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
         l.leveringstijd, l.afhaaltijd, l.lat, l.lng, l.geocode_adres,
         l.voertuig_levering, l.voertuig_afhaling,
         COALESCE(l.levering_voltooid, false) AS levering_voltooid,
         COALESCE(l.afhaling_voltooid, false) AS afhaling_voltooid,
         bp_namen.producten_namen, bp_namen.eerste_product_naam, bp_namen.aantal_producten
  FROM boekingen b
  JOIN klanten k ON k.id = b.klant_id
  LEFT JOIN leveringen l ON l.boeking_id = b.id
  LEFT JOIN (
    SELECT bp.boeking_id,
           string_agg(p.naam || CASE WHEN bp.aantal > 1 THEN ' (x' || bp.aantal || ')' ELSE '' END, ', ' ORDER BY p.naam) AS producten_namen,
           (array_agg(p.naam ORDER BY p.naam))[1] AS eerste_product_naam,
           COUNT(*) AS aantal_producten
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

// datumKolom is altijd één van deze 2 letterlijke, hardgecodeerde waarden
// (nooit user-input), dus veilig om rechtstreeks in de query te plakken.
const DATUMKOLOM = { levering: 'gewenste_datum_start', afhaling: 'gewenste_datum_einde' };

// Als er op de gekozen dag niets gepland staat, toont het Dashboard i.p.v. een
// lege kolom de eerstvolgende dag waarop er wél iets is — zo blijft de kolom
// altijd nuttig, ook in een rustige periode. `type` maakt in het antwoord
// duidelijk of het om "vandaag" gaat of om zo'n eerstvolgende dag, zodat de
// pagina dat nooit door elkaar toont.
async function haalKolom(soort, datum) {
  const kolom = DATUMKOLOM[soort];
  const { rows } = await db.query(`${DASHBOARD_SELECT} AND b.${kolom} = $2 ORDER BY k.naam`, [GEPLANDE_STATUSSEN, datum]);
  if (rows.length) return { type: 'vandaag', datum, items: rows };

  const { rows: volgendeRows } = await db.query(
    `SELECT MIN(b.${kolom}) AS datum FROM boekingen b WHERE b.status = ANY($1) AND b.${kolom} > $2`,
    [GEPLANDE_STATUSSEN, datum]
  );
  const volgendeDatum = volgendeRows[0]?.datum ? new Date(volgendeRows[0].datum).toISOString().slice(0, 10) : null;
  if (!volgendeDatum) return { type: 'vandaag', datum, items: [] };

  const { rows: volgendeItems } = await db.query(`${DASHBOARD_SELECT} AND b.${kolom} = $2 ORDER BY k.naam`, [GEPLANDE_STATUSSEN, volgendeDatum]);
  return { type: 'eerstvolgende', datum: volgendeDatum, items: volgendeItems };
}

// Voor een gekozen periode (i.p.v. één dag) — de snelfilters boven de kaart
// (Deze week / Vorige week / Vorige maand / Aangepast). Geen "eerstvolgende"-
// terugval hier: een expliciet gekozen periode die leeg is, is gewoon leeg.
async function haalBereik(soort, vanaf, tot) {
  const kolom = DATUMKOLOM[soort];
  const tijdKolom = soort === 'levering' ? 'l.leveringstijd' : 'l.afhaaltijd';
  const { rows } = await db.query(
    `${DASHBOARD_SELECT} AND b.${kolom} BETWEEN $2 AND $3 ORDER BY b.${kolom}, ${tijdKolom} NULLS LAST, k.naam`,
    [GEPLANDE_STATUSSEN, vanaf, tot]
  );
  return { items: rows };
}

router.get('/', asyncHandler(async (req, res) => {
  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  const vanaf = isoRegex.test(req.query.vanaf || '') ? req.query.vanaf : null;
  const tot = isoRegex.test(req.query.tot || '') ? req.query.tot : null;

  if (vanaf && tot) {
    const [levering, afhaling, magazijn] = await Promise.all([
      haalBereik('levering', vanaf, tot),
      haalBereik('afhaling', vanaf, tot),
      haalMagazijnLocatieOp(),
    ]);
    await Promise.all([zorgVoorGeocodering(levering.items), zorgVoorGeocodering(afhaling.items)]);
    return res.json({
      vanaf,
      tot,
      leveringen: levering.items,
      leveringenType: 'bereik',
      ophalingen: afhaling.items,
      ophalingenType: 'bereik',
      magazijn: magazijn ? { adres: ONS_MAGAZIJN_ADRES, ...magazijn } : null,
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || null,
    });
  }

  const datum = isoRegex.test(req.query.datum || '')
    ? req.query.datum
    : new Date().toISOString().slice(0, 10);

  const [levering, afhaling, magazijn] = await Promise.all([
    haalKolom('levering', datum),
    haalKolom('afhaling', datum),
    haalMagazijnLocatieOp(),
  ]);

  await Promise.all([zorgVoorGeocodering(levering.items), zorgVoorGeocodering(afhaling.items)]);

  res.json({
    datum,
    leveringen: levering.items,
    leveringenType: levering.type,
    leveringenDatum: levering.datum,
    ophalingen: afhaling.items,
    ophalingenType: afhaling.type,
    ophalingenDatum: afhaling.datum,
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

// Eenvoudig "geleverd"/"opgehaald"-vinkje vanop het Dashboard — kleurt de kaart
// groen zodra het effectief gebeurd is. Los van de boeking-status (die kan
// intussen al "betaald" zijn zonder dat er al iets geleverd is).
router.put('/:boekingId/voltooid', asyncHandler(async (req, res) => {
  const { type, voltooid } = req.body;
  if (!['levering', 'afhaling'].includes(type) || typeof voltooid !== 'boolean') {
    return res.status(400).json({ fout: 'type ("levering"/"afhaling") en voltooid (true/false) zijn verplicht' });
  }
  const kolom = type === 'levering' ? 'levering_voltooid' : 'afhaling_voltooid';

  const { rows } = await db.query(
    `UPDATE leveringen SET ${kolom} = $1 WHERE boeking_id = $2 RETURNING *`,
    [voltooid, req.params.boekingId]
  );
  if (rows[0]) return res.json(rows[0]);

  const { rows: nieuw } = await db.query(
    `INSERT INTO leveringen (boeking_id, ${kolom}) VALUES ($1, $2) RETURNING *`,
    [req.params.boekingId, voltooid]
  );
  res.status(201).json(nieuw[0]);
}));

// Voertuig toewijzen aan een levering of afhaling vanop het Dashboard — dezelfde
// leveringen-tabel/kolommen die later ook door de leveringen-app gebruikt
// worden, dus dit komt daar straks gewoon in mee. Levering en afhaling van
// dezelfde boeking krijgen elk hun EIGEN voertuig (bv. geleverd met de
// camionette, later opgehaald met de bus) — dus altijd op basis van "type"
// de juiste kolom bijwerken, nooit beide tegelijk.
router.put('/:boekingId/voertuig', asyncHandler(async (req, res) => {
  if (!['levering', 'afhaling'].includes(req.body.type)) {
    return res.status(400).json({ fout: 'type (levering/afhaling) is verplicht' });
  }
  const kolom = req.body.type === 'levering' ? 'voertuig_levering' : 'voertuig_afhaling';
  const waarde = (req.body.voertuig || '').trim() || null;

  const { rows } = await db.query(
    `UPDATE leveringen SET ${kolom} = $1 WHERE boeking_id = $2 RETURNING *`,
    [waarde, req.params.boekingId]
  );
  if (rows[0]) return res.json(rows[0]);

  const { rows: nieuw } = await db.query(
    `INSERT INTO leveringen (boeking_id, ${kolom}) VALUES ($1, $2) RETURNING *`,
    [req.params.boekingId, waarde]
  );
  res.status(201).json(nieuw[0]);
}));

module.exports = router;
