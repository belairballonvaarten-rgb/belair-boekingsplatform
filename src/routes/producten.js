const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(vereistIngelogd);

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
  const { rows } = await db.query(`SELECT * FROM producten ${where} ORDER BY naam`, params);
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

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM producten WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ fout: 'Product niet gevonden' });

  const { rows: keuringen } = await db.query(
    'SELECT * FROM keuringen WHERE product_id = $1 ORDER BY vervaldatum',
    [req.params.id]
  );
  res.json({ ...rows[0], keuringen });
}));

router.post('/', asyncHandler(async (req, res) => {
  const {
    naam, categorieen, sku, prijs, weekendprijs, afhaalprijs, weekdagprijs, meerdaagse_prijstabel,
    max_boekingen_per_dag, availability_buffer_dagen, overnachting_mogelijk,
    overnachting_toeslag, parent_id, korting_toegelaten, zichtbaarheid,
    afbeeldingen, afmetingen, leeftijdscategorie, kostprijs,
  } = req.body;

  if (!naam) return res.status(400).json({ fout: 'Naam is verplicht' });

  const { rows } = await db.query(
    `INSERT INTO producten (
       naam, categorieen, sku, prijs, weekendprijs, afhaalprijs, weekdagprijs, meerdaagse_prijstabel,
       max_boekingen_per_dag, availability_buffer_dagen, overnachting_mogelijk,
       overnachting_toeslag, parent_id, korting_toegelaten, zichtbaarheid,
       afbeeldingen, afmetingen, leeftijdscategorie, kostprijs
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING *`,
    [
      naam, categorieen || [], sku || null, prijs || 0, weekendprijs || null, afhaalprijs || null,
      weekdagprijs, meerdaagse_prijstabel || {},
      max_boekingen_per_dag || 1, availability_buffer_dagen || 0, overnachting_mogelijk || false,
      overnachting_toeslag, parent_id || null, korting_toegelaten !== false, zichtbaarheid || 'bookbaar',
      afbeeldingen || [], afmetingen, leeftijdscategorie, kostprijs,
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
  const eersteRegel = lijnen[0] || '';
  const scheidingsteken = (eersteRegel.split(';').length - 1) > (eersteRegel.split(',').length - 1) ? ';' : ',';

  const resultaat = { aangemaakt: 0, bijgewerkt: 0, overgeslagen: [], onherkendeCategorie: [] };

  for (const lijn of lijnen) {
    const [naamRuw, prijsRuw, typeRuw, categorieRuw, afbeeldingRuw] = parseCsvRegel(lijn, scheidingsteken);
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
    'afbeeldingen', 'afmetingen', 'leeftijdscategorie', 'kostprijs', 'staat',
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
    `UPDATE producten SET ${updates.join(', ')}, bijgewerkt_op = now() WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) return res.status(404).json({ fout: 'Product niet gevonden' });
  res.json(rows[0]);
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

module.exports = router;
