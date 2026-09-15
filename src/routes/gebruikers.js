const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

// Beheer van de admin-accounts (de "gebruikers" van het beheerscherm) — op
// vraag van Jonas: meerdere personen moeten met hun eigen inloggegevens
// kunnen inloggen, i.p.v. één gedeeld account. Elke ingelogde gebruiker mag
// andere gebruikers beheren (geen aparte rollen/rechten — dit is een klein
// team). Om nooit per ongeluk iedereen buiten te sluiten: jezelf verwijderen
// en de laatste overblijvende gebruiker verwijderen zijn allebei geblokkeerd.
const router = express.Router();
router.use(vereistIngelogd);

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, email, naam, aangemaakt_op FROM admins ORDER BY aangemaakt_op ASC'
  );
  res.json(rows);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { email, wachtwoord, naam } = req.body;
  if (!email || !wachtwoord) {
    return res.status(400).json({ fout: 'E-mail en wachtwoord zijn verplicht' });
  }
  if (wachtwoord.length < 8) {
    return res.status(400).json({ fout: 'Wachtwoord moet minstens 8 tekens lang zijn' });
  }

  const { rows: bestaand } = await db.query('SELECT id FROM admins WHERE email = $1', [email]);
  if (bestaand[0]) {
    return res.status(409).json({ fout: 'Er bestaat al een gebruiker met dit e-mailadres' });
  }

  const hash = await bcrypt.hash(wachtwoord, 10);
  const { rows } = await db.query(
    'INSERT INTO admins (email, wachtwoord_hash, naam) VALUES ($1, $2, $3) RETURNING id, email, naam, aangemaakt_op',
    [email, hash, naam || null]
  );
  res.status(201).json(rows[0]);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { naam, email, wachtwoord } = req.body;
  if (wachtwoord && wachtwoord.length < 8) {
    return res.status(400).json({ fout: 'Wachtwoord moet minstens 8 tekens lang zijn' });
  }

  if (email) {
    const { rows: bestaand } = await db.query('SELECT id FROM admins WHERE email = $1 AND id != $2', [email, req.params.id]);
    if (bestaand[0]) return res.status(409).json({ fout: 'Er bestaat al een gebruiker met dit e-mailadres' });
  }

  const wachtwoordHash = wachtwoord ? await bcrypt.hash(wachtwoord, 10) : null;
  const { rows } = await db.query(
    `UPDATE admins SET
       naam = COALESCE($1, naam),
       email = COALESCE($2, email),
       wachtwoord_hash = COALESCE($3, wachtwoord_hash)
     WHERE id = $4
     RETURNING id, email, naam, aangemaakt_op`,
    [naam, email, wachtwoordHash, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ fout: 'Gebruiker niet gevonden' });
  res.json(rows[0]);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (req.params.id === req.session.adminId) {
    return res.status(400).json({ fout: 'Je kan je eigen account niet verwijderen. Vraag een collega om dit te doen.' });
  }
  const { rows: aantalRows } = await db.query('SELECT COUNT(*) FROM admins');
  if (Number(aantalRows[0].count) <= 1) {
    return res.status(400).json({ fout: 'De laatste gebruiker kan niet verwijderd worden — er moet altijd minstens één account overblijven.' });
  }
  const { rowCount } = await db.query('DELETE FROM admins WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ fout: 'Gebruiker niet gevonden' });
  res.status(204).end();
}));

module.exports = router;
