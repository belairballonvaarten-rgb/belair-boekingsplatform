// Beheer van de e-mailtemplates (Instellingen-pagina) — het versturen ervan
// naar een klant gebeurt vanuit het boekingdossier zelf, zie
// POST /api/boekingen/:id/verstuur-template in routes/boekingen.js.
const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(vereistIngelogd);

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM mail_templates ORDER BY aangemaakt_op');
  res.json(rows);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { naam, onderwerp, inhoud } = req.body || {};
  if (!naam || !onderwerp || !inhoud) {
    return res.status(400).json({ fout: 'Naam, onderwerp en inhoud zijn verplicht' });
  }
  const { rows } = await db.query(
    'INSERT INTO mail_templates (naam, onderwerp, inhoud) VALUES ($1, $2, $3) RETURNING *',
    [naam.trim(), onderwerp.trim(), inhoud]
  );
  res.status(201).json(rows[0]);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { naam, onderwerp, inhoud } = req.body || {};
  if (!naam || !onderwerp || !inhoud) {
    return res.status(400).json({ fout: 'Naam, onderwerp en inhoud zijn verplicht' });
  }
  const { rows } = await db.query(
    'UPDATE mail_templates SET naam = $1, onderwerp = $2, inhoud = $3, bijgewerkt_op = now() WHERE id = $4 RETURNING *',
    [naam.trim(), onderwerp.trim(), inhoud, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ fout: 'Template niet gevonden' });
  res.json(rows[0]);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM mail_templates WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ fout: 'Template niet gevonden' });
  res.status(204).end();
}));

module.exports = router;
