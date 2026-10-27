const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { geocodeAdres, ONS_MAGAZIJN_ADRES } = require('../utils/afstand');
const { berekenPrijstabel } = require('../utils/prijstabel');
const { bepaalZekerAfhalenBoekingIds } = require('../utils/zekerAfhalen');
const { EFFECTIEVE_DATUM_SQL } = require('../utils/effectieveDatum');

const router = express.Router();
router.use(vereistIngelogd);

// Zelfde patroon als TIJDSTIP_HHMM_PATROON in routes/boekingen.js: een
// concreet kwartiertijdstip (geen lege/vrije "tussen 07:00 en 12:00"-optie).
const TIJDSTIP_HHMM_PATROON = /^([01]\d|2[0-3]):(00|15|30|45)$/;

// Statussen die op het Dashboard als geplande levering/afhaling getoond
// worden. 'nieuw' en 'in_behandeling' horen hier bewust NIET bij: dat zijn
// aanvragen die Jonas nog moet bekijken/beoordelen in de Aanvragen-inbox, en
// mogen pas elders (Dashboard, Planning, Boekingenoverzicht) verschijnen
// zodra hij ze goedkeurt/accepteert. Dit is een expliciete herziening van een
// eerdere opzet waarbij 'nieuw' hier ook al in stond — op uitdrukkelijke
// vraag van Jonas teruggedraaid.
const GEPLANDE_STATUSSEN = [
  'geaccepteerd', 'ingepland', 'bevestigd', 'betaalverzoek_verstuurd',
  'betaald_deels', 'betaald_volledig', 'gefactureerd', 'voldaan_manueel',
];

const DASHBOARD_SELECT = `
  SELECT b.id, b.status, b.leveringswijze, b.leveringsadres,
         b.gewenste_datum_start, b.gewenste_datum_einde,
         b.voorkeur_tijdstip_levering, b.voorkeur_tijdstip_afhaling,
         b.notities,
         k.id AS klant_id, k.naam AS klant_naam, k.telefoon AS klant_telefoon,
         k.adres AS klant_adres, k.postcode AS klant_postcode, k.gemeente AS klant_gemeente,
         l.leveringstijd, l.afhaaltijd, l.lat, l.lng, l.geocode_adres,
         COALESCE(l.afhaling_moet_zeker, false) AS afhaling_moet_zeker,
         COALESCE(l.leverdatum_afwijkend, false) AS leverdatum_afwijkend,
         COALESCE(l.afhaaldatum_afwijkend, false) AS afhaaldatum_afwijkend,
         l.voertuig_levering, l.voertuig_afhaling, l.volgorde_levering, l.volgorde_afhaling,
         COALESCE(l.levering_voltooid, false) AS levering_voltooid,
         COALESCE(l.afhaling_voltooid, false) AS afhaling_voltooid,
         bp_namen.producten_namen, bp_namen.eerste_product_naam, bp_namen.aantal_producten
  FROM boekingen b
  JOIN klanten k ON k.id = b.klant_id
  LEFT JOIN leveringen l ON l.boeking_id = b.id
  LEFT JOIN (
    SELECT bp.boeking_id,
           string_agg(p.naam || CASE WHEN bp.aantal > 1 THEN ' (x' || bp.aantal || ')' ELSE '' END, ', ' ORDER BY p.naam) AS producten_namen,
           (array_agg(p.naam ORDER BY p.naam))[1] AS eerste_product_naam,
           COUNT(*) AS aantal_producten
    FROM boeking_producten bp
    JOIN producten p ON p.id = bp.product_id
    GROUP BY bp.boeking_id
  ) bp_namen ON bp_namen.boeking_id = b.id
  WHERE b.status = ANY($1)
`;

// Zelfde adreslogica als bij de CSV-export/afstandsberekening in boekingen.js:
// 'afhaling' (klant haalt zelf op) heeft geen leveringsadres nodig, en anders
// valt het leveringsadres terug op het adres van de klant zelf.
function bepaalAdres(b) {
  if (b.leveringswijze === 'afhaling') return null;
  return b.leveringsadres
    || [b.klant_adres, [b.klant_postcode, b.klant_gemeente].filter(Boolean).join(' ')]
      .filter(Boolean).join(', ');
}

// Geocodeert (en cachet in de leveringen-tabel) de locatie van elke boeking met
// een leveringsadres, voor de kaart bovenaan het Dashboard. Spaarzaam met de
// Google-quota: enkel geocoderen als het adres nog niet eerder gecached is, of
// intussen gewijzigd. Faalt de geocodering (geen sleutel, adres niet gevonden),
// dan krijgt die kaart gewoon geen marker — de rest van het Dashboard blijft werken.
async function zorgVoorGeocodering(rijen) {
  if (!process.env.GOOGLE_MAPS_API_KEY) return rijen;
  for (const rij of rijen) {
    const adres = bepaalAdres(rij);
    if (!adres) continue;
    if (rij.lat != null && rij.geocode_adres === adres) continue;
    try {
      const locatie = await geocodeAdres(adres);
      await db.query(
        'UPDATE leveringen SET lat = $1, lng = $2, geocode_adres = $3 WHERE boeking_id = $4',
        [locatie.lat, locatie.lng, adres, rij.id]
      );
      rij.lat = locatie.lat;
      rij.lng = locatie.lng;
      rij.geocode_adres = adres;
    } catch (err) {
      console.warn(`[dashboard] kon adres niet geocoderen voor boeking ${rij.id}:`, err.message);
    }
  }
  return rijen;
}

// Het echte openstaande saldo per boeking erbij zetten — de status alleen
// ("Betaald (volledig)", "Gefactureerd", ...) garandeert niet dat er ook
// werkelijk niets meer open staat: Jonas kan bewust een tussenstap (bv. het
// betaalverzoek) overslaan en rechtstreeks naar "klaar voor levering"
// schakelen. Zonder dit veld toonde het Dashboard dan toch "Betaald
// (volledig)", ook met een openstaand saldo — zie weergaveStatusLabel() in
// public/js/app.js, dat hiermee nu ook op het Dashboard "(open saldo)" toont.
// Het Dashboard toont maar een handvol boekingen per dag/periode, dus de
// N+1-aanpak (3 kleine, geïndexeerde queries per boeking) is hier geen
// probleem — anders dan bv. het Boekingenoverzicht (tot 200 rijen), dat
// daarom bewust een goedkopere benadering gebruikt.
async function zorgVoorSaldo(rijen) {
  await Promise.all(rijen.map(async (rij) => {
    const prijstabel = await berekenPrijstabel(rij.id);
    rij.saldo_openstaand = prijstabel.saldo_openstaand;
  }));
  return rijen;
}

// "Zeker afhalen"-vlag op elke afhaling — enkel zinvol voor de ophalingen-
// kolom (leveringen hebben dit niet nodig). Combinatie van de automatische
// berekening (zie utils/zekerAfhalen.js) EN de manuele vlag die Jonas zelf in
// het boekingdossier kan aanzetten (afhaling_moet_zeker, al meegeselecteerd
// via DASHBOARD_SELECT) — allebei even zwaar, dus gewoon een OF.
async function zorgVoorZekerAfhalen(rijen) {
  const zekerSet = await bepaalZekerAfhalenBoekingIds(rijen.map((r) => r.id));
  rijen.forEach((r) => { r.zeker_afhalen = zekerSet.has(r.id) || !!r.afhaling_moet_zeker; });
  return rijen;
}

// In-memory cache voor de locatie van ons eigen magazijn — verandert nooit
// binnen een lopende serverinstantie, dus geen reden om dit telkens opnieuw
// op te vragen bij Google.
let magazijnLocatieCache = null;

async function haalMagazijnLocatieOp() {
  if (magazijnLocatieCache) return magazijnLocatieCache;
  if (!process.env.GOOGLE_MAPS_API_KEY) return null;
  try {
    magazijnLocatieCache = await geocodeAdres(ONS_MAGAZIJN_ADRES);
    return magazijnLocatieCache;
  } catch (err) {
    console.warn('[dashboard] kon magazijnadres niet geocoderen:', err.message);
    return null;
  }
}

// Welke dag een levering/afhaling écht telt voor — standaard de huurperiode,
// maar een bewust afwijkende leverdatum/afhaaldatum (migratie 056) weegt
// zwaarder. Zie utils/effectieveDatum.js.
const EFFECTIEVE_DATUM = EFFECTIEVE_DATUM_SQL;

// Als er op de gekozen dag niets gepland staat, toont het Dashboard i.p.v. een
// lege kolom de eerstvolgende dag waarop er wél iets is — zo blijft de kolom
// altijd nuttig, ook in een rustige periode. `type` maakt in het antwoord
// duidelijk of het om "vandaag" gaat of om zo'n eerstvolgende dag, zodat de
// pagina dat nooit door elkaar toont.
async function haalKolom(soort, datum) {
  const effDatum = EFFECTIEVE_DATUM[soort];
  const { rows } = await db.query(`${DASHBOARD_SELECT} AND ${effDatum} = $2 ORDER BY k.naam`, [GEPLANDE_STATUSSEN, datum]);
  if (rows.length) return { type: 'vandaag', datum, items: rows };

  const { rows: volgendeRows } = await db.query(
    `SELECT MIN(${effDatum}) AS datum FROM boekingen b LEFT JOIN leveringen l ON l.boeking_id = b.id
     WHERE b.status = ANY($1) AND ${effDatum} > $2`,
    [GEPLANDE_STATUSSEN, datum]
  );
  const volgendeDatum = volgendeRows[0]?.datum ? new Date(volgendeRows[0].datum).toISOString().slice(0, 10) : null;
  if (!volgendeDatum) return { type: 'vandaag', datum, items: [] };

  const { rows: volgendeItems } = await db.query(`${DASHBOARD_SELECT} AND ${effDatum} = $2 ORDER BY k.naam`, [GEPLANDE_STATUSSEN, volgendeDatum]);
  return { type: 'eerstvolgende', datum: volgendeDatum, items: volgendeItems };
}

// Voor een gekozen periode (i.p.v. één dag) — de snelfilters boven de kaart
// (Deze week / Vorige week / Vorige maand / Aangepast). Geen "eerstvolgende"-
// terugval hier: een expliciet gekozen periode die leeg is, is gewoon leeg.
async function haalBereik(soort, vanaf, tot) {
  const effDatum = EFFECTIEVE_DATUM[soort];
  const tijdKolom = soort === 'levering' ? 'l.leveringstijd' : 'l.afhaaltijd';
  const { rows } = await db.query(
    `${DASHBOARD_SELECT} AND ${effDatum} BETWEEN $2 AND $3 ORDER BY ${effDatum}, ${tijdKolom} NULLS LAST, k.naam`,
    [GEPLANDE_STATUSSEN, vanaf, tot]
  );
  return { items: rows };
}

router.get('/', asyncHandler(async (req, res) => {
  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  const vanaf = isoRegex.test(req.query.vanaf || '') ? req.query.vanaf : null;
  const tot = isoRegex.test(req.query.tot || '') ? req.query.tot : null;

  if (vanaf && tot) {
    const [levering, afhaling, magazijn] = await Promise.all([
      haalBereik('levering', vanaf, tot),
      haalBereik('afhaling', vanaf, tot),
      haalMagazijnLocatieOp(),
    ]);
    await Promise.all([
      zorgVoorGeocodering(levering.items), zorgVoorGeocodering(afhaling.items),
      zorgVoorSaldo(levering.items), zorgVoorSaldo(afhaling.items),
      zorgVoorZekerAfhalen(afhaling.items),
    ]);
    return res.json({
      vanaf,
      tot,
      leveringen: levering.items,
      leveringenType: 'bereik',
      ophalingen: afhaling.items,
      ophalingenType: 'bereik',
      magazijn: magazijn ? { adres: ONS_MAGAZIJN_ADRES, ...magazijn } : null,
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || null,
    });
  }

  const datum = isoRegex.test(req.query.datum || '')
    ? req.query.datum
    : new Date().toISOString().slice(0, 10);

  const [levering, afhaling, magazijn] = await Promise.all([
    haalKolom('levering', datum),
    haalKolom('afhaling', datum),
    haalMagazijnLocatieOp(),
  ]);

  await Promise.all([
    zorgVoorGeocodering(levering.items), zorgVoorGeocodering(afhaling.items),
    zorgVoorSaldo(levering.items), zorgVoorSaldo(afhaling.items),
    zorgVoorZekerAfhalen(afhaling.items),
  ]);

  res.json({
    datum,
    leveringen: levering.items,
    leveringenType: levering.type,
    leveringenDatum: levering.datum,
    ophalingen: afhaling.items,
    ophalingenType: afhaling.type,
    ophalingenDatum: afhaling.datum,
    magazijn: magazijn ? { adres: ONS_MAGAZIJN_ADRES, ...magazijn } : null,
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || null,
  });
}));

// Eenvoudige aanpassing van het geplande leverings-/afhaaltijdstip vanop het
// Dashboard — dit is het tijdstip dat Jonas' team effectief aanhoudt (los van
// voorkeur_tijdstip_levering/afhaling, dat is wat de klant oorspronkelijk
// vroeg). Slaat op in de leveringen-tabel, dezelfde die later gekoppeld wordt
// aan de leveringen-app, zodat dit straks meteen mee overkomt.
router.put('/:boekingId/tijdstip', asyncHandler(async (req, res) => {
  const { type, datum, tijd } = req.body;
  if (!['levering', 'afhaling'].includes(type)) {
    return res.status(400).json({ fout: 'type moet "levering" of "afhaling" zijn' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum || '') || !/^\d{2}:\d{2}$/.test(tijd || '')) {
    return res.status(400).json({ fout: 'datum en tijd zijn verplicht (datum: YYYY-MM-DD, tijd: UU:MM)' });
  }
  const kolom = type === 'levering' ? 'leveringstijd' : 'afhaaltijd';
  const vlagKolom = type === 'levering' ? 'leverdatum_afwijkend' : 'afhaaldatum_afwijkend';
  const periodeKolom = type === 'levering' ? 'gewenste_datum_start' : 'gewenste_datum_einde';
  const tijdstip = `${datum} ${tijd}`;

  // Wijkt de meegegeven datum af van de huurperiode, dan telt dit meteen ook
  // als een bewuste afwijkende leverdatum/afhaaldatum (migratie 056) — zelfde
  // vlag als PUT /:boekingId/afwijkende-datum hieronder, zodat de automatische
  // herberekening in routes/boekingen.js dit niet overschrijft. Vandaag stuurt
  // de Dashboard-tijdkiezer hier altijd gewoon de datum van de huurperiode
  // mee, dus dit blijft in de praktijk gewoon false — maar zo klopt het ook
  // als dat ooit verandert.
  const { rows: boekingRows } = await db.query(
    `SELECT to_char(${periodeKolom}, 'YYYY-MM-DD') AS periode_datum FROM boekingen WHERE id = $1`,
    [req.params.boekingId]
  );
  if (!boekingRows[0]) return res.status(404).json({ fout: 'Boeking niet gevonden' });
  const afwijkend = datum !== boekingRows[0].periode_datum;

  const { rows } = await db.query(
    `UPDATE leveringen SET ${kolom} = $1, ${vlagKolom} = $2 WHERE boeking_id = $3 RETURNING *`,
    [tijdstip, afwijkend, req.params.boekingId]
  );
  if (rows[0]) return res.json(rows[0]);

  // Zou normaal altijd al moeten bestaan (aangemaakt bij acceptatie van de
  // boeking), maar voor de zekerheid: als het record toch ontbreekt, meteen aanmaken.
  const { rows: nieuw } = await db.query(
    `INSERT INTO leveringen (boeking_id, ${kolom}, ${vlagKolom}) VALUES ($1, $2, $3) RETURNING *`,
    [req.params.boekingId, tijdstip, afwijkend]
  );
  res.status(201).json(nieuw[0]);
}));

// "Leverdatum"/"afhaaldatum" bewust laten afwijken van de huurperiode
// (gewenste_datum_start/gewenste_datum_einde — die blijft bepalen wat er
// gefactureerd wordt, zie berekenMeerdaagsePrijs in routes/boekingen.js).
// Typevoorbeeld: huurperiode "1 dag" afgesproken met de klant, maar de
// plaatsing gebeurt om logistieke redenen al een dag vroeger. Past enkel de
// DATUM aan (het uur blijft wat het al was, of het standaarduur als er nog
// niets stond) en zet leverdatum_afwijkend/afhaaldatum_afwijkend (migratie
// 056) aan, zodat routes/boekingen.js dit niet overschrijft bij een latere,
// ongerelateerde wijziging van de huurperiode of het voorkeur-tijdstip.
// `datum: null` heft de afwijking weer op: leveringstijd/afhaaltijd volgt dan
// meteen weer de huurperiode (+ voorkeur-tijdstip, indien gezet).
router.put('/:boekingId/afwijkende-datum', asyncHandler(async (req, res) => {
  const { type, datum } = req.body;
  if (!['levering', 'afhaling'].includes(type)) {
    return res.status(400).json({ fout: 'type moet "levering" of "afhaling" zijn' });
  }
  if (datum !== null && !/^\d{4}-\d{2}-\d{2}$/.test(datum || '')) {
    return res.status(400).json({ fout: 'datum moet YYYY-MM-DD zijn, of null om de afwijking op te heffen' });
  }

  const tijdKolom = type === 'levering' ? 'leveringstijd' : 'afhaaltijd';
  const vlagKolom = type === 'levering' ? 'leverdatum_afwijkend' : 'afhaaldatum_afwijkend';
  const standaardTijd = type === 'levering' ? '08:00' : '20:00';

  const { rows: huidige } = await db.query(
    `SELECT to_char(b.gewenste_datum_start, 'YYYY-MM-DD') AS datum_start,
            to_char(b.gewenste_datum_einde, 'YYYY-MM-DD') AS datum_einde,
            b.voorkeur_tijdstip_levering, b.voorkeur_tijdstip_afhaling,
            l.leveringstijd, l.afhaaltijd
     FROM boekingen b LEFT JOIN leveringen l ON l.boeking_id = b.id
     WHERE b.id = $1`,
    [req.params.boekingId]
  );
  if (!huidige[0]) return res.status(404).json({ fout: 'Boeking niet gevonden' });
  const b = huidige[0];

  let nieuweWaarde;
  let afwijkend;
  if (datum === null) {
    // Afwijking opheffen: terug naar huurperiode + voorkeur-tijdstip, exact
    // dezelfde berekening als de automatische herberekening in boekingen.js.
    const basisDatum = type === 'levering' ? b.datum_start : b.datum_einde;
    const voorkeur = type === 'levering' ? b.voorkeur_tijdstip_levering : b.voorkeur_tijdstip_afhaling;
    nieuweWaarde = TIJDSTIP_HHMM_PATROON.test(voorkeur || '') ? `${basisDatum} ${voorkeur}` : null;
    afwijkend = false;
  } else {
    const bestaandeWaarde = type === 'levering' ? b.leveringstijd : b.afhaaltijd;
    const bestaandeTijd = bestaandeWaarde ? new Date(bestaandeWaarde).toISOString().slice(11, 16) : standaardTijd;
    nieuweWaarde = `${datum} ${bestaandeTijd}`;
    afwijkend = true;
  }

  const { rows } = await db.query(
    `UPDATE leveringen SET ${tijdKolom} = $1, ${vlagKolom} = $2 WHERE boeking_id = $3 RETURNING *`,
    [nieuweWaarde, afwijkend, req.params.boekingId]
  );
  if (rows[0]) return res.json(rows[0]);

  const { rows: nieuw } = await db.query(
    `INSERT INTO leveringen (boeking_id, ${tijdKolom}, ${vlagKolom}) VALUES ($1, $2, $3) RETURNING *`,
    [req.params.boekingId, nieuweWaarde, afwijkend]
  );
  res.status(201).json(nieuw[0]);
}));

// Eenvoudig "geleverd"/"opgehaald"-vinkje vanop het Dashboard — kleurt de kaart
// groen zodra het effectief gebeurd is. Los van de boeking-status (die kan
// intussen al "betaald" zijn zonder dat er al iets geleverd is).
//
// Terug UITvinken ("was toch nog niet geleverd") moet ook de checklist in de
// leveringen-app weer openzetten — anders bleef die daar op "✓ Levering
// bevestigd" (groen, vergrendeld) staan, ook al toonde de lijst intussen weer
// "te leveren": dashboard.js zette hier voorheen ENKEL levering_voltooid/
// afhaling_voltooid terug, nooit plaatsing_bevestigd/afhaling_bevestigd (de
// aparte vlag die de app's checklist-scherm vergrendelt). Zelfde effect als
// de "Levering bewerken"/"Afhaling bewerken"-knop in de app zelf: de reeds
// ingevulde checklist (en een eventuele handtekening) blijft gewoon staan,
// enkel het scherm gaat weer open om opnieuw te bevestigen. Bij AANvinken
// vanop het Dashboard raken die velden bewust niet aan — dat forceert geen
// (ongetekende) bevestiging in de app.
router.put('/:boekingId/voltooid', asyncHandler(async (req, res) => {
  const { type, voltooid } = req.body;
  if (!['levering', 'afhaling'].includes(type) || typeof voltooid !== 'boolean') {
    return res.status(400).json({ fout: 'type ("levering"/"afhaling") en voltooid (true/false) zijn verplicht' });
  }
  const kolom = type === 'levering' ? 'levering_voltooid' : 'afhaling_voltooid';
  const kolomBevestigd = type === 'levering' ? 'plaatsing_bevestigd' : 'afhaling_bevestigd';
  const kolomBevestigdOp = type === 'levering' ? 'plaatsing_bevestigd_op' : 'afhaling_bevestigd_op';
  const heropenChecklist = voltooid === false;

  const { rows } = await db.query(
    `UPDATE leveringen
     SET ${kolom} = $1${heropenChecklist ? `, ${kolomBevestigd} = false, ${kolomBevestigdOp} = NULL` : ''}
     WHERE boeking_id = $2 RETURNING *`,
    [voltooid, req.params.boekingId]
  );
  if (rows[0]) return res.json(rows[0]);

  const { rows: nieuw } = await db.query(
    `INSERT INTO leveringen (boeking_id, ${kolom}) VALUES ($1, $2) RETURNING *`,
    [req.params.boekingId, voltooid]
  );
  res.status(201).json(nieuw[0]);
}));

// Voertuig toewijzen aan een levering of afhaling vanop het Dashboard — dezelfde
// leveringen-tabel/kolommen die later ook door de leveringen-app gebruikt
// worden, dus dit komt daar straks gewoon in mee. Levering en afhaling van
// dezelfde boeking krijgen elk hun EIGEN voertuig (bv. geleverd met de
// camionette, later opgehaald met de bus) — dus altijd op basis van "type"
// de juiste kolom bijwerken, nooit beide tegelijk.
router.put('/:boekingId/voertuig', asyncHandler(async (req, res) => {
  if (!['levering', 'afhaling'].includes(req.body.type)) {
    return res.status(400).json({ fout: 'type (levering/afhaling) is verplicht' });
  }
  const kolom = req.body.type === 'levering' ? 'voertuig_levering' : 'voertuig_afhaling';
  const waarde = (req.body.voertuig || '').trim() || null;

  const { rows } = await db.query(
    `UPDATE leveringen SET ${kolom} = $1 WHERE boeking_id = $2 RETURNING *`,
    [waarde, req.params.boekingId]
  );
  if (rows[0]) return res.json(rows[0]);

  const { rows: nieuw } = await db.query(
    `INSERT INTO leveringen (boeking_id, ${kolom}) VALUES ($1, $2) RETURNING *`,
    [req.params.boekingId, waarde]
  );
  res.status(201).json(nieuw[0]);
}));

// Manuele "moet zeker afgehaald worden"-vlag, instelbaar vanuit het
// boekingdossier zelf (Periode-blok) — los van de automatische berekening
// o.b.v. voorraad (zie utils/zekerAfhalen.js). Zelfde upsert-patroon als
// hierboven (tijdstip/voertuig): UPDATE, en enkel als er nog geen
// leveringen-rij bestaat alsnog INSERT.
router.put('/:boekingId/moet-zeker-afhalen', asyncHandler(async (req, res) => {
  if (typeof req.body.waarde !== 'boolean') {
    return res.status(400).json({ fout: 'waarde (true/false) is verplicht' });
  }
  const { rows } = await db.query(
    'UPDATE leveringen SET afhaling_moet_zeker = $1 WHERE boeking_id = $2 RETURNING *',
    [req.body.waarde, req.params.boekingId]
  );
  if (rows[0]) return res.json(rows[0]);

  const { rows: nieuw } = await db.query(
    'INSERT INTO leveringen (boeking_id, afhaling_moet_zeker) VALUES ($1, $2) RETURNING *',
    [req.params.boekingId, req.body.waarde]
  );
  res.status(201).json(nieuw[0]);
}));

module.exports = router;
