require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');

const db = require('./db');
const authRoutes = require('./routes/auth');
const klantenRoutes = require('./routes/klanten');
const productenRoutes = require('./routes/producten');
const boekingenRoutes = require('./routes/boekingen');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json());

app.use(
  session({
    store: new pgSession({ pool: db.pool, tableName: 'sessies', createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || 'dev-secret-niet-voor-productie',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dagen
    },
  })
);

app.get('/api/gezondheid', (req, res) => res.json({ status: 'ok', tijd: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/klanten', klantenRoutes);
app.use('/api/producten', productenRoutes);
app.use('/api/boekingen', boekingenRoutes);

// Centrale foutafhandeling
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ fout: 'Er ging iets mis op de server', details: err.message });
});

async function zorgVoorEersteAdmin() {
  const { rows } = await db.query('SELECT COUNT(*) FROM admins');
  if (parseInt(rows[0].count, 10) > 0) return;

  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    console.warn('Geen admin-account aanwezig en ADMIN_EMAIL/ADMIN_PASSWORD niet ingesteld — kan niet inloggen op het beheerscherm.');
    return;
  }

  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
  await db.query('INSERT INTO admins (email, wachtwoord_hash, naam) VALUES ($1, $2, $3)', [
    process.env.ADMIN_EMAIL,
    hash,
    'Jonas',
  ]);
  console.log(`Admin-account aangemaakt voor ${process.env.ADMIN_EMAIL}`);
}

const PORT = process.env.PORT || 3000;

async function main() {
  await zorgVoorEersteAdmin();
  app.listen(PORT, () => console.log(`Belair-boekingsplatform API draait op poort ${PORT}`));
}

main().catch((err) => {
  console.error('Kon server niet opstarten:', err);
  process.exit(1);
});
