const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { checkBeschikbaarheid } = require('../utils/beschikbaarheid');
const { berekenAfstandKm, berekenTransportkost } = require('../utils/afstand');
const { berekenAantalDagen, berekenMeerdaagsePrijs } = require('../utils/prijzen');
const { asyncHandler } = require('../utils/asyncHandler');
const { verstuurMail, isGeconfigureerd: mailIsGeconfigureerd } = require('../utils/mailer');
const { vulTemplateIn, bouwTemplateContext } = require('../utils/mailTemplates');
const {
  isGeconfigureerd: efIsGeconfigureerd,
  zorgVoorKlant: efZorgVoorKlant,
  maakFactuur: efMaakFactuur,
  maakBetaalverzoek: efMaakBetaalverzoek,
} = require('../utils/eenvoudigFactureren');

const router = express.Router();
router.use(vereistIngelogd);

// Toegelaten statusovergangen (state machine uit het bouwplan)
const TOEGELATEN_OVERGANGEN = {
  nieuw: ['in_behandeling', 'geaccepteerd', 'geweigerd'],
  in_behandeling: ['geaccepteerd', 'geweigerd'],
  geaccepteerd: ['ingepland', 'geweigerd'],
  ingepland: ['bevestigd'],
  bevestigd: ['betaalverzoek_verstuurd'],
  betaalverzoek_verstuurd: ['betaald_deels', 'betaald_volledig'],
  betaald_deels: ['betaald_volledig', 'gefactureerd', 'voldaan_manueel'],
  betaald_volledig: ['gefactureerd', 'voldaan_manueel'],
  geweigerd: [],
  gefactureerd: [],
  voldaan_manueel: [],
};

// Statussen die voor Jonas betekenen "dit is afgehandeld, het saldo staat op
// nul" — bij een overgang hiernaartoe wordt een eventueel nog openstaand
// saldo automatisch als betaald geregistreerd, zodat hij niet ook nog apart
// een betaling van het resterende bedrag moet ingeven.
const STATUSSEN_MET_AUTOMATISCHE_VOLLEDIGE_BETALING = ['gefactureerd', 'voldaan_manueel'];

// Let op: deze route moet vóór '/:id' staan
router.post('/beschikbaarheid-check', asyncHandler(async (req, res) => {
  const { product_id, gewenste_datum_start, gewenste_datum_einde, aantal, excl_boeking_id } = req.body;
  if (!product_id || !gewenste_datum_start) {
    return res.status(400).json({ fout: 'product_id en gewenste_datum_start zijn verplicht' });
  }
  const resultaat = await checkBeschikbaarheid(
    product_id,
    gewenste_datum_start,
    gewenste_datum_einde || gewenste_datum_start,
    aantal || 1,
    excl_boeking_id || null
  );
  res.json(resultaat);
}));

// Staat de Microsoft 365-mailkoppeling al ingesteld (AZURE_*-omgevingsvariabelen)?
// Zo kan de "Bulk e-mail"-knop in het overzicht netjes uitleggen wat nog moet
// gebeuren i.p.v. gewoon te falen bij het versturen.
router.get('/mail-status', (req, res) => {
  res.json({ geconfigureerd: mailIsGeconfigureerd() });
});

// Bulk e-mail naar de klanten van een selectie boekingen — Jonas vinkt boekingen
// aan in het overzicht en typt hier één bericht, dat (via zijn eigen Microsoft
// 365, zie utils/mailer.js) naar elk van hun e-mailadressen gaat. {{naam}} in
// onderwerp/inhoud wordt per mail vervangen door de klantnaam. Elke geslaagde
// mail wordt ook als "communicatie"-regel bij de boeking gelogd, zodat het
// dossier zelf ook toont dat en wat er verstuurd is.
router.post('/bulk-email', asyncHandler(async (req, res) => {
  const { boeking_ids, onderwerp, inhoud } = req.body;
  if (!Array.isArray(boeking_ids) || !boeking_ids.length) {
    return res.status(400).json({ fout: 'boeking_ids is verplicht en mag niet leeg zijn' });
  }
  if (!onderwerp || !inhoud) {
    return res.status(400).json({ fout: 'onderwerp en inhoud zijn verplicht' });
  }
  const { rows } = await db.query(
    `SELECT b.id AS boeking_id, k.naam AS klant_naam, k.email AS klant_email
     FROM boekingen b JOIN klanten k ON k.id = b.klant_id
     WHERE b.id = ANY($1)`,
    [boeking_ids]
  );
  const resultaten = [];
  for (const rij of rows) {
    if (!rij.klant_email) {
      resultaten.push({ boeking_id: rij.boeking_id, klant_naam: rij.klant_naam, status: 'overgeslagen', reden: 'Geen e-mailadres bekend bij deze klant' });
      continue;
    }
    const persoonlijkOnderwerp = onderwerp.replace(/\{\{naam\}\}/g, rij.klant_naam);
    const persoonlijkeInhoud = inhoud.replace(/\{\{naam\}\}/g, rij.klant_naam);
    try {
      await verstuurMail({
        naar: rij.klant_email,
        onderwerp: persoonlijkOnderwerp,
        html: persoonlijkeInhoud.replace(/\n/g, '<br>'),
      });
      await db.query(
        `INSERT INTO communicatie (boeking_id, type, richting, onderwerp, inhoud) VALUES ($1, 'email', 'uitgaand', $2, $3)`,
        [rij.boeking_id, persoonlijkOnderwerp, persoonlijkeInhoud]
      );
      resultaten.push({ boeking_id: rij.boeking_id, klant_naam: rij.klant_naam, status: 'verstuurd' });
    } catch (err) {
      resultaten.push({ boeking_id: rij.boeking_id, klant_naam: rij.klant_naam, status: 'mislukt', reden: err.message });
    }
  }
  res.json({ resultaten });
}));

// Gedeelde opbouw voor zowel de preview (ff-controle-stap vóór versturen) als
// het effectief versturen: haalt de template + boekingsgegevens op en vult de
// {{plaatshouders}} in. Onderwerp = platte tekst, inhoud = HTML (zie
// utils/mailTemplates.js voor waarom die twee apart ingevuld worden).
async function haalIngevuldeTemplateOp(boekingId, templateId) {
  const { rows: templateRows } = await db.query('SELECT * FROM mail_templates WHERE id = $1', [templateId]);
  const template = templateRows[0];
  if (!template) return { fout: 'Template niet gevonden', status: 404 };

  const { rows: boekingRows } = await db.query(
    `SELECT b.*, k.naam AS klant_naam, k.email AS klant_email
     FROM boekingen b JOIN klanten k ON k.id = b.klant_id WHERE b.id = $1`,
    [boekingId]
  );
  const boeking = boekingRows[0];
  if (!boeking) return { fout: 'Boeking niet gevonden', status: 404 };

  const { rows: producten } = await db.query(
    `SELECT p.naam, bp.aantal FROM boeking_producten bp JOIN producten p ON p.id = bp.product_id WHERE bp.boeking_id = $1 ORDER BY p.naam`,
    [boekingId]
  );
  const prijstabel = await berekenPrijstabel(boekingId);
  const { onderwerpContext, inhoudContext } = bouwTemplateContext(boeking, producten, prijstabel);

  const onderwerp = vulTemplateIn(template.onderwerp, onderwerpContext);
  const inhoud = vulTemplateIn(template.inhoud, inhoudContext);
  return { template, boeking, onderwerp, inhoud };
}

// Preview van een template voor deze ene boeking — vult de plaatshouders in,
// maar verstuurt niets. Gebruikt door de "ff controle"-stap vóór het
// effectief versturen (de 4 sneltoetsen bovenaan het dossier, en de vrije
// templatelijst bij Communicatie).
router.get('/:id/template-preview/:templateId', asyncHandler(async (req, res) => {
  const resultaat = await haalIngevuldeTemplateOp(req.params.id, req.params.templateId);
  if (resultaat.fout) return res.status(resultaat.status).json({ fout: resultaat.fout });
  res.json({
    onderwerp: resultaat.onderwerp,
    inhoud: resultaat.inhoud,
    klantEmail: resultaat.boeking.klant_email,
  });
}));

// Verstuurt één van de (in Instellingen beheerde) e-mailtemplates naar de
// klant van dit ene dossier, met de {{plaatshouders}} al ingevuld met de
// gegevens van deze boeking — en logt dat net als bulk-email in Communicatie.
router.post('/:id/verstuur-template', asyncHandler(async (req, res) => {
  const { templateId } = req.body || {};
  if (!templateId) return res.status(400).json({ fout: 'templateId is verplicht' });

  const resultaat = await haalIngevuldeTemplateOp(req.params.id, templateId);
  if (resultaat.fout) return res.status(resultaat.status).json({ fout: resultaat.fout });
  const { boeking, onderwerp, inhoud } = resultaat;
  if (!boeking.klant_email) return res.status(400).json({ fout: 'Deze klant heeft geen e-mailadres bekend' });

  try {
    await verstuurMail({ naar: boeking.klant_email, onderwerp, html: inhoud });
    await db.query(
      `INSERT INTO communicatie (boeking_id, type, richting, onderwerp, inhoud) VALUES ($1, 'email', 'uitgaand', $2, $3)`,
      [req.params.id, onderwerp, inhoud]
    );
    res.json({ verstuurd: true, onderwerp });
  } catch (err) {
    res.status(502).json({ fout: `Versturen mislukt: ${err.message}` });
  }
}));

// Maakt een factuur of betaalverzoek aan in EenvoudigFactureren voor deze
// boeking (klant wordt hergebruikt/aangemaakt daar, lijnen = producten +
// transportkost + eventuele toeslag/korting). Zie utils/eenvoudigFactureren.js
// voor de belangrijke kanttekeningen — dit is niet live getest tegen een
// echte account, dus foutmeldingen van EenvoudigFactureren zelf komen zo veel
// mogelijk letterlijk terug naar Jonas toe.
router.post('/:id/eenvoudigfactureren', asyncHandler(async (req, res) => {
  const soort = req.body && req.body.soort === 'betaalverzoek' ? 'betaalverzoek' : 'factuur';
  if (!efIsGeconfigureerd()) {
    return res.status(501).json({ fout: 'EenvoudigFactureren is nog niet gekoppeld — EENVOUDIGFACTUREREN_API_KEY ontbreekt bij Render.' });
  }

  const { rows: boekingRows } = await db.query(
    `SELECT b.id, k.id AS klant_id, k.naam AS klant_naam, k.email AS klant_email, k.adres AS klant_adres,
            k.postcode AS klant_postcode, k.gemeente AS klant_gemeente, k.eenvoudigfactureren_klant_id
     FROM boekingen b JOIN klanten k ON k.id = b.klant_id WHERE b.id = $1`,
    [req.params.id]
  );
  const boeking = boekingRows[0];
  if (!boeking) return res.status(404).json({ fout: 'Boeking niet gevonden' });

  const { rows: producten } = await db.query(
    `SELECT p.naam, bp.aantal, bp.prijs FROM boeking_producten bp JOIN producten p ON p.id = bp.product_id WHERE bp.boeking_id = $1 ORDER BY p.naam`,
    [req.params.id]
  );
  if (!producten.length) return res.status(400).json({ fout: 'Deze boeking heeft geen producten om te factureren' });

  const prijstabel = await berekenPrijstabel(req.params.id);
  const regels = producten.map((p) => ({
    omschrijving: p.naam,
    aantal: Number(p.aantal) || 1,
    bedrag_incl_btw: Number(p.prijs),
  }));
  if (prijstabel.transportkost) {
    regels.push({ omschrijving: 'Transportkost', aantal: 1, bedrag_incl_btw: prijstabel.transportkost });
  }
  if (prijstabel.toeslag_korting) {
    regels.push({ omschrijving: prijstabel.toeslag_korting > 0 ? 'Toeslag' : 'Korting', aantal: 1, bedrag_incl_btw: prijstabel.toeslag_korting });
  }

  try {
    const klantId = await efZorgVoorKlant(db, {
      id: boeking.klant_id,
      naam: boeking.klant_naam,
      email: boeking.klant_email,
      adres: boeking.klant_adres,
      postcode: boeking.klant_postcode,
      gemeente: boeking.klant_gemeente,
      eenvoudigfactureren_klant_id: boeking.eenvoudigfactureren_klant_id,
    });

    const notitie = `Belair-Fun boeking ${req.params.id.slice(0, 8)}`;
    const resultaat = soort === 'betaalverzoek'
      ? await efMaakBetaalverzoek(klantId, regels, notitie)
      : await efMaakFactuur(klantId, regels, notitie);

    if (resultaat.url) {
      await db.query('UPDATE boekingen SET eenvoudigfactureren_laatste_url = $1 WHERE id = $2', [resultaat.url, req.params.id]);
    }
    await db.query(
      `INSERT INTO communicatie (boeking_id, type, richting, onderwerp, inhoud) VALUES ($1, 'notitie', 'intern', $2, $3)`,
      [req.params.id, `${soort === 'betaalverzoek' ? 'Betaalverzoek' : 'Factuur'} aangemaakt in EenvoudigFactureren`, resultaat.url || `id: ${resultaat.id || '?'}`]
    );

    res.json({ url: resultaat.url, id: resultaat.id, viaFallback: !!resultaat.viaFallback });
  } catch (err) {
    res.status(502).json({ fout: err.message });
  }
}));

// Gedeelde filter (status/periode/klant) en basisquery voor het boekingenoverzicht —
// gebruikt door zowel de lijst (JSON) als de export (CSV), zodat die twee altijd
// exact dezelfde selectie tonen.
function bouwBoekingenFilter(query) {
  const { status, vanaf, tot, klant_id, open_saldo, zoek, product_id } = query;
  const condities = [];
  const params = [];
  if (status) {
    params.push(status);
    condities.push(`b.status = $${params.length}`);
  }
  if (product_id) {
    params.push(product_id);
    condities.push(`EXISTS (SELECT 1 FROM boeking_producten bp_filter WHERE bp_filter.boeking_id = b.id AND bp_filter.product_id = $${params.length})`);
  }
  // Een zoekterm overstijgt de gekozen periode — Jonas typt een naam/adres om
  // ÉÉN specifieke boeking terug te vinden, ongeacht of die in het verleden ligt
  // of buiten de actieve snelfilter valt (bv. "Alles" toont vanaf vandaag, maar
  // een klant opzoeken moet ook een oudere boeking nog kunnen tonen).
  const heeftZoekterm = zoek && zoek.trim();
  if (vanaf && !heeftZoekterm) {
    params.push(vanaf);
    condities.push(`b.gewenste_datum_einde >= $${params.length}`);
  }
  if (tot && !heeftZoekterm) {
    params.push(tot);
    condities.push(`b.gewenste_datum_start <= $${params.length}`);
  }
  if (klant_id) {
    params.push(klant_id);
    condities.push(`b.klant_id = $${params.length}`);
  }
  // Zoeken op klantnaam of adres (leveringsadres, of bij ontstentenis het adres
  // van de klant zelf) — één tekstveld, ongeacht hoofd-/kleine letters.
  if (heeftZoekterm) {
    params.push(`%${zoek.trim()}%`);
    const i = params.length;
    condities.push(`(k.naam ILIKE $${i} OR b.leveringsadres ILIKE $${i} OR k.adres ILIKE $${i} OR k.gemeente ILIKE $${i} OR k.postcode ILIKE $${i})`);
  }
  // "Nog te betalen": onafhankelijk van de status of gekozen periode — zowel
  // toekomstige als reeds verlopen boekingen met een openstaand saldo. Let op:
  // dit is een benadering op basis van het productensubtotaal (zoals ook in de
  // "Waarde"-kolom/CSV-export), zonder transportkost/toeslag-korting mee te
  // rekenen — dat vergt de volledige berekenPrijstabel()-logica per boeking,
  // wat hier te duur zou zijn voor een overzichtslijst.
  if (open_saldo) {
    condities.push(`COALESCE(bp_totaal.waarde, 0) - COALESCE(bet.betaald_bedrag, 0) > 0.01`);
  }
  const where = condities.length ? `WHERE ${condities.join(' AND ')}` : '';
  return { where, params };
}

const BOEKINGEN_OVERZICHT_SELECT = `
  SELECT b.*, k.naam AS klant_naam, k.telefoon AS klant_telefoon,
         k.adres AS klant_adres, k.postcode AS klant_postcode, k.gemeente AS klant_gemeente,
         COALESCE(bp_totaal.waarde, 0) AS waarde,
         COALESCE(bet.betaald_bedrag, 0) AS betaling_ontvangen,
         bp_namen.producten_namen
  FROM boekingen b
  JOIN klanten k ON k.id = b.klant_id
  LEFT JOIN (
    SELECT boeking_id, SUM(prijs * aantal) AS waarde
    FROM boeking_producten GROUP BY boeking_id
  ) bp_totaal ON bp_totaal.boeking_id = b.id
  LEFT JOIN betalingen bet ON bet.boeking_id = b.id
  LEFT JOIN (
    SELECT bp.boeking_id,
           string_agg(p.naam || CASE WHEN bp.aantal > 1 THEN ' (x' || bp.aantal || ')' ELSE '' END, ', ' ORDER BY p.naam) AS producten_namen
    FROM boeking_producten bp
    JOIN producten p ON p.id = bp.product_id
    GROUP BY bp.boeking_id
  ) bp_namen ON bp_namen.boeking_id = b.id
`;

// Lijst met filters: status, datum-range, klant, zoekterm
// sortering=laatst_toegevoegd toont de meest recent aangemaakte boekingen eerst
// (i.p.v. de eerstkomende leverdatum) — handig om snel na te kijken wat er
// juist is binnengekomen/ingevoerd (bv. na een import), los van de leverdatum.
router.get('/', asyncHandler(async (req, res) => {
  const { where, params } = bouwBoekingenFilter(req.query);
  const orderBy = req.query.sortering === 'laatst_toegevoegd'
    ? 'b.aangemaakt_op DESC'
    : 'b.gewenste_datum_start ASC';
  const { rows } = await db.query(
    `${BOEKINGEN_OVERZICHT_SELECT} ${where} ORDER BY ${orderBy} LIMIT 200`,
    params
  );
  res.json(rows);
}));

// CSV-export van het (gefilterde) boekingenoverzicht — opent rechtstreeks in Excel.
// Let op: deze route moet vóór '/:id' staan, anders wordt "export.csv" als :id gezien.
function csvVeld(waarde) {
  const tekst = waarde === null || waarde === undefined ? '' : String(waarde);
  return /[";\n]/.test(tekst) ? `"${tekst.replace(/"/g, '""')}"` : tekst;
}

// Ontleedt het (vrije-tekst) leveringsadres of het klantadres in 3 kolommen:
// straat + nr, postcode, gemeente — zodat Jonas het overzicht kan sorteren/lezen
// per gemeente/straat i.p.v. één lange adrestekst. Belgische postcodes zijn
// steevast 4 cijfers, dus dat is het betrouwbaarste ankerpunt om vrije tekst
// ("Léon Bekaertlaan 32, 9880 Aalter") te splitsen.
function ontleedAdres(b) {
  if (b.leveringswijze === 'afhaling') {
    return { straat: 'Afhaling', postcode: '', gemeente: '' };
  }
  if (b.leveringsadres) {
    const match = b.leveringsadres.match(/^(.*?),?\s*(\d{4})\s+(.+)$/);
    if (match) {
      return { straat: match[1].trim(), postcode: match[2], gemeente: match[3].trim() };
    }
    return { straat: b.leveringsadres, postcode: '', gemeente: '' };
  }
  return {
    straat: b.klant_adres || '—',
    postcode: b.klant_postcode || '',
    gemeente: b.klant_gemeente || '',
  };
}

router.get('/export.csv', asyncHandler(async (req, res) => {
  const { where, params } = bouwBoekingenFilter(req.query);
  const { rows } = await db.query(
    `${BOEKINGEN_OVERZICHT_SELECT} ${where} ORDER BY b.gewenste_datum_start ASC`,
    params
  );

  const kolommen = ['Datum start', 'Datum einde', 'Product(en)', 'Straat + nr', 'Postcode', 'Gemeente', 'Klant', 'Telefoon', 'Status', 'Waarde', 'Betaald', 'Openstaand'];
  const regels = [kolommen.join(';')];
  for (const b of rows) {
    const adres = ontleedAdres(b);
    const waarde = Number(b.waarde) || 0;
    const betaald = Number(b.betaling_ontvangen) || 0;
    const naarBedrag = (n) => String(Math.round(n));
    regels.push([
      b.gewenste_datum_start, b.gewenste_datum_einde, b.producten_namen || '',
      adres.straat, adres.postcode, adres.gemeente,
      b.klant_naam, b.klant_telefoon || '', b.status,
      naarBedrag(waarde), naarBedrag(betaald), naarBedrag(waarde - betaald),
    ].map(csvVeld).join(';'));
  }
  // BOM vooraan zodat Excel het bestand herkent als UTF-8 (anders lopen accenten fout).
  const csv = '﻿' + regels.join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="belair-boekingen.csv"`);
  res.send(csv);
}));

// Berekent de prijstabel (producten, levering, toeslag/korting, totaal, btw, betaald, saldo)
// voor één boeking. Wordt gebruikt in het dossier én bij het registreren van betalingen.
const BTW_PERCENTAGE = 21; // prijzen worden verondersteld inclusief BTW te zijn

async function berekenPrijstabel(boekingId) {
  const { rows: boekingRows } = await db.query(
    'SELECT transportkost, toeslag_korting, toeslag_korting_type FROM boekingen WHERE id = $1',
    [boekingId]
  );
  const boeking = boekingRows[0] || {};

  const { rows: prodRows } = await db.query(
    'SELECT COALESCE(SUM(prijs * aantal), 0) AS subtotaal FROM boeking_producten WHERE boeking_id = $1',
    [boekingId]
  );
  const subtotaalProducten = Number(prodRows[0].subtotaal) || 0;
  const transportkost = Number(boeking.transportkost) || 0;
  const toeslagKortingType = boeking.toeslag_korting_type || 'bedrag';
  const toeslagKortingWaarde = Number(boeking.toeslag_korting) || 0;
  // Een percentage wordt toegepast op het productensubtotaal (niet op de
  // transportkost) — een vast bedrag telt zoals voorheen rechtstreeks mee.
  const toeslagKorting = toeslagKortingType === 'percentage'
    ? Math.round(subtotaalProducten * (toeslagKortingWaarde / 100) * 100) / 100
    : toeslagKortingWaarde;
  const totaal = subtotaalProducten + transportkost + toeslagKorting;
  const btwBedrag = Math.round(((totaal * BTW_PERCENTAGE) / (100 + BTW_PERCENTAGE)) * 100) / 100;

  const { rows: betaaldRows } = await db.query(
    'SELECT COALESCE(SUM(bedrag), 0) AS betaald FROM betaling_transacties WHERE boeking_id = $1',
    [boekingId]
  );
  const betaaldBedrag = Number(betaaldRows[0].betaald) || 0;
  const saldoOpenstaand = Math.round((totaal - betaaldBedrag) * 100) / 100;

  return {
    subtotaal_producten: subtotaalProducten,
    transportkost,
    toeslag_korting: toeslagKorting,
    toeslag_korting_waarde: toeslagKortingWaarde,
    toeslag_korting_type: toeslagKortingType,
    totaal,
    btw_percentage: BTW_PERCENTAGE,
    btw_bedrag: btwBedrag,
    betaald_bedrag: betaaldBedrag,
    saldo_openstaand: saldoOpenstaand,
  };
}

// Volledig adres van een boeking samenstellen (plaatsingsadres, of anders dat van de klant).
function bepaalVolledigAdres(boeking) {
  return boeking.leveringsadres
    || [boeking.klant_adres, [boeking.klant_postcode, boeking.klant_gemeente].filter(Boolean).join(' ')]
      .filter(Boolean).join(', ');
}

// Automatisch de afstand berekenen zodra dat nog niet gebeurd is voor deze boeking.
// Resultaat wordt opgeslagen zodat dit maar één keer per boeking gebeurt (spaarzaam
// met de gratis Google-quota). Faalt dit (geen sleutel, adres niet gevonden, ...),
// dan blijft het dossier gewoon werken en kan de afstand nog manueel ingevuld worden.
//
// Let op: dit vult NIET automatisch de (officiële) transportkost in — dat gebeurt
// pas nadat Jonas de voorgestelde transportkost expliciet bevestigt, zodat de
// prijstabel/het totaal nooit een bedrag toont dat hij niet zelf heeft goedgekeurd.
async function zorgVoorAutomatischeAfstand(boeking) {
  if (boeking.afstand_km != null) return boeking;
  if (!process.env.GOOGLE_MAPS_API_KEY) return boeking;

  const adres = bepaalVolledigAdres(boeking);
  if (!adres) return boeking;

  try {
    const afstandKm = await berekenAfstandKm(adres);
    const { rows } = await db.query(
      'UPDATE boekingen SET afstand_km = $1, bijgewerkt_op = now() WHERE id = $2 RETURNING *',
      [afstandKm, boeking.id]
    );
    return { ...boeking, ...rows[0] };
  } catch (err) {
    console.warn(`[afstand] kon afstand niet automatisch berekenen voor boeking ${boeking.id}:`, err.message);
    return boeking;
  }
}

// Voorgestelde transportkost o.b.v. de gekende afstand — louter informatief zolang
// dit niet bevestigd is (via PUT /:id met transportkost). Pas na bevestiging telt
// dit bedrag mee in de prijstabel/het totaal.
function berekenVoorgesteldeTransportkost(boeking) {
  if (boeking.afstand_km == null) return null;
  return berekenTransportkost(boeking.afstand_km, boeking.leveringswijze);
}

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT b.*, k.naam AS klant_naam, k.email AS klant_email, k.telefoon AS klant_telefoon,
            k.adres AS klant_adres, k.postcode AS klant_postcode, k.gemeente AS klant_gemeente
     FROM boekingen b JOIN klanten k ON k.id = b.klant_id WHERE b.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ fout: 'Boeking niet gevonden' });

  const boeking = await zorgVoorAutomatischeAfstand(rows[0]);

  const { rows: producten } = await db.query(
    `SELECT bp.*, p.naam AS product_naam, p.afbeeldingen AS product_afbeeldingen, p.categorieen AS product_categorieen,
            (p.certificaat_bestandsnaam IS NOT NULL) AS product_heeft_certificaat
     FROM boeking_producten bp
     JOIN producten p ON p.id = bp.product_id WHERE bp.boeking_id = $1`,
    [req.params.id]
  );
  const { rows: historiek } = await db.query(
    'SELECT * FROM boeking_status_historiek WHERE boeking_id = $1 ORDER BY gewijzigd_op',
    [req.params.id]
  );
  const { rows: levering } = await db.query('SELECT * FROM leveringen WHERE boeking_id = $1', [req.params.id]);
  const { rows: betalingTransacties } = await db.query(
    'SELECT * FROM betaling_transacties WHERE boeking_id = $1 ORDER BY aangemaakt_op',
    [req.params.id]
  );
  const { rows: communicatie } = await db.query(
    'SELECT * FROM communicatie WHERE boeking_id = $1 ORDER BY aangemaakt_op DESC',
    [req.params.id]
  );
  const prijstabel = await berekenPrijstabel(req.params.id);

  // Foto's die de chauffeur bij plaatsing/afhaling in de crew-app nam — die
  // schrijft rechtstreeks in dezelfde databank (leveringen_fotos), dus hier
  // gewoon meelezen. Wordt best-effort ook al naar Dropbox gekopieerd door de
  // crew-app zelf op het moment van uploaden.
  const { rows: fotos } = await db.query(
    `SELECT lf.id, lf.fase, lf.naam, lf.data_url, lf.aangemaakt_op
     FROM leveringen_fotos lf
     JOIN leveringen l ON l.id = lf.leveringen_id
     WHERE l.boeking_id = $1
     ORDER BY lf.aangemaakt_op`,
    [req.params.id]
  );

  res.json({
    ...boeking,
    producten,
    historiek,
    levering: levering[0] || null,
    betaling_transacties: betalingTransacties,
    communicatie,
    fotos,
    prijstabel,
    voorgestelde_transportkost: berekenVoorgesteldeTransportkost(boeking),
  });
}));

// Controleert of alle producten van deze (al bestaande) aanvraag/boeking nog
// steeds beschikbaar zijn op de aangevraagde datum — vooral bedoeld voor de
// aanvragen-inbox: een aanvraag kan (bv. automatisch vanuit het website-formulier,
// of gewoon omdat Jonas ze nog niet meteen behandelt) een tijdje blijven liggen,
// en ondertussen kan een andere boeking hetzelfde product op diezelfde datum
// hebben geclaimd. Sluit de boeking zelf uit bij de check (anders zou ze zichzelf
// als bezetting meetellen).
router.get('/:id/beschikbaarheid', asyncHandler(async (req, res) => {
  const { rows: boekingRows } = await db.query('SELECT * FROM boekingen WHERE id = $1', [req.params.id]);
  const boeking = boekingRows[0];
  if (!boeking) return res.status(404).json({ fout: 'Boeking niet gevonden' });

  const { rows: producten } = await db.query(
    `SELECT bp.product_id, bp.aantal, p.naam AS product_naam FROM boeking_producten bp
     JOIN producten p ON p.id = bp.product_id WHERE bp.boeking_id = $1`,
    [req.params.id]
  );

  const problemen = [];
  for (const p of producten) {
    const check = await checkBeschikbaarheid(
      p.product_id, boeking.gewenste_datum_start, boeking.gewenste_datum_einde, p.aantal, req.params.id
    );
    if (!check.beschikbaar) problemen.push(`${p.product_naam}: ${check.reden}`);
  }
  res.json({ beschikbaar: problemen.length === 0, problemen });
}));

// Afstand (en transportkost-suggestie) manueel laten herberekenen — bv. na een
// adreswijziging, of als de automatische berekening niet klopte. De officiële
// transportkost (die meetelt in het totaal) wordt hier NIET aangepast — enkel
// de afstand en de bijhorende suggestie, die Jonas nog moet bevestigen.
router.post('/:id/herbereken-afstand', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT b.*, k.adres AS klant_adres, k.postcode AS klant_postcode, k.gemeente AS klant_gemeente
     FROM boekingen b JOIN klanten k ON k.id = b.klant_id WHERE b.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ fout: 'Boeking niet gevonden' });
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return res.status(400).json({ fout: 'Google Maps-sleutel is nog niet geconfigureerd' });
  }

  const adres = bepaalVolledigAdres(rows[0]);
  if (!adres) return res.status(400).json({ fout: 'Geen adres gekend voor deze boeking' });

  const afstandKm = await berekenAfstandKm(adres);
  const { rows: updated } = await db.query(
    'UPDATE boekingen SET afstand_km = $1, bijgewerkt_op = now() WHERE id = $2 RETURNING *',
    [afstandKm, req.params.id]
  );
  const prijstabel = await berekenPrijstabel(req.params.id);
  res.json({ ...updated[0], prijstabel, voorgestelde_transportkost: berekenVoorgesteldeTransportkost(updated[0]) });
}));

// Algemene velden van het dossier bewerken: opmerkingen, transportkost/toeslag/afstand,
// en (voor telefonische correcties zoals een fout adres of typfout) ook het
// plaatsingsadres, leveringswijze, ondergrond/toegankelijkheid en tijdstipvoorkeuren.
// Dit is ook de manier om een bevestigde transportkost (of toeslag/korting) weer te
// wissen: geef gewoon `null` mee voor dat veld.
router.put('/:id', asyncHandler(async (req, res) => {
  const velden = [
    'notities', 'transportkost', 'toeslag_korting', 'toeslag_korting_type', 'afstand_km',
    'leveringsadres', 'type_ondergrond', 'toegankelijkheid', 'leveringswijze',
    'voorkeur_tijdstip_levering', 'voorkeur_tijdstip_afhaling',
    'speciaal_verzoek', 'speciaal_verzoek_notitie',
    'gewenste_datum_start', 'gewenste_datum_einde',
  ];
  const updates = [];
  const params = [];
  for (const veld of velden) {
    if (req.body[veld] !== undefined) {
      params.push(req.body[veld]);
      updates.push(`${veld} = $${params.length}`);
    }
  }
  if (!updates.length) return res.status(400).json({ fout: 'Geen velden om te updaten' });

  // Als het plaatsingsadres wijzigt, is een eerder berekende afstand niet meer
  // betrouwbaar -> automatisch laten herberekenen (tenzij afstand_km zelf ook
  // expliciet in dezelfde aanvraag werd meegegeven).
  if (req.body.leveringsadres !== undefined && req.body.afstand_km === undefined) {
    updates.push('afstand_km = NULL');
  }

  // Als de periode wijzigt (bv. telefonische correctie), moet elk reeds
  // toegevoegd product nog wel beschikbaar zijn op de nieuwe datum(s) —
  // anders zou je per ongeluk kunnen dubbelboeken.
  if (req.body.gewenste_datum_start !== undefined || req.body.gewenste_datum_einde !== undefined) {
    const { rows: huidige } = await db.query('SELECT * FROM boekingen WHERE id = $1', [req.params.id]);
    if (!huidige[0]) return res.status(404).json({ fout: 'Boeking niet gevonden' });
    const nieuweStart = req.body.gewenste_datum_start !== undefined ? req.body.gewenste_datum_start : huidige[0].gewenste_datum_start;
    const nieuweEinde = req.body.gewenste_datum_einde !== undefined ? req.body.gewenste_datum_einde : huidige[0].gewenste_datum_einde;
    const { rows: producten } = await db.query('SELECT product_id, aantal FROM boeking_producten WHERE boeking_id = $1', [req.params.id]);
    for (const p of producten) {
      const check = await checkBeschikbaarheid(p.product_id, nieuweStart, nieuweEinde, p.aantal, req.params.id);
      if (!check.beschikbaar) {
        return res.status(409).json({ fout: `Niet beschikbaar op de nieuwe periode: ${check.reden}`, product_id: p.product_id });
      }
    }
  }

  params.push(req.params.id);
  const { rows } = await db.query(
    `UPDATE boekingen SET ${updates.join(', ')}, bijgewerkt_op = now() WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) return res.status(404).json({ fout: 'Boeking niet gevonden' });

  // Wanneer de periode wijzigde: de prijzen van de reeds toegevoegde producten
  // automatisch herberekenen o.b.v. het nieuwe aantal dagen (dagprijs/weekendprijs-
  // formule) — Jonas controleert dit nadien en stuurt het manueel bij waar nodig.
  if (req.body.gewenste_datum_start !== undefined || req.body.gewenste_datum_einde !== undefined) {
    const nieuweAantalDagen = berekenAantalDagen(rows[0].gewenste_datum_start, rows[0].gewenste_datum_einde);
    const { rows: productenVolledig } = await db.query(
      `SELECT bp.id AS regel_id, p.prijs, p.weekendprijs
       FROM boeking_producten bp JOIN producten p ON p.id = bp.product_id
       WHERE bp.boeking_id = $1`,
      [req.params.id]
    );
    for (const regel of productenVolledig) {
      const nieuwePrijs = berekenMeerdaagsePrijs(regel, nieuweAantalDagen);
      await db.query('UPDATE boeking_producten SET prijs = $1 WHERE id = $2', [nieuwePrijs, regel.regel_id]);
    }
  }

  const prijstabel = await berekenPrijstabel(req.params.id);
  res.json({ ...rows[0], prijstabel, voorgestelde_transportkost: berekenVoorgesteldeTransportkost(rows[0]) });
}));

// Prijs en/of aantal van één productregel manueel bijsturen (bv. na de
// automatische dagprijs/weekendprijs-suggestie, of voor een uitzondering).
router.put('/:id/producten/:regelId', asyncHandler(async (req, res) => {
  const { prijs, aantal } = req.body;
  const updates = [];
  const params = [];
  if (prijs !== undefined) { params.push(prijs); updates.push(`prijs = $${params.length}`); }
  if (aantal !== undefined) { params.push(aantal); updates.push(`aantal = $${params.length}`); }
  if (!updates.length) return res.status(400).json({ fout: 'Geen velden om te updaten' });
  params.push(req.params.regelId, req.params.id);
  const { rows } = await db.query(
    `UPDATE boeking_producten SET ${updates.join(', ')}
     WHERE id = $${params.length - 1} AND boeking_id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) return res.status(404).json({ fout: 'Productregel niet gevonden' });
  const { rows: producten } = await db.query(
    `SELECT bp.*, p.naam AS product_naam, p.afbeeldingen AS product_afbeeldingen, p.categorieen AS product_categorieen FROM boeking_producten bp
     JOIN producten p ON p.id = bp.product_id WHERE bp.boeking_id = $1`,
    [req.params.id]
  );
  const prijstabel = await berekenPrijstabel(req.params.id);
  res.json({ producten, prijstabel });
}));

// Extra product toevoegen aan een bestaande boeking (bv. telefonisch bijbesteld).
router.post('/:id/producten', asyncHandler(async (req, res) => {
  const { product_id, aantal } = req.body;
  if (!product_id) return res.status(400).json({ fout: 'product_id is verplicht' });
  const aantalNum = aantal ? Number(aantal) : 1;

  const { rows: boekingRows } = await db.query('SELECT * FROM boekingen WHERE id = $1', [req.params.id]);
  if (!boekingRows[0]) return res.status(404).json({ fout: 'Boeking niet gevonden' });
  const boeking = boekingRows[0];

  const check = await checkBeschikbaarheid(
    product_id, boeking.gewenste_datum_start, boeking.gewenste_datum_einde, aantalNum, req.params.id
  );
  if (!check.beschikbaar) {
    return res.status(409).json({ fout: `Niet beschikbaar: ${check.reden}` });
  }

  const { rows: productRows } = await db.query('SELECT prijs, weekendprijs FROM producten WHERE id = $1', [product_id]);
  if (!productRows[0]) return res.status(404).json({ fout: 'Product niet gevonden' });

  // Automatisch voorstel o.b.v. dagprijs/weekendprijs en het aantal dagen van de
  // huidige periode — Jonas kan dit nadien nog manueel bijsturen per productregel.
  const aantalDagen = berekenAantalDagen(boeking.gewenste_datum_start, boeking.gewenste_datum_einde);
  const prijs = req.body.prijs !== undefined ? req.body.prijs : berekenMeerdaagsePrijs(productRows[0], aantalDagen);

  await db.query(
    'INSERT INTO boeking_producten (boeking_id, product_id, aantal, prijs) VALUES ($1, $2, $3, $4)',
    [req.params.id, product_id, aantalNum, prijs]
  );

  const { rows: producten } = await db.query(
    `SELECT bp.*, p.naam AS product_naam, p.afbeeldingen AS product_afbeeldingen, p.categorieen AS product_categorieen FROM boeking_producten bp
     JOIN producten p ON p.id = bp.product_id WHERE bp.boeking_id = $1`,
    [req.params.id]
  );
  const prijstabel = await berekenPrijstabel(req.params.id);
  res.status(201).json({ producten, prijstabel });
}));

// Eén productregel uit een boeking verwijderen (bv. verkeerd toegevoegd).
router.delete('/:id/producten/:regelId', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'DELETE FROM boeking_producten WHERE id = $1 AND boeking_id = $2 RETURNING id',
    [req.params.regelId, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ fout: 'Productregel niet gevonden' });

  const { rows: producten } = await db.query(
    `SELECT bp.*, p.naam AS product_naam, p.afbeeldingen AS product_afbeeldingen, p.categorieen AS product_categorieen FROM boeking_producten bp
     JOIN producten p ON p.id = bp.product_id WHERE bp.boeking_id = $1`,
    [req.params.id]
  );
  const prijstabel = await berekenPrijstabel(req.params.id);
  res.json({ producten, prijstabel });
}));

// Boeking volledig verwijderen (bv. een dubbele of foutieve aanvraag). Alle
// gekoppelde gegevens (producten, historiek, betalingen, communicatie, levering)
// worden mee verwijderd via ON DELETE CASCADE — dit kan niet ongedaan gemaakt worden.
router.delete('/:id', asyncHandler(async (req, res) => {
  const { rows } = await db.query('DELETE FROM boekingen WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ fout: 'Boeking niet gevonden' });
  res.status(204).end();
}));

// Betaling registreren (telt op bij eerder ontvangen bedragen -> saldo wordt herberekend)
router.post('/:id/betaling', asyncHandler(async (req, res) => {
  const { bedrag, opmerking } = req.body;
  const bedragNum = Number(bedrag);
  if (!bedragNum || bedragNum <= 0) {
    return res.status(400).json({ fout: 'Geef een geldig positief bedrag op' });
  }
  const { rows: boekingRows } = await db.query('SELECT id FROM boekingen WHERE id = $1', [req.params.id]);
  if (!boekingRows[0]) return res.status(404).json({ fout: 'Boeking niet gevonden' });

  await db.query(
    'INSERT INTO betaling_transacties (boeking_id, bedrag, opmerking) VALUES ($1, $2, $3)',
    [req.params.id, bedragNum, opmerking || null]
  );

  const prijstabel = await berekenPrijstabel(req.params.id);

  // De 'betalingen'-rij (bestaand overzichtsrecord) mee synchroniseren, zodat
  // bestaande rapportages die tabel raadplegen up-to-date blijven.
  const betaalstatus = prijstabel.saldo_openstaand <= 0
    ? 'volledig'
    : (prijstabel.betaald_bedrag > 0 ? 'deels' : 'open');
  await db.query(
    `INSERT INTO betalingen (boeking_id, bedrag, betaald_bedrag, betaalstatus)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (boeking_id) DO UPDATE
       SET bedrag = EXCLUDED.bedrag, betaald_bedrag = EXCLUDED.betaald_bedrag,
           betaalstatus = EXCLUDED.betaalstatus, bijgewerkt_op = now()`,
    [req.params.id, prijstabel.totaal, prijstabel.betaald_bedrag, betaalstatus]
  );

  res.status(201).json({ prijstabel });
}));

// Een eerder geregistreerde betaling weer verwijderen (bv. foutief ingegeven bedrag).
// Het saldo/de prijstabel wordt meteen herberekend.
router.delete('/:id/betaling/:betalingId', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'DELETE FROM betaling_transacties WHERE id = $1 AND boeking_id = $2 RETURNING *',
    [req.params.betalingId, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ fout: 'Betaling niet gevonden' });

  const prijstabel = await berekenPrijstabel(req.params.id);

  const betaalstatus = prijstabel.saldo_openstaand <= 0
    ? 'volledig'
    : (prijstabel.betaald_bedrag > 0 ? 'deels' : 'open');
  await db.query(
    `INSERT INTO betalingen (boeking_id, bedrag, betaald_bedrag, betaalstatus)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (boeking_id) DO UPDATE
       SET bedrag = EXCLUDED.bedrag, betaald_bedrag = EXCLUDED.betaald_bedrag,
           betaalstatus = EXCLUDED.betaalstatus, bijgewerkt_op = now()`,
    [req.params.id, prijstabel.totaal, prijstabel.betaald_bedrag, betaalstatus]
  );

  res.json({ prijstabel });
}));

// Communicatie loggen (mail/telefoon/sms/notitie) bij een boeking
router.get('/:id/communicatie', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM communicatie WHERE boeking_id = $1 ORDER BY aangemaakt_op DESC',
    [req.params.id]
  );
  res.json(rows);
}));

router.post('/:id/communicatie', asyncHandler(async (req, res) => {
  const { type, richting, onderwerp, inhoud } = req.body;
  const { rows } = await db.query(
    `INSERT INTO communicatie (boeking_id, type, richting, onderwerp, inhoud)
     VALUES ($1, COALESCE($2, 'notitie'), COALESCE($3, 'intern'), $4, $5) RETURNING *`,
    [req.params.id, type, richting, onderwerp || null, inhoud || null]
  );
  res.status(201).json(rows[0]);
}));

// Nieuwe aanvraag/boeking aanmaken (manueel door Jonas, of later via website)
router.post('/', asyncHandler(async (req, res) => {
  const {
    klant_id, producten, gewenste_datum_start, gewenste_datum_einde,
    leveringswijze, leveringsadres, adres_idem_klant, type_ondergrond, toegankelijkheid,
    voorkeur_tijdstip_levering, voorkeur_tijdstip_afhaling,
    huurvoorwaarden_geaccepteerd, notities, bron,
  } = req.body;

  if (!klant_id || !producten || !producten.length || !gewenste_datum_start) {
    return res.status(400).json({ fout: 'klant_id, producten en gewenste_datum_start zijn verplicht' });
  }
  const datumEinde = gewenste_datum_einde || gewenste_datum_start;

  // "Plaatsingsadres is hetzelfde als het adres van de klant" -> adres van de klant opzoeken
  let uiteindelijkAdres = leveringsadres || null;
  if (adres_idem_klant) {
    const { rows: klantRows } = await db.query(
      'SELECT adres, postcode, gemeente FROM klanten WHERE id = $1',
      [klant_id]
    );
    const k = klantRows[0];
    if (k) {
      uiteindelijkAdres = [k.adres, [k.postcode, k.gemeente].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ') || null;
    }
  }

  // Beschikbaarheid controleren voor elk gevraagd product
  for (const p of producten) {
    const check = await checkBeschikbaarheid(p.product_id, gewenste_datum_start, datumEinde, p.aantal || 1);
    if (!check.beschikbaar) {
      return res.status(409).json({ fout: `Niet beschikbaar: ${check.reden}`, product_id: p.product_id });
    }
  }

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
       VALUES ($1, $2, $3, COALESCE($4, 'levering'), $5, $6, $7, $8, $9, $10, CASE WHEN $10 THEN now() ELSE NULL END, $11, COALESCE($12, 'manueel'))
       RETURNING *`,
      [
        klant_id, gewenste_datum_start, datumEinde,
        leveringswijze, uiteindelijkAdres, type_ondergrond, toegankelijkheid,
        voorkeur_tijdstip_levering, voorkeur_tijdstip_afhaling,
        huurvoorwaarden_geaccepteerd || false,
        notities, bron,
      ]
    );
    const boeking = boekingRows[0];
    const aantalDagen = berekenAantalDagen(boeking.gewenste_datum_start, boeking.gewenste_datum_einde);

    for (const p of producten) {
      const { rows: productRows } = await client.query('SELECT prijs, weekendprijs FROM producten WHERE id = $1', [p.product_id]);
      // Automatisch voorstel o.b.v. dagprijs/weekendprijs en het aantal dagen — een
      // expliciet meegegeven prijs (bv. vanuit de automatische website-omzetting) wint.
      const prijs = p.prijs !== undefined ? p.prijs : berekenMeerdaagsePrijs(productRows[0] || {}, aantalDagen);
      await client.query(
        'INSERT INTO boeking_producten (boeking_id, product_id, aantal, prijs) VALUES ($1, $2, $3, $4)',
        [boeking.id, p.product_id, p.aantal || 1, prijs]
      );
    }

    await client.query(
      'INSERT INTO boeking_status_historiek (boeking_id, van_status, naar_status) VALUES ($1, NULL, $2)',
      [boeking.id, 'nieuw']
    );

    await client.query('COMMIT');
    res.status(201).json(boeking);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Status wijzigen (accepteren/weigeren/inplannen/...)
router.post('/:id/status', asyncHandler(async (req, res) => {
  const { status: nieuweStatus, opmerking } = req.body;
  const { rows } = await db.query('SELECT status FROM boekingen WHERE id = $1', [req.params.id]);
  const boeking = rows[0];
  if (!boeking) return res.status(404).json({ fout: 'Boeking niet gevonden' });

  // Jonas moet de status ten allen tijde vrij kunnen aanpassen, ook een stap
  // overslaan (bv. voor een vaste klant meteen van "bevestigd" naar "klaar voor
  // levering" gaan zonder het betaalverzoek te doorlopen). TOEGELATEN_OVERGANGEN
  // hierboven blijft enkel de leidraad voor de voorgestelde snelknoppen in de UI,
  // geen harde blokkade meer hier. Wél nog controleren dat het een bestaande,
  // geldige status is — anders krijgt Jonas een duidelijke foutmelding i.p.v.
  // een generieke DB-fout van de CHECK-constraint.
  if (!Object.prototype.hasOwnProperty.call(TOEGELATEN_OVERGANGEN, nieuweStatus)) {
    return res.status(400).json({ fout: `Onbekende status: '${nieuweStatus}'` });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE boekingen SET status = $1, bijgewerkt_op = now(),
         weigeringsreden = CASE WHEN $1 = 'geweigerd' THEN $2 ELSE weigeringsreden END
       WHERE id = $3`,
      [nieuweStatus, opmerking || null, req.params.id]
    );
    await client.query(
      'INSERT INTO boeking_status_historiek (boeking_id, van_status, naar_status, opmerking) VALUES ($1, $2, $3, $4)',
      [req.params.id, boeking.status, nieuweStatus, opmerking || null]
    );

    // Bij acceptatie -> automatisch een leveringsrecord aanmaken (koppeling met leveringen-app)
    if (nieuweStatus === 'geaccepteerd') {
      await client.query(
        `INSERT INTO leveringen (boeking_id) VALUES ($1)
         ON CONFLICT (boeking_id) DO NOTHING`,
        [req.params.id]
      );
    }

    // Bij "Gefactureerd" of "Voldaan manueel" het eventueel nog openstaand
    // saldo automatisch als betaald registreren (zie STATUSSEN_MET_...
    // hierboven) — Jonas hoeft dan zelf geen aparte betaling meer in te geven.
    if (STATUSSEN_MET_AUTOMATISCHE_VOLLEDIGE_BETALING.includes(nieuweStatus)) {
      const prijstabel = await berekenPrijstabel(req.params.id);
      if (prijstabel.saldo_openstaand > 0.01) {
        const statusLabel = nieuweStatus === 'gefactureerd' ? 'Gefactureerd' : 'Voldaan manueel';
        await client.query(
          'INSERT INTO betaling_transacties (boeking_id, bedrag, opmerking) VALUES ($1, $2, $3)',
          [req.params.id, prijstabel.saldo_openstaand, `Automatisch volledig betaald gezet bij status "${statusLabel}"`]
        );
        await client.query(
          `INSERT INTO betalingen (boeking_id, bedrag, betaald_bedrag, betaalstatus)
           VALUES ($1, $2, $3, 'volledig')
           ON CONFLICT (boeking_id) DO UPDATE
             SET bedrag = EXCLUDED.bedrag, betaald_bedrag = EXCLUDED.betaald_bedrag,
                 betaalstatus = EXCLUDED.betaalstatus, bijgewerkt_op = now()`,
          [req.params.id, prijstabel.totaal, prijstabel.totaal]
        );
      }
    }

    await client.query('COMMIT');
    const { rows: updated } = await db.query('SELECT * FROM boekingen WHERE id = $1', [req.params.id]);
    res.json(updated[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

module.exports = router;
