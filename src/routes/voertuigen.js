const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { isGeconfigureerd, stuurNaarAbonnementen } = require('../utils/webpush');

const router = express.Router();
router.use(vereistIngelogd);

// Genereert een korte, makkelijk over te typen cijfercode (voor het aanmelden
// van de vaste iPad in het voertuig — geen wachtwoordbeheer nodig, gewoon
// eenmalig intikken op het toestel zelf).
function nieuweToegangscode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

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

// Zet een nieuwe (willekeurige) toegangscode voor de vaste iPad-login van dit
// voertuig — bv. bij eerste inrichting van het toestel, of als de code
// ergens rondslingert en vervangen moet worden. Bestaande inlog op de iPad
// zelf blijft gewoon werken (die gebruikt het token van de vorige aanmelding,
// niet de code opnieuw) totdat er expliciet afgemeld wordt op dat toestel.
router.post('/:id/nieuwe-toegangscode', asyncHandler(async (req, res) => {
  const code = nieuweToegangscode();
  const { rows } = await db.query(
    'UPDATE voertuigen SET toegangscode = $1 WHERE id = $2 RETURNING id, naam, toegangscode',
    [code, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ fout: 'Voertuig niet gevonden' });
  res.json(rows[0]);
}));

// Stuurt een push-melding naar het vaste voertuig-toestel (de iPad) en
// bewaart ze ook in de geschiedenis (voertuig_meldingen), zodat ze op het
// scherm blijft staan ook al was de iPad even dicht/offline toen ze verstuurd
// werd (web push zelf bewaart niets).
router.post('/:id/melding', asyncHandler(async (req, res) => {
  const titel = (req.body && req.body.titel || '').trim();
  const bericht = (req.body && req.body.bericht || '').trim();
  if (!titel || !bericht) return res.status(400).json({ fout: 'Titel en bericht zijn verplicht' });

  const { rows: voertuigRows } = await db.query('SELECT id FROM voertuigen WHERE id = $1', [req.params.id]);
  if (!voertuigRows[0]) return res.status(404).json({ fout: 'Voertuig niet gevonden' });

  await db.query(
    'INSERT INTO voertuig_meldingen (voertuig_id, titel, bericht) VALUES ($1, $2, $3)',
    [req.params.id, titel, bericht]
  );

  if (!isGeconfigureerd()) {
    return res.status(207).json({ verstuurd: 0, mislukt: 0, opgeslagen: true, fout: 'Push-meldingen zijn nog niet geconfigureerd (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ontbreken bij Render) — de melding staat wel klaar op het scherm zodra de iPad ververst.' });
  }
  // Een voertuig wordt op 2 verschillende manieren "gebruikt" in de leveringen-app:
  // 1) Een echt vast toestel-login (voertuig.html, met toegangscode) — dat
  //    abonnement staat rechtstreeks met voertuig_id getagd.
  // 2) (In de praktijk de manier die Jonas gebruikt) Een gewoon crewlid-account
  //    (Crew-pagina hier) met "Standaard voertuig" ingesteld, bv. de iPad-
  //    accounts "Belair Camionette"/"Linirent Bus" — dat abonnement staat
  //    getagd met user_id, NIET voertuig_id, dus die werden hier vroeger
  //    gemist (0 verstuurd, geen fout te zien). Vul daarom aan met elk
  //    crewlid wiens standaard voertuig dit is, of dat hier vandaag expliciet
  //    aan toegewezen staat (via "Wijzig voertuig" in de leveringen-app).
  const { rows: subs } = await db.query(
    `SELECT DISTINCT ps.id, ps.endpoint, ps.p256dh, ps.auth
     FROM push_subscriptions ps
     WHERE ps.voertuig_id = $1
        OR ps.user_id IN (
          SELECT id FROM users WHERE standaard_voertuig_id = $1
          UNION
          SELECT gebruiker_id FROM voertuig_bemanning WHERE voertuig_id = $1 AND datum = CURRENT_DATE
        )`,
    [req.params.id]
  );
  const { verstuurd, mislukt } = await stuurNaarAbonnementen(db, subs, { title: titel, message: bericht });
  res.json({ verstuurd, mislukt, opgeslagen: true });
}));

module.exports = router;
