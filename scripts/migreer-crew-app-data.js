/**
 * Eenmalig overzetscript (Stage 2, vóór de crew-app overschakelt op deze
 * databank): kopieert de checklist-gegevens (plaatsing/afhaling) en foto's
 * die de crew al via de crew-app heeft ingegeven, naar de nieuwe kolommen/
 * tabellen op DIT platform (toegevoegd in migratie 020), zodat er niets
 * verloren gaat wanneer de crew-app straks stopt met zijn eigen databank
 * te gebruiken.
 *
 * Bewust NIET overgezet (zie uitleg onderaan bij het rapport):
 *  - betaling ter plekke (crew-app d.betaling) — raakt de officiële
 *    facturatie/betaalstatus, wordt NIET automatisch overgenomen.
 *  - toegewezenAan / toegewezenAanAfhaling (crew-app users-koppeling) —
 *    kan pas zodra de crew-app's 'users'-tabel mee op deze databank zit.
 *  - status / volgorde — lopen al correct via de bestaande sync (sync.js).
 *
 * Gebruik (vanuit de Shell van de boekingsplatform-service op Render, waar
 * DATABASE_URL al klaarstaat):
 *
 *   CREW_APP_DATABASE_URL="<externe url van de crew-app-databank>" \
 *     node scripts/migreer-crew-app-data.js
 *
 * Standaard een DROOGLOOP (er wordt niets weggeschreven, enkel gerapporteerd).
 * Pas als het rapport er goed uitziet, echt uitvoeren met:
 *
 *   CREW_APP_DATABASE_URL="..." node scripts/migreer-crew-app-data.js --uitvoeren
 *
 * Mag gerust meermaals gedraaid worden: elke run overschrijft dezelfde
 * kolommen met de laatste stand uit de crew-app (idempotent), dus een
 * dubbele uitvoering is onschadelijk.
 */
require('dotenv').config();
const { Pool } = require('pg');

const UITVOEREN = process.argv.includes('--uitvoeren');

function maakPool(url) {
  const useSsl = url.includes('render.com') || process.env.PGSSL === 'true';
  return new Pool({ connectionString: url, ssl: useSsl ? { rejectUnauthorized: false } : false });
}

function naarInt(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function naarDatum(v) {
  if (!v) return null;
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function naarTijdstempel(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Vult tijdstip-notities (crew-app heeft geen eigen kolom hiervoor op het
// platform) als extra regel vooraan de opmerkingen, zodat die info niet
// gewoon verdwijnt.
function metTijdstipVoorvoegsel(tijdstip, opmerkingen) {
  const basis = (opmerkingen || '').trim();
  if (!tijdstip) return basis || null;
  const voorvoegsel = `(voorziene tijd: ${tijdstip})`;
  return basis ? `${voorvoegsel} ${basis}` : voorvoegsel;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL ontbreekt (platform-databank).');
    process.exit(1);
  }
  if (!process.env.CREW_APP_DATABASE_URL) {
    console.error('CREW_APP_DATABASE_URL ontbreekt. Geef de databank-URL van de crew-app mee, bv.:\n  CREW_APP_DATABASE_URL="postgresql://..." node scripts/migreer-crew-app-data.js');
    process.exit(1);
  }

  const platform = maakPool(process.env.DATABASE_URL);
  const crewApp = maakPool(process.env.CREW_APP_DATABASE_URL);

  console.log(UITVOEREN ? '=== ECHTE UITVOERING (schrijft weg naar de platform-databank) ===' : '=== DROOGLOOP (er wordt niets weggeschreven — voeg --uitvoeren toe om echt uit te voeren) ===');

  try {
    const { rows: deliveries } = await crewApp.query('SELECT id, data FROM deliveries');
    const { rows: photoRows } = await crewApp.query('SELECT id, delivery_id, naam, data_url, created_at FROM photos ORDER BY id');
    const fotosPerDelivery = new Map();
    for (const p of photoRows) {
      if (!fotosPerDelivery.has(p.delivery_id)) fotosPerDelivery.set(p.delivery_id, []);
      fotosPerDelivery.get(p.delivery_id).push(p);
    }

    let bijgewerkt = 0;
    let overgeslagenGeenBoekingsnummer = 0;
    let overgeslagenBoekingNietGevonden = [];
    let fotosGekopieerd = 0;
    const heeftBetaalinfoGenegeerd = [];

    for (const row of deliveries) {
      const d = row.data || {};
      const boekingsnummer = (d.boekingsnummer || '').trim();
      if (!boekingsnummer) {
        overgeslagenGeenBoekingsnummer++;
        continue;
      }

      const { rows: boekingRows } = await platform.query('SELECT id FROM boekingen WHERE id = $1', [boekingsnummer]);
      if (!boekingRows.length) {
        overgeslagenBoekingNietGevonden.push({ crewAppDeliveryId: row.id, boekingsnummer, klant: d.klant });
        continue;
      }

      const plaatsing = d.plaatsing || {};
      const afhaling = d.afhaling || {};

      if (d.betaling && (d.betaling.status || d.betaling.opmerking)) {
        heeftBetaalinfoGenegeerd.push({ boekingsnummer, klant: d.klant, betaling: d.betaling });
      }

      const velden = {
        plaatsing_correct: plaatsing.correctGeplaatst ?? null,
        plaatsing_bevestiging: plaatsing.bevestiging || null,
        plaatsing_valmatten: plaatsing.valmatten ?? null,
        plaatsing_verlengkabel: plaatsing.verlengkabel ?? null,
        plaatsing_aantal_kabels: naarInt(plaatsing.aantalKabels),
        plaatsing_aantal_zandzakken: naarInt(plaatsing.aantalZandzakken),
        plaatsing_netjes: plaatsing.netjes ?? null,
        plaatsing_opmerkingen: metTijdstipVoorvoegsel(plaatsing.tijdstip, plaatsing.opmerkingen),
        plaatsing_bevestigd: !!plaatsing.bevestigd,
        plaatsing_bevestigd_op: naarTijdstempel(plaatsing.bevestigdOp),
        afhaling_valmatten_terug: afhaling.valmattenTerug ?? null,
        afhaling_kabels_terug: afhaling.kabelsTerug ?? null,
        afhaling_bevestiging_terug: afhaling.bevestigingTerug ?? null,
        afhaling_nat_of_vuil: afhaling.natOfVuil ?? null,
        afhaling_reiniging_nodig: afhaling.reinigingNodig ?? null,
        afhaling_opmerkingen: metTijdstipVoorvoegsel(afhaling.tijdstip, afhaling.opmerkingen),
        afhaling_bevestigd: !!afhaling.bevestigd,
        afhaling_bevestigd_op: naarTijdstempel(afhaling.bevestigdOp),
        afhaling_verzet_aangevraagd: !!afhaling.verzetAangevraagd,
        afhaling_verzet_naar_datum: naarDatum(afhaling.verzetNaarDatum),
        afhaling_verzet_reden: afhaling.verzetReden || null,
      };

      console.log(`- ${boekingsnummer} (${d.klant || 'onbekende klant'}): plaatsing_bevestigd=${velden.plaatsing_bevestigd}, afhaling_bevestigd=${velden.afhaling_bevestigd}`);

      let leveringenId = null;
      if (UITVOEREN) {
        const kolomNamen = Object.keys(velden);
        const upsert = await platform.query(
          `INSERT INTO leveringen (boeking_id, ${kolomNamen.join(', ')})
           VALUES ($1, ${kolomNamen.map((_, i) => `$${i + 2}`).join(', ')})
           ON CONFLICT (boeking_id) DO UPDATE SET
             ${kolomNamen.map((k) => `${k} = EXCLUDED.${k}`).join(', ')}
           RETURNING id`,
          [boekingsnummer, ...kolomNamen.map((k) => velden[k])]
        );
        leveringenId = upsert.rows[0].id;
      } else {
        const { rows } = await platform.query('SELECT id FROM leveringen WHERE boeking_id = $1', [boekingsnummer]);
        leveringenId = rows[0] ? rows[0].id : '(nog geen leveringen-rij, wordt aangemaakt)';
      }
      bijgewerkt++;

      // Foto's: crew-app houdt geen plaatsing/afhaling-fase per foto bij, dus
      // schatten we dit in op basis van het tijdstip t.o.v. plaatsing_bevestigd_op.
      const fotos = fotosPerDelivery.get(row.id) || [];
      for (const foto of fotos) {
        const fase = (velden.plaatsing_bevestigd_op && new Date(foto.created_at) > new Date(velden.plaatsing_bevestigd_op) && velden.afhaling_bevestigd)
          ? 'afhaling'
          : 'plaatsing';
        if (UITVOEREN && leveringenId) {
          await platform.query(
            `INSERT INTO leveringen_fotos (leveringen_id, fase, naam, data_url, aangemaakt_op) VALUES ($1, $2, $3, $4, $5)`,
            [leveringenId, fase, foto.naam, foto.data_url, foto.created_at]
          );
        }
        fotosGekopieerd++;
      }
    }

    console.log('\n=== RAPPORT ===');
    console.log(`Leveringen ${UITVOEREN ? 'bijgewerkt' : 'die bijgewerkt zouden worden'}: ${bijgewerkt}`);
    console.log(`Foto's ${UITVOEREN ? 'gekopieerd' : 'die gekopieerd zouden worden'}: ${fotosGekopieerd} (fase is een inschatting, want de crew-app hield dit niet apart bij — controleer dit best even visueel na)`);
    console.log(`Overgeslagen — geen boekingsnummer (test-levering zonder echte koppeling): ${overgeslagenGeenBoekingsnummer}`);
    if (overgeslagenBoekingNietGevonden.length) {
      console.log(`Overgeslagen — boekingsnummer niet gevonden op het platform (${overgeslagenBoekingNietGevonden.length}x), controleer dit manueel:`);
      overgeslagenBoekingNietGevonden.forEach((x) => console.log(`   - ${x.boekingsnummer} (${x.klant || '?'}, crew-app id ${x.crewAppDeliveryId})`));
    }
    if (heeftBetaalinfoGenegeerd.length) {
      console.log(`\nLET OP — deze leveringen hebben in de crew-app "betaling ter plekke"-info staan die BEWUST NIET is overgezet (raakt de officiële facturatie, moet je zelf nakijken):`);
      heeftBetaalinfoGenegeerd.forEach((x) => console.log(`   - ${x.boekingsnummer} (${x.klant || '?'}): ${JSON.stringify(x.betaling)}`));
    }
    if (!UITVOEREN) {
      console.log('\nDit was een droogloop. Ziet dit rapport er goed uit? Voer dan opnieuw uit met --uitvoeren.');
    }
  } finally {
    await platform.end();
    await crewApp.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('MISLUKT:', err);
    process.exit(1);
  });
}

module.exports = { naarInt, naarDatum, naarTijdstempel, metTijdstipVoorvoegsel };
