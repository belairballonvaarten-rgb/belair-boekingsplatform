const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.post('/login', asyncHandler(async (req, res) => {
  const { email, wachtwoord } = req.body;
  if (!email || !wachtwoord) {
    return res.status(400).json({ fout: 'Email en wachtwoord zijn verplicht' });
  }

  const { rows } = await db.query('SELECT * FROM admins WHERE email = $1', [email]);
  const admin = rows[0];
  if (!admin) {
    return res.status(401).json({ fout: 'Ongeldige inloggegevens' });
  }

  const klopt = await bcrypt.compare(wachtwoord, admin.wachtwoord_hash);
  if (!klopt) {
    return res.status(401).json({ fout: 'Ongeldige inloggegevens' });
  }

  req.session.adminId = admin.id;
  // Tijdelijke diagnose-log (mag later terug weg) om het sessie/cookie-probleem te vinden.
  console.log('[login] sessionID:', req.sessionID, '| adminId gezet:', req.session.adminId, '| secure cookie-config:', req.session.cookie.secure);
  res.json({ id: admin.id, email: admin.email, naam: admin.naam });
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', asyncHandler(async (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ fout: 'Niet ingelogd' });
  }
  const { rows } = await db.query('SELECT id, email, naam, email_handtekening FROM admins WHERE id = $1', [req.session.adminId]);
  if (!rows[0]) {
    // Account ondertussen verwijderd door een collega, maar sessie nog actief.
    req.session.destroy(() => {});
    return res.status(401).json({ fout: 'Niet ingelogd' });
  }
  res.json({
    adminId: req.session.adminId,
    email: rows[0].email,
    naam: rows[0].naam,
    email_handtekening: rows[0].email_handtekening || '',
  });
}));

// Eigen e-mailhandtekening instellen — enkel voor de eigen, ingelogde account
// (zie migratie 033): overschrijft voor deze gebruiker de gedeelde standaard
// (Instellingen → E-mailhandtekening). Leeg opslaan = terug de standaard
// gebruiken.
router.put('/mijn-handtekening', asyncHandler(async (req, res) => {
  if (!req.session.adminId) return res.status(401).json({ fout: 'Niet ingelogd' });
  const html = typeof (req.body && req.body.html) === 'string' ? req.body.html : '';
  await db.query('UPDATE admins SET email_handtekening = $1 WHERE id = $2', [html || null, req.session.adminId]);
  res.json({ html });
}));

module.exports = router;
