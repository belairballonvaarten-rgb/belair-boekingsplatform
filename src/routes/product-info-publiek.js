// Publieke (NIET ingelogde) downloadlinks voor de infofiche/handleiding en
// het keuringscertificaat van een product — op vraag van Jonas, na een
// controle van de FOD Economie: een klant moet de handleiding "op een
// eenvoudige manier kunnen bemachtigen", maar Jonas wil dit NIET standaard
// als bijlage bij elke mail meesturen. Deze link is het alternatief: ze kan
// in een mailtemplate gezet worden via {{handleiding_links}} (zie
// utils/mailTemplates.js) zodat de klant zelf klikt wanneer hij het nodig
// heeft, zonder dat elke bevestigingsmail een PDF-bijlage krijgt.
//
// Bewust GEEN vereistIngelogd (net als routes/klant-bevestiging.js en
// routes/webinzendingen.js) — de klant is nooit ingelogd. Het product-ID
// (een niet-opsombare UUID) is de enige bescherming, wat hier volstaat: dit
// zijn geen persoonsgegevens, enkel een algemeen productdocument dat Jonas
// zelf liever niet aan iedereen standaard opstuurt, maar dat verder geen
// probleem is als het via een gerichte link bekeken wordt.
const express = require('express');
const db = require('../db');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.get('/:id/infofiche', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'SELECT naam, infofiche_bestand, infofiche_bestandsnaam, infofiche_mimetype FROM producten WHERE id = $1',
    [req.params.id]
  );
  if (!rows[0] || !rows[0].infofiche_bestand) {
    return res.status(404).send('Geen infofiche/handleiding gevonden voor dit product.');
  }
  res.set('Content-Type', rows[0].infofiche_mimetype || 'application/octet-stream');
  res.set('Content-Disposition', `inline; filename="${(rows[0].infofiche_bestandsnaam || 'infofiche').replace(/"/g, '')}"`);
  res.send(rows[0].infofiche_bestand);
}));

router.get('/:id/certificaat', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'SELECT naam, certificaat_bestand, certificaat_bestandsnaam, certificaat_mimetype FROM producten WHERE id = $1',
    [req.params.id]
  );
  if (!rows[0] || !rows[0].certificaat_bestand) {
    return res.status(404).send('Geen keuringscertificaat gevonden voor dit product.');
  }
  res.set('Content-Type', rows[0].certificaat_mimetype || 'application/octet-stream');
  res.set('Content-Disposition', `inline; filename="${(rows[0].certificaat_bestandsnaam || 'certificaat').replace(/"/g, '')}"`);
  res.send(rows[0].certificaat_bestand);
}));

module.exports = router;
