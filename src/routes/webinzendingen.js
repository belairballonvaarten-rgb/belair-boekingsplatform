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
  const eu = ruw.match(/(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/); // 18/09/2026
  if (eu) {
    const [, dag, maand, jaar] = eu;
    return `${jaar}-${maand.padStart(2, '0')}-${dag.padStart(2, '0')}`;
  }
  const iso = ruw.match(/(\d{4})-(\d{2})-(\d{2})/); // 2026-09-18(...)
  if (iso) return iso[0].slice(0, 10);
  return null;
}

// Een huurperiode van meerdere dagen komt vanuit het webformulier soms als ÉÉN
// tekstveld binnen i.p.v. een apart begin- en einddatumveld, bv.
// "18/09/2026 - 20/09/2026", "18/09/2026 tot 20/09/2026" of "18/09/2026 t/m
// 20/09/2026". We zoeken daarom gewoon alle datum-achtige stukjes in de tekst:
// één gevonden → zelfde dag voor start én einde (zoals bij een dagboeking),
// twee of meer gevonden → de eerste is de startdatum, de laatste de einddatum.
function parseDatumBereik(ruw) {
  if (!ruw) return { start: null, einde: null };
  const stukjes = ruw.match(/\d{1,2}[/\-]\d{1,2}[/\-]\d{4}|\d{4}-\d{2}-\d{2}/g) || [];
  if (stukjes.length >= 2) {
    const start = parseDatumNaarIso(stukjes[0]);
    const einde = parseDatumNaarIso(stukjes[stukjes.length - 1]);
    if (start) return { start, einde: einde || start };
  }
  const start = parseDatumNaarIso(ruw);
  return { start, einde: start };
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

// Sommige formulieren (bv. cateringmateriaal/events-aanvragen) sturen geen
// los "Product"-veld met telkens 1 item, maar één "Services List"-tekstveld
// met de VOLLEDIGE opsomming, elk als "Naam: aantal", gescheiden door komma's
// — bv. 'Percolator 6L: 1, Buffettafel: 8, Klapstoel "zwart": 45, Glazen: 40,
// Servies: 50, Venster frigo: 1'. Voorheen werd dit veld nergens gelezen,
// waardoor enkel het aparte "Product"-veld (meestal gewoon het eerste item
// uit diezelfde lijst) een productregel werd, en de rest van de bestelling
// in de boeking zelf volledig ontbrak (de ruwe inzending bleef wel altijd
// bewaard, zie website_inzendingen.ruwe_data — enkel de OMZETTING naar
// productregels miste dit). We splitsen op komma, en per stuk op de laatste
// ":" voor de naam/aantal — ontbreekt een herkenbaar aantal, dan nemen we 1
// (beter een regel met mogelijk verkeerd aantal dan een item dat stilzwijgend
// verdwijnt).
function parseServicesLijst(ruw) {
  if (!ruw) return [];
  return ruw
    .split(',')
    .map((stuk) => stuk.trim())
    .filter(Boolean)
    .map((stuk) => {
      const match = stuk.match(/^(.+):\s*(\d+)\s*$/);
      if (!match) return { naam: stuk, aantal: 1 };
      return { naam: match[1].trim(), aantal: parseInt(match[2], 10) || 1 };
    })
    .filter((item) => item.naam);
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

// Zet een binnengekomen formulier-inzending ALTIJD om in een echte aanvraag
// (boeking met status 'nieuw', bron 'website'), die dan gewoon in de
// Aanvragen-inbox verschijnt — ook als iets ontbreekt of onherkend is (bv.
// geen datum, of een productnaam die niet herkend wordt). Op uitdrukkelijke
// vraag van Jonas: liever een onvolledige/mogelijk foutieve aanvraag die hij
// nog moet vervolledigen, dan een inzending die onopgemerkt blijft liggen.
// Ontbrekende/onherkende velden worden vervangen door een duidelijke
// placeholder en bovenaan de Opmerkingen opgesomd, zodat meteen duidelijk is
// wat nog nagekeken/aangevuld moet worden. Een eventueel beschikbaarheids-
// conflict (product al bezet op die datum) blokkeert de aanmaak dus ook niet
// meer — dat conflict blijft gewoon zichtbaar via de bestaande rode
// conflict-banner in het dossier zelf (zie openDetail() in app.js), net als
// bij een manuele overboeking. Een niet-herkend product blijft niet enkel in
// de Opmerkingen staan: het komt ook als een rode "niet herkend"-regel in de
// productenlijst zelf (zie boeking_producten.ruwe_naam, migratie 049), zodat
// het meteen opvalt en in 1 klik te vervangen is door het juiste product.
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
  const voorkeur_tijdstip_levering = zoekVeld(ruweData, 'Voorkeur tijdstip van levering');
  const voorkeur_tijdstip_afhaling = zoekVeld(ruweData, 'Voorkeur tijdstip van afhaling');
  const opmerkingen = zoekVeld(ruweData, 'Extra opmerkingen?', 'Opmerkingen', 'Extra opmerkingen');
  const huurvoorwaardenRuw = zoekVeld(ruweData, 'Huurvoorwaarden');
  const huurvoorwaarden_geaccepteerd = Boolean(huurvoorwaardenRuw && normaliseerTekst(huurvoorwaardenRuw).includes('akkoord'));
  const productNaam = zoekVeld(ruweData, 'Product');
  const servicesLijstRuw = zoekVeld(ruweData, 'Services List', 'Services lijst', 'Diensten', 'Productenlijst', 'Producten lijst');

  // Niets hiervan blokkeert nog de aanmaak — enkel verzamelen voor de
  // "nog na te kijken"-opmerking hieronder.
  const aandachtspunten = [];

  let effectieveNaam = naam;
  if (!effectieveNaam) {
    effectieveNaam = 'Onbekend (website-inzending)';
    aandachtspunten.push('Naam ontbrak in het webformulier.');
  }

  // Datum/periode: zie parseDatumBereik hierboven voor de "meerdere dagen in
  // één veld"-situatie. Daarnaast proberen we ook nog een apart einddatumveld
  // (sommige formuliervarianten hebben dat wél) — vindt die iets, dan heeft
  // die voorrang op wat uit het ene datumveld zelf afgeleid werd.
  const { start: datumUitBereik, einde: eindeUitBereik } = parseDatumBereik(zoekVeld(ruweData, 'Datum'));
  let gewenste_datum_start = datumUitBereik;
  let gewenste_datum_einde = eindeUitBereik;
  const apartEindeRuw = zoekVeld(ruweData, 'Datum tot', 'Datum einde', 'Einddatum', 'Eind datum', 'Datum (tot)', 'Tot en met', 'Tot');
  if (apartEindeRuw) {
    const apartEinde = parseDatumNaarIso(apartEindeRuw);
    if (apartEinde) gewenste_datum_einde = apartEinde;
  }
  if (!gewenste_datum_start) {
    gewenste_datum_start = new Date().toISOString().slice(0, 10);
    aandachtspunten.push(`Datum ontbrak of werd niet herkend — voorlopig op vandaag (${gewenste_datum_start}) gezet, zelf corrigeren.`);
  }
  if (!gewenste_datum_einde || gewenste_datum_einde < gewenste_datum_start) {
    gewenste_datum_einde = gewenste_datum_start;
  }

  // Niet-herkende/ontbrekende producten blokkeren de aanmaak niet meer, maar
  // worden (op vraag van Jonas) WEL als een echte, rood gemarkeerde "niet
  // herkend"-regel op de boeking gezet (zie boeking_producten.ruwe_naam,
  // migratie 049) i.p.v. enkel vermeld in de Opmerkingen — zo valt het meteen
  // op in de productenlijst zelf van het dossier, en is het in 1 klik te
  // vervangen door het juiste product.
  //
  // Is er een "Services List" (zie parseServicesLijst hierboven), dan bevat
  // die AL het volledige order (het losse "Product"-veld is daar typisch
  // gewoon het eerste item van) — dan gebruiken we uitsluitend de lijst, met
  // elk item z'n eigen aantal, i.p.v. ook nog het Product-veld als aparte
  // (dubbele) regel toe te voegen. Is er geen Services List, dan blijft het
  // gedrag exact zoals voorheen: het ene Product-veld, aantal 1.
  const servicesLijst = parseServicesLijst(servicesLijstRuw);
  const productItems = servicesLijst.length
    ? servicesLijst
    : (productNaam ? [{ naam: productNaam, aantal: 1 }] : []);

  if (!productItems.length) {
    aandachtspunten.push('Geen product opgegeven in het webformulier — zelf toevoegen.');
  }
  const productRegels = [];
  for (const item of productItems) {
    const gevondenId = await vindProductId(item.naam);
    if (!gevondenId) {
      aandachtspunten.push(`Product "${item.naam}" niet herkend in de productenlijst — rode regel "niet herkend" toegevoegd, zelf corrigeren.`);
    }
    productRegels.push({ naam: item.naam, aantal: item.aantal, productId: gevondenId });
  }

  const adresVolledig = [plaatsingsadres, [postcode, gemeente].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null;

  const klantId = await vindOfMaakKlant({
    naam: effectieveNaam, klant_type, btw_nummer, adres: plaatsingsadres, postcode, gemeente, telefoon, email,
  });

  const notitieDelen = [];
  if (aandachtspunten.length) {
    notitieDelen.push(`⚠ Automatisch aangemaakt vanuit het webformulier, nog na te kijken:\n- ${aandachtspunten.join('\n- ')}`);
  }
  if (opmerkingen) notitieDelen.push(opmerkingen);
  const notitiesVolledig = notitieDelen.join('\n\n') || null;

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
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $10 THEN now() ELSE NULL END, $11, 'website')
       RETURNING id`,
      [
        klantId, gewenste_datum_start, gewenste_datum_einde, leveringswijze, adresVolledig, type_ondergrond, toegankelijkheid,
        voorkeur_tijdstip_levering, voorkeur_tijdstip_afhaling, huurvoorwaarden_geaccepteerd,
        notitiesVolledig,
      ]
    );
    const boekingId = boekingRows[0].id;
    // Eén regel per item uit productRegels (hierboven al bepaald — ofwel de
    // volledige Services List, ofwel het ene Product-veld) i.p.v. voorheen
    // altijd maximaal één regel: dat was precies de bug — bij een "Services
    // List" met meerdere items werd enkel het eerste/aparte Product-veld
    // geregistreerd en ging de rest van de bestelling nergens in de boeking
    // zelf terecht.
    for (const regel of productRegels) {
      if (regel.productId) {
        // Herkend product: gewoon een normale regel, zoals bij elke manuele boeking.
        const { rows: productRows } = await client.query('SELECT prijs FROM producten WHERE id = $1', [regel.productId]);
        await client.query(
          'INSERT INTO boeking_producten (boeking_id, product_id, aantal, prijs) VALUES ($1, $2, $3, $4)',
          [boekingId, regel.productId, regel.aantal, productRows[0]?.prijs || 0]
        );
      } else {
        // Niet herkend: een placeholder-regel (prijs 0, nog zelf te bepalen)
        // met de letterlijke tekst, die in het dossier rood/"niet herkend"
        // getoond wordt — met het aantal dat in de Services List stond.
        await client.query(
          'INSERT INTO boeking_producten (boeking_id, product_id, ruwe_naam, aantal, prijs) VALUES ($1, NULL, $2, $3, 0)',
          [boekingId, regel.naam, regel.aantal]
        );
      }
    }
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
