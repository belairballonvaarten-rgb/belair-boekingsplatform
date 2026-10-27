// Koppeling met EenvoudigFactureren (facturatiesoftware van Jonas) via hun
// REST API (https://eenvoudigfactureren.be/api-docs/index.html).
//
// LET OP — eerlijkheid over wat wel/niet bevestigd is uit hun documentatie:
// - Basis-URL (https://eenvoudigfactureren.be/api/v1), authenticatie via de
//   'X-API-Key'-header, en het aanmaken van klanten (POST /clients) en
//   facturen (POST /invoices, met client_id + items[]) zijn bevestigd via
//   hun eigen hulp-artikels.
// - Een apart "betaalverzoek"-document bestaat WEL in hun systeem, los van
//   een factuur (bevestigd: hun eigen Make.com-koppeling heeft er een
//   volledige eigen module-set voor — aanmaken/opvragen/zoeken/bijwerken/
//   verwijderen/PDF/mailen). Jonas gaf zelf bevestigd dat dit in zijn account
//   écht twee verschillende documenten zijn. Het exacte API-pad daarvoor kon
//   niet met zekerheid uit hun documentatie gehaald worden — zie
//   BETAALVERZOEK_PADEN hieronder, waar een paar aannemelijke varianten na
//   elkaar geprobeerd worden.
// - Lukt geen van die paden (bv. nog steeds 404), dan valt dit NIET meer
//   terug op een gewone factuur — eerder deed het dat wel, maar een factuur
//   verbruikt mogelijk een echt factuurnummer in Jonas' boekhouding, en dat
//   stilzwijgend aanmaken terwijl hij een betaalverzoek verwachtte is geen
//   aanvaardbare terugval. Jonas krijgt dan een duidelijke foutmelding i.p.v.
//   een verkeerd document, met de vraag om het juiste API-pad op te vragen
//   via EenvoudigFactureren → Instellingen → API-documentatie.
// - Dit is dus, in tegenstelling tot de rest van het platform, NIET getest
//   tegen een echte account/sleutel. Foutmeldingen van EenvoudigFactureren
//   zelf worden zo veel mogelijk letterlijk doorgegeven, net om samen snel
//   te kunnen bijsturen indien nodig.

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
  // 'street'/'postal_code'/'city' zijn in EenvoudigFactureren's klantmodel het
  // echte facturatieadres (bevestigd via hun API-docs — er bestaat geen apart
  // 'billing_address'-veld). Heeft de klant een afwijkend facturatieadres
  // ingevuld (bv. boekhouding op een ander adres), dan gaat dat hier mee i.p.v.
  // het gewone adres. 'tax_code' is hun bevestigde veldnaam voor het btw-nummer.
  const payload = {
    name: klant.naam,
    email_address: klant.email || undefined,
    street: klant.facturatie_adres || klant.adres || undefined,
    postal_code: klant.facturatie_postcode || klant.postcode || undefined,
    city: klant.facturatie_gemeente || klant.gemeente || undefined,
    country_code: 'BE',
    tax_code: klant.btw_nummer || undefined,
  };
  // EenvoudigFactureren geeft bij een te lang postal_code enkel de kale melding
  // "postal_code too long" terug (zonder te zeggen om welke klant/waarde het
  // gaat) — geen enkel land heeft een postcode van meer dan 12 tekens, dus dit
  // is hoe dan ook een fout ingevuld veld (bv. per ongeluk het volledige adres
  // in het postcodeveld, soms zo binnengekomen via een import). Dit hier al
  // opvangen met een duidelijke, bruikbare melding i.p.v. Jonas de kale
  // API-fout te laten uitpluizen.
  if (payload.postal_code && payload.postal_code.length > 12) {
    throw new Error(
      `Postcode van klant "${klant.naam}" is te lang voor EenvoudigFactureren `
      + `("${payload.postal_code}", ${payload.postal_code.length} tekens). `
      + `Corrigeer het postcodeveld (of facturatie-postcode) bij deze klant en probeer opnieuw.`
    );
  }
  const resultaat = await efRequest('POST', '/clients', payload);
  const klantId = String(resultaat.client_id || resultaat.id || (resultaat.client && resultaat.client.id) || '');
  if (!klantId) throw new Error('EenvoudigFactureren gaf geen klant-id terug bij het aanmaken van de klant');
  await db.query('UPDATE klanten SET eenvoudigfactureren_klant_id = $1 WHERE id = $2', [klantId, klant.id]);
  return klantId;
}

// EenvoudigFactureren geeft in 'uri' de kale API-resource-link terug (zonder
// extensie, bv. ".../api/v1/invoices/13288106") — rechtstreeks in de browser
// geopend toont dat enkel de ruwe XML-data, geen leesbaar document. Hun eigen
// documentatie (onfact.be, hetzelfde platform): "voor documenten kan u ook de
// .pdf, .html of .xml extensie gebruiken" — door .pdf toe te voegen krijgt
// Jonas de echte PDF van de factuur/het betaalverzoek te zien i.p.v. de kale
// API-data. (Bevestigd via hun documentatie, niet live getest tegen een
// echte account — als dit toch nog fout zou gaan, laat het dan weten.)
function maakWeergaveUrl(resultaat) {
  if (resultaat.uri) return `${resultaat.uri}.pdf`;
  return resultaat.url || null;
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
    url: maakWeergaveUrl(resultaat),
  };
}

// Een "betaalverzoek" is bij EenvoudigFactureren bevestigd een EIGEN
// documenttype, los van een factuur (hun Make.com-koppeling heeft er een
// volledige eigen module-set voor: aanmaken/opvragen/zoeken/bijwerken/
// verwijderen/PDF/mailen — zie hun eigen integratiepagina). Enkel het exacte
// API-pad kon niet met zekerheid uit hun documentatie gehaald worden, dus
// proberen we hier een paar aannemelijke varianten na elkaar (zelfde
// payload-vorm als een factuur — niet bevestigd, maar wel de meest
// voor de hand liggende aanname).
//
// BELANGRIJK — dit valt NIET meer automatisch terug op een gewone factuur
// als geen van deze paden werkt: een factuur verbruikt mogelijk een echt,
// opeenvolgend factuurnummer in Jonas' boekhouding, en dat stilzwijgend
// aanmaken terwijl hij een betaalverzoek verwachtte is geen aanvaardbare
// terugval. Lukt geen van de paden, dan krijgt Jonas een duidelijke
// foutmelding i.p.v. een verkeerd document.
const BETAALVERZOEK_PADEN = ['/paymentrequests', '/payment_requests', '/payment-requests'];

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
  let laatsteFout = null;
  for (const pad of BETAALVERZOEK_PADEN) {
    try {
      const resultaat = await efRequest('POST', pad, payload);
      return {
        id: resultaat.payment_request_id || resultaat.id || null,
        url: maakWeergaveUrl(resultaat),
        viaFallback: false,
      };
    } catch (err) {
      if (err.status !== 404 && err.status !== 405) throw err;
      laatsteFout = err;
    }
  }
  const fout = new Error(
    `Geen van de geprobeerde betaalverzoek-eindpunten (${BETAALVERZOEK_PADEN.join(', ')}) bestaat bij EenvoudigFactureren. `
    + `Er werd NIETS aangemaakt (dus ook geen factuur) — vraag het juiste API-pad op bij EenvoudigFactureren (Instellingen → API-documentatie) zodat dit opgelost kan worden.`
  );
  fout.status = laatsteFout ? laatsteFout.status : undefined;
  throw fout;
}

// Een "offerte" is bij EenvoudigFactureren bevestigd een EIGEN documenttype,
// los van een factuur/betaalverzoek — hun eigen Make.com-koppeling heeft er
// een volledige eigen module-set voor (het Engelse "Quote": aanmaken/
// opvragen/zoeken/bijwerken/verwijderen/PDF/mailen/notitie toevoegen — zie
// hun integratiepagina op apps.make.com). Het exacte API-pad daarvoor kon,
// net als bij het betaalverzoek hierboven, niet met zekerheid uit hun
// documentatie gehaald worden — hun eigen factuur-/klantenpad is Engels en
// meervoud ('/invoices', '/clients'), dus '/quotes' is de voor de hand
// liggende eerste gok, met een paar varianten erna.
//
// Zelfde regel als bij het betaalverzoek: lukt geen van deze paden, dan
// valt dit NIET terug op een gewone factuur (die verbruikt mogelijk een
// echt factuurnummer) — Jonas krijgt dan een duidelijke foutmelding i.p.v.
// een verkeerd document.
const OFFERTE_PADEN = ['/quotes', '/quote', '/estimates'];

async function maakOfferte(klantId, regels, notitie) {
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
  let laatsteFout = null;
  for (const pad of OFFERTE_PADEN) {
    try {
      const resultaat = await efRequest('POST', pad, payload);
      return {
        id: resultaat.quote_id || resultaat.id || null,
        url: maakWeergaveUrl(resultaat),
        viaFallback: false,
      };
    } catch (err) {
      if (err.status !== 404 && err.status !== 405) throw err;
      laatsteFout = err;
    }
  }
  const fout = new Error(
    `Geen van de geprobeerde offerte-eindpunten (${OFFERTE_PADEN.join(', ')}) bestaat bij EenvoudigFactureren. `
    + `Er werd NIETS aangemaakt — vraag het juiste API-pad op bij EenvoudigFactureren (Instellingen → API-documentatie) zodat dit opgelost kan worden.`
  );
  fout.status = laatsteFout ? laatsteFout.status : undefined;
  throw fout;
}

module.exports = { isGeconfigureerd, zorgVoorKlant, maakFactuur, maakBetaalverzoek, maakOfferte };
