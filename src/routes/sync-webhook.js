const express = require('express');
const db = require('../db');
const { asyncHandler } = require('../utils/asyncHandler');
const { verstuurOndertekendDocumentPerMail } = require('../utils/ondertekendDocument');

const router = express.Router();

// LET OP: bewust GEEN vereistIngelogd hier — dit komt niet van een ingelogde
// browser, maar rechtstreeks van de leveringen-app-server zelf, zodra een
// chauffeur daar een levering als geleverd/opgehaald markeert. Enkel de
// gedeelde sleutel (dezelfde als bij "Nu synchroniseren") beveiligt dit.
// Zo verschijnt "voltooid" hier live op het Dashboard, zonder dat iemand
// nog manueel moet synchroniseren — de "Nu synchroniseren"-knop (zie sync.js)
// blijft daarnaast gewoon als terugvaloptie werken (bv. als deze aanroep om
// een of andere reden niet aankomt).
router.post('/leveringen-app/status-update', asyncHandler(async (req, res) => {
  const sleutel = process.env.LEVERINGEN_APP_SYNC_SECRET;
  if (!sleutel) {
    return res.status(501).json({ fout: 'Koppeling met de leveringen-app is nog niet geconfigureerd (LEVERINGEN_APP_SYNC_SECRET ontbreekt bij Render).' });
  }
  if (req.headers['x-belair-sync-key'] !== sleutel) {
    return res.status(401).json({ fout: 'Ongeldige sleutel' });
  }

  const { boekingsnummer, status } = req.body;
  if (!boekingsnummer || !status) {
    return res.status(400).json({ fout: 'boekingsnummer en status zijn verplicht' });
  }

  // Zelfde statuslogica als de terugkoppeling bij "Nu synchroniseren":
  // 'geplaatst' = levering gebeurd, 'afgerond' = ook al opgehaald. Wordt de
  // status ergens terug teruggezet (bv. per ongeluk aangevinkt), dan volgt
  // "voltooid" hier gewoon mee terug naar niet-voltooid.
  const leveringVoltooid = status === 'geplaatst' || status === 'afgerond';
  const afhalingVoltooid = status === 'afgerond';

  const { rows } = await db.query(
    `UPDATE leveringen SET levering_voltooid = $1, afhaling_voltooid = $2 WHERE boeking_id = $3 RETURNING id`,
    [leveringVoltooid, afhalingVoltooid, boekingsnummer]
  );
  if (!rows.length) {
    await db.query(
      `INSERT INTO leveringen (boeking_id, levering_voltooid, afhaling_voltooid) VALUES ($1, $2, $3)`,
      [boekingsnummer, leveringVoltooid, afhalingVoltooid]
    );
  }
  res.json({ ok: true });
}));

// Wordt aangeroepen door de knop "Verstuur getekende aflevering" in de
// leveringen-app zelf, zodat een chauffeur meteen na de handtekening het
// ondertekende document (als betalingsbewijs) naar de klant kan mailen,
// zonder dat hij hiervoor eerst naar het platform moet gaan. Zelfde
// gedeelde sleutel als hierboven — geen ingelogde sessie beschikbaar
// vanuit de leveringen-app.
router.post('/leveringen-app/verstuur-ondertekend-document', asyncHandler(async (req, res) => {
  const sleutel = process.env.LEVERINGEN_APP_SYNC_SECRET;
  if (!sleutel) {
    return res.status(501).json({ fout: 'Koppeling met de leveringen-app is nog niet geconfigureerd (LEVERINGEN_APP_SYNC_SECRET ontbreekt bij Render).' });
  }
  if (req.headers['x-belair-sync-key'] !== sleutel) {
    return res.status(401).json({ fout: 'Ongeldige sleutel' });
  }

  const { boekingsnummer } = req.body;
  if (!boekingsnummer) {
    return res.status(400).json({ fout: 'boekingsnummer is verplicht' });
  }

  try {
    await verstuurOndertekendDocumentPerMail(boekingsnummer);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 502).json({ fout: err.message });
  }
}));

module.exports = router;
