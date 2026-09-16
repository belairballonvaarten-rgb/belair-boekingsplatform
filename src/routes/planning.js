const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

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
             'aantal_zandzakken', p.aantal_zandzakken
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

module.exports = router;
