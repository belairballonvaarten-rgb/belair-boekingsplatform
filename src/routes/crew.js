// Beheer van de crewleden (de inlogaccounts van de leveringen-app zelf — de
// gedeelde 'users'-tabel sinds stage 3), plus het versturen van een
// push-melding naar één crewlid z'n telefoon (indien die de crew-app
// gebruikt en er ingelogd op blijft). Los van 'gebruikers.js', dat de
// admin-accounts van DIT beheerscherm beheert.
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { isGeconfigureerd, stuurNaarAbonnementen } = require('../utils/webpush');

const router = express.Router();
router.use(vereistIngelogd);

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, username, naam, rol, telefoon, opmerking, standaard_voertuig_id, created_at
     FROM users ORDER BY naam`
  );
  res.json(rows);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { username, wachtwoord, naam, rol, telefoon, opmerking, standaardVoertuigId } = req.body || {};
  if (!username || !wachtwoord || !naam) {
    return res.status(400).json({ fout: 'Gebruikersnaam, wachtwoord en naam zijn verplicht' });
  }
  if (wachtwoord.length < 6) {
    return res.status(400).json({ fout: 'Wachtwoord moet minstens 6 tekens lang zijn' });
  }
  const hash = await bcrypt.hash(wachtwoord, 10);
  try {
    const { rows } = await db.query(
      `INSERT INTO users (username, password_hash, naam, rol, telefoon, opmerking, standaard_voertuig_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, naam, rol, telefoon, opmerking, standaard_voertuig_id, created_at`,
      [username.trim(), hash, naam.trim(), rol === 'admin' ? 'admin' : 'plaatser', telefoon || null, opmerking || null, standaardVoertuigId || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ fout: `Er bestaat al een crewlid met gebruikersnaam "${username}"` });
    }
    throw err;
  }
}));

// ---------- Huidige bezetting (wie zit vandaag in welk voertuig) ----------
// Zelfde voertuig_bemanning-tabel als de leveringen-app gebruikt voor zijn
// "Huidige bezetting" (daar enkel het EIGEN voertuig van een niet-admin
// account) — dit is de volledige (admin-)variant, rechtstreeks op het
// platform, zodat Jonas dit ook hier kan opvolgen/aanpassen zonder de
// crew-app zelf te moeten openen. Enkel VANDAAG (net als de crew-app);
// morgen begint dit vanzelf weer leeg, geen automatische overname.
//
// Let op: deze twee routes moeten vóór '/:id' staan, anders vangt de
// '/:id'-route (hieronder) 'bezetting' op als een letterlijke id-waarde.
const ISODATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
function vandaagIso() {
  return new Date().toISOString().slice(0, 10);
}

router.get('/bezetting', asyncHandler(async (req, res) => {
  const datum = ISODATE_REGEX.test(req.query.datum || '') ? req.query.datum : vandaagIso();
  const fase = req.query.fase === 'afhaling' ? 'afhaling' : 'levering';
  const [voertuigenRes, bemanningRes] = await Promise.all([
    db.query('SELECT id, naam FROM voertuigen ORDER BY naam'),
    db.query(
      'SELECT voertuig_id, gebruiker_id AS id, gebruiker_naam AS naam FROM voertuig_bemanning WHERE datum=$1 AND fase=$2',
      [datum, fase]
    ),
  ]);
  const perVoertuig = {};
  bemanningRes.rows.forEach((row) => {
    if (!perVoertuig[row.voertuig_id]) perVoertuig[row.voertuig_id] = [];
    perVoertuig[row.voertuig_id].push({ id: row.id, naam: row.naam });
  });
  res.json({ datum, fase, voertuigen: voertuigenRes.rows, bemanning: perVoertuig });
}));

// Vervangt in één keer de volledige bemanning van één voertuig, voor één dag
// + fase — verwijdert de gekozen gebruikers ook automatisch uit een ANDER
// voertuig voor diezelfde dag/fase (één crewlid kan er maar in één zitten).
// Zelfde logica als PUT /api/voertuig-bemanning in de leveringen-app, hier
// gewoon rechtstreeks tegen dezelfde tabel.
router.put('/bezetting', asyncHandler(async (req, res) => {
  const { voertuigId, datum, fase, gebruikerIds } = req.body || {};
  if (!voertuigId || !['levering', 'afhaling'].includes(fase) || !Array.isArray(gebruikerIds)) {
    return res.status(400).json({ fout: 'voertuigId, fase (levering/afhaling) en gebruikerIds (lijst) zijn verplicht' });
  }
  const gekozenDatum = ISODATE_REGEX.test(datum || '') ? datum : vandaagIso();
  const ids = gebruikerIds.map((id) => parseInt(id, 10)).filter(Number.isFinite);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM voertuig_bemanning
       WHERE datum = $1 AND fase = $2 AND (voertuig_id = $3 OR gebruiker_id = ANY($4::int[]))`,
      [gekozenDatum, fase, voertuigId, ids]
    );
    if (ids.length) {
      await client.query(
        `INSERT INTO voertuig_bemanning (voertuig_id, gebruiker_id, gebruiker_naam, datum, fase)
         SELECT $1, u.id, u.naam, $2, $3 FROM users u WHERE u.id = ANY($4::int[])`,
        [voertuigId, gekozenDatum, fase, ids]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ fout: 'Bemanning bijwerken mislukt: ' + e.message });
  } finally {
    client.release();
  }
}));

// Live locatie van crewleden — enkel gevuld terwijl iemand de leveringen-app
// effectief open heeft op z'n telefoon (geen achtergrond-tracking, zie de
// 'locations'-tabel/uitleg in leveringen-app/server.js). Die tabel wordt door
// de leveringen-app zelf aangemaakt/bijgehouden; hier lezen we ze gewoon uit
// dezelfde gedeelde databank.
router.get('/locaties', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.naam, l.lat, l.lng, l.updated_at
     FROM locations l JOIN users u ON u.id = l.user_id
     ORDER BY l.updated_at DESC`
  );
  res.json(rows);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { naam, rol, telefoon, opmerking, wachtwoord, standaardVoertuigId } = req.body || {};
  if (wachtwoord && wachtwoord.length < 6) {
    return res.status(400).json({ fout: 'Wachtwoord moet minstens 6 tekens lang zijn' });
  }
  const wachtwoordHash = wachtwoord ? await bcrypt.hash(wachtwoord, 10) : null;
  const { rows } = await db.query(
    `UPDATE users SET
       naam = COALESCE($1, naam),
       rol = COALESCE($2, rol),
       telefoon = $3,
       opmerking = $4,
       password_hash = COALESCE($5, password_hash),
       standaard_voertuig_id = $7
     WHERE id = $6
     RETURNING id, username, naam, rol, telefoon, opmerking, standaard_voertuig_id, created_at`,
    [naam || null, rol === 'admin' || rol === 'plaatser' ? rol : null, telefoon || null, opmerking || null, wachtwoordHash, req.params.id, standaardVoertuigId || null]
  );
  if (!rows[0]) return res.status(404).json({ fout: 'Crewlid niet gevonden' });
  res.json(rows[0]);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ fout: 'Crewlid niet gevonden' });
  res.status(204).end();
}));

// Stuurt een push-melding naar dit crewlid (al z'n toestellen die ooit
// ingelogd zijn geweest in de crew-app en meldingen hebben aangezet).
router.post('/:id/melding', asyncHandler(async (req, res) => {
  const titel = (req.body && req.body.titel || '').trim();
  const bericht = (req.body && req.body.bericht || '').trim();
  if (!titel || !bericht) return res.status(400).json({ fout: 'Titel en bericht zijn verplicht' });
  if (!isGeconfigureerd()) {
    return res.status(501).json({ fout: 'Push-meldingen zijn nog niet geconfigureerd (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ontbreken bij Render — kopieer ze van de leveringen-app).' });
  }
  const { rows: subs } = await db.query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [req.params.id]
  );
  if (!subs.length) return res.status(400).json({ fout: 'Dit crewlid heeft geen meldingen aanstaan op een toestel (nog niet ingelogd/toegestaan in de crew-app).' });
  const { verstuurd, mislukt } = await stuurNaarAbonnementen(db, subs, { title: titel, message: bericht });
  res.json({ verstuurd, mislukt });
}));

module.exports = router;
