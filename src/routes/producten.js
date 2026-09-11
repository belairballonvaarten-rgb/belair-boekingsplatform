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
    naam, categorieen, sku, prijs, weekdagprijs, meerdaagse_prijstabel,
    max_boekingen_per_dag, availability_buffer_dagen, overnachting_mogelijk,
    overnachting_toeslag, parent_id, korting_toegelaten, zichtbaarheid,
    afbeeldingen, afmetingen, leeftijdscategorie, kostprijs,
  } = req.body;

  if (!naam) return res.status(400).json({ fout: 'Naam is verplicht' });

  const { rows } = await db.query(
    `INSERT INTO producten (
       naam, categorieen, sku, prijs, weekdagprijs, meerdaagse_prijstabel,
       max_boekingen_per_dag, availability_buffer_dagen, overnachting_mogelijk,
       overnachting_toeslag, parent_id, korting_toegelaten, zichtbaarheid,
       afbeeldingen, afmetingen, leeftijdscategorie, kostprijs
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [
      naam, categorieen || [], sku, prijs || 0, weekdagprijs, meerdaagse_prijstabel || {},
      max_boekingen_per_dag || 1, availability_buffer_dagen || 0, overnachting_mogelijk || false,
      overnachting_toeslag, parent_id || null, korting_toegelaten !== false, zichtbaarheid || 'bookbaar',
      afbeeldingen || [], afmetingen, leeftijdscategorie, kostprijs,
    ]
  );
  res.status(201).json(rows[0]);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const velden = [
    'naam', 'categorieen', 'sku', 'prijs', 'weekdagprijs', 'meerdaagse_prijstabel',
    'max_boekingen_per_dag', 'availability_buffer_dagen', 'overnachting_mogelijk',
    'overnachting_toeslag', 'parent_id', 'korting_toegelaten', 'zichtbaarheid',
    'afbeeldingen', 'afmetingen', 'leeftijdscategorie', 'kostprijs',
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
