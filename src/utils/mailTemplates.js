// Vult {{plaatshouders}} in een e-mailtemplate in met gegevens van één
// specifieke boeking — gebruikt bij het manueel versturen van een template
// vanuit het dossier (zie POST /api/boekingen/:id/verstuur-template).
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

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

// boeking: rij uit 'boekingen' (met klant_naam erbij gejoined).
// producten: [{naam, aantal}, ...]
// prijstabel: resultaat van berekenPrijstabel() in routes/boekingen.js.
function bouwTemplateContext(boeking, producten, prijstabel) {
  const productenNamen = (producten || [])
    .map((p) => (Number(p.aantal) > 1 ? `${p.naam} (x${p.aantal})` : p.naam))
    .join(', ') || '—';
  const periode = iso(boeking.gewenste_datum_start) === iso(boeking.gewenste_datum_einde)
    ? fmtDatumNl(boeking.gewenste_datum_start)
    : `${fmtDatumNl(boeking.gewenste_datum_start)} t.e.m. ${fmtDatumNl(boeking.gewenste_datum_einde)}`;

  return {
    klant_naam: boeking.klant_naam || '',
    producten: productenNamen,
    periode,
    datum_start: fmtDatumNl(boeking.gewenste_datum_start),
    datum_einde: fmtDatumNl(boeking.gewenste_datum_einde),
    prijs: fmtEuro(prijstabel.subtotaal_producten),
    transportkost: fmtEuro(prijstabel.transportkost),
    totaal: fmtEuro(prijstabel.totaal),
    saldo: fmtEuro(prijstabel.saldo_openstaand),
    boeking_nummer: String(boeking.id || '').slice(0, 8),
  };
}

function vulTemplateIn(tekst, context) {
  return String(tekst || '').replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (heleMatch, sleutel) => {
    const waarde = context[sleutel.toLowerCase()];
    return waarde != null ? String(waarde) : heleMatch;
  });
}

module.exports = { vulTemplateIn, bouwTemplateContext };
