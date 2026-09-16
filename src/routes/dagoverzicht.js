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

// Basis: alle geplande boekingen die vandaag "actief" zijn (geleverd EN/OF
// afgehaald op deze dag), met klant- en betalingsgegevens erbij — hergebruikt
// dezelfde waarde/betaling_ontvangen-opbouw als het boekingenoverzicht.
const DAGOVERZICHT_BASIS = `
  SELECT b.id, b.status, b.leveringswijze, b.gewenste_datum_start, b.gewenste_datum_einde,
         b.speciaal_verzoek, b.speciaal_verzoek_notitie, b.notities,
         k.naam AS klant_naam, k.telefoon AS klant_telefoon,
         COALESCE(bp_totaal.waarde, 0) AS waarde,
         COALESCE(bet.betaald_bedrag, 0) AS betaling_ontvangen,
         bp_namen.producten_namen
  FROM boekingen b
  JOIN klanten k ON k.id = b.klant_id
  LEFT JOIN (
    SELECT boeking_id, SUM(prijs * aantal) AS waarde
    FROM boeking_producten GROUP BY boeking_id
  ) bp_totaal ON bp_totaal.boeking_id = b.id
  LEFT JOIN betalingen bet ON bet.boeking_id = b.id
  LEFT JOIN (
    SELECT bp.boeking_id,
           string_agg(p.naam || CASE WHEN bp.aantal > 1 THEN ' (x' || bp.aantal || ')' ELSE '' END, ', ' ORDER BY p.naam) AS producten_namen
    FROM boeking_producten bp
    JOIN producten p ON p.id = bp.product_id
    GROUP BY bp.boeking_id
  ) bp_namen ON bp_namen.boeking_id = b.id
  WHERE b.status = ANY($1) AND (b.gewenste_datum_start = $2 OR b.gewenste_datum_einde = $2)
`;

router.get('/', asyncHandler(async (req, res) => {
  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  const datum = isoRegex.test(req.query.datum || '')
    ? req.query.datum
    : new Date().toISOString().slice(0, 10);

  const { rows: actief } = await db.query(
    `${DAGOVERZICHT_BASIS} ORDER BY k.naam`,
    [GEPLANDE_STATUSSEN, datum]
  );

  // 1. Nog te factureren: een boeking van vandaag met een openstaand saldo
  // (zelfde benadering als de "Nog te betalen"-filter in het boekingenoverzicht).
  const teFactureren = actief
    .filter((b) => Number(b.waarde) - Number(b.betaling_ontvangen) > 0.01)
    .map((b) => ({
      id: b.id, klant_naam: b.klant_naam, klant_telefoon: b.klant_telefoon,
      status: b.status, waarde: b.waarde, betaling_ontvangen: b.betaling_ontvangen,
      saldo: Math.round((Number(b.waarde) - Number(b.betaling_ontvangen)) * 100) / 100,
    }));

  // 2. Bijzonderheden: speciaal verzoek en/of een ingevulde opmerking.
  const bijzonderheden = actief
    .filter((b) => b.speciaal_verzoek || (b.notities && b.notities.trim()))
    .map((b) => ({
      id: b.id, klant_naam: b.klant_naam, klant_telefoon: b.klant_telefoon,
      speciaal_verzoek: b.speciaal_verzoek, speciaal_verzoek_notitie: b.speciaal_verzoek_notitie,
      notities: b.notities,
    }));

  // 3. Vuile/natte producten: gekoppeld aan diezelfde boekingen van vandaag
  // (dus producten die vandaag geleverd of afgehaald werden/worden en momenteel
  // als "vuil" gemarkeerd staan) — apart opgehaald, want dit gaat over de
  // huidige staat van het PRODUCT, niet over de boeking zelf.
  const boekingIds = actief.map((b) => b.id);
  let vuileProducten = [];
  if (boekingIds.length) {
    const { rows } = await db.query(
      `SELECT bp.boeking_id, k.naam AS klant_naam, p.naam AS product_naam, p.staat
       FROM boeking_producten bp
       JOIN producten p ON p.id = bp.product_id
       JOIN boekingen b ON b.id = bp.boeking_id
       JOIN klanten k ON k.id = b.klant_id
       WHERE bp.boeking_id = ANY($1) AND p.staat = 'vuil'
       ORDER BY k.naam, p.naam`,
      [boekingIds]
    );
    vuileProducten = rows;
  }

  res.json({ datum, teFactureren, bijzonderheden, vuileProducten });
}));

module.exports = router;
