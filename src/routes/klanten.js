const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { berekenPrijstabel } = require('../utils/prijstabel');

const router = express.Router();
router.use(vereistIngelogd);

// Lijst + zoeken (op naam, email of telefoon) — met aantal boekingen en totale
// waarde erbij, zodat de Klanten-pagina in één oogopslag toont wie een
// vaste/grote klant is (op vraag van Jonas: klantgegevens + historiek kunnen
// opvragen).
const KLANTEN_MET_TOTALEN_SELECT = `
  SELECT k.*,
         COALESCE(bt.aantal_boekingen, 0) AS aantal_boekingen,
         COALESCE(bt.totale_waarde, 0) AS totale_waarde,
         bt.laatste_boeking
  FROM klanten k
  LEFT JOIN (
    SELECT b.klant_id, COUNT(*)::int AS aantal_boekingen,
           COALESCE(SUM(bp_totaal.waarde), 0) AS totale_waarde,
           MAX(b.gewenste_datum_start) AS laatste_boeking
    FROM boekingen b
    LEFT JOIN (
      SELECT boeking_id, SUM(prijs * aantal) AS waarde
      FROM boeking_producten GROUP BY boeking_id
    ) bp_totaal ON bp_totaal.boeking_id = b.id
    WHERE b.status != 'geweigerd'
    GROUP BY b.klant_id
  ) bt ON bt.klant_id = k.id
`;

router.get('/', asyncHandler(async (req, res) => {
  const { zoek } = req.query;
  let result;
  if (zoek) {
    result = await db.query(
      `${KLANTEN_MET_TOTALEN_SELECT}
       WHERE k.naam ILIKE $1 OR k.email ILIKE $1 OR k.telefoon ILIKE $1
       ORDER BY k.naam LIMIT 100`,
      [`%${zoek}%`]
    );
  } else {
    result = await db.query(`${KLANTEN_MET_TOTALEN_SELECT} ORDER BY k.aangemaakt_op DESC LIMIT 100`);
  }
  res.json(result.rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await db.query(`${KLANTEN_MET_TOTALEN_SELECT} WHERE k.id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ fout: 'Klant niet gevonden' });

  // Volledige boekingshistoriek van deze klant erbij, zodat Jonas op de
  // klantdetailpagina meteen ziet wat er ooit geboekt is — niet enkel de
  // samengevatte totalen hierboven.
  const { rows: boekingenHistoriek } = await db.query(
    `SELECT b.id, b.gewenste_datum_start, b.gewenste_datum_einde, b.status,
            COALESCE(bp_totaal.waarde, 0) AS waarde,
            bp_namen.producten_namen
     FROM boekingen b
     LEFT JOIN (
       SELECT boeking_id, SUM(prijs * aantal) AS waarde
       FROM boeking_producten GROUP BY boeking_id
     ) bp_totaal ON bp_totaal.boeking_id = b.id
     LEFT JOIN (
       SELECT bp.boeking_id,
              string_agg(p.naam || CASE WHEN bp.aantal > 1 THEN ' (x' || bp.aantal || ')' ELSE '' END, ', ' ORDER BY p.naam) AS producten_namen
       FROM boeking_producten bp JOIN producten p ON p.id = bp.product_id
       GROUP BY bp.boeking_id
     ) bp_namen ON bp_namen.boeking_id = b.id
     WHERE b.klant_id = $1
     ORDER BY b.gewenste_datum_start DESC`,
    [req.params.id]
  );
  // Het echte openstaande saldo per boeking erbij (niet enkel de status) —
  // zelfde reden als bij het Dashboard (zie utils/prijstabel.js): een status
  // als "Betaald (volledig)" garandeert niet dat het saldo ook op 0 staat.
  // Een klant heeft normaliter maar een handvol boekingen, dus dit blijft goedkoop.
  await Promise.all(boekingenHistoriek.map(async (b) => {
    b.saldo_openstaand = (await berekenPrijstabel(b.id)).saldo_openstaand;
  }));

  res.json({ ...rows[0], boekingen: boekingenHistoriek });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { naam, klant_type, btw_nummer, adres, postcode, gemeente, telefoon, email, marketing_opt_in } = req.body;
  if (!naam) return res.status(400).json({ fout: 'Naam is verplicht' });
  if (klant_type === 'bedrijf' && !btw_nummer) {
    return res.status(400).json({ fout: 'btw_nummer is verplicht voor klant_type bedrijf' });
  }

  const { rows } = await db.query(
    `INSERT INTO klanten (naam, klant_type, btw_nummer, adres, postcode, gemeente, telefoon, email, marketing_opt_in)
     VALUES ($1, COALESCE($2, 'particulier'), $3, $4, $5, $6, $7, $8, COALESCE($9, 'nog_niet_gevraagd'))
     RETURNING *`,
    [naam, klant_type, btw_nummer, adres, postcode, gemeente, telefoon, email, marketing_opt_in]
  );
  res.status(201).json(rows[0]);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { naam, klant_type, btw_nummer, adres, postcode, gemeente, telefoon, email, marketing_opt_in } = req.body;
  const { rows } = await db.query(
    `UPDATE klanten SET
       naam = COALESCE($1, naam),
       klant_type = COALESCE($2, klant_type),
       btw_nummer = COALESCE($3, btw_nummer),
       adres = COALESCE($4, adres),
       postcode = COALESCE($5, postcode),
       gemeente = COALESCE($6, gemeente),
       telefoon = COALESCE($7, telefoon),
       email = COALESCE($8, email),
       marketing_opt_in = COALESCE($9, marketing_opt_in),
       bijgewerkt_op = now()
     WHERE id = $10
     RETURNING *`,
    [naam, klant_type, btw_nummer, adres, postcode, gemeente, telefoon, email, marketing_opt_in, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ fout: 'Klant niet gevonden' });
  res.json(rows[0]);
}));

module.exports = router;
