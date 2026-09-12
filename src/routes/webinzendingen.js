const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { checkBeschikbaarheid } = require('../utils/beschikbaarheid');

const router = express.Router();

// Geheime token in de URL zelf (i.p.v. een login) — dit endpoint wordt immers
// rechtstreeks door Gravity Forms (dus zonder ingelogde sessie) aangeroepen.
// Zonder deze token zou eender wie op het internet hier lukraak data naartoe
// kunnen sturen. De token staat in een environment variable op Render, niet
// hardcoded in de code.
const WEBHOOK_TOKEN = process.env.WEBSITE_WEBHOOK_TOKEN || null;

function normaliseerTekst(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Jonas kiest zelf de naam van elk veld bij het instellen van de webhook in
// Gravity Forms — we proberen daarom de meest voor de hand liggende varianten
// i.p.v. exact één vaste veldnaam te verwachten.
//
// In de praktijk blijkt de webhook echter de RUWE Gravity Forms-inzending door
// te sturen (zoals GF die intern bijhoudt): de velden staan dan onder hun
// numeriek veld-ID (bv. "6") i.p.v. een leesbare naam (bv. "Voornaam"), samen
// met interne metadata zoals id/ip/form_id/source_url/user_agent. Herkenbaar
// aan die metadata-velden. GF_FORM_17_VELD_IDS is de (enige gekende) mapping
// voor Jonas' eigen "Offerte aanvragen"-formulier (form_id 17) — enkel gebruikt
// als er geen leesbare naam gevonden werd. Wijzigt Jonas ooit de volgorde/
// opbouw van dat formulier (velden toevoegen, verwijderen, verplaatsen), dan
// kunnen deze ID's verschuiven en moet deze lijst opnieuw nagekeken worden
// (herkenbaar aan: aanvragen die weer als "onherkend" gemarkeerd staan terwijl
// de gegevens wel degelijk ingevuld waren).
const GF_FORM_17_VELD_IDS = {
  Voornaam: '6',
  Achternaam: '7',
  'Particulier of Bedrijf?': '8',
  Telefoonnummer: '9',
  'E-mailadres': '10',
  Plaatsingsadres: '16',
  Stad: '17',
  Postcode: '18',
  'Type ondergrond': '19',
  Datum: '23',
  Toegankelijkheid: '30',
  Product: '31',
  'Voorkeur tijdstip van levering': '34',
  'Voorkeur tijdstip van afhaling': '35',
  'Levering of afhaling': '39',
  Huurvoorwaarden: '37.2',
};

function zoekVeld(data, ...mogelijkeNamen) {
  const sleutels = Object.keys(data || {}).map((k) => ({ orig: k, genorm: normaliseerTekst(k) }));
  for (const naam of mogelijkeNamen) {
    const genorm = normaliseerTekst(naam);
    const gevonden = sleutels.find((s) => s.genorm === genorm);
    if (gevonden && data[gevonden.orig] !== undefined && data[gevonden.orig] !== null && String(data[gevonden.orig]).trim() !== '') {
      return String(data[gevonden.orig]).trim();
    }
    // Enkel toepassen op form_id 17 (Jonas' "Offerte aanvragen"-formulier) —
    // bij een ander/onbekend formulier zouden dezelfde nummers iets heel
    // anders kunnen betekenen.
    if (String(data.form_id) === '17') {
      const veldId = GF_FORM_17_VELD_IDS[naam];
      if (veldId && data[veldId] !== undefined && data[veldId] !== null && String(data[veldId]).trim() !== '') {
        return String(data[veldId]).trim();
      }
    }
  }
  return null;
}

function parseDatumNaarIso(ruw) {
  if (!ruw) return null;
  const eu = ruw.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/); // 18/09/2026
  if (eu) {
    const [, dag, maand, jaar] = eu;
    return `${jaar}-${maand.padStart(2, '0')}-${dag.padStart(2, '0')}`;
  }
  const iso = ruw.match(/^(\d{4})-(\d{2})-(\d{2})/); // 2026-09-18(...)
  if (iso) return iso[0].slice(0, 10);
  return null;
}

// Sommige formulieren wisselen "Stad" en "Postcode" per ongeluk om (dat zagen
// we ook in Jonas' eigen voorbeeld) — we kijken dus gewoon welke van de twee
// waarden er als (Belgische) postcode uitziet, ongeacht onder welk label ze
// binnenkwam.
function scheidPostcodeGemeente(waardeA, waardeB) {
  const isPostcode = (w) => /^\d{4}$/.test((w || '').trim());
  if (isPostcode(waardeA) && !isPostcode(waardeB)) return { postcode: waardeA, gemeente: waardeB };
  if (isPostcode(waardeB) && !isPostcode(waardeA)) return { postcode: waardeB, gemeente: waardeA };
  return { postcode: waardeA || null, gemeente: waardeB || null };
}

async function vindProductId(naamRuw) {
  if (!naamRuw) return null;
  const zoek = normaliseerTekst(naamRuw);
  if (!zoek) return null;
  const { rows } = await db.query('SELECT id, naam FROM producten');
  let match = rows.find((p) => normaliseerTekst(p.naam) === zoek);
  if (!match) {
    match = rows.find((p) => {
      const n = normaliseerTekst(p.naam);
      return n.includes(zoek) || zoek.includes(n);
    });
  }
  return match ? match.id : null;
}

async function vindOfMaakKlant({ naam, klant_type, btw_nummer, adres, postcode, gemeente, telefoon, email }) {
  if (email) {
    const { rows } = await db.query('SELECT id FROM klanten WHERE email = $1 LIMIT 1', [email]);
    if (rows[0]) return rows[0].id;
  }
  if (telefoon) {
    const { rows } = await db.query('SELECT id FROM klanten WHERE telefoon = $1 LIMIT 1', [telefoon]);
    if (rows[0]) return rows[0].id;
  }
  const { rows } = await db.query(
    `INSERT INTO klanten (naam, klant_type, btw_nummer, adres, postcode, gemeente, telefoon, email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [naam, klant_type || 'particulier', btw_nummer || null, adres || null, postcode || null, gemeente || null, telefoon || null, email || null]
  );
  return rows[0].id;
}

// Probeert een binnengekomen formulier-inzending automatisch om te zetten in
// een echte aanvraag (boeking met status 'nieuw', bron 'website'), die dan
// gewoon in de Aanvragen-inbox verschijnt om te accepteren/weigeren zoals
// elke andere aanvraag. Lukt de automatische omzetting niet (bv. onherkend
// product, ontbrekende datum) dan wordt er NIETS aangemaakt — Jonas kan de
// aanvraag dan zelf manueel aanmaken met de zichtbare ruwe gegevens.
async function verwerkInzending(ruweData) {
  const voornaam = zoekVeld(ruweData, 'Voornaam', 'voornaam');
  const achternaam = zoekVeld(ruweData, 'Achternaam', 'achternaam');
  const naam = [voornaam, achternaam].filter(Boolean).join(' ').trim() || null;
  const telefoon = zoekVeld(ruweData, 'Telefoonnummer', 'Telefoon', 'telefoon');
  const email = zoekVeld(ruweData, 'E-mailadres', 'Email', 'E-mail');
  const particulierOfBedrijf = zoekVeld(ruweData, 'Particulier of Bedrijf?', 'Particulier of bedrijf', 'Klanttype');
  const klant_type = particulierOfBedrijf && normaliseerTekst(particulierOfBedrijf).includes('bedrijf') ? 'bedrijf' : 'particulier';
  const btw_nummer = zoekVeld(ruweData, 'VAT', 'BTW', 'BTW-nummer', 'Btw-nummer');
  const leveringOfAfhaling = zoekVeld(ruweData, 'Levering of afhaling');
  const leveringswijze = leveringOfAfhaling && normaliseerTekst(leveringOfAfhaling).includes('afhaling') ? 'afhaling' : 'levering';
  const plaatsingsadres = zoekVeld(ruweData, 'Plaatsingsadres', 'Adres');
  const veldStad = zoekVeld(ruweData, 'Stad');
  const veldPostcode = zoekVeld(ruweData, 'Postcode');
  const { postcode, gemeente } = scheidPostcodeGemeente(veldPostcode, veldStad);
  const type_ondergrond = zoekVeld(ruweData, 'Type ondergrond');
  const toegankelijkheid = zoekVeld(ruweData, 'Toegankelijkheid');
  const gewenste_datum_start = parseDatumNaarIso(zoekVeld(ruweData, 'Datum'));
  const voorkeur_tijdstip_levering = zoekVeld(ruweData, 'Voorkeur tijdstip van levering');
  const voorkeur_tijdstip_afhaling = zoekVeld(ruweData, 'Voorkeur tijdstip van afhaling');
  const opmerkingen = zoekVeld(ruweData, 'Extra opmerkingen?', 'Opmerkingen', 'Extra opmerkingen');
  const huurvoorwaardenRuw = zoekVeld(ruweData, 'Huurvoorwaarden');
  const huurvoorwaarden_geaccepteerd = Boolean(huurvoorwaardenRuw && normaliseerTekst(huurvoorwaardenRuw).includes('akkoord'));
  const productNaam = zoekVeld(ruweData, 'Product');

  const ontbrekend = [];
  if (!naam) ontbrekend.push('naam (Voornaam/Achternaam)');
  if (!gewenste_datum_start) ontbrekend.push('datum');
  const productId = productNaam ? await vindProductId(productNaam) : null;
  if (!productNaam) ontbrekend.push('product');
  else if (!productId) ontbrekend.push(`product "${productNaam}" (niet herkend in de productenlijst)`);

  if (ontbrekend.length) {
    return { ok: false, reden: `Kon niet automatisch omgezet worden — ontbreekt of onherkend: ${ontbrekend.join(', ')}.` };
  }

  const check = await checkBeschikbaarheid(productId, gewenste_datum_start, gewenste_datum_start, 1);
  if (!check.beschikbaar) {
    return { ok: false, reden: `Kon niet automatisch omgezet worden — product niet beschikbaar op ${gewenste_datum_start}: ${check.reden}` };
  }

  const adresVolledig = [plaatsingsadres, [postcode, gemeente].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null;

  const klantId = await vindOfMaakKlant({
    naam, klant_type, btw_nummer, adres: plaatsingsadres, postcode, gemeente, telefoon, email,
  });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows: boekingRows } = await client.query(
      `INSERT INTO boekingen (
         klant_id, gewenste_datum_start, gewenste_datum_einde,
         leveringswijze, leveringsadres, type_ondergrond, toegankelijkheid,
         voorkeur_tijdstip_levering, voorkeur_tijdstip_afhaling,
         huurvoorwaarden_geaccepteerd, huurvoorwaarden_geaccepteerd_op,
         notities, bron
       )
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9 THEN now() ELSE NULL END, $10, 'website')
       RETURNING id`,
      [
        klantId, gewenste_datum_start, leveringswijze, adresVolledig, type_ondergrond, toegankelijkheid,
        voorkeur_tijdstip_levering, voorkeur_tijdstip_afhaling, huurvoorwaarden_geaccepteerd,
        opmerkingen,
      ]
    );
    const boekingId = boekingRows[0].id;
    const { rows: productRows } = await client.query('SELECT prijs FROM producten WHERE id = $1', [productId]);
    await client.query(
      'INSERT INTO boeking_producten (boeking_id, product_id, aantal, prijs) VALUES ($1, $2, 1, $3)',
      [boekingId, productId, productRows[0]?.prijs || 0]
    );
    await client.query(
      'INSERT INTO boeking_status_historiek (boeking_id, van_status, naar_status) VALUES ($1, NULL, $2)',
      [boekingId, 'nieuw']
    );
    await client.query('COMMIT');
    return { ok: true, boekingId };
  } catch (err) {
    await client.query('ROLLBACK');
    return { ok: false, reden: `Fout bij automatisch aanmaken: ${err.message}` };
  } finally {
    client.release();
  }
}

// Ontvangt een formulier-inzending (bv. van Gravity Forms via de "Webhooks"-
// uitbreiding). De ruwe data wordt ALTIJD eerst bewaard, en pas daarna wordt
// geprobeerd er automatisch een aanvraag van te maken — zo gaat er nooit iets
// verloren, ook niet als de automatische omzetting faalt.
router.post('/website-formulier/:token', asyncHandler(async (req, res) => {
  if (!WEBHOOK_TOKEN || req.params.token !== WEBHOOK_TOKEN) {
    return res.status(403).json({ fout: 'Ongeldige of ontbrekende token' });
  }
  const ruweData = req.body || {};
  const { rows } = await db.query(
    `INSERT INTO website_inzendingen (bron, ruwe_data) VALUES ($1, $2) RETURNING id`,
    ['website-formulier', JSON.stringify(ruweData)]
  );
  const inzendingId = rows[0].id;

  let resultaat;
  try {
    resultaat = await verwerkInzending(ruweData);
  } catch (err) {
    resultaat = { ok: false, reden: `Onverwachte fout bij automatisch verwerken: ${err.message}` };
  }

  await db.query(
    `UPDATE website_inzendingen SET verwerkt = $1, boeking_id = $2, verwerkings_fout = $3 WHERE id = $4`,
    [resultaat.ok, resultaat.boekingId || null, resultaat.ok ? null : resultaat.reden, inzendingId]
  );

  // Gravity Forms verwacht enkel een 200 OK, de inhoud van de respons doet er niet toe.
  res.status(200).json({ ok: true });
}));

// Overzicht van ontvangen inzendingen — enkel voor Jonas (ingelogd), om te
// bekijken hoe de koppeling loopt en welke al dan niet automatisch omgezet zijn.
router.get('/website-formulier', vereistIngelogd, asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, ontvangen_op, bron, ruwe_data, verwerkt, boeking_id, verwerkings_fout
     FROM website_inzendingen
     ORDER BY ontvangen_op DESC
     LIMIT 200`
  );
  res.json(rows);
}));

// Eén (niet-automatisch-verwerkte) inzending manueel als "bekeken" markeren,
// bv. nadat Jonas de aanvraag zelf handmatig heeft aangemaakt.
router.post('/website-formulier/:id/verwerkt', vereistIngelogd, asyncHandler(async (req, res) => {
  await db.query(`UPDATE website_inzendingen SET verwerkt = true WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
