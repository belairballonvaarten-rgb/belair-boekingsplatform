const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');

const router = express.Router();
router.use(vereistIngelogd);

// Lijst + zoeken (op naam, email of telefoon)
router.get('/', async (req, res) => {
  const { zoek } = req.query;
  let result;
  if (zoek) {
    result = await db.query(
      `SELECT * FROM klanten
       WHERE naam ILIKE $1 OR email ILIKE $1 OR telefoon ILIKE $1
       ORDER BY naam LIMIT 100`,
      [`%${zoek}%`]
    );
  } else {
    result = await db.query('SELECT * FROM klanten ORDER BY aangemaakt_op DESC LIMIT 100');
  }
  res.json(result.rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM klanten WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ fout: 'Klant niet gevonden' });
  res.json(rows[0]);
});

router.post('/', async (req, res) => {
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
});

router.put('/:id', async (req, res) => {
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
});

module.exports = router;
