const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { verstuurMail, isGeconfigureerd: mailIsGeconfigureerd } = require('../utils/mailer');
const { genereerProductRapportPdf } = require('../utils/productRapport');

const router = express.Router();
router.use(vereistIngelogd);

// Alle kolommen BEHALVE certificaat_bestand (bytea) — dat bestand zelf is vaak
// enkele MB's groot en hoort niet mee te reizen in elke productenlijst-aanroep;
// "heeft_certificaat" volstaat om te weten of er één is, het bestand zelf
// wordt apart opgehaald via GET /:id/certificaat.
const PRODUCT_KOLOMMEN_ZONDER_BESTAND = `
  id, naam, categorieen, sku, prijs, weekendprijs, afhaalprijs, weekdagprijs, meerdaagse_prijstabel,
  max_boekingen_per_dag, availability_buffer_dagen, overnachting_mogelijk,
  overnachting_toeslag, parent_id, korting_toegelaten, zichtbaarheid,
  afbeeldingen, afmetingen, leeftijdscategorie, kostprijs, aankoopdatum, staat, staat_bijgewerkt_op,
  motor_type, gewicht_kg, aantal_valmatten, aantal_piketten, aantal_zandzakken,
  aantal_motors, verlengkabel_standaard, verlengkabel_dubbel, overige_benodigdheden,
  materiaal_opmerking, gemiddelde_opsteltijd_minuten,
  certificaat_bestandsnaam, certificaat_mimetype, certificaat_upload_op,
  (certificaat_bestandsnaam IS NOT NULL) AS heeft_certificaat,
  infofiche_bestandsnaam, infofiche_mimetype, infofiche_upload_op,
  (infofiche_bestandsnaam IS NOT NULL) AS heeft_infofiche,
  aangemaakt_op, bijgewerkt_op
`;

router.get('/', asyncHandler(async (req, res) => {
  const { zichtbaarheid, categorie } = req.query;
  const condities = [];
  const params = [];
  if (zichtbaarheid) {
    params.push(zichtbaarheid);
    condities.push(`zichtbaarheid = $${params.length}`);
  }
  if (categorie) {
    params.push(categorie);
    condities.push(`$${params.length} = ANY(categorieen)`);
  }
  const where = condities.length ? `WHERE ${condities.join(' AND ')}` : '';
  const { rows } = await db.query(`SELECT ${PRODUCT_KOLOMMEN_ZONDER_BESTAND} FROM producten ${where} ORDER BY naam`, params);
  res.json(rows);
}));

// Let op: deze route moet vóór '/:id' staan, anders vangt '/:id' dit pad ook af
router.get('/waarschuwingen/vervalt-binnenkort', asyncHandler(async (req, res) => {
  const { dagen = 30 } = req.query;
  const { rows } = await db.query(
    `SELECT k.*, p.naam AS product_naam FROM keuringen k
     JOIN producten p ON p.id = k.product_id
     WHERE k.vervaldatum <= (CURRENT_DATE + $1::int)
     ORDER BY k.vervaldatum`,
    [dagen]
  );
  res.json(rows);
}));

// FOD Economie verwacht van elk springkasteel minstens dit aantal nazichten
// (controle/reiniging/drogen) per kalenderjaar — zie migratie 041. Op vraag
// van Jonas toont het Logboek-overzicht een duidelijke waarschuwing zolang
// een product dit jaar nog niet aan dit minimum zit.
const MIN_CONTROLES_PER_JAAR = 5;

// Let op: deze route moet vóór '/:id' staan.
// Eén overzicht van alle producten met hun logboekstatus dit kalenderjaar —
// zodat Jonas in één oogopslag ziet welke springkastelen achterstaan op de
// verplichte nazichten, zonder elk product apart te moeten openen. Telt
// enkel 'controle'-regels mee voor de 5x/jaar-verplichting; reiniging en
// herstelling tonen we erbij als laatste-datum, puur informatief.
router.get('/logboek-overzicht', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.id, p.naam,
            COUNT(*) FILTER (WHERE l.type = 'controle' AND l.datum >= date_trunc('year', CURRENT_DATE)) AS aantal_controles_dit_jaar,
            MAX(l.datum) FILTER (WHERE l.type = 'reiniging') AS laatste_reiniging,
            MAX(l.datum) FILTER (WHERE l.type = 'herstelling') AS laatste_herstelling,
            MAX(l.datum) FILTER (WHERE l.type = 'controle') AS laatste_controle
     FROM producten p
     LEFT JOIN product_logboek l ON l.product_id = p.id
     WHERE p.zichtbaarheid <> 'hidden' OR EXISTS (
       SELECT 1 FROM product_logboek l2 WHERE l2.product_id = p.id
     )
     GROUP BY p.id, p.naam
     ORDER BY p.naam`
  );
  const resultaat = rows.map((r) => ({
    ...r,
    aantal_controles_dit_jaar: Number(r.aantal_controles_dit_jaar),
    voldoet_aan_minimum: Number(r.aantal_controles_dit_jaar) >= MIN_CONTROLES_PER_JAAR,
  }));
  res.json({ minimum_per_jaar: MIN_CONTROLES_PER_JAAR, producten: resultaat });
}));

// Statussen die voor Jonas "echte, gewenste verhuur" betekenen — zelfde
// principe als het Boekingenoverzicht: een geweigerde, nog niet beoordeelde
// ('nieuw'/'in_behandeling') aanvraag telt niet mee als omzet voor de
// terugverdiend-berekening.
const OMZET_STATUSSEN_UITGESLOTEN = ['geweigerd', 'nieuw', 'in_behandeling'];

// Let op: deze route moet vóór '/:id' staan.
// "Wanneer heb ik dit terugverdiend?" — kostprijs bestond al (migratie 001),
// hier enkel de omzet ertegenover gezet (subtotaal van boeking_producten,
// over alle niet-geweigerde/niet-nieuwe boekingen heen) + de aankoopdatum
// erbij (migratie 043) om ook "sinds wanneer loopt dit al mee" te tonen.
router.get('/terugverdiend-overzicht', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.id, p.naam, p.kostprijs, p.aankoopdatum,
            COALESCE(SUM(bp.prijs * bp.aantal) FILTER (WHERE b.status NOT IN (${OMZET_STATUSSEN_UITGESLOTEN.map((_, i) => `$${i + 1}`).join(', ')})), 0) AS omzet
     FROM producten p
     LEFT JOIN boeking_producten bp ON bp.product_id = p.id
     LEFT JOIN boekingen b ON b.id = bp.boeking_id
     WHERE p.kostprijs IS NOT NULL
     GROUP BY p.id, p.naam, p.kostprijs, p.aankoopdatum
     ORDER BY p.naam`,
    OMZET_STATUSSEN_UITGESLOTEN
  );
  const resultaat = rows.map((r) => {
    const kostprijs = Number(r.kostprijs) || 0;
    const omzet = Number(r.omzet) || 0;
    return {
      ...r,
      omzet,
      resterend: Math.max(kostprijs - omzet, 0),
      percentage_terugverdiend: kostprijs > 0 ? Math.min(100, Math.round((omzet / kostprijs) * 100)) : null,
      terugverdiend: kostprijs > 0 && omzet >= kostprijs,
    };
  });
  res.json(resultaat);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await db.query(`SELECT ${PRODUCT_KOLOMMEN_ZONDER_BESTAND} FROM producten WHERE id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ fout: 'Product niet gevonden' });

  const { rows: keuringen } = await db.query(
    'SELECT * FROM keuringen WHERE product_id = $1 ORDER BY vervaldatum',
    [req.params.id]
  );
  const { rows: logboek } = await db.query(
    'SELECT * FROM product_logboek WHERE product_id = $1 ORDER BY datum DESC, aangemaakt_op DESC',
    [req.params.id]
  );
  res.json({ ...rows[0], keuringen, logboek });
}));

// "Rapport per kasteel" (PDF) — op vraag van Jonas na een FOD Economie-
// controle: alle gegevens die al bijgehouden worden (keuringen, certificaat,
// logboek, infofiche) gebundeld in één document, klaar om te tonen/af te
// drukken bij een volgende controle. Zie utils/productRapport.js voor de
// opbouw. Inline getoond, zelfde patroon als ondertekend-document.pdf.
router.get('/:id/rapport.pdf', asyncHandler(async (req, res) => {
  const resultaat = await genereerProductRapportPdf(req.params.id);
  if (!resultaat) return res.status(404).json({ fout: 'Product niet gevonden' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${resultaat.bestandsnaam}"`);
  res.send(resultaat.buffer);
}));

router.post('/', asyncHandler(async (req, res) => {
  const {
    naam, categorieen, sku, prijs, weekendprijs, afhaalprijs, weekdagprijs, meerdaagse_prijstabel,
    max_boekingen_per_dag, availability_buffer_dagen, overnachting_mogelijk,
    overnachting_toeslag, parent_id, korting_toegelaten, zichtbaarheid,
    afbeeldingen, afmetingen, leeftijdscategorie, kostprijs, aankoopdatum,
    motor_type, gewicht_kg, aantal_valmatten, aantal_piketten, aantal_zandzakken,
    aantal_motors, verlengkabel_standaard, verlengkabel_dubbel, overige_benodigdheden,
    materiaal_opmerking, gemiddelde_opsteltijd_minuten,
  } = req.body;

  if (!naam) return res.status(400).json({ fout: 'Naam is verplicht' });

  const { rows } = await db.query(
    `INSERT INTO producten (
       naam, categorieen, sku, prijs, weekendprijs, afhaalprijs, weekdagprijs, meerdaagse_prijstabel,
       max_boekingen_per_dag, availability_buffer_dagen, overnachting_mogelijk,
       overnachting_toeslag, parent_id, korting_toegelaten, zichtbaarheid,
       afbeeldingen, afmetingen, leeftijdscategorie, kostprijs, aankoopdatum,
       motor_type, gewicht_kg, aantal_valmatten, aantal_piketten, aantal_zandzakken,
       aantal_motors, verlengkabel_standaard, verlengkabel_dubbel, overige_benodigdheden,
       materiaal_opmerking, gemiddelde_opsteltijd_minuten
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
     RETURNING ${PRODUCT_KOLOMMEN_ZONDER_BESTAND}`,
    [
      naam, categorieen || [], sku || null, prijs || 0, weekendprijs || null, afhaalprijs || null,
      weekdagprijs, meerdaagse_prijstabel || {},
      max_boekingen_per_dag || 1, availability_buffer_dagen || 0, overnachting_mogelijk || false,
      overnachting_toeslag, parent_id || null, korting_toegelaten !== false, zichtbaarheid || 'bookbaar',
      afbeeldingen || [], afmetingen, leeftijdscategorie, kostprijs || null, aankoopdatum || null,
      motor_type || null, gewicht_kg || null, aantal_valmatten || null, aantal_piketten || null, aantal_zandzakken || null,
      aantal_motors || null, verlengkabel_standaard || null, verlengkabel_dubbel || null, overige_benodigdheden || null,
      materiaal_opmerking || null, gemiddelde_opsteltijd_minuten || null,
    ]
  );
  res.status(201).json(rows[0]);
}));

// Bulk-import: CSV-tekst (Naam,Prijs,Type,Categorie[,Afbeelding]) in één keer verwerken.
// Bestaat een product al (zelfde naam, hoofdletterongevoelig) dan wordt het bijgewerkt
// i.p.v. dubbel aangemaakt — zo kan dezelfde lijst gerust meermaals geplakt worden.
//
// Excel op een Belgische/Nederlandse computer gebruikt vaak ";" i.p.v. "," als
// scheidingsteken (en "," als decimaalteken) wanneer een .csv-bestand geopend
// of opnieuw opgeslagen wordt — vandaar dat we hier zowel "," als ";" als
// scheidingsteken herkennen i.p.v. altijd "," te veronderstellen.
const PRODUCT_CATEGORIEEN_BEKEND = ['Springkastelen', 'Attracties', 'Obstakelbanen', 'Feestmaterialen', 'Servies/Bestek/glazen'];

function parseCsvRegel(regel, scheidingsteken) {
  const velden = [];
  let huidig = '';
  let inAanhalingstekens = false;
  for (let i = 0; i < regel.length; i++) {
    const teken = regel[i];
    if (inAanhalingstekens) {
      if (teken === '"') {
        if (regel[i + 1] === '"') { huidig += '"'; i++; } else { inAanhalingstekens = false; }
      } else {
        huidig += teken;
      }
    } else if (teken === '"') {
      inAanhalingstekens = true;
    } else if (teken === scheidingsteken) {
      velden.push(huidig);
      huidig = '';
    } else {
      huidig += teken;
    }
  }
  velden.push(huidig);
  return velden.map((v) => v.trim());
}

// Normaliseert de categorie-tekst naar één van de gekende categorieën
// (hoofdletterongevoelig, spaties genegeerd) — zo breekt een kleine typfout
// of hoofdletterverschil de indeling niet. Geen match? Dan geven we de
// oorspronkelijke tekst terug (komt dan wel in "Overige" terecht) zodat er
// niets verloren gaat, en melden we dit apart in het resultaat.
function normaliseerCategorie(ruw) {
  const naam = (ruw || '').trim();
  if (!naam) return { categorie: '', herkend: true };
  const gevonden = PRODUCT_CATEGORIEEN_BEKEND.find((c) => c.toLowerCase() === naam.toLowerCase());
  return { categorie: gevonden || naam, herkend: Boolean(gevonden) };
}

router.post('/bulk-import', asyncHandler(async (req, res) => {
  const { regels } = req.body;
  if (!regels || typeof regels !== 'string' || !regels.trim()) {
    return res.status(400).json({ fout: 'Geen CSV-tekst ontvangen' });
  }

  const lijnen = regels.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length);
  // Scheidingsteken bepalen o.b.v. de eerste regel: telkens wat het vaakst voorkomt.
  // Excel plakt een gekopieerde celselectie standaard met TABS i.p.v. komma's/
  // puntkomma's — ook dat herkennen we, naast "," en ";".
  const eersteRegel = lijnen[0] || '';
  const tellingen = { ',': eersteRegel.split(',').length - 1, ';': eersteRegel.split(';').length - 1, '\t': eersteRegel.split('\t').length - 1 };
  const scheidingsteken = Object.entries(tellingen).sort((a, b) => b[1] - a[1])[0][0];

  const resultaat = { aangemaakt: 0, bijgewerkt: 0, overgeslagen: [], onherkendeCategorie: [] };

  for (const lijn of lijnen) {
    let velden = parseCsvRegel(lijn, scheidingsteken);
    // Bekend Excel-probleem op een Belgische computer: prijzen met een komma
    // als decimaalteken ("150,00") worden — als "," toch het scheidingsteken
    // is — foutief in twee velden opgesplitst ("150" en "00"). Dat schuift alle
    // velden erna één plaats op. Dit patroon herkennen we en herstellen we:
    // 1 veld te veel, en het 3de veld is een kort getal (de "decimalen").
    if (scheidingsteken === ',' && velden.length === 6 && /^\d{1,2}$/.test(velden[2])) {
      velden = [velden[0], `${velden[1]}.${velden[2]}`, velden[3], velden[4], velden[5]];
    }
    const [naamRuw, prijsRuw, typeRuw, categorieRuw, afbeeldingRuw] = velden;
    const naam = (naamRuw || '').trim();
    if (!naam || naam.toLowerCase() === 'naam') continue; // lege regel of kopregel overslaan

    const prijs = parseFloat((prijsRuw || '0').replace(',', '.')) || 0;
    const zichtbaarheid = (typeRuw || '').trim().toLowerCase() === 'display only' ? 'hidden' : 'bookbaar';
    const { categorie, herkend } = normaliseerCategorie(categorieRuw);
    if (categorie && !herkend) resultaat.onherkendeCategorie.push({ naam, categorie });
    const categorieen = categorie ? [categorie] : [];
    const afbeelding = (afbeeldingRuw || '').trim();

    try {
      const { rows: bestaand } = await db.query(
        'SELECT id, afbeeldingen FROM producten WHERE lower(naam) = lower($1)',
        [naam]
      );
      if (bestaand[0]) {
        const afbeeldingen = afbeelding ? [afbeelding] : (bestaand[0].afbeeldingen || []);
        await db.query(
          `UPDATE producten SET prijs = $1, categorieen = $2, zichtbaarheid = $3, afbeeldingen = $4, bijgewerkt_op = now()
           WHERE id = $5`,
          [prijs, categorieen, zichtbaarheid, afbeeldingen, bestaand[0].id]
        );
        resultaat.bijgewerkt++;
      } else {
        await db.query(
          `INSERT INTO producten (naam, categorieen, prijs, zichtbaarheid, afbeeldingen, max_boekingen_per_dag, availability_buffer_dagen, korting_toegelaten)
           VALUES ($1,$2,$3,$4,$5,1,0,true)`,
          [naam, categorieen, prijs, zichtbaarheid, afbeelding ? [afbeelding] : []]
        );
        resultaat.aangemaakt++;
      }
    } catch (err) {
      resultaat.overgeslagen.push({ naam, fout: err.message });
    }
  }

  res.json(resultaat);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const velden = [
    'naam', 'categorieen', 'sku', 'prijs', 'weekendprijs', 'afhaalprijs', 'weekdagprijs', 'meerdaagse_prijstabel',
    'max_boekingen_per_dag', 'availability_buffer_dagen', 'overnachting_mogelijk',
    'overnachting_toeslag', 'parent_id', 'korting_toegelaten', 'zichtbaarheid',
    'afbeeldingen', 'afmetingen', 'leeftijdscategorie', 'kostprijs', 'aankoopdatum', 'staat',
    'motor_type', 'gewicht_kg', 'aantal_valmatten', 'aantal_piketten', 'aantal_zandzakken',
    'aantal_motors', 'verlengkabel_standaard', 'verlengkabel_dubbel', 'overige_benodigdheden',
    'materiaal_opmerking', 'gemiddelde_opsteltijd_minuten',
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
  if (req.body.staat !== undefined) updates.push('staat_bijgewerkt_op = now()');

  params.push(req.params.id);
  const { rows } = await db.query(
    `UPDATE producten SET ${updates.join(', ')}, bijgewerkt_op = now() WHERE id = $${params.length} RETURNING ${PRODUCT_KOLOMMEN_ZONDER_BESTAND}`,
    params
  );
  if (!rows[0]) return res.status(404).json({ fout: 'Product niet gevonden' });
  res.json(rows[0]);
}));

// Product verwijderen — enkel mogelijk als het nooit in een boeking gebruikt is
// (de databank beschermt dit zelf via een foreign-key), zodat de historiek van
// bestaande boekingen nooit kan verwijzen naar een verdwenen product. Is een
// product al gebruikt, dan krijg je een duidelijke melding i.p.v. een rauwe
// databankfout — je kan het product dan wel op "Verborgen" zetten.
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM producten WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ fout: 'Product niet gevonden' });
    res.status(204).end();
  } catch (err) {
    if (err.code === '23503') { // foreign_key_violation
      return res.status(409).json({
        fout: 'Dit product is al gebruikt in minstens één boeking en kan daarom niet verwijderd worden. '
          + 'Zet het in plaats daarvan op zichtbaarheid "Verborgen" als het niet meer verhuurd wordt.',
      });
    }
    throw err;
  }
}));

// Keuringen beheren
router.post('/:id/keuringen', asyncHandler(async (req, res) => {
  const { type_keuring, vervaldatum } = req.body;
  if (!type_keuring || !vervaldatum) {
    return res.status(400).json({ fout: 'type_keuring en vervaldatum zijn verplicht' });
  }
  const { rows } = await db.query(
    'INSERT INTO keuringen (product_id, type_keuring, vervaldatum) VALUES ($1, $2, $3) RETURNING *',
    [req.params.id, type_keuring, vervaldatum]
  );
  res.status(201).json(rows[0]);
}));

// ============================================================
// LOGBOEK (controle/reiniging/herstelling per product — zie migratie 041)
// ============================================================
const LOGBOEK_TYPES = ['controle', 'reiniging', 'herstelling'];

router.post('/:id/logboek', asyncHandler(async (req, res) => {
  const { type, datum, notitie } = req.body;
  if (!LOGBOEK_TYPES.includes(type) || !datum) {
    return res.status(400).json({ fout: `type (${LOGBOEK_TYPES.join('/')}) en datum zijn verplicht` });
  }
  const { rows } = await db.query(
    'INSERT INTO product_logboek (product_id, type, datum, notitie) VALUES ($1, $2, $3, $4) RETURNING *',
    [req.params.id, type, datum, notitie || null]
  );
  res.status(201).json(rows[0]);
}));

// Let op: eigen pad (niet onder /:id) omdat het logboek-item zelf de sleutel is.
router.delete('/logboek/:logboekId', asyncHandler(async (req, res) => {
  const { rows } = await db.query('DELETE FROM product_logboek WHERE id = $1 RETURNING id', [req.params.logboekId]);
  if (!rows[0]) return res.status(404).json({ fout: 'Logboek-item niet gevonden' });
  res.status(204).end();
}));

// ============================================================
// CERTIFICAAT (keuringsdocument als bestand bij het product)
// ============================================================
// Rechtstreeks als bytea in de databank bewaard i.p.v. via een apart
// bestand-uploadpakket (multer) — de frontend leest het bestand zelf in als
// base64 (FileReader) en stuurt dat als gewone JSON mee, dus geen extra
// afhankelijkheid nodig. Max. 8MB: ruim voldoende voor een gescand
// keuringsdocument (PDF/foto), maar voorkomt dat een veel te groot bestand de
// databank en elke pagina die het product opvraagt onnodig zwaar maakt.
const CERTIFICAAT_MAX_BYTES = 8 * 1024 * 1024;
const CERTIFICAAT_TOEGESTANE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

router.put('/:id/certificaat', asyncHandler(async (req, res) => {
  const { bestandsnaam, mimetype, dataBase64 } = req.body;
  if (!bestandsnaam || !mimetype || !dataBase64) {
    return res.status(400).json({ fout: 'bestandsnaam, mimetype en dataBase64 zijn verplicht' });
  }
  if (!CERTIFICAAT_TOEGESTANE_TYPES.includes(mimetype)) {
    return res.status(400).json({ fout: 'Enkel PDF, JPG of PNG toegelaten voor een certificaat' });
  }
  const buffer = Buffer.from(dataBase64, 'base64');
  if (buffer.length > CERTIFICAAT_MAX_BYTES) {
    return res.status(413).json({ fout: `Bestand is te groot (max. ${CERTIFICAAT_MAX_BYTES / 1024 / 1024}MB)` });
  }

  const { rows } = await db.query(
    `UPDATE producten SET certificaat_bestand = $1, certificaat_bestandsnaam = $2, certificaat_mimetype = $3,
       certificaat_upload_op = now(), bijgewerkt_op = now()
     WHERE id = $4 RETURNING ${PRODUCT_KOLOMMEN_ZONDER_BESTAND}`,
    [buffer, bestandsnaam, mimetype, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ fout: 'Product niet gevonden' });
  res.json(rows[0]);
}));

router.get('/:id/certificaat', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'SELECT certificaat_bestand, certificaat_bestandsnaam, certificaat_mimetype FROM producten WHERE id = $1',
    [req.params.id]
  );
  if (!rows[0] || !rows[0].certificaat_bestand) return res.status(404).json({ fout: 'Geen certificaat gevonden voor dit product' });
  res.set('Content-Type', rows[0].certificaat_mimetype || 'application/octet-stream');
  res.set('Content-Disposition', `inline; filename="${(rows[0].certificaat_bestandsnaam || 'certificaat').replace(/"/g, '')}"`);
  res.send(rows[0].certificaat_bestand);
}));

router.delete('/:id/certificaat', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `UPDATE producten SET certificaat_bestand = NULL, certificaat_bestandsnaam = NULL, certificaat_mimetype = NULL,
       certificaat_upload_op = NULL, bijgewerkt_op = now()
     WHERE id = $1 RETURNING ${PRODUCT_KOLOMMEN_ZONDER_BESTAND}`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ fout: 'Product niet gevonden' });
  res.json(rows[0]);
}));

// Stuurt het certificaat als bijlage door naar een klant "op aanvraag" — vanaf
// de productpagina zelf (vrij e-mailadres) of vanaf een boeking-dossier (het
// e-mailadres van die klant wordt daar door de frontend meegegeven).
router.post('/:id/certificaat/verstuur', asyncHandler(async (req, res) => {
  const email = (req.body.email || '').trim();
  if (!email) return res.status(400).json({ fout: 'E-mailadres is verplicht' });
  if (!mailIsGeconfigureerd()) {
    return res.status(501).json({
      fout: 'De koppeling met Microsoft 365 is nog niet ingesteld (zie SETUP-MICROSOFT365.md) — versturen van e-mail is daardoor nog niet mogelijk.',
    });
  }

  const { rows } = await db.query(
    'SELECT naam, certificaat_bestand, certificaat_bestandsnaam, certificaat_mimetype FROM producten WHERE id = $1',
    [req.params.id]
  );
  const product = rows[0];
  if (!product || !product.certificaat_bestand) {
    return res.status(404).json({ fout: 'Geen certificaat gevonden voor dit product' });
  }

  await verstuurMail({
    naar: email,
    onderwerp: `Keuringscertificaat — ${product.naam}`,
    html: `Beste,<br><br>In bijlage het keuringscertificaat van "${product.naam}".<br><br>Met vriendelijke groeten,<br>Belair-Fun`,
    bijlagen: [{
      naam: product.certificaat_bestandsnaam,
      mimetype: product.certificaat_mimetype,
      dataBase64: product.certificaat_bestand.toString('base64'),
    }],
  });
  res.json({ verstuurd: true, naar: email });
}));

// ============================================================
// INFOFICHE / HANDLEIDING (bv. veiligheidsinstructies — zie migratie 042)
// ============================================================
// Zelfde opslagpatroon als het certificaat hierboven. Bewust GEEN automatische
// bijlage bij elke mail (op vraag van Jonas) — in plaats daarvan kan de klant
// het bestand zelf ophalen via de publieke, niet-ingelogde link in
// routes/product-info-publiek.js (handig als {{handleiding_links}}-plaatshouder
// in een mailtemplate, zie utils/mailTemplates.js), of Jonas kan het hier
// alsnog manueel naar een specifiek e-mailadres versturen "op aanvraag".
const INFOFICHE_MAX_BYTES = 8 * 1024 * 1024;
const INFOFICHE_TOEGESTANE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

router.put('/:id/infofiche', asyncHandler(async (req, res) => {
  const { bestandsnaam, mimetype, dataBase64 } = req.body;
  if (!bestandsnaam || !mimetype || !dataBase64) {
    return res.status(400).json({ fout: 'bestandsnaam, mimetype en dataBase64 zijn verplicht' });
  }
  if (!INFOFICHE_TOEGESTANE_TYPES.includes(mimetype)) {
    return res.status(400).json({ fout: 'Enkel PDF, JPG of PNG toegelaten voor een infofiche' });
  }
  const buffer = Buffer.from(dataBase64, 'base64');
  if (buffer.length > INFOFICHE_MAX_BYTES) {
    return res.status(413).json({ fout: `Bestand is te groot (max. ${INFOFICHE_MAX_BYTES / 1024 / 1024}MB)` });
  }

  const { rows } = await db.query(
    `UPDATE producten SET infofiche_bestand = $1, infofiche_bestandsnaam = $2, infofiche_mimetype = $3,
       infofiche_upload_op = now(), bijgewerkt_op = now()
     WHERE id = $4 RETURNING ${PRODUCT_KOLOMMEN_ZONDER_BESTAND}`,
    [buffer, bestandsnaam, mimetype, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ fout: 'Product niet gevonden' });
  res.json(rows[0]);
}));

router.get('/:id/infofiche', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'SELECT infofiche_bestand, infofiche_bestandsnaam, infofiche_mimetype FROM producten WHERE id = $1',
    [req.params.id]
  );
  if (!rows[0] || !rows[0].infofiche_bestand) return res.status(404).json({ fout: 'Geen infofiche gevonden voor dit product' });
  res.set('Content-Type', rows[0].infofiche_mimetype || 'application/octet-stream');
  res.set('Content-Disposition', `inline; filename="${(rows[0].infofiche_bestandsnaam || 'infofiche').replace(/"/g, '')}"`);
  res.send(rows[0].infofiche_bestand);
}));

router.delete('/:id/infofiche', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `UPDATE producten SET infofiche_bestand = NULL, infofiche_bestandsnaam = NULL, infofiche_mimetype = NULL,
       infofiche_upload_op = NULL, bijgewerkt_op = now()
     WHERE id = $1 RETURNING ${PRODUCT_KOLOMMEN_ZONDER_BESTAND}`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ fout: 'Product niet gevonden' });
  res.json(rows[0]);
}));

// Stuurt de infofiche als bijlage door naar een klant "op aanvraag" — zelfde
// opzet als /certificaat/verstuur hierboven. Dit is de manuele weg (Jonas
// stuurt zelf); de klant zelf kan het bestand ook rechtstreeks ophalen via de
// publieke link, zie routes/product-info-publiek.js.
router.post('/:id/infofiche/verstuur', asyncHandler(async (req, res) => {
  const email = (req.body.email || '').trim();
  if (!email) return res.status(400).json({ fout: 'E-mailadres is verplicht' });
  if (!mailIsGeconfigureerd()) {
    return res.status(501).json({
      fout: 'De koppeling met Microsoft 365 is nog niet ingesteld (zie SETUP-MICROSOFT365.md) — versturen van e-mail is daardoor nog niet mogelijk.',
    });
  }

  const { rows } = await db.query(
    'SELECT naam, infofiche_bestand, infofiche_bestandsnaam, infofiche_mimetype FROM producten WHERE id = $1',
    [req.params.id]
  );
  const product = rows[0];
  if (!product || !product.infofiche_bestand) {
    return res.status(404).json({ fout: 'Geen infofiche gevonden voor dit product' });
  }

  await verstuurMail({
    naar: email,
    onderwerp: `Infofiche/handleiding — ${product.naam}`,
    html: `Beste,<br><br>In bijlage de infofiche/handleiding van "${product.naam}".<br><br>Met vriendelijke groeten,<br>Belair-Fun`,
    bijlagen: [{
      naam: product.infofiche_bestandsnaam,
      mimetype: product.infofiche_mimetype,
      dataBase64: product.infofiche_bestand.toString('base64'),
    }],
  });
  res.json({ verstuurd: true, naar: email });
}));

module.exports = router;
