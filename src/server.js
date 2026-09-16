require('dotenv').config();
const path = require('path');
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
const webinzendingenRoutes = require('./routes/webinzendingen');
const reservatieImportRoutes = require('./routes/reservatie-import');
const statistiekenRoutes = require('./routes/statistieken');
const gebruikersRoutes = require('./routes/gebruikers');
const dashboardRoutes = require('./routes/dashboard');
const syncRoutes = require('./routes/sync');
const syncWebhookRoutes = require('./routes/sync-webhook');
const voertuigenRoutes = require('./routes/voertuigen');
const planningRoutes = require('./routes/planning');

const app = express();

// Render (en de meeste hosting-providers) zitten als reverse proxy vóór de app.
// Zonder dit vertrouwt Express de "https"-status van het originele verzoek niet
// correct, wat het zetten/lezen van de sessie-cookie kan verstoren.
app.set('trust proxy', 1);

app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
// Standaard-limiet (100kb) is te klein voor een productcertificaat (PDF/foto)
// dat als base64 meekomt in de JSON-body — vandaar de ruimere limiet.
app.use(express.json({ limit: '15mb' }));
// Gravity Forms' "Webhooks"-uitbreiding kan een inzending ook als gewone
// formuliervelden (in plaats van JSON) versturen — deze parser vangt dat op.
app.use(express.urlencoded({ extended: true }));

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
app.use('/api/webinzendingen', webinzendingenRoutes);
app.use('/api/reservatie-import', reservatieImportRoutes);
app.use('/api/statistieken', statistiekenRoutes);
app.use('/api/gebruikers', gebruikersRoutes);
app.use('/api/dashboard', dashboardRoutes);
// Vóór de ingelogde sync-routes: dit ene pad komt van de leveringen-app-server
// zelf (geen ingelogde browser), en beveiligt zichzelf met de gedeelde sleutel.
app.use('/api/sync', syncWebhookRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/voertuigen', voertuigenRoutes);
app.use('/api/planning', planningRoutes);

// Beheerscherm (statische front-end) — public/index.html is het startpunt
app.use(express.static(path.join(__dirname, '..', 'public')));

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
