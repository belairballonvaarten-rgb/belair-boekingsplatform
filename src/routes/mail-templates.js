// Beheer van de e-mailtemplates (Instellingen-pagina) — het versturen ervan
// naar een klant gebeurt vanuit het boekingdossier zelf, zie
// POST /api/boekingen/:id/verstuur-template in routes/boekingen.js.
const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(vereistIngelogd);

// De 4 vaste sneltoetsen bovenaan een boekingdossier — 'rol' koppelt een
// template daaraan (zie migratie 028). NULL/leeg = gewoon een vrije, extra
// template (enkel bereikbaar via de vrije lijst bij Communicatie).
const GELDIGE_ROLLEN = ['aanvraag_bevestiging', 'betaalverzoek', 'reservatie_bevestiging', 'review_verzoek', 'weigering'];

function normaliseerRol(rol) {
  if (!rol) return null;
  if (!GELDIGE_ROLLEN.includes(rol)) {
    throw Object.assign(new Error(`Ongeldige rol: ${rol}`), { status: 400 });
  }
  return rol;
}

// Postgres-foutcode 23505 (unique_violation) op de rol-index -> vriendelijke
// melding i.p.v. de ruwe DB-fout, want dat is de enige manier waarop deze
// insert/update normaal kan mislukken.
function afhandelenDbFout(err, res) {
  if (err.status === 400) return res.status(400).json({ fout: err.message });
  if (err.code === '23505' && err.constraint === 'mail_templates_rol_uniek') {
    return res.status(409).json({ fout: 'Er is al een andere template met deze rol — ken die eerst een andere rol toe (of "Geen").' });
  }
  throw err;
}

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM mail_templates ORDER BY aangemaakt_op');
  res.json(rows);
}));

// Eén gedeelde e-mailhandtekening (ruwe HTML), automatisch onderaan elke
// template-mail geplakt (zie haalIngevuldeTemplateOp() in routes/boekingen.js).
// Let op: moet vóór PUT '/:id' hieronder staan, anders vangt die generieke
// route 'handtekening' op als een (ongeldig) template-id.
router.get('/handtekening', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT email_handtekening FROM platform_instellingen WHERE id = true');
  res.json({ html: rows[0]?.email_handtekening || '' });
}));

router.put('/handtekening', asyncHandler(async (req, res) => {
  const html = typeof (req.body && req.body.html) === 'string' ? req.body.html : '';
  await db.query('UPDATE platform_instellingen SET email_handtekening = $1, bijgewerkt_op = now() WHERE id = true', [html]);
  res.json({ html });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { naam, onderwerp, inhoud } = req.body || {};
  if (!naam || !onderwerp || !inhoud) {
    return res.status(400).json({ fout: 'Naam, onderwerp en inhoud zijn verplicht' });
  }
  try {
    const rol = normaliseerRol(req.body.rol);
    const { rows } = await db.query(
      'INSERT INTO mail_templates (naam, onderwerp, inhoud, rol) VALUES ($1, $2, $3, $4) RETURNING *',
      [naam.trim(), onderwerp.trim(), inhoud, rol]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    afhandelenDbFout(err, res);
  }
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { naam, onderwerp, inhoud } = req.body || {};
  if (!naam || !onderwerp || !inhoud) {
    return res.status(400).json({ fout: 'Naam, onderwerp en inhoud zijn verplicht' });
  }
  try {
    const rol = normaliseerRol(req.body.rol);
    const { rows } = await db.query(
      'UPDATE mail_templates SET naam = $1, onderwerp = $2, inhoud = $3, rol = $4, bijgewerkt_op = now() WHERE id = $5 RETURNING *',
      [naam.trim(), onderwerp.trim(), inhoud, rol, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ fout: 'Template niet gevonden' });
    res.json(rows[0]);
  } catch (err) {
    afhandelenDbFout(err, res);
  }
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM mail_templates WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ fout: 'Template niet gevonden' });
  res.status(204).end();
}));

module.exports = router;
