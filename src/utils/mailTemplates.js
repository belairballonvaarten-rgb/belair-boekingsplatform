// Vult {{plaatshouders}} in een e-mailtemplate in met gegevens van één
// specifieke boeking — gebruikt bij het manueel versturen van een template
// vanuit het dossier (zie POST /api/boekingen/:id/verstuur-template), en bij
// het automatisch versturen van de bevestigingsmail (zie routes/klant-bevestiging.js).
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

// Publiek adres van DIT platform zelf — nodig om de bevestigingslink in een
// mail als volledige (absolute) URL te kunnen zetten. Zie .env.example.
const PLATFORM_URL = (process.env.PLATFORM_URL || 'https://planning.belair-fun.be').replace(/\/+$/, '');

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

// boeking: rij uit 'boekingen' (met klant_naam erbij gejoined).
// producten: [{naam, aantal}, ...]
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

  const basis = {
    klant_naam: boeking.klant_naam || '',
    producten: productenNamen,
    periode,
    datum_start: fmtDatumNl(boeking.gewenste_datum_start),
    datum_einde: fmtDatumNl(boeking.gewenste_datum_einde),
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
  // bevestig_link is een URL (geen vrije klanttekst) en bevestig_knop is zelf
  // al kant-en-klare HTML — geen van beide door escapeHtml() halen, anders
  // verschijnt de knop hierboven als kapotte, letterlijke &lt;a&gt;-tags i.p.v.
  // een echte klikbare knop.
  inhoudContext.bevestig_link = bevestigLink;
  inhoudContext.bevestig_knop = bevestigLink
    ? `<p style="text-align:center;margin:28px 0;"><a href="${bevestigLink}" style="background:#e8631e;color:#ffffff;padding:14px 30px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;display:inline-block;">✓ Ik bevestig mijn reservatie</a></p>`
    : '';
  return { onderwerpContext: basis, inhoudContext };
}

function vulTemplateIn(tekst, context) {
  return String(tekst || '').replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (heleMatch, sleutel) => {
    const waarde = context[sleutel.toLowerCase()];
    return waarde != null ? String(waarde) : heleMatch;
  });
}

module.exports = { vulTemplateIn, bouwTemplateContext };
