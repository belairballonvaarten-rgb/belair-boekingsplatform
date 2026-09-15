const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(vereistIngelogd);

const MAAND_NAMEN = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
];

// Alle jaren waarvoor er zinvolle data bestaat (bevestigde boekingen of
// geplande leverdatums), zodat de jaar-selector geen lege jaren aanbiedt.
async function bepaalBeschikbareJaren() {
  const { rows } = await db.query(`
    SELECT DISTINCT EXTRACT(YEAR FROM jaar)::int AS jaar FROM (
      SELECT gewijzigd_op AS jaar FROM boeking_status_historiek WHERE naar_status = 'bevestigd'
      UNION ALL
      SELECT gewenste_datum_start::timestamptz AS jaar FROM boekingen
    ) x
    ORDER BY jaar DESC
  `);
  const jaren = rows.map((r) => r.jaar);
  const huidigJaar = new Date().getFullYear();
  if (!jaren.includes(huidigJaar)) jaren.unshift(huidigJaar);
  return jaren;
}

// "Reservaties per maand" = op basis van de datum van BEVESTIGING (eerste keer
// dat de status naar "bevestigd" ging), niet de leverdatum of aanmaakdatum —
// zo op vraag van Jonas. Losgetrokken in een functie zodat we zowel het
// geselecteerde jaar als het vorige jaar (voor de jaar-op-jaar-vergelijking op
// de grafiek) op dezelfde manier kunnen berekenen.
async function berekenPerMaand(jaar) {
  const bevestigdPerMaand = await db.query(
    `
    SELECT EXTRACT(MONTH FROM eerste_bevestiging)::int AS maand, COUNT(*)::int AS aantal
    FROM (
      SELECT boeking_id, MIN(gewijzigd_op) AS eerste_bevestiging
      FROM boeking_status_historiek
      WHERE naar_status = 'bevestigd'
      GROUP BY boeking_id
    ) x
    WHERE EXTRACT(YEAR FROM eerste_bevestiging) = $1
    GROUP BY maand
    `,
    [jaar]
  );
  const perMaandMap = new Map(bevestigdPerMaand.rows.map((r) => [r.maand, r.aantal]));
  return MAAND_NAMEN.map((naam, i) => ({ maand: i + 1, label: naam, aantal: perMaandMap.get(i + 1) || 0 }));
}

// Aantal verhuringen per product, gegroepeerd per categorie, binnen een vrij
// te kiezen periode (o.b.v. de leverdatum) — op vraag van Jonas i.p.v. één
// algemene top-8 over het hele jaar. Een product met meerdere categorieën
// (bv. zowel "Springkastelen" als "Attracties") telt mee in elke categorie.
async function berekenProductenPerCategorie(vanaf, tot) {
  const { rows } = await db.query(
    `
    SELECT COALESCE(cat, '(geen categorie)') AS categorie, p.naam AS product_naam, SUM(bp.aantal)::int AS aantal
    FROM boeking_producten bp
    JOIN boekingen b ON b.id = bp.boeking_id
    JOIN producten p ON p.id = bp.product_id
    LEFT JOIN LATERAL UNNEST(p.categorieen) AS cat ON true
    WHERE b.gewenste_datum_start >= $1 AND b.gewenste_datum_start <= $2 AND b.status != 'geweigerd'
    GROUP BY categorie, p.naam
    ORDER BY categorie ASC, aantal DESC, product_naam ASC
    `,
    [vanaf, tot]
  );
  const perCategorie = [];
  const index = new Map();
  for (const rij of rows) {
    if (!index.has(rij.categorie)) {
      index.set(rij.categorie, { categorie: rij.categorie, producten: [] });
      perCategorie.push(index.get(rij.categorie));
    }
    index.get(rij.categorie).producten.push({ product_naam: rij.product_naam, aantal: rij.aantal });
  }
  return perCategorie;
}

// Losse route zodat de periode voor de producten-uitsplitsing onafhankelijk
// van de jaar-selector (die de rest van de pagina stuurt) ververst kan worden.
router.get('/producten', asyncHandler(async (req, res) => {
  const jaar = new Date().getFullYear();
  const vanaf = req.query.vanaf || `${jaar}-01-01`;
  const tot = req.query.tot || `${jaar}-12-31`;
  const productenPerCategorie = await berekenProductenPerCategorie(vanaf, tot);
  res.json({ vanaf, tot, productenPerCategorie });
}));

router.get('/', asyncHandler(async (req, res) => {
  const jaar = parseInt(req.query.jaar, 10) || new Date().getFullYear();

  const perMaand = await berekenPerMaand(jaar);
  // Vorig jaar erbij, zodat Jonas de twee jaren kan overlappen op de grafiek
  // om het verschil in één oogopslag te zien.
  const perMaandVorigJaar = await berekenPerMaand(jaar - 1);
  const totaalBevestigd = perMaand.reduce((s, m) => s + m.aantal, 0);

  // "Populairste gemeentes" en "aantallen per product" gaan over de effectief
  // geleverde/geplande boekingen van dat jaar (o.b.v. de leverdatum), maar niet
  // over de geweigerde aanvragen — die zijn nooit doorgegaan.
  const topGemeentes = await db.query(
    `
    SELECT COALESCE(NULLIF(TRIM(k.gemeente), ''), '(onbekend)') AS gemeente, COUNT(*)::int AS aantal
    FROM boekingen b
    JOIN klanten k ON k.id = b.klant_id
    WHERE EXTRACT(YEAR FROM b.gewenste_datum_start) = $1 AND b.status != 'geweigerd'
    GROUP BY gemeente
    ORDER BY aantal DESC, gemeente ASC
    LIMIT 8
    `,
    [jaar]
  );

  // Standaardperiode voor de producten-uitsplitsing = het volledige geselecteerde
  // jaar; Jonas kan dit nadien vrij bijsturen via de periodevelden op de pagina.
  const productVanaf = `${jaar}-01-01`;
  const productTot = `${jaar}-12-31`;
  const productenPerCategorie = await berekenProductenPerCategorie(productVanaf, productTot);

  const totalenDitJaar = await db.query(
    `
    SELECT
      COUNT(*)::int AS aantal_boekingen,
      COALESCE(SUM(bp_totaal.waarde), 0) AS totale_waarde
    FROM boekingen b
    LEFT JOIN (
      SELECT boeking_id, SUM(aantal * prijs) AS waarde
      FROM boeking_producten
      GROUP BY boeking_id
    ) bp_totaal ON bp_totaal.boeking_id = b.id
    WHERE EXTRACT(YEAR FROM b.gewenste_datum_start) = $1 AND b.status != 'geweigerd'
    `,
    [jaar]
  );

  const beschikbareJaren = await bepaalBeschikbareJaren();

  res.json({
    jaar,
    beschikbareJaren,
    perMaand,
    perMaandVorigJaar,
    totaalBevestigd,
    topGemeentes: topGemeentes.rows,
    productVanaf,
    productTot,
    productenPerCategorie,
    totaalBoekingen: totalenDitJaar.rows[0].aantal_boekingen,
    totaleWaarde: Number(totalenDitJaar.rows[0].totale_waarde),
  });
}));

module.exports = router;
