// Genereert het "Rapport per kasteel" (PDF) — op vraag van Jonas na een
// FOD Economie-controle: één document per springkasteel dat hij meteen kan
// tonen/afdrukken bij een volgende controle, met alle gegevens die het
// systeem al bijhoudt (keuringen, certificaat, logboek, infofiche).
//
// Structuur bewust gespiegeld op de "Handleiding & Logboek"-documenten van
// JB-Inflatables (door Jonas zelf aangeleverd als voorbeeld/sjabloon), Deel
// II "Logboek": Eigenaar & Verhuurder, Onderhoud, Inspecties, Gebreken &
// Veranderingen, Ongevallen — dat is het formaat dat een FOD-controleur
// gewend is te zien. "Leverancier & Fabrikant" laten we hier bewust weg: die
// gegevens staan al in de handleiding/infofiche die per product apart
// geüpload kan worden (zie infofiche_* in routes/producten.js) en worden
// niet apart bijgehouden in het systeem — dat zou dubbel werk zijn voor
// Jonas zonder extra nut.
//
// Herbruikt bedrijfsgegevens + teken-helpers van ondertekendDocument.js i.p.v.
// alles te dupliceren (beide horen bij dezelfde app).
const PDFDocument = require('pdfkit');
const db = require('../db');
const { BEDRIJF, KL, fmtDatum, fmtDatumTijd, tekenKaart } = require('./ondertekendDocument');

// Zelfde verplichting als in routes/producten.js (MIN_CONTROLES_PER_JAAR) en
// public/js/app.js (LOGBOEK_MINIMUM_CONTROLES) — bewust hier nogmaals apart
// gedefinieerd, zelfde reden als die twee: een PDF-generator i.p.v. een
// route, geen gedeelde module ervoor opzetten voor één getal.
const MIN_CONTROLES_PER_JAAR = 5;

const LOGBOEK_TYPE_LABELS = { controle: 'Controle/nazicht', reiniging: 'Reiniging', herstelling: 'Herstelling' };

// ---- Zorgt dat er nog minstens 'benodigd' ruimte is tot de ondermarge;
// breekt anders naar een nieuwe pagina. Nodig omdat enkel tekenTabel()'s
// eigen rij-voor-rij-lus een paginabreuk-check deed — secties zonder tabel
// (titel, inleiding, statusbanner) of de start van een tabel zelf konden
// zonder deze check gewoon voorbij de onderrand van de pagina getekend
// worden (pdfkit breekt NIET vanzelf bij expliciete x/y-coördinaten). ----
function zorgRuimte(doc, margin, benodigd) {
  if (doc.y + benodigd > doc.page.height - margin) {
    doc.addPage();
    doc.y = margin;
  }
}

// ---- Sectietitel: gekleurde balk + titel, met optionele inleidende tekst ----
function tekenSectieTitel(doc, x, w, margin, titel, inleiding) {
  // Genoeg ruimte voorzien voor titel + lijn + (evt.) inleiding, zodat een
  // sectie nooit met enkel haar titel onderaan een pagina blijft hangen.
  zorgRuimte(doc, margin, inleiding ? 55 : 35);
  doc.fontSize(12).font('Helvetica-Bold').fillColor(KL.oranje).text(titel, x, doc.y, { width: w });
  doc.moveDown(0.15);
  doc.moveTo(x, doc.y).lineTo(x + w, doc.y).lineWidth(1.3).strokeColor(KL.oranje).stroke();
  doc.moveDown(0.3);
  if (inleiding) {
    doc.fontSize(8.3).font('Helvetica').fillColor(KL.grijs).text(inleiding, x, doc.y, { width: w });
    doc.moveDown(0.3);
  }
  doc.fillColor('#000000');
}

// ---- Statusbanner (groen/rood) voor de 5x/jaar-verplichting ----
function tekenStatusBanner(doc, x, w, margin, tekst, ok) {
  const h = 22;
  zorgRuimte(doc, margin, h + 10);
  const y = doc.y;
  doc.roundedRect(x, y, w, h, 5).fillAndStroke(ok ? KL.groenBg : KL.roodBg, ok ? KL.groenRand : KL.roodRand);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(ok ? KL.groenTekst : KL.roodTekst)
    .text(tekst, x + 10, y + h / 2 - 5, { width: w - 20 });
  doc.fillColor('#000000');
  doc.y = y + h + 10;
}

// ---- Eenvoudige tabel met automatische paginabreuk; hertekent de
// kolomkoppen bovenaan elke nieuwe pagina ("(vervolg)"). Kolombreedtes zijn
// fracties van w die samen 1 moeten geven. ----
function tekenTabel(doc, x, w, margin, titel, kolommen, rijen, legeTekst) {
  // Marge expliciet meegegeven i.p.v. via doc.page.margins gelezen — dat
  // veld bestaat niet gegarandeerd op elke pdfkit-achtige implementatie
  // (en we weten de marge toch al, zie MARGIN in genereerProductRapportPdf).
  const PAGE_BOTTOM = doc.page.height - margin;
  const rijPad = 5;

  function kolomX(i) {
    let off = 0;
    for (let j = 0; j < i; j++) off += kolommen[j].breedte * w;
    return x + off;
  }

  function tekenHeader(vervolg) {
    doc.fontSize(10.5).font('Helvetica-Bold').fillColor(KL.zwart)
      .text(vervolg ? `${titel} (vervolg)` : titel, x, doc.y, { width: w });
    doc.moveDown(0.25);
    const headerY = doc.y;
    const headerH = 16;
    doc.rect(x, headerY, w, headerH).fill(KL.grijsLicht);
    kolommen.forEach((k, i) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(KL.grijs)
        .text(k.titel.toUpperCase(), kolomX(i) + 6, headerY + 4, { width: k.breedte * w - 10 });
    });
    doc.fillColor('#000000');
    doc.y = headerY + headerH;
    doc.moveTo(x, doc.y).lineTo(x + w, doc.y).lineWidth(0.5).strokeColor(KL.rand).stroke();
  }

  // Ruimte voor titel + kolomkoppen + minstens één rij (of de "leeg"-tekst) —
  // anders kan de tabel helemaal onderaan een pagina beginnen en meteen
  // weer overlopen.
  zorgRuimte(doc, margin, 16 + 16 + 24);
  tekenHeader(false);

  if (!rijen.length) {
    doc.fontSize(8.5).font('Helvetica').fillColor(KL.grijs).text(legeTekst, x + 6, doc.y + rijPad, { width: w - 12 });
    doc.moveDown(0.6);
    doc.fillColor('#000000');
    return;
  }

  rijen.forEach((rij) => {
    doc.font('Helvetica').fontSize(8.5);
    const hoogtes = rij.map((cel, i) => doc.heightOfString(cel || '—', { width: kolommen[i].breedte * w - 12 }));
    const rijH = Math.max(14, ...hoogtes) + rijPad * 2;

    if (doc.y + rijH > PAGE_BOTTOM) {
      doc.addPage();
      doc.y = margin;
      tekenHeader(true);
    }

    const rijY = doc.y;
    rij.forEach((cel, i) => {
      doc.font('Helvetica').fontSize(8.5).fillColor(KL.zwart)
        .text(cel || '—', kolomX(i) + 6, rijY + rijPad, { width: kolommen[i].breedte * w - 12 });
    });
    doc.fillColor('#000000');
    doc.y = rijY + rijH;
    doc.moveTo(x, doc.y).lineTo(x + w, doc.y).lineWidth(0.5).strokeColor(KL.rand).stroke();
  });
  doc.moveDown(0.6);
}

async function haalProductRapportData(productId) {
  const { rows } = await db.query(
    `SELECT id, naam, categorieen, afmetingen, leeftijdscategorie, gewicht_kg, aankoopdatum,
            certificaat_bestandsnaam, certificaat_upload_op,
            infofiche_bestandsnaam, infofiche_upload_op
     FROM producten WHERE id = $1`,
    [productId]
  );
  if (!rows[0]) return null;
  const product = rows[0];

  const { rows: keuringen } = await db.query(
    'SELECT type_keuring, vervaldatum FROM keuringen WHERE product_id = $1 ORDER BY vervaldatum', [productId]
  );
  const { rows: logboek } = await db.query(
    'SELECT type, datum, notitie FROM product_logboek WHERE product_id = $1 ORDER BY datum', [productId]
  );
  return { product, keuringen, logboek };
}

// Geeft { buffer, bestandsnaam } terug, of null als het product niet bestaat.
async function genereerProductRapportPdf(productId) {
  const data = await haalProductRapportData(productId);
  if (!data) return null;
  const { product, keuringen, logboek } = data;

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
    .text('Logboek & rapport springkasteel', MARGIN, MARGIN + 2, { width: CONTENT_W, align: 'right' });
  doc.fontSize(8.5).font('Helvetica').fillColor(KL.grijs)
    .text(`${product.naam} — afgedrukt op ${fmtDatumTijd(new Date())}`, MARGIN, MARGIN + 19, { width: CONTENT_W, align: 'right' });
  doc.fillColor('#000000');

  const dividerY = MARGIN + 55;
  doc.moveTo(MARGIN, dividerY).lineTo(MARGIN + CONTENT_W, dividerY).lineWidth(2).strokeColor(KL.oranje).stroke();
  doc.y = dividerY + 14;

  // ---- Productinformatie + Keuring/certificaat/handleiding (twee kolommen) ----
  const colGap = 16;
  const colW = (CONTENT_W - colGap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + colGap;
  const bodyTop = doc.y;

  const productRegels = [
    { label: 'Categorie', waarde: (product.categorieen || []).join(', ') },
    { label: 'Afmetingen', waarde: product.afmetingen },
    { label: 'Leeftijd', waarde: product.leeftijdscategorie },
    { label: 'Gewicht', waarde: product.gewicht_kg != null ? `${product.gewicht_kg} kg` : null },
    { label: 'Aankoopdatum', waarde: fmtDatum(product.aankoopdatum) },
  ];
  let leftY = bodyTop;
  leftY += tekenKaart(doc, leftX, leftY, colW, 'Productinformatie', productRegels) + 12;

  const keuringRegels = keuringen.length
    ? keuringen.map((k) => ({ label: k.type_keuring, waarde: `vervalt ${fmtDatum(k.vervaldatum)}` }))
    : [{ label: 'Keuring', waarde: 'Nog niet geregistreerd' }];
  keuringRegels.push({
    label: 'Certificaat',
    waarde: product.certificaat_bestandsnaam
      ? `${product.certificaat_bestandsnaam} (${fmtDatum(product.certificaat_upload_op)})`
      : 'Nog niet geüpload',
  });
  keuringRegels.push({
    label: 'Handleiding',
    waarde: product.infofiche_bestandsnaam
      ? `${product.infofiche_bestandsnaam} (${fmtDatum(product.infofiche_upload_op)})`
      : 'Nog niet geüpload',
  });
  leftY += tekenKaart(doc, leftX, leftY, colW, 'Keuring / certificaat / handleiding', keuringRegels);

  const eigenaarRegels = [
    { label: 'Naam', waarde: BEDRIJF.naam },
    { label: 'Adres', waarde: BEDRIJF.adres },
    { label: 'Telefoon', waarde: `${BEDRIJF.tel} / ${BEDRIJF.gsm}` },
  ];
  let rightY = bodyTop;
  rightY += tekenKaart(doc, rightX, rightY, colW, 'Eigenaar', eigenaarRegels) + 12;
  rightY += tekenKaart(doc, rightX, rightY, colW, 'Verhuurder', eigenaarRegels);

  doc.y = Math.max(leftY, rightY) + 18;

  // ---- Onderhoud (reiniging/herstelling) ----
  const onderhoudRijen = logboek
    .filter((l) => l.type === 'reiniging' || l.type === 'herstelling')
    .map((l) => [fmtDatum(l.datum), LOGBOEK_TYPE_LABELS[l.type] || l.type, l.notitie || '']);
  tekenSectieTitel(doc, MARGIN, CONTENT_W, MARGIN, 'Onderhoud');
  tekenTabel(
    doc, MARGIN, CONTENT_W, MARGIN, 'Reiniging & herstelling',
    [{ titel: 'Datum', breedte: 0.2 }, { titel: 'Type', breedte: 0.25 }, { titel: 'Opmerking', breedte: 0.55 }],
    onderhoudRijen,
    'Nog geen reiniging/herstelling genoteerd.'
  );

  // ---- Inspecties (controle) ----
  const controleRijen = logboek.filter((l) => l.type === 'controle');
  const ditJaar = controleRijen.filter((l) => new Date(l.datum).getFullYear() === new Date().getFullYear()).length;
  const voldoet = ditJaar >= MIN_CONTROLES_PER_JAAR;
  tekenSectieTitel(
    doc, MARGIN, CONTENT_W, MARGIN, 'Inspecties',
    `Minstens ${MIN_CONTROLES_PER_JAAR}x per jaar een controle/nazicht (FOD-verplichting).`
  );
  tekenStatusBanner(
    doc, MARGIN, CONTENT_W, MARGIN,
    `${ditJaar} / ${MIN_CONTROLES_PER_JAAR} controles in ${new Date().getFullYear()} — ${voldoet ? 'voldoet aan de verplichting' : 'voldoet nog niet aan de verplichting'}`,
    voldoet
  );
  tekenTabel(
    doc, MARGIN, CONTENT_W, MARGIN, 'Controles/nazichten',
    [{ titel: 'Datum', breedte: 0.2 }, { titel: 'Opmerking', breedte: 0.8 }],
    controleRijen.map((l) => [fmtDatum(l.datum), l.notitie || '']),
    'Nog geen controle/nazicht genoteerd.'
  );

  // ---- Gebreken & Veranderingen / Ongevallen — leeg, net als het papieren
  // logboek, zodat dit ter plaatse met de hand ingevuld kan worden indien
  // nodig (het systeem houdt dit nog niet apart bij). ----
  tekenSectieTitel(doc, MARGIN, CONTENT_W, MARGIN, 'Gebreken & veranderingen', 'In te vullen indien van toepassing.');
  tekenTabel(
    doc, MARGIN, CONTENT_W, MARGIN, 'Gebreken & veranderingen',
    [{ titel: 'Datum', breedte: 0.15 }, { titel: 'Gebrek / verandering', breedte: 0.45 }, { titel: 'Maatregel', breedte: 0.3 }, { titel: 'Datum maatr.', breedte: 0.1 }],
    [['', '', '', ''], ['', '', '', '']],
    ''
  );

  tekenSectieTitel(doc, MARGIN, CONTENT_W, MARGIN, 'Ongevallen', 'In te vullen indien van toepassing.');
  tekenTabel(
    doc, MARGIN, CONTENT_W, MARGIN, 'Ongevallen',
    [{ titel: 'Datum', breedte: 0.15 }, { titel: 'Letsel/leeftijd', breedte: 0.25 }, { titel: 'Oorzaak', breedte: 0.3 }, { titel: 'Maatregel', breedte: 0.3 }],
    [['', '', '', ''], ['', '', '', '']],
    ''
  );

  doc.end();
  const buffer = await klaar;
  const veiligeNaam = (product.naam || 'product').normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const bestandsnaam = `Rapport-${veiligeNaam}-${fmtDatum(new Date()).replace(/\//g, '-')}.pdf`;
  return { buffer, bestandsnaam };
}

module.exports = { genereerProductRapportPdf };
