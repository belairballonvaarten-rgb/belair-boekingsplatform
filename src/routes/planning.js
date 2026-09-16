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

router.get('/', asyncHandler(async (req, res) => {
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(req.query.datum || '')
    ? req.query.datum
    : new Date().toISOString().slice(0, 10);

  const queryVoorKolom = (kolom) => `
    SELECT b.id, b.status, b.leveringswijze, b.leveringsadres,
           b.gewenste_datum_start, b.gewenste_datum_einde,
           k.naam AS klant_naam, k.telefoon AS klant_telefoon,
           k.adres AS klant_adres, k.postcode AS klant_postcode, k.gemeente AS klant_gemeente,
           l.leveringstijd, l.afhaaltijd,
           l.voertuig_levering, l.voertuig_afhaling,
           l.volgorde_levering, l.volgorde_afhaling,
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
    WHERE b.status = ANY($1) AND b.${kolom} = $2
    ORDER BY k.naam
  `;

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
