const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { checkBeschikbaarheid } = require('../utils/beschikbaarheid');
const { berekenAfstandKm, berekenTransportkost } = require('../utils/afstand');
const { asyncHandler } = require('../utils/asyncHandler');

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
  betaald_deels: ['betaald_volledig', 'gefactureerd'],
  betaald_volledig: ['gefactureerd'],
  geweigerd: [],
  gefactureerd: [],
};

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

// Gedeelde filter (status/periode/klant) en basisquery voor het boekingenoverzicht —
// gebruikt door zowel de lijst (JSON) als de export (CSV), zodat die twee altijd
// exact dezelfde selectie tonen.
function bouwBoekingenFilter(query) {
  const { status, vanaf, tot, klant_id } = query;
  const condities = [];
  const params = [];
  if (status) {
    params.push(status);
    condities.push(`b.status = $${params.length}`);
  }
  if (vanaf) {
    params.push(vanaf);
    condities.push(`b.gewenste_datum_einde >= $${params.length}`);
  }
  if (tot) {
    params.push(tot);
    condities.push(`b.gewenste_datum_start <= $${params.length}`);
  }
  if (klant_id) {
    params.push(klant_id);
    condities.push(`b.klant_id = $${params.length}`);
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

// Lijst met filters: status, datum-range, klant
router.get('/', asyncHandler(async (req, res) => {
  const { where, params } = bouwBoekingenFilter(req.query);
  const { rows } = await db.query(
    `${BOEKINGEN_OVERZICHT_SELECT} ${where} ORDER BY b.gewenste_datum_start DESC LIMIT 200`,
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
    const naarBedrag = (n) => n.toFixed(2).replace('.', ',');
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
    'SELECT transportkost, toeslag_korting FROM boekingen WHERE id = $1',
    [boekingId]
  );
  const boeking = boekingRows[0] || {};

  const { rows: prodRows } = await db.query(
    'SELECT COALESCE(SUM(prijs * aantal), 0) AS subtotaal FROM boeking_producten WHERE boeking_id = $1',
    [boekingId]
  );
  const subtotaalProducten = Number(prodRows[0].subtotaal) || 0;
  const transportkost = Number(boeking.transportkost) || 0;
  const toeslagKorting = Number(boeking.toeslag_korting) || 0;
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
    `SELECT bp.*, p.naam AS product_naam FROM boeking_producten bp
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

  res.json({
    ...boeking,
    producten,
    historiek,
    levering: levering[0] || null,
    betaling_transacties: betalingTransacties,
    communicatie,
    prijstabel,
    voorgestelde_transportkost: berekenVoorgesteldeTransportkost(boeking),
  });
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
    'notities', 'transportkost', 'toeslag_korting', 'afstand_km',
    'leveringsadres', 'type_ondergrond', 'toegankelijkheid', 'leveringswijze',
    'voorkeur_tijdstip_levering', 'voorkeur_tijdstip_afhaling',
    'speciaal_verzoek', 'speciaal_verzoek_notitie',
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

  params.push(req.params.id);
  const { rows } = await db.query(
    `UPDATE boekingen SET ${updates.join(', ')}, bijgewerkt_op = now() WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) return res.status(404).json({ fout: 'Boeking niet gevonden' });
  const prijstabel = await berekenPrijstabel(req.params.id);
  res.json({ ...rows[0], prijstabel, voorgestelde_transportkost: berekenVoorgesteldeTransportkost(rows[0]) });
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

    for (const p of producten) {
      const { rows: productRows } = await client.query('SELECT prijs FROM producten WHERE id = $1', [p.product_id]);
      const prijs = p.prijs !== undefined ? p.prijs : productRows[0]?.prijs || 0;
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

  const toegelaten = TOEGELATEN_OVERGANGEN[boeking.status] || [];
  if (!toegelaten.includes(nieuweStatus)) {
    return res.status(400).json({
      fout: `Overgang van '${boeking.status}' naar '${nieuweStatus}' is niet toegelaten`,
      toegelaten_overgangen: toegelaten,
    });
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
