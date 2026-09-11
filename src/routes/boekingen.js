const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { checkBeschikbaarheid } = require('../utils/beschikbaarheid');

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

// Lijst met filters: status, datum-range, klant
router.get('/', async (req, res) => {
  const { status, vanaf, tot, klant_id } = req.query;
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
  const { rows } = await db.query(
    `SELECT b.*, k.naam AS klant_naam, k.telefoon AS klant_telefoon
     FROM boekingen b
     JOIN klanten k ON k.id = b.klant_id
     ${where}
     ORDER BY b.gewenste_datum_start DESC
     LIMIT 200`,
    params
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await db.query(
    `SELECT b.*, k.naam AS klant_naam, k.email AS klant_email, k.telefoon AS klant_telefoon
     FROM boekingen b JOIN klanten k ON k.id = b.klant_id WHERE b.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ fout: 'Boeking niet gevonden' });

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
  const { rows: betaling } = await db.query('SELECT * FROM betalingen WHERE boeking_id = $1', [req.params.id]);

  res.json({ ...rows[0], producten, historiek, levering: levering[0] || null, betaling: betaling[0] || null });
});

// Nieuwe aanvraag/boeking aanmaken (manueel door Jonas, of later via website)
router.post('/', async (req, res) => {
  const {
    klant_id, producten, gewenste_datum_start, gewenste_datum_einde,
    leveringswijze, leveringsadres, type_ondergrond, toegankelijkheid,
    voorkeur_tijdstip_levering, voorkeur_tijdstip_afhaling,
    huurvoorwaarden_geaccepteerd, notities, bron,
  } = req.body;

  if (!klant_id || !producten || !producten.length || !gewenste_datum_start) {
    return res.status(400).json({ fout: 'klant_id, producten en gewenste_datum_start zijn verplicht' });
  }
  const datumEinde = gewenste_datum_einde || gewenste_datum_start;

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
        leveringswijze, leveringsadres, type_ondergrond, toegankelijkheid,
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
});

// Status wijzigen (accepteren/weigeren/inplannen/...)
router.post('/:id/status', async (req, res) => {
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
});

// Beschikbaarheid opvragen zonder een boeking aan te maken (handig voor de admin-UI)
router.post('/beschikbaarheid-check', async (req, res) => {
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
});

module.exports = router;
