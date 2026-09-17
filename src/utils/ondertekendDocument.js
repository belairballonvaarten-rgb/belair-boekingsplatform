// Genereert het ondertekende leverings-/plaatsingsdocument (PDF) nadat de
// klant getekend heeft in de leveringen-app (zie plaatsing_handtekening in de
// leveringen-tabel) — adresgegevens, betaalstatus, een samenvatting van de
// plaatsingschecklist, de handtekening zelf, en de algemene huurvoorwaarden
// in klein lettertype op een tweede pagina. Wordt gebruikt om te downloaden
// vanuit het dossier op het platform, en om als bijlage mee te sturen in een
// e-mail naar de klant (zie routes/boekingen.js).
//
// Enkel voor PLAATSING/levering (niet afhaling) — op uitdrukkelijke keuze van
// Jonas hoeft de afhaling niet ondertekend te worden.
const PDFDocument = require('pdfkit');
const db = require('../db');
const { berekenPrijstabel } = require('./prijstabel');

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

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const buffers = [];
  doc.on('data', (chunk) => buffers.push(chunk));
  const klaar = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
  });

  // ---- Briefhoofding ----
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#000').text(BEDRIJF.naam);
  doc.fontSize(9).font('Helvetica').fillColor('#555555')
    .text(`${BEDRIJF.verantwoordelijke} · ${BEDRIJF.adres}`)
    .text(`Tel ${BEDRIJF.tel} · Gsm ${BEDRIJF.gsm} · ${BEDRIJF.email} · ${BEDRIJF.website}`)
    .text(`IBAN ${BEDRIJF.iban} · BTW ${BEDRIJF.btw}`);
  doc.fillColor('#000000').moveDown(1);

  doc.fontSize(14).font('Helvetica-Bold').text('Ondertekende leveringsbevestiging');
  doc.fontSize(9).font('Helvetica').fillColor('#555555')
    .text(`Dossier: ${b.klant_naam} — ${fmtDatum(b.gewenste_datum_start)}`);
  doc.fillColor('#000000').moveDown(1);

  // ---- Klant ----
  doc.fontSize(11).font('Helvetica-Bold').text('Klant');
  doc.fontSize(10).font('Helvetica');
  doc.text(`Naam: ${b.klant_naam}`);
  doc.text(`Adres van plaatsing: ${adres}`);
  if (b.klant_telefoon) doc.text(`Telefoon: ${b.klant_telefoon}`);
  if (b.klant_email) doc.text(`E-mail: ${b.klant_email}`);
  doc.moveDown(0.8);

  // ---- Levering ----
  doc.fontSize(11).font('Helvetica-Bold').text('Levering');
  doc.fontSize(10).font('Helvetica');
  doc.text(`Datum: ${fmtDatum(b.gewenste_datum_start)}`);
  doc.text(`Product(en): ${b.producten_namen || '—'}`);
  doc.moveDown(0.8);

  // ---- Plaatsing ----
  doc.fontSize(11).font('Helvetica-Bold').text('Plaatsing');
  doc.fontSize(10).font('Helvetica');
  doc.text(`Grasrobot uitgeschakeld: ${b.plaatsing_grasrobot_uit ? 'Ja' : 'Nee'}`);
  doc.text(`Springkasteel correct geplaatst: ${b.plaatsing_correct ? 'Ja' : 'Nee'}`);
  doc.text(`Bevestiging: ${b.plaatsing_bevestiging || '—'}${b.plaatsing_bevestiging === 'zandzakken' && b.plaatsing_aantal_zandzakken ? ` (${b.plaatsing_aantal_zandzakken}x)` : ''}`);
  doc.text(`Valmatten gebruikt: ${b.plaatsing_valmatten ? 'Ja' : 'Nee'}`);
  doc.text(`Verlengkabel gebruikt: ${b.plaatsing_verlengkabel ? `Ja${b.plaatsing_aantal_kabels ? ' (' + b.plaatsing_aantal_kabels + 'x)' : ''}` : 'Nee'}`);
  doc.text(`Netjes achtergelaten: ${b.plaatsing_netjes ? 'Ja' : 'Nee'}`);
  if (b.plaatsing_opmerkingen) doc.text(`Opmerkingen: ${b.plaatsing_opmerkingen}`);
  doc.moveDown(0.8);

  // ---- Betaalstatus ----
  doc.fontSize(11).font('Helvetica-Bold').text('Betaalstatus');
  doc.fontSize(10).font('Helvetica');
  doc.text(`Totaalbedrag (incl. btw): ${euro(prijstabel.totaal)}`);
  doc.text(`Reeds betaald: ${euro(prijstabel.betaald_bedrag)}`);
  if (prijstabel.saldo_openstaand > 0.01) {
    doc.font('Helvetica-Bold').fillColor('#b91c1c').text(`Nog te betalen: ${euro(prijstabel.saldo_openstaand)}`);
  } else {
    doc.font('Helvetica-Bold').fillColor('#15803d').text('Volledig betaald');
  }
  doc.fillColor('#000000').font('Helvetica').moveDown(1);

  // ---- Handtekening ----
  doc.fontSize(11).font('Helvetica-Bold').text('Handtekening klant');
  doc.fontSize(9).font('Helvetica').fillColor('#555555')
    .text(`Ondertekend door ${b.plaatsing_handtekening_naam || b.klant_naam} op ${fmtDatumTijd(b.plaatsing_handtekening_op || b.plaatsing_bevestigd_op)}`);
  doc.fillColor('#000000').moveDown(0.4);
  const match = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(b.plaatsing_handtekening || '');
  if (match) {
    try {
      doc.image(Buffer.from(match[2], 'base64'), { fit: [220, 100] });
    } catch (e) {
      doc.fontSize(9).fillColor('#b91c1c').text('(Handtekening kon niet weergegeven worden)');
      doc.fillColor('#000000');
    }
  }

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

module.exports = { genereerOndertekendDocumentPdf };
