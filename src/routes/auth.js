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

router.get('/me', (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ fout: 'Niet ingelogd' });
  }
  res.json({ adminId: req.session.adminId });
});

module.exports = router;
