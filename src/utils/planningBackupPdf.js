// Genereert een leesbaar PDF-overzicht van de huidige planning — op vraag van
// Jonas ALS aanvulling op de dagelijkse JSON-back-up naar Dropbox (zie
// utils/dropboxSync.js): de JSON is bedoeld als technische back-up (voor een
// eventueel databank-herstel), dit PDF is bedoeld om zelf te lezen/afdrukken,
// bv. als hij ergens zonder internet zit of als alles stuk zou zijn — dan
// heeft hij toch een leesbare, volledige kopie van al zijn boekingen bij de
// hand (telefoon/print), met per boeking alle details (ook prijs/saldo en
// notities, op uitdrukkelijke vraag van Jonas — niet enkel een kort rijtje).
//
// BEWUST beperkt tot recente + toekomstige boekingen (vanaf VANAF_DAGEN_TERUG
// dagen geleden) i.p.v. de volledige historiek zoals de JSON-back-up — voor
// een document dat je ter plaatse leest/afdrukt is jarenlange oude, al
// afgehandelde geschiedenis niet bruikbaar en maakt het enkel onwerkbaar lang.
// Geweigerde aanvragen worden ook weggelaten (operationeel niet relevant).
//
// Herbruikt briefhoofding-gegevens + teken-helpers van ondertekendDocument.js
// (zelfde aanpak als productRapport.js hiernaast) i.p.v. alles te dupliceren.
const PDFDocument = require('pdfkit');
const db = require('../db');
const { berekenPrijstabel } = require('./prijstabel');
const { BEDRIJF, KL, euro, fmtDatum, fmtDatumTijd, tekenKaart } = require('./ondertekendDocument');

const VANAF_DAGEN_TERUG = 14;

const STATUS_LABELS = {
  nieuw: 'Nieuw', in_behandeling: 'In behandeling', geaccepteerd: 'Geaccepteerd',
  ingepland: 'Ingepland', bevestigd: 'Bevestigd', betaalverzoek_verstuurd: 'Betaalverzoek verstuurd',
  betaald_deels: 'Betaald (deels)', betaald_volledig: 'Betaald (volledig)',
  gefactureerd: 'Gefactureerd', voldaan_manueel: 'Voldaan manueel',
};

function zorgRuimte(doc, margin, benodigd) {
  if (doc.y + benodigd > doc.page.height - margin) {
    doc.addPage();
    doc.y = margin;
  }
}

async function haalBoekingenData() {
  const { rows: boekingen } = await db.query(
    `SELECT b.*, k.naam AS klant_naam, k.email AS klant_email, k.telefoon AS klant_telefoon,
            k.adres AS klant_adres, k.postcode AS klant_postcode, k.gemeente AS klant_gemeente
     FROM boekingen b JOIN klanten k ON k.id = b.klant_id
     WHERE b.status <> 'geweigerd' AND b.gewenste_datum_start >= (CURRENT_DATE - INTERVAL '${VANAF_DAGEN_TERUG} days')
     ORDER BY b.gewenste_datum_start, b.aangemaakt_op`
  );
  const { rows: producten } = await db.query(
    `SELECT bp.boeking_id, COALESCE(p.naam, bp.ruwe_naam, 'Onbekend product') AS product_naam, bp.aantal, bp.prijs, bp.optie_naam
     FROM boeking_producten bp LEFT JOIN producten p ON p.id = bp.product_id
     ORDER BY bp.boeking_id`
  );
  const { rows: leveringen } = await db.query(
    `SELECT boeking_id, voertuig_levering, voertuig_afhaling, leveringstijd, afhaaltijd,
            levering_voltooid, afhaling_voltooid
     FROM leveringen`
  );
  const productenPerBoeking = new Map();
  producten.forEach((p) => {
    if (!productenPerBoeking.has(p.boeking_id)) productenPerBoeking.set(p.boeking_id, []);
    productenPerBoeking.get(p.boeking_id).push(p);
  });
  const leveringPerBoeking = new Map(leveringen.map((l) => [l.boeking_id, l]));
  return { boekingen, productenPerBoeking, leveringPerBoeking };
}

function bepaalAdres(b) {
  if (b.leveringswijze === 'afhaling') return 'Zelfafhaling';
  return b.leveringsadres
    || [b.klant_adres, [b.klant_postcode, b.klant_gemeente].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    || '—';
}

async function genereerPlanningBackupPdf() {
  const { boekingen, productenPerBoeking, leveringPerBoeking } = await haalBoekingenData();

  const MARGIN = 40;
  const doc = new PDFDocument({ margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }, size: 'A4' });
  const CONTENT_W = doc.page.width - MARGIN * 2;
  const buffers = [];
  doc.on('data', (chunk) => buffers.push(chunk));
  const klaar = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
  });

  // ---- Briefhoofding ----
  doc.fontSize(20).font('Helvetica-Bold').fillColor(KL.oranje).text(BEDRIJF.naam, MARGIN, MARGIN);
  doc.fontSize(8).font('Helvetica').fillColor(KL.grijs)
    .text(`${BEDRIJF.verantwoordelijke} · ${BEDRIJF.adres}`, MARGIN, MARGIN + 25, { width: 300 })
    .text(`Tel ${BEDRIJF.tel} · Gsm ${BEDRIJF.gsm} · ${BEDRIJF.email}`, MARGIN, MARGIN + 36, { width: 300 });
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000')
    .text('Planning-overzicht (back-up)', MARGIN, MARGIN + 2, { width: CONTENT_W, align: 'right' });
  doc.fontSize(8.5).font('Helvetica').fillColor(KL.grijs)
    .text(`Boekingen vanaf ${VANAF_DAGEN_TERUG} dagen geleden — afgedrukt op ${fmtDatumTijd(new Date())}`, MARGIN, MARGIN + 19, { width: CONTENT_W, align: 'right' });
  doc.fillColor('#000000');
  const dividerY = MARGIN + 55;
  doc.moveTo(MARGIN, dividerY).lineTo(MARGIN + CONTENT_W, dividerY).lineWidth(2).strokeColor(KL.oranje).stroke();
  doc.y = dividerY + 14;

  if (!boekingen.length) {
    doc.fontSize(10).font('Helvetica').fillColor(KL.grijs).text('Geen boekingen in deze periode.', MARGIN, doc.y);
  }

  for (const b of boekingen) {
    const prijstabel = await berekenPrijstabel(b.id);
    const producten = productenPerBoeking.get(b.id) || [];
    const levering = leveringPerBoeking.get(b.id);

    // ---- Kaartkop: datum + klantnaam + status, met genoeg ruimte voor de
    // rest van de kaart gereserveerd zodat die niet halverwege afbreekt op
    // een nieuwe pagina (ruwe schatting, tekenKaart breekt zelf niet af).
    zorgRuimte(doc, MARGIN, 230);
    doc.fontSize(11.5).font('Helvetica-Bold').fillColor(KL.zwart)
      .text(`${fmtDatum(b.gewenste_datum_start)}${b.gewenste_datum_einde && b.gewenste_datum_einde !== b.gewenste_datum_start ? ' t.e.m. ' + fmtDatum(b.gewenste_datum_einde) : ''} — ${b.klant_naam}`, MARGIN, doc.y, { width: CONTENT_W - 140 });
    doc.fontSize(9).font('Helvetica-Bold').fillColor(KL.grijs)
      .text(STATUS_LABELS[b.status] || b.status, MARGIN, doc.y - 14, { width: CONTENT_W, align: 'right' });
    doc.fillColor('#000000');
    doc.moveDown(0.4);

    const colGap = 16;
    const colW = (CONTENT_W - colGap) / 2;
    const leftX = MARGIN;
    const rightX = MARGIN + colW + colGap;
    const topY = doc.y;

    const klantRegels = [
      { label: 'Telefoon', waarde: b.klant_telefoon },
      { label: 'E-mail', waarde: b.klant_email },
      { label: 'Adres', waarde: bepaalAdres(b) },
      { label: 'Tijdstip lev.', waarde: b.voorkeur_tijdstip_levering || (levering && levering.leveringstijd ? fmtDatumTijd(levering.leveringstijd) : null) },
      { label: 'Tijdstip afh.', waarde: b.voorkeur_tijdstip_afhaling || (levering && levering.afhaaltijd ? fmtDatumTijd(levering.afhaaltijd) : null) },
    ];
    const leftH = tekenKaart(doc, leftX, topY, colW, 'Klant & levering', klantRegels);

    const prijsRegels = [
      { label: 'Subtotaal', waarde: euro(prijstabel.subtotaal_producten) },
      { label: 'Transport', waarde: euro(prijstabel.transportkost) },
      { label: 'Totaal', waarde: euro(prijstabel.totaal) },
      { label: 'Betaald', waarde: euro(prijstabel.betaald_bedrag) },
      { label: 'Saldo open', waarde: euro(prijstabel.saldo_openstaand) },
    ];
    const rightH = tekenKaart(doc, rightX, topY, colW, 'Prijs & betaling', prijsRegels);
    doc.y = topY + Math.max(leftH, rightH) + 10;

    // ---- Producten ----
    if (producten.length) {
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(KL.grijs).text('PRODUCTEN', MARGIN, doc.y);
      doc.moveDown(0.15);
      producten.forEach((p) => {
        zorgRuimte(doc, MARGIN, 14);
        const naam = p.optie_naam ? `${p.product_naam} (${p.optie_naam})` : p.product_naam;
        doc.fontSize(9).font('Helvetica').fillColor(KL.zwart)
          .text(`${p.aantal}x ${naam}`, MARGIN, doc.y, { continued: true, width: CONTENT_W - 80 })
          .text(euro(p.prijs), { width: 80, align: 'right' });
      });
      doc.fillColor('#000000');
      doc.moveDown(0.3);
    }

    // ---- Notities ----
    const notities = [b.speciaal_verzoek_notitie, b.notities].filter(Boolean).join(' — ');
    if (notities) {
      zorgRuimte(doc, MARGIN, 20);
      doc.fontSize(8.5).font('Helvetica-Oblique').fillColor(KL.grijs)
        .text(`Opmerking: ${notities}`, MARGIN, doc.y, { width: CONTENT_W });
      doc.fillColor('#000000');
    }

    doc.moveDown(0.5);
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_W, doc.y).lineWidth(0.5).strokeColor(KL.rand).stroke();
    doc.moveDown(0.6);
  }

  doc.end();
  const buffer = await klaar;
  const bestandsnaam = `planning-${fmtDatum(new Date()).replace(/\//g, '-')}.pdf`;
  return { buffer, bestandsnaam };
}

module.exports = { genereerPlanningBackupPdf };
