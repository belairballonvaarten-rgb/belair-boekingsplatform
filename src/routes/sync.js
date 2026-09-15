const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(vereistIngelogd);

// Zelfde statuslijst als het Dashboard: enkel "definitief genoeg" geplande
// boekingen zijn interessant voor de leveringen-app, geen kale aanvragen.
const GEPLANDE_STATUSSEN = [
  'geaccepteerd', 'ingepland', 'bevestigd', 'betaalverzoek_verstuurd',
  'betaald_deels', 'betaald_volledig', 'gefactureerd', 'voldaan_manueel',
];

// Zelfde adreslogica als op het Dashboard: bij zelfafhaling is er geen
// leveringsadres nodig; anders valt het terug op het adres van de klant zelf.
function bepaalAdres(b) {
  if (b.leveringswijze === 'afhaling') return '';
  return b.leveringsadres
    || [b.klant_adres, [b.klant_postcode, b.klant_gemeente].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

// pg geeft DATE/TIMESTAMPTZ-kolommen terug als JS Date-objecten — dit werkt
// zowel op zo'n Date als op een string, en geeft in beide gevallen YYYY-MM-DD.
function naarDatum(waarde) {
  if (!waarde) return '';
  return new Date(waarde).toISOString().slice(0, 10);
}

// Zelfde, maar dan de tijdcomponent (HH:MM) — voor leveringstijd/afhaaltijd.
function naarTijd(waarde) {
  if (!waarde) return '';
  return new Date(waarde).toISOString().slice(11, 16);
}

router.get('/leveringen-app/status', asyncHandler(async (req, res) => {
  res.json({
    geconfigureerd: !!(process.env.LEVERINGEN_APP_URL && process.env.LEVERINGEN_APP_SYNC_SECRET),
  });
}));

router.post('/leveringen-app', asyncHandler(async (req, res) => {
  const url = process.env.LEVERINGEN_APP_URL;
  const sleutel = process.env.LEVERINGEN_APP_SYNC_SECRET;
  if (!url || !sleutel) {
    return res.status(501).json({
      fout: 'Koppeling met de leveringen-app is nog niet geconfigureerd (LEVERINGEN_APP_URL / LEVERINGEN_APP_SYNC_SECRET ontbreken bij Render).',
    });
  }

  // Zelfde venster als de bestaande WordPress-sync: vanaf 2 dagen geleden tot
  // in de toekomst, zodat net afgelopen leveringen nog even meekomen.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 2);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { rows } = await db.query(
    `SELECT b.id, b.leveringswijze, b.leveringsadres,
            b.gewenste_datum_start, b.gewenste_datum_einde,
            k.naam AS klant_naam, k.telefoon AS klant_telefoon, k.email AS klant_email,
            k.adres AS klant_adres, k.postcode AS klant_postcode, k.gemeente AS klant_gemeente,
            l.leveringstijd, l.afhaaltijd, l.voertuig,
            bp_namen.producten_namen,
            COALESCE(bp_totalen.totaal, 0) AS totaal
     FROM boekingen b
     JOIN klanten k ON k.id = b.klant_id
     LEFT JOIN leveringen l ON l.boeking_id = b.id
     LEFT JOIN (
       SELECT bp.boeking_id,
              string_agg(p.naam || CASE WHEN bp.aantal > 1 THEN ' (x' || bp.aantal || ')' ELSE '' END, ', ' ORDER BY p.naam) AS producten_namen
       FROM boeking_producten bp
       JOIN producten p ON p.id = bp.product_id
       GROUP BY bp.boeking_id
     ) bp_namen ON bp_namen.boeking_id = b.id
     LEFT JOIN (
       SELECT boeking_id, SUM(prijs * aantal) AS totaal
       FROM boeking_producten
       GROUP BY boeking_id
     ) bp_totalen ON bp_totalen.boeking_id = b.id
     WHERE b.status = ANY($1) AND b.gewenste_datum_einde >= $2
     ORDER BY b.gewenste_datum_start`,
    [GEPLANDE_STATUSSEN, cutoffStr]
  );

  const boekingen = rows.map((b) => ({
    boekingsnummer: b.id,
    klant: b.klant_naam,
    telefoon: b.klant_telefoon || '',
    email: b.klant_email || '',
    adres: bepaalAdres(b),
    datum: naarDatum(b.gewenste_datum_start),
    tijdslot: naarTijd(b.leveringstijd),
    afhaaldatum: naarDatum(b.gewenste_datum_einde),
    afhaaltijd: naarTijd(b.afhaaltijd),
    artikelen: b.producten_namen || '',
    bedrag: Number(b.totaal || 0),
    voertuig: b.voertuig || null,
  }));

  try {
    const respons = await fetch(url.replace(/\/$/, '') + '/api/sync/boekingsplatform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Belair-Sync-Key': sleutel },
      body: JSON.stringify({ boekingen }),
    });
    const data = await respons.json().catch(() => null);
    if (!respons.ok || !data) {
      return res.status(502).json({ fout: `De leveringen-app antwoordde met een fout (${respons.status})`, details: data });
    }
    res.json({ verstuurd: boekingen.length, ...data });
  } catch (err) {
    res.status(502).json({ fout: 'Kon de leveringen-app niet bereiken: ' + err.message });
  }
}));

module.exports = router;
