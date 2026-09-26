// "Zeker afhalen"-melding — op vraag van Jonas: bij een afhaling waarschuwen
// als HET PRODUCT de volgende dag opnieuw verhuurd wordt, zodat hij weet dat
// die afhaling niet mag uitgesteld worden. Bij producten met maar 1 exemplaar
// (max_boekingen_per_dag = 1) is elke boeking de volgende dag meteen een
// probleem. Bij meerdere exemplaren pas een probleem als de vrije voorraad
// zonder dit exemplaar niet volstaat — vandaar de beschikbaarheids-check i.p.v.
// gewoon "is er iets de volgende dag" (dat zou bij bv. 5 hupstelefoons veel te
// vaak onterecht afgaan).
//
// Bewust NIET hergebruikt via checkBeschikbaarheid() uit utils/beschikbaarheid.js
// (die werkt per product/periode, één voor één) — hier moeten we in één keer
// voor een hele lijst afhalingen (een dag, of een periode in Planning) de
// concurrentie op "de volgende dag" berekenen, dus één gebundelde query i.p.v.
// N losse round-trips naar de database.
const db = require('../db');
const { BLOKKERENDE_STATUSSEN } = require('./beschikbaarheid');

/**
 * @param {string[]} boekingIds  Boeking-id's van boekingen die vandaag (of op
 *   de dag die getoond wordt) afgehaald worden.
 * @returns {Promise<Set<string>>} boeking-id's waarvoor minstens 1 product
 *   "zeker afhalen" nodig heeft.
 */
async function bepaalZekerAfhalenBoekingIds(boekingIds) {
  const ids = [...new Set((boekingIds || []).filter(Boolean))];
  if (!ids.length) return new Set();

  const { rows } = await db.query(
    `
    WITH afhaal_boekingen AS (
      SELECT b.id AS boeking_id, b.gewenste_datum_einde::date AS afhaaldag
      FROM boekingen b
      WHERE b.id = ANY($1::uuid[])
    ),
    afhaal_producten AS (
      SELECT ab.boeking_id, ab.afhaaldag, bp.product_id, bp.aantal AS aantal_afgehaald,
             GREATEST(p.max_boekingen_per_dag, 1) AS max_per_dag,
             COALESCE(p.availability_buffer_dagen, 0) AS buffer_dagen
      FROM afhaal_boekingen ab
      JOIN boeking_producten bp ON bp.boeking_id = ab.boeking_id
      JOIN producten p ON p.id = bp.product_id
    ),
    concurrentie AS (
      -- Bewust gewone (inner) JOINs hier, geen LEFT JOIN: we willen enkel
      -- bp2-rijen meetellen waarvan de boeking ook echt aan alle voorwaarden
      -- voldoet (andere boeking, geldige status, overlapt met de volgende
      -- dag). Met een LEFT JOIN zou elke bp2-rij voor dit product blijven
      -- meetellen ook als er geen bijpassende b2 is (b2-kolommen worden dan
      -- gewoon NULL, maar bp2.aantal telt toch mee in de SUM) — dat gaf in
      -- de test veel te hoge "bezet"-aantallen. Ontbreekt elke match, dan
      -- heeft deze CTE gewoon geen rij voor die (boeking_id, product_id) en
      -- vangt de COALESCE(...,0) in de hoofdquery dat correct op als 0.
      SELECT ap.boeking_id, ap.product_id,
             SUM(bp2.aantal) AS bezet_volgende_dag
      FROM afhaal_producten ap
      JOIN boeking_producten bp2 ON bp2.product_id = ap.product_id
      JOIN boekingen b2
        ON b2.id = bp2.boeking_id
        AND b2.id <> ap.boeking_id
        AND b2.status = ANY($2::text[])
        AND (b2.gewenste_datum_start - (ap.buffer_dagen || ' days')::interval) <= (ap.afhaaldag + 1)
        AND (b2.gewenste_datum_einde + (ap.buffer_dagen || ' days')::interval) >= (ap.afhaaldag + 1)
      GROUP BY ap.boeking_id, ap.product_id
    )
    SELECT ap.boeking_id, ap.aantal_afgehaald, ap.max_per_dag,
           COALESCE(c.bezet_volgende_dag, 0) AS bezet_volgende_dag
    FROM afhaal_producten ap
    LEFT JOIN concurrentie c ON c.boeking_id = ap.boeking_id AND c.product_id = ap.product_id
    `,
    [ids, BLOKKERENDE_STATUSSEN]
  );

  const resultaat = new Set();
  for (const r of rows) {
    // bezet_volgende_dag komt als BIGINT (SUM van een integer-kolom) terug —
    // de pg-driver geeft dat als string i.p.v. number, dus expliciet omzetten
    // i.p.v. op JS' impliciete coercie bij "-"/"<" te vertrouwen.
    const vrijeCapaciteit = Number(r.max_per_dag) - Number(r.bezet_volgende_dag);
    if (vrijeCapaciteit < Number(r.aantal_afgehaald)) resultaat.add(r.boeking_id);
  }
  return resultaat;
}

module.exports = { bepaalZekerAfhalenBoekingIds };
