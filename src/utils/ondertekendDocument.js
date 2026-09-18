// Genereert het ondertekende leverings-/plaatsingsdocument (PDF) nadat de
// klant getekend heeft in de leveringen-app (zie plaatsing_handtekening in de
// leveringen-tabel) — adresgegevens, betaalstatus, een samenvatting van de
// plaatsingschecklist (met iconen), de handtekening zelf, en de algemene
// huurvoorwaarden in klein lettertype op een tweede pagina. Wordt gebruikt om
// te downloaden vanuit het dossier op het platform, en om als bijlage mee te
// sturen in een e-mail naar de klant (zie routes/boekingen.js).
//
// Lay-out (ontwerp door Jonas gekozen uit 2 voorstellen): briefhoofding, twee
// kolommen met kaartjes (Klant/Levering links, Plaatsing met icoon-vakjes
// rechts), een kleurbanner voor de betaalstatus, en een handtekeningblok. Enkel
// vector-tekeningen voor de icoontjes (cirkel + vinkje/streepje) i.p.v. emoji —
// de standaard PDF-lettertypes (Helvetica) ondersteunen geen emoji/dingbats,
// dus emoji zouden hier als lege/verkeerde tekens verschijnen.
//
// Enkel voor PLAATSING/levering (niet afhaling) — op uitdrukkelijke keuze van
// Jonas hoeft de afhaling niet ondertekend te worden.
const PDFDocument = require('pdfkit');
const db = require('../db');
const { berekenPrijstabel } = require('./prijstabel');
const { verstuurMail } = require('./mailer');

// Vaste bedrijfsgegevens voor de briefhoofding — overgenomen van het bestaande
// huurovereenkomst-document van Jonas (Belair_huurovereenkomst.pdf).
const BEDRIJF = {
  naam: 'Belair-Fun',
  verantwoordelijke: 'Van Doorsselaere Jonas',
  adres: 'Goudberg 12, B-9290 Overmere',
  tel: '09/33.50.432',
  gsm: '0485/928.756',
  email: 'info@belair-fun.be',
  website: 'www.belair-fun.be',
  iban: 'BE03 0682 4766 6184',
  btw: 'BE0889 720 424',
};

// Letterlijke tekst van ALGEMENE_VERHUURVOORWAARDEN_SPRINGKASTELEN.docx (door
// Jonas zelf aangeleverd) — bewust hier als platte tekst overgenomen i.p.v.
// samengevat, dit zijn de effectieve huurvoorwaarden.
const VOORWAARDEN = [
  'De verantwoordelijke persoon, vermeld op de huurovereenkomst, ziet toe op de naleving van de hieronder vermelde voorwaarden.',
  'Er mogen maximaal 10 personen tezelfdertijd op het springkasteel.',
  'De kinderen dienen zich te ontdoen van eender welk schoeisel alsook scherpe voorwerpen.',
  'De motor dient zover mogelijk van het springkasteel geplaatst te worden en wordt verbonden met de daartoe voorziene buis. Deze mag niet verlengd worden.',
  'De huurder stelt 2 personen ter beschikking om de attractie af te laden, te plaatsen en terug te laden; bij gebrek zal de verhuurder 25€ per uur kunnen aanrekenen.',
  'De huurder verleent te allen tijde vrije toegang aan de verhuurder tot de plaats waar de attractie opgesteld is.',
  'De motor mag NOOIT afgedekt worden!!!',
  'Bij annulatie, minder dan 10 dagen voor de in huurovereenkomst vermelde datum, zal de huurder gehouden zijn aan de volledige huurprijs, welke de reden ook zijn mag.',
  'Men voorziet een aansluiting van 220Volt met aarding, eventueel verlengkabel tot aan de motor; koppelingen dienen afgedekt te worden met plastiek.',
  'De huurder zal aanwezig zijn bij de plaatsing, en aanduiding waar de attractie geplaatst moet worden. Bij afwezigheid en verkeerde plaatsing zal bij verhuis een vaste vergoeding van 50€ aangerekend worden.',
  'De verhuurder ziet toe dat bij hevige wind het springkasteel voldoende vastgemaakt is.',
  'Het gehuurde materiaal wordt in goede staat ontvangen. De huurder is verantwoordelijk voor alle schade vastgesteld na de huurperiode. Bij eventuele vaststellingen van schade moet deze betaald worden door de huurder. De verhuurder zal hiervoor een factuur van herstelling voorleggen. Bij niet te herstellen schade zullen de vaststellingen en het bewijs hiervan tot de totale schadevergoeding leiden.',
  'Bij storm of hevig onweer dient de huurder het gehuurde goed in veiligheid te brengen. Dit dient ook bij nacht te gebeuren om schade of diefstal te voorkomen.',
  'Ieder geval van overmacht ontheft de verhuurder van alle aansprakelijkheid en heeft haar het recht alle overeenkomsten en contracten op te zeggen, zonder dat hieruit enig recht op schadevergoeding vanwege de huurder ontstaat. Gevallen van overmacht zijn o.a.: oorlog of mobilisatie, lock-out, ongunstige weersgesteldheid, staking, transportstoringen en in het algemeen alle onvoorziene gebeurtenissen die de uitvoering van de huurovereenkomst onmogelijk maken.',
  'De verhuurder kan in geen geval aansprakelijk gesteld worden voor ongevallen, hoe dan ook ontstaan, zowel aan de huurder zelf, derden, personen of dieren en materialen, onverschillig of zij zich binnen of buiten de plaats bevinden waar de attractie opgesteld is.',
  'Ook bij het lossen, plaatsen en terug laden van de attractie kan de verhuurder niet aansprakelijk gesteld worden voor letsels en schade opgelopen tijdens de werkzaamheden.',
  'De huurder zal de verhuurder vrijwaren voor alle vorderingen van derden tot betaling van welke schade ook voortspruitend uit de uitvoering van de huurovereenkomst.',
  'De huurder draagt de volledige verantwoordelijkheid voor het beschadigen, ontbreken, verliezen of verdwijnen van materiaal, wat ook de oorzaak is, met inbegrip van diefstal, ongeval, brand of overmacht.',
  'Alle andere schade dan brand- of stormschade, veroorzaakt aan de gehuurde goederen gedurende de huurperiode, wordt geacht voort te komen uit een gebrekkige of onvoldoende bewaking door de huurder. Gehele of gedeeltelijke vernietiging van het gehuurde materiaal geeft de huurder geen enkel recht op prijsvermindering of terugbetaling.',
  'Het is verboden onze publiciteit op de attractie te verwijderen of te bedekken.',
  'Niet met meerdere personen aan de figuren of muren hangen om scheuren te voorkomen.',
  'Bij beschadiging aan het gehuurde goed zal de herstellingskost ten laste van de huurder zijn.',
  'Bij regenweer: het springkasteel opgeblazen laten met de voorziene motor. Indien er beslist wordt toch het springkasteel neer te laten, moet de huurder het plooien en afdekken.',
  'Indien het bij het terugbrengen vol zit met water zal Belair-Fun de reiniging aanrekenen en afhouden van de waarborg: 110€.',
];
const FACTUURVOORWAARDEN = [
  'Bij afhaling/levering/plaatsing wordt het volledige bedrag contant betaald.',
  'Factuur wordt opgemaakt en naar de huurder verstuurd na het in goede staat terugbrengen van het gehuurde materiaal.',
];

// ---- Kleuren ----
const KL = {
  oranje: '#e8631e',
  zwart: '#1a1a1a',
  grijs: '#777777',
  grijsLicht: '#fafafa',
  rand: '#eeeeee',
  groenBg: '#e9f8ee', groenRand: '#a9dfb8', groenTekst: '#1a7a3c', groenIcoon: '#2fa84f',
  roodBg: '#fdecea', roodRand: '#f3c3bd', roodTekst: '#c0392b',
  chipGrijsBg: '#f4f5f6', chipGrijsRand: '#e2e4e7', chipGrijsIcoon: '#b7bcc4',
};

function euro(bedrag) {
  return '€ ' + Number(bedrag || 0).toFixed(2).replace('.', ',');
}
function fmtDatum(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtDatumTijd(d) {
  if (!d) return '—';
  const datum = new Date(d);
  return datum.toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' om ' + datum.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
}

// ---- Vector-icoontjes (bewust GEEN emoji/dingbats — Helvetica in pdfkit
// ondersteunt enkel WinAnsi/Latin-1, emoji zouden als lege tekens verschijnen) ----
function tekenCirkelBadge(doc, cx, cy, r, kleur, symbool) {
  doc.save();
  doc.circle(cx, cy, r).fill(kleur);
  if (symbool === 'check') {
    doc.strokeColor('#ffffff').lineWidth(Math.max(1.2, r * 0.22)).lineJoin('round').lineCap('round');
    doc.moveTo(cx - r * 0.5, cy).lineTo(cx - r * 0.1, cy + r * 0.45).lineTo(cx + r * 0.55, cy - r * 0.5).stroke();
  } else if (symbool === 'dash') {
    doc.strokeColor('#ffffff').lineWidth(Math.max(1.2, r * 0.22)).lineCap('round');
    doc.moveTo(cx - r * 0.45, cy).lineTo(cx + r * 0.45, cy).stroke();
  } else if (symbool === 'excl') {
    doc.rect(cx - r * 0.09, cy - r * 0.5, r * 0.18, r * 0.55).fill('#ffffff');
    doc.circle(cx, cy + r * 0.38, r * 0.11).fill('#ffffff');
  }
  doc.restore();
}

// ---- Eén kaartje met titel + label/waarde-regels (Klant, Levering) ----
// regels: [{ label, waarde }] — waarde-hoogte wordt vooraf gemeten
// (heightOfString) zodat het kaartje altijd exact hoog genoeg getekend wordt,
// ook bij een langer adres of productlijst.
function tekenKaart(doc, x, y, w, titel, regels) {
  const pad = 10;
  const titelH = 12;
  const titelGap = 7;
  const labelW = 66;
  const waardeW = w - pad * 2 - labelW;
  const vgap = 5;

  const hoogtes = regels.map((r) => {
    doc.font('Helvetica-Bold').fontSize(9.5);
    return Math.max(12, doc.heightOfString(r.waarde || '—', { width: waardeW }));
  });
  const inhoudH = hoogtes.reduce((a, b) => a + b, 0) + vgap * Math.max(0, regels.length - 1);
  const totalH = pad * 2 + titelH + titelGap + inhoudH;

  doc.roundedRect(x, y, w, totalH, 6).fillAndStroke(KL.grijsLicht, KL.rand);
  doc.fillColor(KL.oranje).font('Helvetica-Bold').fontSize(9.5).text(titel.toUpperCase(), x + pad, y + pad, { width: w - pad * 2 });

  let ry = y + pad + titelH + titelGap;
  regels.forEach((r, i) => {
    doc.fillColor(KL.grijs).font('Helvetica').fontSize(9).text(r.label, x + pad, ry, { width: labelW });
    doc.fillColor(KL.zwart).font('Helvetica-Bold').fontSize(9.5).text(r.waarde || '—', x + pad + labelW, ry, { width: waardeW, align: 'right' });
    ry += hoogtes[i] + vgap;
  });
  doc.fillColor('#000000');
  return totalH;
}

// ---- Eén icoon-vakje (chip) in de Plaatsing-kaart ----
function tekenChip(doc, x, y, w, h, label, positief) {
  doc.roundedRect(x, y, w, h, 5).fillAndStroke(positief ? KL.groenBg : KL.chipGrijsBg, positief ? KL.groenRand : KL.chipGrijsRand);
  tekenCirkelBadge(doc, x + 14, y + h / 2, 6, positief ? KL.groenIcoon : KL.chipGrijsIcoon, positief ? 'check' : 'dash');
  doc.fillColor(KL.zwart).font('Helvetica').fontSize(8.3).text(label, x + 25, y + h / 2 - 5, { width: w - 32 });
  doc.fillColor('#000000');
}

// ---- De volledige Plaatsing-kaart: titel + rooster van chips + optioneel
// een "Opmerkingen"-blok (vrije tekst van de plaatser, dus lengte gemeten
// met heightOfString i.p.v. een vaste hoogte aan te nemen). ----
function tekenPlaatsingKaart(doc, x, y, w, chips, opmerkingen) {
  const pad = 10;
  const titelH = 12;
  const titelGap = 8;
  const chipGap = 7;
  const chipH = 26;
  const chipW = (w - pad * 2 - chipGap) / 2;
  const rijen = Math.ceil(chips.length / 2);
  const gridH = rijen * chipH + (rijen - 1) * chipGap;

  let opmH = 0;
  if (opmerkingen) {
    doc.font('Helvetica').fontSize(8.3);
    opmH = 12 + 4 + doc.heightOfString(opmerkingen, { width: w - pad * 2 });
  }
  const totalH = pad * 2 + titelH + titelGap + gridH + (opmerkingen ? 8 + opmH : 0);

  doc.roundedRect(x, y, w, totalH, 6).fillAndStroke(KL.grijsLicht, KL.rand);
  doc.fillColor(KL.oranje).font('Helvetica-Bold').fontSize(9.5).text('PLAATSING', x + pad, y + pad, { width: w - pad * 2 });

  const gridY = y + pad + titelH + titelGap;
  chips.forEach((c, i) => {
    const kol = i % 2;
    const rij = Math.floor(i / 2);
    const cx = x + pad + kol * (chipW + chipGap);
    const cy = gridY + rij * (chipH + chipGap);
    tekenChip(doc, cx, cy, chipW, chipH, c.label, c.positief);
  });

  if (opmerkingen) {
    const opmY = gridY + gridH + 8;
    doc.fillColor(KL.grijs).font('Helvetica-Bold').fontSize(7.8).text('OPMERKINGEN VAN DE PLAATSER', x + pad, opmY, { width: w - pad * 2 });
    doc.fillColor(KL.zwart).font('Helvetica').fontSize(8.3).text(opmerkingen, x + pad, opmY + 12, { width: w - pad * 2 });
  }
  doc.fillColor('#000000');
  return totalH;
}

// ---- Betaalstatus-banner (volle breedte, groen of rood) ----
function tekenBetaalBanner(doc, x, y, w, totaal, betaaldBedrag, saldo) {
  const betaald = saldo <= 0.01;
  const h = 42;
  doc.roundedRect(x, y, w, h, 6).fillAndStroke(betaald ? KL.groenBg : KL.roodBg, betaald ? KL.groenRand : KL.roodRand);

  doc.font('Helvetica').fontSize(8.5).fillColor(KL.grijs)
    .text('Totaalbedrag (incl. btw): ', x + 14, y + 14, { continued: true })
    .font('Helvetica-Bold').fillColor(KL.zwart).text(euro(totaal), { continued: true })
    .font('Helvetica').fillColor(KL.grijs).text('   ·   Reeds betaald: ', { continued: true })
    .font('Helvetica-Bold').fillColor(KL.zwart).text(euro(betaaldBedrag));

  const label = betaald ? 'VOLLEDIG BETAALD' : `NOG TE BETALEN: ${euro(saldo)}`;
  doc.font('Helvetica-Bold').fontSize(11);
  const labelW = doc.widthOfString(label);
  const badgeR = 9;
  const labelX = x + w - 14 - labelW;
  const badgeCx = labelX - 10 - badgeR;
  tekenCirkelBadge(doc, badgeCx, y + h / 2, badgeR, betaald ? KL.groenIcoon : KL.roodTekst, betaald ? 'check' : 'excl');
  doc.fillColor(betaald ? KL.groenTekst : KL.roodTekst).text(label, labelX, y + h / 2 - 5.5);
  doc.fillColor('#000000');
  return h;
}

// ---- Handtekeningblok: handtekening-afbeelding links, korte voorwaarden-
// verwijzing rechts. ----
function tekenHandtekeningBlok(doc, x, y, w, signatureBuffer, naam, wanneer) {
  const sigW = Math.round(w * 0.56);
  const noteX = x + sigW + 20;
  const noteW = w - sigW - 20;
  const boxH = 66;

  doc.moveTo(x, y).lineTo(x + w, y).lineWidth(1).strokeColor(KL.rand).stroke();
  const top = y + 12;
  doc.fillColor(KL.oranje).font('Helvetica-Bold').fontSize(9.5).text('HANDTEKENING KLANT', x, top);
  doc.fillColor(KL.oranje).font('Helvetica-Bold').fontSize(9.5).text('VOORWAARDEN', noteX, top);

  const boxY = top + 16;
  doc.roundedRect(x, boxY, sigW, boxH, 5).fillAndStroke('#ffffff', '#dddddd');
  if (signatureBuffer) {
    try {
      doc.image(signatureBuffer, x + 8, boxY + 6, { fit: [sigW - 16, boxH - 12] });
    } catch (e) {
      doc.fillColor(KL.roodTekst).font('Helvetica').fontSize(8).text('(Handtekening kon niet weergegeven worden)', x + 8, boxY + boxH / 2 - 4);
    }
  }
  doc.fillColor('#000000');

  doc.fillColor(KL.grijs).font('Helvetica').fontSize(8).text(`Ondertekend door ${naam} op ${wanneer}`, x, boxY + boxH + 6, { width: sigW });
  doc.fillColor(KL.grijs).font('Helvetica').fontSize(8.3).text('Volledige algemene huurvoorwaarden op pagina 2 van dit document.', noteX, boxY, { width: noteW });
  doc.fillColor('#000000');

  return (boxY + boxH + 6 + 12) - y;
}

async function haalOndertekendData(boekingId) {
  const { rows } = await db.query(
    `SELECT b.id, b.leveringswijze, b.leveringsadres, b.gewenste_datum_start, b.gewenste_datum_einde,
            k.naam AS klant_naam, k.telefoon AS klant_telefoon, k.email AS klant_email,
            k.adres AS klant_adres, k.postcode AS klant_postcode, k.gemeente AS klant_gemeente,
            l.plaatsing_grasrobot_uit, l.plaatsing_correct, l.plaatsing_bevestiging,
            l.plaatsing_valmatten, l.plaatsing_verlengkabel, l.plaatsing_aantal_kabels,
            l.plaatsing_aantal_zandzakken, l.plaatsing_netjes, l.plaatsing_opmerkingen,
            l.plaatsing_bevestigd, l.plaatsing_bevestigd_op,
            l.plaatsing_handtekening, l.plaatsing_handtekening_naam, l.plaatsing_handtekening_op,
            bp_namen.producten_namen
     FROM boekingen b
     JOIN klanten k ON k.id = b.klant_id
     LEFT JOIN leveringen l ON l.boeking_id = b.id
     LEFT JOIN (
       SELECT bp.boeking_id,
              string_agg(p.naam || CASE WHEN bp.aantal > 1 THEN ' (x' || bp.aantal || ')' ELSE '' END, ', ' ORDER BY p.naam) AS producten_namen
       FROM boeking_producten bp JOIN producten p ON p.id = bp.product_id
       GROUP BY bp.boeking_id
     ) bp_namen ON bp_namen.boeking_id = b.id
     WHERE b.id = $1`,
    [boekingId]
  );
  return rows[0] || null;
}

const BEVESTIGING_LABELS = { pinnen: 'Pinnen', zandzakken: 'Zandzakken', verankering: 'Verankering', geen: 'Geen bevestiging' };

// Geeft { buffer, bestandsnaam, klantEmail, klantNaam } terug, of gooit een
// Error met .status (404/400) als de boeking niet bestaat of nog niet
// ondertekend is.
async function genereerOndertekendDocumentPdf(boekingId) {
  const b = await haalOndertekendData(boekingId);
  if (!b) {
    const err = new Error('Boeking niet gevonden');
    err.status = 404;
    throw err;
  }
  if (!b.plaatsing_bevestigd || !b.plaatsing_handtekening) {
    const err = new Error('Deze levering is nog niet ondertekend door de klant');
    err.status = 400;
    throw err;
  }
  const prijstabel = await berekenPrijstabel(boekingId);

  const adres = b.leveringswijze === 'afhaling'
    ? 'Klant haalt zelf op / brengt zelf terug'
    : (b.leveringsadres
      || [b.klant_adres, [b.klant_postcode, b.klant_gemeente].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      || '—');

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
    .text('Ondertekende leveringsbevestiging', MARGIN, MARGIN + 2, { width: CONTENT_W, align: 'right' });
  doc.fontSize(8.5).font('Helvetica').fillColor(KL.grijs)
    .text(`Dossier: ${b.klant_naam} — ${fmtDatum(b.gewenste_datum_start)}`, MARGIN, MARGIN + 19, { width: CONTENT_W, align: 'right' });
  doc.fillColor('#000000');

  const dividerY = MARGIN + 55;
  doc.moveTo(MARGIN, dividerY).lineTo(MARGIN + CONTENT_W, dividerY).lineWidth(2).strokeColor(KL.oranje).stroke();

  // ---- Twee kolommen: Klant + Levering (links), Plaatsing (rechts) ----
  const colGap = 16;
  const colW = (CONTENT_W - colGap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + colGap;
  const bodyTop = dividerY + 16;

  const klantRegels = [{ label: 'Naam', waarde: b.klant_naam }, { label: 'Adres', waarde: adres }];
  if (b.klant_telefoon) klantRegels.push({ label: 'Telefoon', waarde: b.klant_telefoon });
  if (b.klant_email) klantRegels.push({ label: 'E-mail', waarde: b.klant_email });

  const leveringRegels = [
    { label: 'Datum', waarde: fmtDatum(b.gewenste_datum_start) },
    { label: 'Product(en)', waarde: b.producten_namen || '—' },
  ];

  let leftY = bodyTop;
  leftY += tekenKaart(doc, leftX, leftY, colW, 'Klant', klantRegels) + 12;
  leftY += tekenKaart(doc, leftX, leftY, colW, 'Levering', leveringRegels);

  const bevestigingWaarde = BEVESTIGING_LABELS[b.plaatsing_bevestiging] || '—';
  const chips = [
    { label: 'Grasrobot uitgeschakeld', positief: !!b.plaatsing_grasrobot_uit },
    { label: 'Correct geplaatst', positief: !!b.plaatsing_correct },
    {
      label: bevestigingWaarde + (b.plaatsing_bevestiging === 'zandzakken' && b.plaatsing_aantal_zandzakken ? ` (${b.plaatsing_aantal_zandzakken}x)` : ''),
      positief: !!b.plaatsing_bevestiging && b.plaatsing_bevestiging !== 'geen',
    },
    { label: 'Valmatten gebruikt', positief: !!b.plaatsing_valmatten },
    { label: 'Verlengkabel' + (b.plaatsing_verlengkabel && b.plaatsing_aantal_kabels ? ` (${b.plaatsing_aantal_kabels}x)` : ''), positief: !!b.plaatsing_verlengkabel },
    { label: 'Netjes achtergelaten', positief: !!b.plaatsing_netjes },
  ];
  const rightY = bodyTop + tekenPlaatsingKaart(doc, rightX, bodyTop, colW, chips, b.plaatsing_opmerkingen || '');

  let y = Math.max(leftY, rightY) + 14;

  // ---- Betaalstatus ----
  y += tekenBetaalBanner(doc, MARGIN, y, CONTENT_W, prijstabel.totaal, prijstabel.betaald_bedrag, prijstabel.saldo_openstaand) + 16;

  // ---- Handtekening ----
  const match = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(b.plaatsing_handtekening || '');
  const signatureBuffer = match ? Buffer.from(match[2], 'base64') : null;
  y += tekenHandtekeningBlok(
    doc, MARGIN, y, CONTENT_W, signatureBuffer,
    b.plaatsing_handtekening_naam || b.klant_naam,
    fmtDatumTijd(b.plaatsing_handtekening_op || b.plaatsing_bevestigd_op)
  ) + 10;

  doc.fontSize(7.5).font('Helvetica').fillColor(KL.grijs)
    .text(`${BEDRIJF.naam} · IBAN ${BEDRIJF.iban} · BTW ${BEDRIJF.btw}`, MARGIN, y, { width: CONTENT_W, align: 'center' });
  doc.fillColor('#000000');

  // ---- Algemene voorwaarden — klein lettertype, eigen pagina ----
  doc.addPage();
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text('Algemene verhuurvoorwaarden springkastelen');
  doc.moveDown(0.4);
  doc.fontSize(6.5).font('Helvetica').fillColor('#333333');
  VOORWAARDEN.forEach((regel) => {
    doc.text(`• ${regel}`, { align: 'justify' });
    doc.moveDown(0.15);
  });
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').text('Factuurvoorwaarden');
  doc.font('Helvetica');
  FACTUURVOORWAARDEN.forEach((regel) => {
    doc.text(`• ${regel}`, { align: 'justify' });
    doc.moveDown(0.15);
  });
  doc.fillColor('#000000');

  doc.end();
  const buffer = await klaar;
  const veiligeNaam = (b.klant_naam || 'klant').normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const bestandsnaam = `Leveringsbevestiging-${veiligeNaam}-${fmtDatum(b.gewenste_datum_start).replace(/\//g, '-')}.pdf`;
  return { buffer, bestandsnaam, klantEmail: b.klant_email, klantNaam: b.klant_naam };
}

// Genereert het document en mailt het meteen als bijlage naar de klant, plus
// een logregel in Communicatie — gedeelde logica voor zowel de knop in het
// dossier (platform, ingelogde gebruiker) als de knop "Verstuur getekende
// aflevering" in de leveringen-app zelf (via de webhook-route, zie
// sync-webhook.js), zodat de mailtekst en logregel overal identiek blijven.
async function verstuurOndertekendDocumentPerMail(boekingId) {
  const resultaat = await genereerOndertekendDocumentPdf(boekingId);
  if (!resultaat.klantEmail) {
    const fout = new Error('Deze klant heeft geen e-mailadres bekend');
    fout.status = 400;
    throw fout;
  }
  const onderwerp = `Ondertekende leveringsbevestiging — Belair-Fun`;
  const html = `<p>Beste ${resultaat.klantNaam},</p>
<p>In bijlage de ondertekende bevestiging van de plaatsing van uw springkasteel, met de huurvoorwaarden.</p>
<p>Met vriendelijke groeten,<br>Belair-Fun</p>`;
  await verstuurMail({
    naar: resultaat.klantEmail,
    onderwerp,
    html,
    bijlagen: [{ naam: resultaat.bestandsnaam, mimetype: 'application/pdf', dataBase64: resultaat.buffer.toString('base64') }],
  });
  await db.query(
    `INSERT INTO communicatie (boeking_id, type, richting, onderwerp, inhoud) VALUES ($1, 'email', 'uitgaand', $2, $3)`,
    [boekingId, onderwerp, html]
  );
  return resultaat;
}

module.exports = { genereerOndertekendDocumentPdf, verstuurOndertekendDocumentPerMail };
