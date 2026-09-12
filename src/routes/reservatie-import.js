const express = require('express');
const db = require('../db');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(vereistIngelogd);

// ============================================================
// Reservaties in bulk importeren uit een Excel-export (bv. van het vorige
// systeem/bookingonline.co.uk). Het bestand zelf wordt in de browser gelezen
// (zie public/js/app.js, met SheetJS) — hierheen komt enkel al ontlede,
// gestructureerde data per rij. Twee stappen, bewust nooit in één keer:
//   1) POST /preview  — leest niets, schrijft niets: enkel producten matchen
//      en mogelijke dubbels opsporen, zodat Jonas alles kan nakijken.
//   2) POST /bevestig — maakt effectief de boekingen aan, enkel voor de rijen
//      die Jonas expliciet aanvinkt (dubbels staan standaard UIT).
// ============================================================

function normaliseerTekst(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function vindProduct(alleProducten, naamRuw) {
  const zoek = normaliseerTekst(naamRuw);
  if (!zoek) return null;
  let match = alleProducten.find((p) => normaliseerTekst(p.naam) === zoek);
  if (!match) {
    match = alleProducten.find((p) => {
      const n = normaliseerTekst(p.naam);
      return n.includes(zoek) || zoek.includes(n);
    });
  }
  return match || null;
}

// "Outdoors on Hard Surface" heeft geen eenduidige match in onze eigen
// ONDERGROND_OPTIES-lijst (Gras/Steen/Braakliggend/Zand/Klinkers) — we kiezen
// hier "Steen" als meest waarschijnlijke standaard, maar melden dit expliciet
// per rij zodat Jonas dit kan nakijken/corrigeren i.p.v. dat het stilzwijgend
// verkeerd blijft staan.
function bepaalOndergrond(ruw) {
  const t = normaliseerTekst(ruw);
  if (!t || t.includes('no selection')) return { waarde: null, onzeker: false };
  if (t.includes('grass')) return { waarde: 'Gras', onzeker: false };
  if (t.includes('hard surface')) return { waarde: 'Steen', onzeker: true };
  return { waarde: null, onzeker: false };
}

function rond(bedrag) {
  return Math.round((Number(bedrag) || 0) * 100) / 100;
}

async function verwerkRij(rij, client) {
  const naam = (rij.klantNaam || '').trim() || null;
  const email = (rij.email || '').trim() || null;
  const telefoon = (rij.telefoon || '').trim() || null;
  const datumStart = rij.datumStart || null;
  const datumEinde = rij.datumEinde || rij.datumStart || null;

  const problemen = [];
  if (!naam) problemen.push('Klantnaam ontbreekt');
  if (!datumStart) problemen.push('Leverdatum ontbreekt of niet herkend');

  // Producten matchen: de "Item"-kolom bevat elk item zoveel keer als de
  // gewenste hoeveelheid (bevestigd o.b.v. Jonas' voorbeeldbestand) — we
  // groeperen dus gewoon op (genormaliseerde) naam en tellen.
  const { rows: alleProducten } = await client.query('SELECT id, naam, prijs FROM producten');
  const aantalPerNaam = new Map();
  (rij.itemsRuw || []).forEach((item) => {
    const key = (item || '').trim();
    if (!key) return;
    aantalPerNaam.set(key, (aantalPerNaam.get(key) || 0) + 1);
  });

  const producten = [];
  const onherkendeProducten = [];
  for (const [itemNaam, aantal] of aantalPerNaam) {
    const product = await vindProduct(alleProducten, itemNaam);
    if (product) {
      producten.push({ product_id: product.id, naam: product.naam, aantal, prijs: Number(product.prijs) });
    } else {
      onherkendeProducten.push(itemNaam);
    }
  }
  if (aantalPerNaam.size === 0) problemen.push('Geen producten in de "Item"-kolom gevonden');
  else if (!producten.length) problemen.push('Geen enkel product uit deze rij herkend in de productenlijst');

  const totaalProducten = rond(producten.reduce((s, p) => s + p.prijs * p.aantal, 0));
  const balance = rij.balance != null && rij.balance !== '' ? Number(rij.balance) : 0;
  let betaaldBedrag = rond(totaalProducten - balance);
  let balansAfwijking = false;
  if (betaaldBedrag < 0 || betaaldBedrag > totaalProducten) {
    balansAfwijking = true;
    betaaldBedrag = Math.min(Math.max(betaaldBedrag, 0), totaalProducten);
  }

  const { waarde: ondergrond, onzeker: ondergrondOnzeker } = bepaalOndergrond(rij.ondergrondRuw);

  // Mogelijke dubbele import opsporen: zelfde klant (op e-mail/telefoon, of bij
  // ontstentenis daarvan de naam) EN dezelfde leverdatum als een bestaande boeking.
  let dubbel = null;
  if (datumStart) {
    const condities = ['b.gewenste_datum_start = $1'];
    const params = [datumStart];
    if (email || telefoon) {
      const sub = [];
      if (email) { params.push(email); sub.push(`k.email = $${params.length}`); }
      if (telefoon) { params.push(telefoon); sub.push(`k.telefoon = $${params.length}`); }
      condities.push(`(${sub.join(' OR ')})`);
    } else if (naam) {
      params.push(naam);
      condities.push(`lower(k.naam) = lower($${params.length})`);
    }
    const { rows } = await client.query(
      `SELECT b.id, b.status, k.naam AS klant_naam FROM boekingen b JOIN klanten k ON k.id = b.klant_id
       WHERE ${condities.join(' AND ')} LIMIT 1`,
      params
    );
    if (rows[0]) dubbel = rows[0];
  }

  const waarschuwingen = [];
  if (onherkendeProducten.length) waarschuwingen.push(`Onherkend product(en): ${onherkendeProducten.join(', ')} — voeg deze eventueel manueel toe in het dossier.`);
  if (ondergrondOnzeker) waarschuwingen.push(`"${rij.ondergrondRuw}" is aangenomen als "Steen" — controleer dit.`);
  if (balansAfwijking) waarschuwingen.push(`Berekend bedrag (o.b.v. huidige prijzen) en het openstaand saldo uit het bestand kwamen niet overeen — betaald bedrag is aangepast zodat het saldo klopt.`);

  const status = problemen.length ? 'fout' : (dubbel ? 'mogelijk_dubbel' : 'nieuw');

  return {
    rijnummer: rij.rijnummer,
    klantNaam: naam,
    email,
    telefoon,
    adres: (rij.adres || '').trim() || null,
    gemeente: (rij.gemeente || '').trim() || null,
    postcode: (rij.postcode || '').trim() || null,
    datumStart,
    datumEinde,
    tijdstipLevering: (rij.tijdstipLevering || '').trim() || null,
    tijdstipAfhaling: (rij.tijdstipAfhaling || '').trim() || null,
    ondergrond,
    notities: (rij.notities || '').trim() || null,
    producten,
    onherkendeProducten,
    totaalProducten,
    balance,
    betaaldBedrag,
    saldoOpenstaand: rond(totaalProducten - betaaldBedrag),
    status,
    problemen,
    waarschuwingen,
    dubbel,
  };
}

router.post('/preview', asyncHandler(async (req, res) => {
  const { rijen } = req.body;
  if (!Array.isArray(rijen) || !rijen.length) {
    return res.status(400).json({ fout: 'Geen rijen ontvangen' });
  }
  const client = await db.getClient();
  try {
    const resultaat = [];
    for (const rij of rijen) {
      resultaat.push(await verwerkRij(rij, client));
    }
    res.json({ rijen: resultaat });
  } finally {
    client.release();
  }
}));

async function vindOfMaakKlant(client, { klantNaam, adres, postcode, gemeente, telefoon, email }) {
  if (email) {
    const { rows } = await client.query('SELECT id FROM klanten WHERE email = $1 LIMIT 1', [email]);
    if (rows[0]) return rows[0].id;
  }
  if (telefoon) {
    const { rows } = await client.query('SELECT id FROM klanten WHERE telefoon = $1 LIMIT 1', [telefoon]);
    if (rows[0]) return rows[0].id;
  }
  const { rows } = await client.query(
    `INSERT INTO klanten (naam, klant_type, adres, postcode, gemeente, telefoon, email)
     VALUES ($1, 'particulier', $2, $3, $4, $5, $6) RETURNING id`,
    [klantNaam, adres || null, postcode || null, gemeente || null, telefoon || null, email || null]
  );
  return rows[0].id;
}

router.post('/bevestig', asyncHandler(async (req, res) => {
  const { rijen } = req.body;
  if (!Array.isArray(rijen) || !rijen.length) {
    return res.status(400).json({ fout: 'Geen rijen ontvangen' });
  }

  const resultaat = { aangemaakt: 0, overgeslagen: [] };

  for (const rij of rijen) {
    if (!rij.klantNaam || !rij.datumStart) {
      resultaat.overgeslagen.push({ rijnummer: rij.rijnummer, reden: 'Klantnaam of datum ontbreekt' });
      continue;
    }
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const klantId = await vindOfMaakKlant(client, rij);

      const adresVolledig = [rij.adres, [rij.postcode, rij.gemeente].filter(Boolean).join(' ')]
        .filter(Boolean).join(', ') || null;

      const { rows: boekingRows } = await client.query(
        `INSERT INTO boekingen (
           klant_id, gewenste_datum_start, gewenste_datum_einde, leveringswijze, leveringsadres,
           type_ondergrond, voorkeur_tijdstip_levering, voorkeur_tijdstip_afhaling, notities, bron
         ) VALUES ($1, $2, $3, 'levering', $4, $5, $6, $7, $8, 'excel-import')
         RETURNING id`,
        [
          klantId, rij.datumStart, rij.datumEinde || rij.datumStart, adresVolledig,
          (rij.ondergrond && rij.ondergrond.waarde) || null,
          rij.tijdstipLevering || null, rij.tijdstipAfhaling || null, rij.notities || null,
        ]
      );
      const boekingId = boekingRows[0].id;

      for (const p of (rij.producten || [])) {
        await client.query(
          'INSERT INTO boeking_producten (boeking_id, product_id, aantal, prijs) VALUES ($1, $2, $3, $4)',
          [boekingId, p.product_id, p.aantal, p.prijs]
        );
      }

      await client.query(
        'INSERT INTO boeking_status_historiek (boeking_id, van_status, naar_status) VALUES ($1, NULL, $2)',
        [boekingId, 'nieuw']
      );

      const betaaldBedrag = Number(rij.betaaldBedrag) || 0;
      if (betaaldBedrag > 0) {
        await client.query(
          'INSERT INTO betaling_transacties (boeking_id, bedrag, opmerking) VALUES ($1, $2, $3)',
          [boekingId, betaaldBedrag, 'Automatisch berekend bij Excel-import (o.b.v. huidige prijzen)']
        );
        const totaal = Number(rij.totaalProducten) || 0;
        const betaalstatus = betaaldBedrag >= totaal ? 'volledig' : 'deels';
        await client.query(
          `INSERT INTO betalingen (boeking_id, bedrag, betaald_bedrag, betaalstatus)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (boeking_id) DO UPDATE
             SET bedrag = EXCLUDED.bedrag, betaald_bedrag = EXCLUDED.betaald_bedrag,
                 betaalstatus = EXCLUDED.betaalstatus, bijgewerkt_op = now()`,
          [boekingId, totaal, betaaldBedrag, betaalstatus]
        );
      }

      await client.query('COMMIT');
      resultaat.aangemaakt++;
    } catch (err) {
      await client.query('ROLLBACK');
      resultaat.overgeslagen.push({ rijnummer: rij.rijnummer, reden: err.message });
    } finally {
      client.release();
    }
  }

  res.json(resultaat);
}));

module.exports = router;
