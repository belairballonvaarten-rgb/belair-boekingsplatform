const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(vereistIngelogd);

// Beheerbare lijst van voertuigen — gebruikt door het Dashboard (voertuig-select
// per kaart) en de Planning-pagina (routes per voertuig). Bewust een eenvoudige
// naam-lijst (geen koppeling met kentekens/chauffeurs): Jonas wisselt de
// bemanning per voertuig per shift, niet de voertuigen zelf.
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM voertuigen ORDER BY aangemaakt_op');
  res.json(rows);
}));

router.post('/', asyncHandler(async (req, res) => {
  const naam = (req.body.naam || '').trim();
  if (!naam) return res.status(400).json({ fout: 'Naam is verplicht' });
  try {
    const { rows } = await db.query('INSERT INTO voertuigen (naam) VALUES ($1) RETURNING *', [naam]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({ fout: `Er bestaat al een voertuig met de naam "${naam}"` });
    }
    throw err;
  }
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const naam = (req.body.naam || '').trim();
  if (!naam) return res.status(400).json({ fout: 'Naam is verplicht' });
  try {
    const { rows } = await db.query('UPDATE voertuigen SET naam = $1 WHERE id = $2 RETURNING *', [naam, req.params.id]);
    if (!rows[0]) return res.status(404).json({ fout: 'Voertuig niet gevonden' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ fout: `Er bestaat al een voertuig met de naam "${naam}"` });
    }
    throw err;
  }
}));

// Verwijdert enkel de naam uit de lijst waaruit gekozen kan worden — de naam
// blijft gewoon (als tekst) staan bij leveringen die al aan dit voertuig
// toegewezen waren, dus historiek gaat niet verloren.
router.delete('/:id', asyncHandler(async (req, res) => {
  const { rows } = await db.query('DELETE FROM voertuigen WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ fout: 'Voertuig niet gevonden' });
  res.status(204).end();
}));

module.exports = router;
