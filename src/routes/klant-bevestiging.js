// Publieke (NIET ingelogde) link waarmee een klant zijn/haar aanvraag
// rechtstreeks kan bevestigen door op de knop in de "Aanvraag goed
// ontvangen"-mail te klikken — i.p.v. te moeten ANTWOORDEN op die mail, wat
// Jonas dan zelf moest lezen en manueel verwerken (status wijzigen in het
// dossier). Zie migratie 034 voor de token-kolom, migratie 035 voor de eigen
// mailrol, en utils/mailTemplates.js voor de {{bevestig_link}}/
// {{bevestig_knop}}-plaatshouders die deze URL in de mail zelf invullen.
//
// Bewust GEEN vereistIngelogd hier (net als routes/webinzendingen.js) — de
// klant is nooit ingelogd. De niet-raadbare token in de URL is de enige
// bescherming, vandaar dat elke boeking z'n EIGEN token heeft i.p.v. bv. het
// (makkelijk op te sommen) boekingnummer zelf te gebruiken.
const express = require('express');
const db = require('../db');
const { asyncHandler } = require('../utils/asyncHandler');
const { verstuurMail } = require('../utils/mailer');
const { berekenPrijstabel } = require('../utils/prijstabel');
const boekingenRouter = require('./boekingen');

const router = express.Router();

// Statussen waarin een aanvraag nog "open staat" voor bevestiging door de
// klant. Staat de boeking al verder (bv. al bevestigd, of net geweigerd),
// dan doet de link niets meer — dat voorkomt dat een oude e-mail nog een
// allang afgehandeld dossier terug zou kunnen opentrekken.
const BEVESTIGBARE_STATUSSEN = ['nieuw', 'in_behandeling'];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeHtml(tekst) {
  return String(tekst == null ? '' : tekst)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function paginaHtml(titel, boodschap, kleur, extraHtml) {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(titel)} — Belair-Fun</title>
<style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f7f7f8;color:#1e1e22;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;}
  .kaart{max-width:440px;background:#fff;border:1px solid #e2e2e6;border-radius:14px;padding:32px 28px;text-align:center;}
  h1{font-size:1.3rem;margin:0 0 12px;color:${kleur || '#e8631e'};}
  p{color:#444;line-height:1.5;margin:0;}
  button.bevestig-knop{margin-top:22px;background:#e8631e;color:#fff;border:none;padding:14px 30px;border-radius:8px;font-weight:600;font-size:16px;cursor:pointer;}
  button.bevestig-knop:active{opacity:0.85;}
</style>
</head>
<body>
  <div class="kaart">
    <h1>${escapeHtml(titel)}</h1>
    <p>${escapeHtml(boodschap)}</p>
    ${extraHtml || ''}
  </div>
</body>
</html>`;
}

const PAGINA_LINK_ONGELDIG = paginaHtml('Link niet gevonden', 'Deze bevestigingslink is ongeldig of verlopen. Neem contact op met Belair-Fun als u vragen heeft.', '#c23f38');
const PAGINA_AL_BEVESTIGD = paginaHtml('Al bevestigd', 'Deze aanvraag was al bevestigd — er is niets meer nodig van uw kant. Belair-Fun neemt contact op voor de verdere afhandeling.');
const PAGINA_NIET_MEER_OPEN = paginaHtml('Kan niet meer bevestigd worden', 'Deze aanvraag staat niet meer open voor bevestiging via deze link. Neem contact op met Belair-Fun als u vragen heeft.', '#c23f38');
const PAGINA_ONVERWACHTE_FOUT = paginaHtml('Even iets misgegaan', 'Er ging iets mis bij het verwerken van uw bevestiging. Neem gerust contact op met Belair-Fun — of probeer de link straks nog eens.', '#c23f38');

// Waarom de link zelf (GET) NIET meteen bevestigt, en pas de knop hieronder
// (via een POST) dat effectief doet: veel mailproviders/bedrijfs-mailfilters
// (Microsoft Defender "Safe Links", Proofpoint, Mimecast, ...) openen elke
// link in een binnenkomende e-mail automatisch zelf even, om die vooraf op
// phishing/malware te scannen — nog vóór de klant de mail überhaupt geopend
// heeft. Deed de GET zelf al de bevestiging (zoals voorheen), dan verbruikte
// zo'n scanner de link stilletjes vóór de klant er ooit op klikte: de klant
// zag dan enkel nog de "Al bevestigd"-pagina zonder zelf iets aangeklikt te
// hebben, wat voor hen aanvoelt/lijkt alsof de knop "niet werkt". Een gewone
// GET (zoals een scanner doet) heeft nu geen effect meer — enkel het klikken
// op de knop hieronder (een echte, door de klant zelf ingediende POST) telt.
function paginaMetKnop(actieUrl) {
  return paginaHtml(
    'Bevestig uw reservatie',
    'Klik op de knop hieronder om uw aanvraag te bevestigen.',
    null,
    `<form method="POST" action="${actieUrl}">
      <button type="submit" class="bevestig-knop">✓ Ik bevestig mijn reservatie</button>
    </form>`
  );
}

// Stuurt automatisch de (in Instellingen aan de rol 'klant_zelfbevestiging'
// gekoppelde) e-mailtemplate naar de klant, en logt dat net als een manuele
// template-mail bij Communicatie. Is er geen template aan die rol gekoppeld,
// dan gebeurt er hier gewoon niets — de bevestiging zelf (statuswijziging)
// blijft sowieso al gelden, ongeacht of deze mail lukt. Bewust een EIGEN rol
// (niet 'reservatie_bevestiging', dat is knop 3 in het dossier voor de
// ECHTE, latere bevestiging na inplannen+betaalverzoek — dat zou de klant
// dan twee keer een tegenstrijdige "definitief bevestigd"-mail sturen).
async function stuurAutomatischeBevestigingsmail(boekingId) {
  const { rows: templateRows } = await db.query(
    `SELECT id FROM mail_templates WHERE rol = 'klant_zelfbevestiging' LIMIT 1`
  );
  if (!templateRows[0]) return { verstuurd: false, reden: 'Geen template gekoppeld aan rol "klant_zelfbevestiging" (zie Instellingen)' };

  const resultaat = await boekingenRouter.haalIngevuldeTemplateOp(boekingId, templateRows[0].id, null);
  if (resultaat.fout || !resultaat.boeking.klant_email) {
    return { verstuurd: false, reden: resultaat.fout || 'Klant heeft geen e-mailadres bekend' };
  }
  await verstuurMail({ naar: resultaat.boeking.klant_email, onderwerp: resultaat.onderwerp, html: resultaat.inhoud });
  await db.query(
    `INSERT INTO communicatie (boeking_id, type, richting, onderwerp, inhoud) VALUES ($1, 'email', 'uitgaand', $2, $3)`,
    [boekingId, resultaat.onderwerp, resultaat.inhoud]
  );
  return { verstuurd: true };
}

// Kort seintje naar Jonas zelf (zijn eigen mailadres, AZURE_SENDER_EMAIL) dat
// een klant zopas zelf bevestigd heeft — vroeger zag hij dit vanzelf doordat
// de klant op de mail antwoordde (kwam toe in zijn eigen postvak); nu de
// klant in plaats daarvan op een knop klikt, zou hij het anders kunnen missen.
// Mag NOOIT de bevestiging zelf (hierboven al gecommit) doen mislukken —
// vandaar de try/catch rond de HELE functie, niet enkel rond verstuurMail.
async function stuurSeintjeNaarJonas(boeking) {
  try {
    const afzender = process.env.AZURE_SENDER_EMAIL;
    if (!afzender) return; // geen Microsoft 365-koppeling ingesteld — gewoon overslaan
    const prijstabel = await berekenPrijstabel(boeking.id);
    const klantNaamVeilig = escapeHtml(boeking.klant_naam);
    await verstuurMail({
      naar: afzender,
      onderwerp: `Klant bevestigde zelf: ${boeking.klant_naam}`,
      html: `<p>${klantNaamVeilig} heeft zonet zelf de aanvraag bevestigd via de knop in de e-mail.</p>
             <p>Openstaand saldo: € ${Number(prijstabel.saldo_openstaand || 0).toFixed(2).replace('.', ',')}.</p>
             <p>Status staat nu op "Geaccepteerd" — vergeet het betaalverzoek niet te versturen vanuit het dossier.</p>`,
    });
  } catch (err) {
    console.error('Seintje naar Jonas (klant-zelfbevestiging) mislukt:', err);
  }
}

// Zoekt de boeking op en levert de standaardpagina op als de link zelf al
// niet (meer) geldig/bruikbaar is (foute UUID, foute token, al bevestigd, of
// de status staat het niet meer toe) — gedeeld door zowel GET (enkel tonen)
// als POST (effectief bevestigen) hieronder, want beide moeten exact dezelfde
// checks doen.
async function haalBevestigbareBoekingOp(req) {
  if (!UUID_REGEX.test(req.params.boekingId) || !UUID_REGEX.test(req.params.token)) {
    return { fout: PAGINA_LINK_ONGELDIG, status: 404 };
  }
  const { rows } = await db.query(
    `SELECT b.*, k.naam AS klant_naam, k.email AS klant_email
     FROM boekingen b JOIN klanten k ON k.id = b.klant_id
     WHERE b.id = $1`,
    [req.params.boekingId]
  );
  const boeking = rows[0];
  if (!boeking || boeking.klant_bevestigings_token !== req.params.token) {
    return { fout: PAGINA_LINK_ONGELDIG, status: 404 };
  }
  if (boeking.klant_bevestigd_op) {
    return { fout: PAGINA_AL_BEVESTIGD, status: 200 };
  }
  if (!BEVESTIGBARE_STATUSSEN.includes(boeking.status)) {
    return { fout: PAGINA_NIET_MEER_OPEN, status: 200 };
  }
  return { boeking };
}

// Enkel TONEN — doet zelf niets aan de boeking. Bewust geen enkele
// databank-wijziging op een GET: mailproviders/bedrijfs-mailfilters
// (Microsoft Defender "Safe Links", Proofpoint, Mimecast, ...) openen elke
// link in een binnenkomende e-mail automatisch zelf al even om die vooraf op
// phishing/malware te scannen, nog vóór de klant de mail überhaupt geopend
// heeft. Bevestigde de GET zelf al (zoals voorheen), dan verbruikte zo'n
// scanner de link stilletjes vóór de klant er ooit op klikte — de klant zag
// dan enkel nog "Al bevestigd" zonder zelf iets aangeklikt te hebben, wat
// voor hen aanvoelde alsof de knop niet werkte. Nu heeft een scanner (of het
// gewoon openen van de mail) geen enkel effect meer; enkel het klikken op de
// knop hieronder (een POST, ingediend door de klant zelf) telt.
router.get('/:boekingId/:token', asyncHandler(async (req, res) => {
  try {
    const { fout, status } = await haalBevestigbareBoekingOp(req);
    if (fout) return res.status(status).send(fout);
    res.send(paginaMetKnop(`/api/klant-bevestiging/${req.params.boekingId}/${req.params.token}`));
  } catch (err) {
    console.error('Onverwachte fout bij klant-zelfbevestiging (GET):', err);
    res.status(500).send(PAGINA_ONVERWACHTE_FOUT);
  }
}));

// Effectieve bevestiging — enkel bereikbaar via de knop (een POST) op de
// pagina hierboven, nooit door de link zelf te openen.
router.post('/:boekingId/:token', asyncHandler(async (req, res) => {
  try {
    const { fout, status, boeking } = await haalBevestigbareBoekingOp(req);
    if (fout) return res.status(status).send(fout);

    // De WHERE hieronder herhaalt bewust dezelfde voorwaarden als de checks
    // hierboven: dat is de eigenlijke bescherming tegen een dubbele/gelijktijdige
    // klik (bv. twee tabbladen, of een dubbele tik op de knop) — zonder deze
    // WHERE zouden twee gelijktijdige requests allebei de eerdere
    // (niet-atomaire) checks kunnen doorstaan en dus allebei de mails
    // versturen / de historiek dubbel loggen. rowCount 0 betekent: een ANDERE
    // request (of Jonas zelf, bv. "Weigeren") was ons net vóór — dan gewoon
    // netjes "niet meer open" tonen i.p.v. alsnog de mails te versturen.
    const client = await db.getClient();
    let bijgewerkt;
    try {
      await client.query('BEGIN');
      const updateResultaat = await client.query(
        `UPDATE boekingen SET status = 'geaccepteerd', klant_bevestigd_op = now(), bijgewerkt_op = now()
         WHERE id = $1 AND klant_bevestigd_op IS NULL AND status = ANY($2::text[])`,
        [boeking.id, BEVESTIGBARE_STATUSSEN]
      );
      bijgewerkt = updateResultaat.rowCount > 0;
      if (bijgewerkt) {
        // Zelfde nevenwerking als een manuele statuswijziging naar 'geaccepteerd'
        // in het dossier (zie POST /api/boekingen/:id/status) — koppeling met de
        // leveringen-app.
        await client.query(
          `INSERT INTO leveringen (boeking_id) VALUES ($1) ON CONFLICT (boeking_id) DO NOTHING`,
          [boeking.id]
        );
        await client.query(
          `INSERT INTO boeking_status_historiek (boeking_id, van_status, naar_status, opmerking)
           VALUES ($1, $2, 'geaccepteerd', 'Klant heeft zelf bevestigd via de link in de e-mail')`,
          [boeking.id, boeking.status]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    if (!bijgewerkt) {
      // Iemand anders was net vóór ons (dubbele klik, of Jonas wijzigde de
      // status net op dat moment) — geen mails, gewoon de gepaste pagina.
      return res.send(PAGINA_NIET_MEER_OPEN);
    }

    // De bevestiging zelf staat nu vast (hierboven al gecommit) — lukt de
    // automatische mail niet, dan blijft de bevestiging toch gewoon gelden;
    // de klant krijgt sowieso de bedank-pagina. Wel loggen (i.p.v. volledig
    // stilzwijgend negeren) zodat Jonas/wij achteraf kunnen zien dat de mail
    // niet vertrokken is.
    const mailResultaat = await stuurAutomatischeBevestigingsmail(boeking.id).catch((err) => {
      console.error('Automatische bevestigingsmail (klant-zelfbevestiging) mislukt:', err);
      return { verstuurd: false, reden: err.message };
    });
    if (!mailResultaat.verstuurd) {
      console.warn('Automatische bevestigingsmail niet verstuurd:', mailResultaat.reden);
    }
    await stuurSeintjeNaarJonas(boeking);

    res.send(paginaHtml('Bedankt voor uw bevestiging!', 'Uw reservatie is bevestigd. Belair-Fun neemt binnenkort contact op voor het betaalverzoek.'));
  } catch (err) {
    // Deze publieke pagina mag NOOIT een rauwe JSON-foutmelding (met
    // Postgres-interne details) aan een niet-ingelogde bezoeker tonen — vandaar
    // deze vangnet i.p.v. door te laten vallen naar de centrale foutafhandeling
    // in server.js.
    console.error('Onverwachte fout bij klant-zelfbevestiging (POST):', err);
    res.status(500).send(PAGINA_ONVERWACHTE_FOUT);
  }
}));

module.exports = router;
