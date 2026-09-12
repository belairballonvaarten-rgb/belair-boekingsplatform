const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Geheime token in de URL zelf (i.p.v. een login) — dit endpoint wordt immers
// rechtstreeks door Gravity Forms (dus zonder ingelogde sessie) aangeroepen.
// Zonder deze token zou eender wie op het internet hier lukraak data naartoe
// kunnen sturen. De token staat in een environment variable op Render, niet
// hardcoded in de code.
const WEBHOOK_TOKEN = process.env.WEBSITE_WEBHOOK_TOKEN || null;

// Ontvangt een formulier-inzending (bv. van Gravity Forms via de "Webhooks"-
// uitbreiding) en bewaart ze enkel — er wordt hier bewust nog GEEN aanvraag of
// boeking van gemaakt. Dit is stap 1: eerst zien wat en hoe de data binnenkomt,
// naast (niet in plaats van) de bestaande e-mail naar Jonas' mailbox.
router.post('/website-formulier/:token', asyncHandler(async (req, res) => {
  if (!WEBHOOK_TOKEN || req.params.token !== WEBHOOK_TOKEN) {
    return res.status(403).json({ fout: 'Ongeldige of ontbrekende token' });
  }
  await db.query(
    `INSERT INTO website_inzendingen (bron, ruwe_data) VALUES ($1, $2)`,
    ['website-formulier', JSON.stringify(req.body || {})]
  );
  // Gravity Forms verwacht enkel een 200 OK, de inhoud van de respons doet er niet toe.
  res.status(200).json({ ok: true });
}));

// Overzicht van ontvangen inzendingen — enkel voor Jonas (ingelogd), om te
// bekijken hoe de koppeling loopt.
router.get('/website-formulier', vereistIngelogd, asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, ontvangen_op, bron, ruwe_data, verwerkt
     FROM website_inzendingen
     ORDER BY ontvangen_op DESC
     LIMIT 200`
  );
  res.json(rows);
}));

// Eén inzending markeren als "bekeken/verwerkt" (louter visueel, geen verdere actie).
router.post('/website-formulier/:id/verwerkt', vereistIngelogd, asyncHandler(async (req, res) => {
  await db.query(`UPDATE website_inzendingen SET verwerkt = true WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
