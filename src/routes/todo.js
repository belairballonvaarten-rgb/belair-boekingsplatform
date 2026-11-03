// Jonas' eigen, vrije TODO-lijstje op de Dagoverzicht-pagina (zie migratie 057)
// — puur losse notities met een vink, los van boekingen/klanten/leveringen.
// Bewust een heel eenvoudige, platte lijst (geen datum/prioriteit/koppeling):
// op vraag van Jonas enkel "random zaken die ik nog wil doen".
const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(vereistIngelogd);

// Nog niet afgewerkte items eerst (nieuwste eerst), afgewerkte onderaan (meest
// recent afgewerkt eerst) — zo verdwijnt een afgevinkt item niet meteen uit
// het zicht, maar zakt het wel netjes onderaan weg.
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM todo_items
     ORDER BY afgewerkt ASC, COALESCE(afgewerkt_op, aangemaakt_op) DESC`
  );
  res.json(rows);
}));

router.post('/', asyncHandler(async (req, res) => {
  const tekst = (req.body.tekst || '').trim();
  if (!tekst) return res.status(400).json({ fout: 'Tekst is verplicht' });
  const { rows } = await db.query(
    'INSERT INTO todo_items (tekst) VALUES ($1) RETURNING *',
    [tekst]
  );
  res.status(201).json(rows[0]);
}));

// Enkel 'afgewerkt' (vink) en/of 'tekst' (bv. typfout corrigeren) kunnen
// bijgewerkt worden — geen andere velden nodig voor dit eenvoudige lijstje.
router.put('/:id', asyncHandler(async (req, res) => {
  const updates = [];
  const params = [];
  if (req.body.afgewerkt !== undefined) {
    params.push(!!req.body.afgewerkt);
    updates.push(`afgewerkt = $${params.length}`);
    updates.push(`afgewerkt_op = CASE WHEN $${params.length} THEN now() ELSE NULL END`);
  }
  if (req.body.tekst !== undefined) {
    const tekst = (req.body.tekst || '').trim();
    if (!tekst) return res.status(400).json({ fout: 'Tekst mag niet leeg zijn' });
    params.push(tekst);
    updates.push(`tekst = $${params.length}`);
  }
  if (!updates.length) return res.status(400).json({ fout: 'Geen velden om te updaten' });
  params.push(req.params.id);
  const { rows } = await db.query(
    `UPDATE todo_items SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) return res.status(404).json({ fout: 'Item niet gevonden' });
  res.json(rows[0]);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { rows } = await db.query('DELETE FROM todo_items WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ fout: 'Item niet gevonden' });
  res.status(204).end();
}));

module.exports = router;
