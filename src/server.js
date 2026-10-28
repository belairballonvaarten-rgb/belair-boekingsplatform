require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const compression = require('compression');
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
const dagoverzichtRoutes = require('./routes/dagoverzicht');
const crewRoutes = require('./routes/crew');
const mailTemplatesRoutes = require('./routes/mail-templates');
const klantBevestigingRoutes = require('./routes/klant-bevestiging');
const productInfoPubliekRoutes = require('./routes/product-info-publiek');
const { startPeriodiekeSync } = require('./utils/leveringenAppSync');

const app = express();

// Render (en de meeste hosting-providers) zitten als reverse proxy vóór de app.
// Zonder dit vertrouwt Express de "https"-status van het originele verzoek niet
// correct, wat het zetten/lezen van de sessie-cookie kan verstoren.
app.set('trust proxy', 1);

// Comprimeert elk antwoord (JSON-API-reacties, en straks ook app.js/style.css
// hieronder) met gzip vóór het versturen — typisch 70-80% kleiner over de
// lijn, zonder enig risico: de browser pakt dit automatisch uit.
app.use(compression());

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
app.use('/api/dagoverzicht', dagoverzichtRoutes);
app.use('/api/crew', crewRoutes);
app.use('/api/mail-templates', mailTemplatesRoutes);
// Publiek (geen login) — de "Ik bevestig"-knop in de aanvraagbevestigingsmail
// wijst hierheen, zie routes/klant-bevestiging.js.
app.use('/api/klant-bevestiging', klantBevestigingRoutes);
// Publiek (geen login) — downloadlink voor infofiche/handleiding en
// certificaat, zie routes/product-info-publiek.js.
app.use('/api/product-info', productInfoPubliekRoutes);

// Beheerscherm (statische front-end) — public/index.html is het startpunt.
//
// app.js/style.css/afbeeldingen mogen lang (7 dagen) in de cache van de
// browser blijven: dat bespaart een volledige download bij elk herbezoek.
// Het risico daarvan — dat iemands browser na een update nog dagenlang de
// OUDE app.js/style.css uit de cache blijft gebruiken — vangen we op door
// index.html NIET via deze cache te laten lopen (index: false hieronder) en
// in plaats daarvan hieronder zelf te serveren, met een "?v=...”-versie
// achter de bestandsnamen die bij elke herstart van de server verandert
// (ASSET_VERSIE). Een nieuwe deploy op Render herstart het proces altijd,
// dus dit vraagt nooit een handmatige stap bij het uitbrengen van een update.
const ASSET_VERSIE = Date.now();

app.use(express.static(path.join(__dirname, '..', 'public'), {
  index: false,
  maxAge: '7d',
}));

let indexHtmlCache = null;
app.get(['/', '/index.html'], (req, res) => {
  if (!indexHtmlCache) {
    const ruw = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    indexHtmlCache = ruw
      .replace('href="/css/style.css"', `href="/css/style.css?v=${ASSET_VERSIE}"`)
      .replace('src="/js/app.js"', `src="/js/app.js?v=${ASSET_VERSIE}"`);
  }
  // index.html zelf altijd vers ophalen (klein bestand, nu ook gecomprimeerd),
  // zodat de bezoeker meteen de juiste "?v=...”-verwijzingen krijgt.
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(indexHtmlCache);
});

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

// Wachtwoord vergeten/kwijt — zelfde principe als zorgVoorEersteAdmin()
// hierboven, maar dan om een BESTAAND account te herstellen: zet tijdelijk
// WACHTWOORD_RESET_EMAIL + WACHTWOORD_RESET_WACHTWOORD in Render (Settings >
// Environment), herstart de service, log in, en verwijder beide variabelen
// terug. Draait bij elke opstart zolang de variabelen ingesteld staan — dat
// is onschadelijk (telkens hetzelfde resultaat) maar daarom net zo belangrijk
// om ze nadien weer weg te halen i.p.v. het wachtwoord daar te laten staan.
async function zorgVoorWachtwoordReset() {
  const resetEmail = process.env.WACHTWOORD_RESET_EMAIL;
  const resetWachtwoord = process.env.WACHTWOORD_RESET_WACHTWOORD;
  if (!resetEmail || !resetWachtwoord) return;

  const hash = await bcrypt.hash(resetWachtwoord, 10);
  const { rowCount } = await db.query('UPDATE admins SET wachtwoord_hash = $1 WHERE email = $2', [hash, resetEmail]);
  if (rowCount > 0) {
    console.log(`Wachtwoord gereset voor ${resetEmail} — verwijder nu WACHTWOORD_RESET_EMAIL/WACHTWOORD_RESET_WACHTWOORD terug uit Render.`);
  } else {
    console.warn(`WACHTWOORD_RESET_EMAIL (${resetEmail}) ingesteld maar geen admin met dat e-mailadres gevonden — niets gewijzigd.`);
  }
}

const PORT = process.env.PORT || 3000;

async function main() {
  await zorgVoorEersteAdmin();
  await zorgVoorWachtwoordReset();
  // Vangnet voor de automatische sync met de leveringen-app (zie
  // utils/leveringenAppSync.js) — doet gewoon niets zolang
  // LEVERINGEN_APP_URL/_SYNC_SECRET nog niet ingesteld zijn bij Render.
  startPeriodiekeSync();
  app.listen(PORT, () => console.log(`Belair-boekingsplatform API draait op poort ${PORT}`));
}

main().catch((err) => {
  console.error('Kon server niet opstarten:', err);
  process.exit(1);
});
