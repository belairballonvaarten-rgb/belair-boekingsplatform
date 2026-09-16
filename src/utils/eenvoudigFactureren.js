// Koppeling met EenvoudigFactureren (facturatiesoftware van Jonas) via hun
// REST API (https://eenvoudigfactureren.be/api-docs/index.html).
//
// LET OP — eerlijkheid over wat wel/niet bevestigd is uit hun documentatie:
// - Basis-URL (https://eenvoudigfactureren.be/api/v1), authenticatie via de
//   'X-API-Key'-header, en het aanmaken van klanten (POST /clients) en
//   facturen (POST /invoices, met client_id + items[]) zijn bevestigd via
//   hun eigen hulp-artikels.
// - Een apart "betaalverzoek"-document bestaat WEL in hun systeem (los van
//   een factuur), maar hun documentatie beschrijft dat enkel als een
//   manuele/UI-actie — een apart API-eindpunt daarvoor kon niet met
//   zekerheid bevestigd worden. We proberen POST /payment-requests; lukt dat
//   niet (bv. 404), dan valt dit automatisch terug op een gewone factuur, met
//   een duidelijke melding in de UI zodat Jonas weet dat dat gebeurd is.
// - Dit is dus, in tegenstelling tot de rest van het platform, NIET getest
//   tegen een echte account/sleutel — de eerste keer dat Jonas op "Factuur"
//   of "Betaalverzoek aanmaken" klikt is de eerste echte test. Foutmeldingen
//   van EenvoudigFactureren zelf worden zo veel mogelijk letterlijk
//   doorgegeven, net om samen snel te kunnen bijsturen indien nodig.

const EF_BASIS_URL = 'https://eenvoudigfactureren.be/api/v1';

function isGeconfigureerd() {
  return !!process.env.EENVOUDIGFACTUREREN_API_KEY;
}

async function efRequest(method, pad, body) {
  const apiKey = process.env.EENVOUDIGFACTUREREN_API_KEY;
  if (!apiKey) throw new Error('EENVOUDIGFACTUREREN_API_KEY ontbreekt bij Render');

  const resp = await fetch(`${EF_BASIS_URL}${pad}`, {
    method,
    headers: {
      'X-API-Key': apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await resp.json(); } catch (e) { /* geen (geldige) JSON-body */ }

  if (!resp.ok) {
    const foutdetail = (data && (data.error || data.message || JSON.stringify(data))) || `HTTP ${resp.status}`;
    const fout = new Error(`EenvoudigFactureren: ${foutdetail}`);
    fout.status = resp.status;
    fout.data = data;
    throw fout;
  }
  return data;
}

// Zoekt het al gekende EenvoudigFactureren-klant-id op (opgeslagen bij een
// vorige factuur voor deze klant), of maakt anders een nieuwe klantenkaart
// aan daar en bewaart het teruggekregen id voor de volgende keer.
async function zorgVoorKlant(db, klant) {
  if (klant.eenvoudigfactureren_klant_id) {
    return klant.eenvoudigfactureren_klant_id;
  }
  const payload = {
    name: klant.naam,
    email_address: klant.email || undefined,
    street: klant.adres || undefined,
    postal_code: klant.postcode || undefined,
    city: klant.gemeente || undefined,
    country_code: 'BE',
  };
  const resultaat = await efRequest('POST', '/clients', payload);
  const klantId = String(resultaat.client_id || resultaat.id || (resultaat.client && resultaat.client.id) || '');
  if (!klantId) throw new Error('EenvoudigFactureren gaf geen klant-id terug bij het aanmaken van de klant');
  await db.query('UPDATE klanten SET eenvoudigfactureren_klant_id = $1 WHERE id = $2', [klantId, klant.id]);
  return klantId;
}

// regels: [{ omschrijving, aantal, bedrag_incl_btw }]
async function maakFactuur(klantId, regels, notitie) {
  const payload = {
    client_id: Number.isFinite(Number(klantId)) ? Number(klantId) : klantId,
    items: regels.map((r) => ({
      type: 'item',
      description: r.omschrijving,
      quantity: r.aantal,
      amount_with_tax: r.bedrag_incl_btw,
      tax_rate: 21,
    })),
    note: notitie || undefined,
  };
  const resultaat = await efRequest('POST', '/invoices', payload);
  return {
    id: resultaat.invoice_id || resultaat.id || null,
    url: resultaat.uri || resultaat.url || null,
  };
}

// Probeert eerst een echt "betaalverzoek"-document; bestaat dat eindpunt niet
// op deze account/API-versie, dan valt dit terug op een gewone factuur (zie
// uitleg bovenaan dit bestand) — 'viaFallback' laat de aanroeper weten dat
// dat gebeurd is, voor een duidelijke melding aan Jonas.
async function maakBetaalverzoek(klantId, regels, notitie) {
  const payload = {
    client_id: Number.isFinite(Number(klantId)) ? Number(klantId) : klantId,
    items: regels.map((r) => ({
      type: 'item',
      description: r.omschrijving,
      quantity: r.aantal,
      amount_with_tax: r.bedrag_incl_btw,
      tax_rate: 21,
    })),
    note: notitie || undefined,
  };
  try {
    const resultaat = await efRequest('POST', '/payment-requests', payload);
    return {
      id: resultaat.payment_request_id || resultaat.id || null,
      url: resultaat.uri || resultaat.url || null,
      viaFallback: false,
    };
  } catch (err) {
    if (err.status !== 404 && err.status !== 405) throw err;
    const factuur = await maakFactuur(klantId, regels, notitie);
    return { ...factuur, viaFallback: true };
  }
}

module.exports = { isGeconfigureerd, zorgVoorKlant, maakFactuur, maakBetaalverzoek };
