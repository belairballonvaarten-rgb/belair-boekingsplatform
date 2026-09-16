const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(vereistIngelogd);

// Zelfde statuslijst als Dashboard/Planning: enkel "definitief genoeg"
// boekingen zijn interessant voor een dagafsluiting.
const GEPLANDE_STATUSSEN = [
  'geaccepteerd', 'ingepland', 'bevestigd', 'betaalverzoek_verstuurd',
  'betaald_deels', 'betaald_volledig', 'gefactureerd', 'voldaan_manueel',
];

router.get('/', asyncHandler(async (req, res) => {
  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  const datum = isoRegex.test(req.query.datum || '')
    ? req.query.datum
    : new Date().toISOString().slice(0, 10);

  // 1. Nog te factureren: EEN DOORLOPENDE lijst, los van de gekozen dag — een
  // openstaand saldo verdwijnt niet vanzelf omdat de leverdatum voorbij is, en
  // Jonas wil net ook oudere, nog niet afgehandelde saldi blijven zien. Ze
  // verdwijnen pas zodra hij ze expliciet afvinkt (leveringen.facturatie_afgehandeld),
  // los van de officiële boekingsstatus.
  const { rows: teFacturerenRuw } = await db.query(
    `SELECT b.id, b.gewenste_datum_start, k.naam AS klant_naam, k.telefoon AS klant_telefoon,
            COALESCE(bp_totaal.waarde, 0) AS waarde,
            COALESCE(bet.betaald_bedrag, 0) AS betaling_ontvangen
     FROM boekingen b
     JOIN klanten k ON k.id = b.klant_id
     LEFT JOIN leveringen l ON l.boeking_id = b.id
     LEFT JOIN (
       SELECT boeking_id, SUM(prijs * aantal) AS waarde
       FROM boeking_producten GROUP BY boeking_id
     ) bp_totaal ON bp_totaal.boeking_id = b.id
     LEFT JOIN betalingen bet ON bet.boeking_id = b.id
     WHERE b.status = ANY($1) AND COALESCE(l.facturatie_afgehandeld, false) = false
     ORDER BY b.gewenste_datum_start`,
    [GEPLANDE_STATUSSEN]
  );
  const teFactureren = teFacturerenRuw
    .filter((b) => Number(b.waarde) - Number(b.betaling_ontvangen) > 0.01)
    .map((b) => ({
      id: b.id, klant_naam: b.klant_naam, klant_telefoon: b.klant_telefoon,
      gewenste_datum_start: b.gewenste_datum_start,
      waarde: b.waarde, betaling_ontvangen: b.betaling_ontvangen,
      saldo: Math.round((Number(b.waarde) - Number(b.betaling_ontvangen)) * 100) / 100,
    }));

  // 2. Vuile/natte producten: ALLE producten die momenteel als "vuil"
  // gemarkeerd staan, los van een specifieke dag of boeking (het is een
  // eigenschap van het product op dit moment) — met dezelfde "Markeer als
  // gereinigd"-actie als op de Producten-pagina.
  const { rows: vuileProducten } = await db.query(
    `SELECT id, naam FROM producten WHERE staat = 'vuil' ORDER BY naam`
  );

  // 3. Bijzonderheden: blijft wél per gekozen dag — dit gaat over wat er die
  // dag concreet speelt bij de boekingen van toen.
  const { rows: bijzonderhedenRuw } = await db.query(
    `SELECT b.id, b.speciaal_verzoek, b.speciaal_verzoek_notitie, b.notities,
            k.naam AS klant_naam, k.telefoon AS klant_telefoon
     FROM boekingen b
     JOIN klanten k ON k.id = b.klant_id
     WHERE b.status = ANY($1) AND (b.gewenste_datum_start = $2 OR b.gewenste_datum_einde = $2)
       AND (b.speciaal_verzoek OR (b.notities IS NOT NULL AND btrim(b.notities) <> ''))
     ORDER BY k.naam`,
    [GEPLANDE_STATUSSEN, datum]
  );
  const bijzonderheden = bijzonderhedenRuw.map((b) => ({
    id: b.id, klant_naam: b.klant_naam, klant_telefoon: b.klant_telefoon,
    speciaal_verzoek: b.speciaal_verzoek, speciaal_verzoek_notitie: b.speciaal_verzoek_notitie,
    notities: b.notities,
  }));

  res.json({ datum, teFactureren, bijzonderheden, vuileProducten });
}));

// Een boekingssaldo afvinken als "afgehandeld" (factuur verstuurd/opgevolgd) —
// verwijdert 'm uit "Nog te factureren", los van de officiële boekingsstatus.
// Terug uitvinken kan ook (bv. per ongeluk aangevinkt).
router.put('/facturatie/:boekingId', asyncHandler(async (req, res) => {
  const { afgehandeld } = req.body;
  if (typeof afgehandeld !== 'boolean') {
    return res.status(400).json({ fout: 'afgehandeld (true/false) is verplicht' });
  }
  const { rows } = await db.query(
    `UPDATE leveringen SET facturatie_afgehandeld = $1, facturatie_afgehandeld_op = CASE WHEN $1 THEN now() ELSE NULL END
     WHERE boeking_id = $2 RETURNING id`,
    [afgehandeld, req.params.boekingId]
  );
  if (!rows.length) {
    await db.query(
      `INSERT INTO leveringen (boeking_id, facturatie_afgehandeld, facturatie_afgehandeld_op)
       VALUES ($1, $2, CASE WHEN $2 THEN now() ELSE NULL END)`,
      [req.params.boekingId, afgehandeld]
    );
  }
  res.json({ ok: true });
}));

module.exports = router;
