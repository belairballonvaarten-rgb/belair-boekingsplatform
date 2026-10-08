// Vult {{plaatshouders}} in een e-mailtemplate in met gegevens van één
// specifieke boeking — gebruikt bij het manueel versturen van een template
// vanuit het dossier (zie POST /api/boekingen/:id/verstuur-template), en bij
// het automatisch versturen van de bevestigingsmail (zie routes/klant-bevestiging.js).
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

// Publiek adres van DIT platform zelf — nodig om de bevestigingslink (en de
// header-afbeelding hieronder) in een mail als volledige (absolute) URL te
// kunnen zetten. Zie .env.example.
const PLATFORM_URL = (process.env.PLATFORM_URL || 'https://planning.belair-fun.be').replace(/\/+$/, '');

// Belair-Fun-huisstijlkleuren, overgenomen uit het logo/de mail-header
// (public/img/email-header-belair-fun.png) — gebruikt in de nieuwe,
// visuele "kaartjes + prijsvak"-opmaak van de aanvraagbevestigingsmail.
const KL = {
  navy: '#1e2c51',
  lime: '#8fa300', // iets donkerder dan het logo-groen (bcf00) voor leesbaarheid op wit
  lichtblauw: '#eaf4fb',
  rand: '#e2e2e6',
  grijs: '#6b7280',
};

// Vaste, publiek bereikbare header-afbeelding — hoeft niet via een
// {{plaatshouder}} aangepast te worden, dus gewoon rechtstreeks in de
// meegegeven HTML-blokken hieronder gebruikt i.p.v. als apart merge-veld.
const HEADER_AFBEELDING = `${PLATFORM_URL}/img/email-header-belair-fun.png`;

function fmtDatumNl(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getUTCDate()} ${MAANDEN[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

function fmtEuro(bedrag) {
  const n = Number(bedrag) || 0;
  return `€ ${n.toFixed(2).replace('.', ',')}`;
}

function iso(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : '';
}

// De 'inhoud' van een template is voortaan echte HTML (opgemaakt via de
// rich-text-editor in Instellingen) — waarden die daarin ingevuld worden
// moeten dus HTML-veilig zijn (bv. een klantnaam met een "&" of "<" mag de
// opmaak niet breken). Het onderwerp blijft platte tekst en heeft dat niet nodig.
function escapeHtml(tekst) {
  return String(tekst)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Eén productkaart per boekingsregel — naam, prijs, en de eigen (door Jonas
// bij het product ingevulde) afbeelding-URL indien aanwezig. Ontbreekt die,
// dan gewoon geen <img> tonen i.p.v. een kapot/leeg beeld.
function tekenProductKaart(p) {
  const afbeelding = p.afbeeldingen && p.afbeeldingen[0];
  const naam = escapeHtml(Number(p.aantal) > 1 ? `${p.naam} (x${p.aantal})` : p.naam);
  const prijs = fmtEuro(Number(p.prijs) * Number(p.aantal || 1));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;border:1px solid ${KL.rand};border-radius:8px;overflow:hidden">
    <tr>
      ${afbeelding ? `<td width="110" style="padding:0"><img src="${escapeHtml(afbeelding)}" width="110" height="110" style="display:block;width:110px;height:110px;object-fit:cover" alt=""></td>` : ''}
      <td style="padding:14px 16px;vertical-align:middle">
        <div style="font-size:16px;font-weight:700;color:${KL.navy};margin-bottom:4px">${naam}</div>
        <div style="font-size:14px;color:${KL.grijs}">Prijs: <strong style="color:${KL.navy}">${prijs}</strong></div>
      </td>
    </tr>
  </table>`;
}

// "Bedankt + Uw gegevens"-kader bovenaan plus de Periode/Leveringsadres-tabel
// — bewust HIER (in code) opgebouwd i.p.v. als vaste HTML in de
// template-inhoud zelf. Reden: de template-inhoud wordt in Instellingen via
// Quill (rich-text-editor) bewerkt/opgeslagen, en Quill kent geen <table>-
// opmaak — zet je die rechtstreeks in de opgeslagen inhoud, dan loop je het
// risico dat Quill die kapotmaakt zodra Jonas de tekst er ooit in bewerkt/
// opslaat. Door dit blok pas hier, op verzendmoment, op te bouwen (net als
// tekenProductKaart/tekenPrijsblok) komt er nooit ruwe tabel-HTML in de
// database-inhoud terecht — enkel het onschadelijke platte-tekst-plaatshouder
// {{gegevensblok}}.
function tekenGegevensblok(basis) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr>
    <td style="vertical-align:top">
      <h2 style="margin:0 0 6px;color:${KL.navy};font-size:22px">Hey ${escapeHtml(basis.klant_naam)}, bedankt voor je aanvraag!</h2>
      <p style="margin:0;color:#333">Goed nieuws — dit is nog beschikbaar.</p>
    </td>
    <td style="vertical-align:top;text-align:right;font-size:13px;color:#555;padding-left:16px">
      <div style="font-weight:700;color:${KL.navy};margin-bottom:4px">Uw gegevens</div>
      ${escapeHtml(basis.klant_naam)}<br>
      ${escapeHtml(basis.klant_adres)}<br>
      ${escapeHtml(basis.klant_telefoon)}<br>
      ${escapeHtml(basis.klant_email)}
    </td>
  </tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#333;margin-bottom:6px">
    <tr><td style="padding:3px 0;color:${KL.grijs};width:140px">Periode</td><td style="padding:3px 0;font-weight:600">${escapeHtml(basis.periode)}</td></tr>
    <tr><td style="padding:3px 0;color:${KL.grijs}">Leveringsadres</td><td style="padding:3px 0;font-weight:600">${escapeHtml(basis.leveringsadres)}</td></tr>
  </table>`;
}

// Publieke downloadlink(en) voor de infofiche/handleiding van elk product in
// de boeking dat er één heeft (zie routes/product-info-publiek.js) — enkel
// zichtbaar in de mail als Jonas de {{handleiding_links}}-plaatshouder zelf
// in een template zet. Bewust GEEN automatische bijlage: Jonas wil dit niet
// standaard meesturen, de klant kan via deze link(s) het document zelf
// ophalen wanneer hij het nodig heeft. Geen enkel product met een infofiche?
// Dan gewoon een lege tekst i.p.v. een storend "geen handleiding beschikbaar".
function tekenHandleidingLinks(producten) {
  const metInfofiche = (producten || []).filter((p) => p.heeft_infofiche && p.id);
  if (!metInfofiche.length) return '';
  const regels = metInfofiche
    .map((p) => `<a href="${PLATFORM_URL}/api/product-info/${p.id}/infofiche" style="color:${KL.navy};font-weight:600">${escapeHtml(p.naam)} — handleiding downloaden</a>`)
    .join('<br>');
  return `<p style="margin:16px 0;font-size:14px;color:#333">${regels}</p>`;
}

// Zelfde opzet als tekenHandleidingLinks hierboven, maar dan voor het
// keuringscertificaat — op vraag van Jonas: bestelt een klant meerdere
// producten, dan moet die via het reservatie-document (bv. de
// "Reservatie bevestigd"-template, rol 'reservatie_bevestiging') de
// certificaten van ALLE producten uit die boeking kunnen bereiken, niet
// enkel van één. Publieke downloadlink per product dat een certificaat
// heeft (zie routes/product-info-publiek.js) i.p.v. automatisch als bijlage
// — zelfde reden als bij de handleiding: geen zwaar opgeblazen mail, de
// klant haalt het zelf op wanneer nodig. Jonas plaatst de plaatshouder
// {{certificaat_links}} zelf in de template(s) waar hij dit wil tonen.
function tekenCertificaatLinks(producten) {
  const metCertificaat = (producten || []).filter((p) => p.heeft_certificaat && p.id);
  if (!metCertificaat.length) return '';
  const regels = metCertificaat
    .map((p) => `<a href="${PLATFORM_URL}/api/product-info/${p.id}/certificaat" style="color:${KL.navy};font-weight:600">${escapeHtml(p.naam)} — certificaat downloaden</a>`)
    .join('<br>');
  return `<p style="margin:16px 0;font-size:14px;color:#333">${regels}</p>`;
}

// Prijssamenvatting onderaan — zelfde opbouw als de prijstabel in het dossier
// zelf (subtotaal producten, transport, toeslag/korting indien aanwezig,
// totaal, BTW), in een opvallend huisstijl-kader.
function tekenPrijsblok(prijstabel) {
  const toeslagRegel = prijstabel.toeslag_korting
    ? `<tr><td style="padding:4px 0;color:#ffffff;opacity:0.85">Toeslag/korting</td><td style="padding:4px 0;text-align:right;color:#ffffff">${fmtEuro(prijstabel.toeslag_korting)}</td></tr>`
    : '';
  const totaalExclBtw = prijstabel.totaal - prijstabel.btw_bedrag;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${KL.navy};border-radius:8px;padding:18px 20px;margin:18px 0">
    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:inherit;font-size:14px">
        <tr><td style="padding:4px 0;color:#ffffff;opacity:0.85">Subtotaal producten</td><td style="padding:4px 0;text-align:right;color:#ffffff">${fmtEuro(prijstabel.subtotaal_producten)}</td></tr>
        <tr><td style="padding:4px 0;color:#ffffff;opacity:0.85">Transport</td><td style="padding:4px 0;text-align:right;color:#ffffff">${prijstabel.transportkost ? fmtEuro(prijstabel.transportkost) : 'Gratis'}</td></tr>
        ${toeslagRegel}
        <tr><td colspan="2" style="border-top:1px solid rgba(255,255,255,0.25);padding-top:8px"></td></tr>
        <tr><td style="padding:2px 0;color:#ffffff;opacity:0.85">Totaal excl. BTW</td><td style="padding:2px 0;text-align:right;color:#ffffff">${fmtEuro(totaalExclBtw)}</td></tr>
        <tr><td style="padding:2px 0 10px;color:#ffffff;opacity:0.85">BTW (${prijstabel.btw_percentage}%)</td><td style="padding:2px 0 10px;text-align:right;color:#ffffff">${fmtEuro(prijstabel.btw_bedrag)}</td></tr>
        <tr><td style="padding:2px 0;color:#ffffff;font-size:18px;font-weight:700">Totaal (incl. BTW)</td><td style="padding:2px 0;text-align:right;color:#ffffff;font-size:18px;font-weight:700">${fmtEuro(prijstabel.totaal)}</td></tr>
      </table>
    </td></tr>
  </table>`;
}

// boeking: rij uit 'boekingen' (met klant_naam erbij gejoined).
// producten: [{naam, aantal, prijs, afbeeldingen}, ...]
// prijstabel: resultaat van berekenPrijstabel() in routes/boekingen.js.
// Geeft { onderwerpContext, inhoudContext } terug — zelfde velden, enkel de
// tweede is HTML-escaped.
function bouwTemplateContext(boeking, producten, prijstabel) {
  const productenNamen = (producten || [])
    .map((p) => (Number(p.aantal) > 1 ? `${p.naam} (x${p.aantal})` : p.naam))
    .join(', ') || '—';
  const periode = iso(boeking.gewenste_datum_start) === iso(boeking.gewenste_datum_einde)
    ? fmtDatumNl(boeking.gewenste_datum_start)
    : `${fmtDatumNl(boeking.gewenste_datum_start)} t.e.m. ${fmtDatumNl(boeking.gewenste_datum_einde)}`;

  // Publieke link waarmee de klant, ZONDER in te loggen, deze ene aanvraag
  // rechtstreeks kan bevestigen (zie routes/klant-bevestiging.js) — enkel
  // beschikbaar als de boeking-rij zelf al met 'b.*' opgehaald werd (dus de
  // kolommen uit migratie 034 erbij heeft).
  const bevestigLink = boeking.id && boeking.klant_bevestigings_token
    ? `${PLATFORM_URL}/api/klant-bevestiging/${boeking.id}/${boeking.klant_bevestigings_token}`
    : '';

  const adresRegel = [boeking.klant_adres, [boeking.klant_postcode, boeking.klant_gemeente].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');

  const basis = {
    klant_naam: boeking.klant_naam || '',
    klant_adres: adresRegel,
    klant_telefoon: boeking.klant_telefoon || '',
    klant_email: boeking.klant_email || '',
    producten: productenNamen,
    periode,
    datum_start: fmtDatumNl(boeking.gewenste_datum_start),
    datum_einde: fmtDatumNl(boeking.gewenste_datum_einde),
    leveringsadres: boeking.leveringswijze === 'afhaling' ? 'Afhaling door klant' : (boeking.leveringsadres || adresRegel),
    ondergrond: boeking.type_ondergrond || '',
    tijdstip_levering: boeking.voorkeur_tijdstip_levering || '',
    prijs: fmtEuro(prijstabel.subtotaal_producten),
    transportkost: fmtEuro(prijstabel.transportkost),
    totaal: fmtEuro(prijstabel.totaal),
    betaald: fmtEuro(prijstabel.betaald_bedrag),
    saldo: fmtEuro(prijstabel.saldo_openstaand),
    boeking_nummer: String(boeking.id || '').slice(0, 8),
    bevestig_link: bevestigLink,
  };
  const inhoudContext = { ...basis };
  Object.keys(inhoudContext).forEach((sleutel) => { inhoudContext[sleutel] = escapeHtml(inhoudContext[sleutel]); });
  // bevestig_link is een URL (geen vrije klanttekst) en bevestig_knop/
  // header_afbeelding/producten_kaarten/prijsblok zijn zelf al kant-en-klare
  // HTML — geen van deze door escapeHtml() halen, anders verschijnen ze als
  // kapotte, letterlijke tags i.p.v. de echte opmaak/afbeelding/knop.
  inhoudContext.bevestig_link = bevestigLink;
  inhoudContext.bevestig_knop = bevestigLink
    ? `<p style="text-align:center;margin:28px 0;"><a href="${bevestigLink}" style="background:#e8631e;color:#ffffff;padding:14px 30px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;display:inline-block;">✓ Ik bevestig mijn reservatie</a></p>`
    : '';
  inhoudContext.header_afbeelding = `<img src="${HEADER_AFBEELDING}" alt="Belair-Fun" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0">`;
  inhoudContext.gegevensblok = tekenGegevensblok(basis);
  inhoudContext.producten_kaarten = (producten || []).map(tekenProductKaart).join('');
  inhoudContext.prijsblok = tekenPrijsblok(prijstabel);
  inhoudContext.handleiding_links = tekenHandleidingLinks(producten);
  inhoudContext.certificaat_links = tekenCertificaatLinks(producten);
  return { onderwerpContext: basis, inhoudContext };
}

// Deze plaatshouders worden hierboven vervangen door kant-en-klare HTML-
// blokken (tabellen, afbeeldingen) i.p.v. gewone tekst. In de database staan
// ze als onschuldige platte tekst tussen {{ }}, maar zodra Jonas de
// template ooit bewerkt in de Quill-editor (Instellingen) zet die elke regel
// automatisch in zijn eigen <p>...</p>. Zonder correctie zou de uiteindelijke
// mail dan bv. een <table> genest in een <p> krijgen (ongeldige HTML, kan in
// sommige mailclients de opmaak breken) — daarom die omwikkelende <p>/<div>
// hier weer wegnemen vóór de effectieve vervanging.
const BLOK_PLAATSHOUDERS = ['header_afbeelding', 'gegevensblok', 'producten_kaarten', 'prijsblok', 'bevestig_knop', 'handleiding_links', 'certificaat_links'];

function ontwikkelBlokPlaatshouders(tekst) {
  let resultaat = tekst;
  for (const sleutel of BLOK_PLAATSHOUDERS) {
    const patroon = new RegExp(`<(p|div)(?:\\s[^>]*)?>\\s*\\{\\{\\s*${sleutel}\\s*\\}\\}\\s*<\\/\\1>`, 'gi');
    resultaat = resultaat.replace(patroon, `{{${sleutel}}}`);
  }
  return resultaat;
}

function vulTemplateIn(tekst, context) {
  const voorbereid = ontwikkelBlokPlaatshouders(String(tekst || ''));
  return voorbereid.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (heleMatch, sleutel) => {
    const waarde = context[sleutel.toLowerCase()];
    return waarde != null ? String(waarde) : heleMatch;
  });
}

module.exports = { vulTemplateIn, bouwTemplateContext };
