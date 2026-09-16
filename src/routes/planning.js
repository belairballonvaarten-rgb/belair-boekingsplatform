const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { geocodeAdres } = require('../utils/afstand');
const { berekenRijtijdenMinuten } = require('../utils/osrm');

// Vaste tijd per stop (parkeren, aanbellen, kort gesprek, terug naar het
// voertuig) — komt bovenop de eventuele opsteltijd van de producten zelf.
// "Gewoon een inschatting", zoals Jonas het zelf noemt — geen exacte wetenschap.
const STOP_MINUTEN = 15;

const router = express.Router();
router.use(vereistIngelogd);

// Zelfde statuslijst als het Dashboard en de leveringen-app-sync: enkel
// "definitief genoeg" geplande boekingen zijn interessant om in te plannen.
const GEPLANDE_STATUSSEN = [
  'geaccepteerd', 'ingepland', 'bevestigd', 'betaalverzoek_verstuurd',
  'betaald_deels', 'betaald_volledig', 'gefactureerd', 'voldaan_manueel',
];

// "kolom" is altijd één van deze 2 letterlijke, hardgecodeerde waarden (nooit
// user-input), dus veilig om rechtstreeks in de query te plakken.
const DATUMKOLOM = { levering: 'gewenste_datum_start', afhaling: 'gewenste_datum_einde' };

// producten_detail: naast de leesbare "producten_namen" ook de ruwe
// logistieke gegevens per product (gewicht/motor/valmatten/piketten/
// zandzakken, telkens x het aantal in deze boeking) — nodig om straks een
// laadlijst met totalen per voertuig te kunnen opmaken.
// "kolom" en "voorwaarde" zijn altijd letterlijke, hardgecodeerde stukjes SQL
// (nooit user-input) — voorwaarde bevat zelf de placeholder(s) ($2, of
// "BETWEEN $2 AND $3"), dus veilig om rechtstreeks te plakken.
const PLANNING_SELECT = (kolom, voorwaarde) => `
  SELECT b.id, b.status, b.leveringswijze, b.leveringsadres,
         b.gewenste_datum_start, b.gewenste_datum_einde,
         k.naam AS klant_naam, k.telefoon AS klant_telefoon,
         k.adres AS klant_adres, k.postcode AS klant_postcode, k.gemeente AS klant_gemeente,
         l.leveringstijd, l.afhaaltijd,
         l.voertuig_levering, l.voertuig_afhaling,
         l.volgorde_levering, l.volgorde_afhaling,
         l.lat, l.lng, l.geocode_adres,
         COALESCE(l.levering_voltooid, false) AS levering_voltooid,
         COALESCE(l.afhaling_voltooid, false) AS afhaling_voltooid,
         bp_namen.producten_namen, bp_namen.eerste_product_naam, bp_namen.aantal_producten,
         bp_namen.producten_detail
  FROM boekingen b
  JOIN klanten k ON k.id = b.klant_id
  LEFT JOIN leveringen l ON l.boeking_id = b.id
  LEFT JOIN (
    SELECT bp.boeking_id,
           string_agg(p.naam || CASE WHEN bp.aantal > 1 THEN ' (x' || bp.aantal || ')' ELSE '' END, ', ' ORDER BY p.naam) AS producten_namen,
           (array_agg(p.naam ORDER BY p.naam))[1] AS eerste_product_naam,
           COUNT(*) AS aantal_producten,
           json_agg(json_build_object(
             'naam', p.naam,
             'aantal', bp.aantal,
             'motor_type', p.motor_type,
             'gewicht_kg', p.gewicht_kg,
             'aantal_valmatten', p.aantal_valmatten,
             'aantal_piketten', p.aantal_piketten,
             'aantal_zandzakken', p.aantal_zandzakken,
             'aantal_motors', p.aantal_motors,
             'verlengkabel_standaard', p.verlengkabel_standaard,
             'verlengkabel_dubbel', p.verlengkabel_dubbel,
             'overige_benodigdheden', p.overige_benodigdheden,
             'gemiddelde_opsteltijd_minuten', p.gemiddelde_opsteltijd_minuten
           ) ORDER BY p.naam) AS producten_detail
    FROM boeking_producten bp
    JOIN producten p ON p.id = bp.product_id
    GROUP BY bp.boeking_id
  ) bp_namen ON bp_namen.boeking_id = b.id
  WHERE b.status = ANY($1) AND b.${kolom} ${voorwaarde}
`;

router.get('/', asyncHandler(async (req, res) => {
  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  const vanaf = isoRegex.test(req.query.vanaf || '') ? req.query.vanaf : null;
  const tot = isoRegex.test(req.query.tot || '') ? req.query.tot : null;

  // Bereik-modus (Deze week/Volgende week/Aangepast, ...) — zelfde principe
  // als het Dashboard: geen groepering per voertuig hier (dat gebeurt in de
  // frontend, per dag apart), gewoon alle items in de periode, gesorteerd op
  // datum + tijdstip zodat een logisch overzicht ontstaat.
  if (vanaf && tot) {
    const queryVoorKolomBereik = (kolom) => {
      const tijdKolom = kolom === 'gewenste_datum_start' ? 'l.leveringstijd' : 'l.afhaaltijd';
      return `${PLANNING_SELECT(kolom, 'BETWEEN $2 AND $3')} ORDER BY b.${kolom}, ${tijdKolom} NULLS LAST, k.naam`;
    };
    const [{ rows: leveringen }, { rows: ophalingen }] = await Promise.all([
      db.query(queryVoorKolomBereik('gewenste_datum_start'), [GEPLANDE_STATUSSEN, vanaf, tot]),
      db.query(queryVoorKolomBereik('gewenste_datum_einde'), [GEPLANDE_STATUSSEN, vanaf, tot]),
    ]);
    return res.json({ vanaf, tot, leveringen, ophalingen });
  }

  const datum = isoRegex.test(req.query.datum || '')
    ? req.query.datum
    : new Date().toISOString().slice(0, 10);

  const queryVoorKolom = (kolom) => `${PLANNING_SELECT(kolom, '= $2')} ORDER BY k.naam`;

  const [{ rows: leveringen }, { rows: ophalingen }] = await Promise.all([
    db.query(queryVoorKolom('gewenste_datum_start'), [GEPLANDE_STATUSSEN, datum]),
    db.query(queryVoorKolom('gewenste_datum_einde'), [GEPLANDE_STATUSSEN, datum]),
  ]);

  res.json({ datum, leveringen, ophalingen });
}));

// Bewaart de volgorde van een volledige route (één voertuig, één dag, één
// richting) in één keer — de frontend stuurt telkens de volledige, opnieuw
// genummerde lijst door na een verschuiving, i.p.v. één positie per keer.
router.put('/volgorde', asyncHandler(async (req, res) => {
  const { type, volgorde } = req.body;
  if (!['levering', 'afhaling'].includes(type) || !Array.isArray(volgorde)) {
    return res.status(400).json({ fout: 'type (levering/afhaling) en volgorde (lijst) zijn verplicht' });
  }
  const kolom = type === 'levering' ? 'volgorde_levering' : 'volgorde_afhaling';

  for (const item of volgorde) {
    if (!item || !item.boekingId || !Number.isInteger(item.positie)) continue;
    const { rows } = await db.query(
      `UPDATE leveringen SET ${kolom} = $1 WHERE boeking_id = $2 RETURNING id`,
      [item.positie, item.boekingId]
    );
    if (!rows.length) {
      await db.query(`INSERT INTO leveringen (boeking_id, ${kolom}) VALUES ($1, $2)`, [item.boekingId, item.positie]);
    }
  }
  res.json({ bijgewerkt: volgorde.length });
}));

function tijdNaarMinuten(hhmm) {
  if (!hhmm) return null;
  const [u, m] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(u)) return null;
  return u * 60 + (m || 0);
}

function minutenNaarTijd(m) {
  const totaal = ((Math.round(m) % 1440) + 1440) % 1440;
  const u = Math.floor(totaal / 60);
  const min = totaal % 60;
  return `${String(u).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// Zelfde adreslogica als het Dashboard (src/routes/dashboard.js): bij
// "afhaling" (de klant haalt zelf op bij ons magazijn) is er geen fysieke
// stop nodig op de route, en anders valt het terug op het adres van de klant
// zelf als er geen apart leveringsadres is ingevuld.
function bepaalRouteAdres(b) {
  if (b.leveringswijze === 'afhaling') return null;
  return b.leveringsadres
    || [b.klant_adres, [b.klant_postcode, b.klant_gemeente].filter(Boolean).join(' ')]
      .filter(Boolean).join(', ');
}

// Geeft een "gewoon een inschatting" van de haalbare timing van een reeds
// handmatig vastgelegde route (Planning-pagina, gesleepte volgorde): per stop
// de rijtijd tot daar (via OSRM), plus een vaste tijd per stop en, indien
// gekend, de gemiddelde opsteltijd van de producten in die boeking — voor
// zowel plaatsing (type=levering) als ophaling (type=afhaling). Verandert de
// volgorde, dan roept de frontend dit gewoon opnieuw op.
router.get('/route-inschatting', asyncHandler(async (req, res) => {
  const { voertuigNaam, datum } = req.query;
  const type = req.query.type;
  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!voertuigNaam || !isoRegex.test(datum || '') || !['levering', 'afhaling'].includes(type)) {
    return res.status(400).json({ fout: 'voertuigNaam, datum (JJJJ-MM-DD) en type (levering/afhaling) zijn verplicht' });
  }
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return res.status(501).json({ fout: 'Route-inschatting heeft adres-coördinaten nodig — GOOGLE_MAPS_API_KEY ontbreekt bij Render (dezelfde sleutel als voor de transportkost-berekening en de kaart op het Dashboard).' });
  }

  const kolom = DATUMKOLOM[type];
  const voertuigVeld = type === 'levering' ? 'voertuig_levering' : 'voertuig_afhaling';
  const volgordeVeld = type === 'levering' ? 'volgorde_levering' : 'volgorde_afhaling';
  const tijdVeld = type === 'levering' ? 'leveringstijd' : 'afhaaltijd';

  const { rows } = await db.query(`${PLANNING_SELECT(kolom, '= $2')}`, [GEPLANDE_STATUSSEN, datum]);

  const stops = rows
    .filter((b) => (b[voertuigVeld] || '') === voertuigNaam)
    .sort((a, b) => {
      const va = a[volgordeVeld];
      const vb = b[volgordeVeld];
      if (va != null && vb != null) return va - vb;
      if (va != null) return -1;
      if (vb != null) return 1;
      return 0;
    })
    .map((b) => ({ ...b, _adres: bepaalRouteAdres(b) }))
    .filter((b) => b._adres); // eigen afhaling door de klant zelf: geen fysieke stop nodig

  if (!stops.length) {
    return res.json({ voertuigNaam, datum, type, stops: [], totaalRijtijdMinuten: 0, totaalMinuten: 0, waarschuwingen: [] });
  }

  const waarschuwingen = [];
  for (const b of stops) {
    if (b.lat != null && b.geocode_adres === b._adres) continue;
    try {
      const loc = await geocodeAdres(b._adres);
      await db.query('UPDATE leveringen SET lat = $1, lng = $2, geocode_adres = $3 WHERE boeking_id = $4', [loc.lat, loc.lng, b._adres, b.id]);
      b.lat = loc.lat;
      b.lng = loc.lng;
    } catch (err) {
      b.lat = null;
      b.lng = null;
      waarschuwingen.push(`Adres niet gevonden voor ${b.klant_naam} (${b._adres}) — deze stop telt niet mee in de rijtijd.`);
    }
  }

  const bekendeStops = stops.filter((b) => b.lat != null && b.lng != null);
  let rijtijdenMinuten = null;
  if (bekendeStops.length >= 2) {
    try {
      rijtijdenMinuten = await berekenRijtijdenMinuten(bekendeStops.map((b) => ({ lat: Number(b.lat), lng: Number(b.lng) })));
    } catch (err) {
      waarschuwingen.push(`Rijtijden konden niet opgehaald worden (${err.message}) — enkel stop-/opsteltijden worden meegeteld.`);
    }
  }

  const startMinuten = tijdNaarMinuten(stops[0][tijdVeld]) ?? (8 * 60);
  let klokMinuten = startMinuten;
  let bekendeIndex = -1;
  const resultaatStops = stops.map((b, i) => {
    let rijtijd = null;
    const heeftLocatie = b.lat != null && b.lng != null;
    if (heeftLocatie) {
      bekendeIndex++;
      if (i > 0 && bekendeIndex > 0 && rijtijdenMinuten) rijtijd = rijtijdenMinuten[bekendeIndex - 1];
    }
    if (i === 0) rijtijd = 0;
    if (rijtijd != null) klokMinuten += rijtijd;
    const aankomstTijd = minutenNaarTijd(klokMinuten);
    const opstelMinuten = Array.isArray(b.producten_detail)
      ? b.producten_detail.reduce((som, p) => som + (Number(p.gemiddelde_opsteltijd_minuten) || 0) * (Number(p.aantal) || 1), 0)
      : 0;
    klokMinuten += STOP_MINUTEN + opstelMinuten;
    return {
      boekingId: b.id,
      klantNaam: b.klant_naam,
      adres: b._adres,
      rijtijdMinuten: rijtijd,
      aankomstTijd,
      stopMinuten: STOP_MINUTEN,
      opstelMinuten,
      vertrekTijd: minutenNaarTijd(klokMinuten),
      geenLocatie: !heeftLocatie,
    };
  });

  res.json({
    voertuigNaam,
    datum,
    type,
    vertrekTijd: minutenNaarTijd(startMinuten),
    eindTijd: minutenNaarTijd(klokMinuten),
    totaalRijtijdMinuten: resultaatStops.reduce((som, s) => som + (s.rijtijdMinuten || 0), 0),
    totaalMinuten: klokMinuten - startMinuten,
    stops: resultaatStops,
    waarschuwingen,
  });
}));

module.exports = router;
