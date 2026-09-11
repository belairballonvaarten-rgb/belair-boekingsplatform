// Automatische afstandsberekening (Google Maps Distance Matrix API) tussen ons
// magazijn in Overmere en het leveringsadres van een boeking, plus de daaruit
// afgeleide transportkost (regels van Jonas: eerste 10km gratis, dan €0,50/km,
// x4 omdat het over 2 heen-en-terugritten gaat: levering + ophaling).
//
// Bewust spaarzaam met API-calls: deze module wordt enkel aangeroepen wanneer
// een boeking nog geen afstand_km heeft (zie src/routes/boekingen.js). Het
// resultaat wordt in de boeking opgeslagen zodat het maar één keer per boeking
// berekend hoeft te worden — ruim binnen de gratis 10.000 aanvragen/maand die
// Google per API voorziet.

const ONS_MAGAZIJN_ADRES = 'Goudberg 12, 9290 Overmere, België';
const GRATIS_KM = 10;
const TARIEF_PER_KM = 0.50;
const RIT_FACTOR = 4; // levering (heen+terug) + ophaling (heen+terug)

async function geocodeAdres(adres) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY ontbreekt');

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(adres)}&key=${apiKey}`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (data.status !== 'OK' || !data.results?.length) {
    throw new Error(`Adres kon niet gevonden worden op Google Maps (status: ${data.status})`);
  }
  return data.results[0].geometry.location; // { lat, lng }
}

// Retourneert de rijafstand (in km, over de weg) tussen ons magazijn en het
// opgegeven adres, via de Distance Matrix API.
async function berekenAfstandKm(adres) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY ontbreekt');

  const url = `https://maps.googleapis.com/maps/api/distancematrix/json`
    + `?origins=${encodeURIComponent(ONS_MAGAZIJN_ADRES)}`
    + `&destinations=${encodeURIComponent(adres)}`
    + `&units=metric&key=${apiKey}`;
  const resp = await fetch(url);
  const data = await resp.json();

  const element = data.rows?.[0]?.elements?.[0];
  if (data.status !== 'OK' || !element || element.status !== 'OK') {
    throw new Error(`Afstand kon niet berekend worden (status: ${element?.status || data.status})`);
  }
  return Math.round((element.distance.value / 1000) * 10) / 10; // meter -> km, 1 decimaal
}

// Transportkost volgens de regels van Jonas: eerste 10km (enkele rit) gratis,
// elke km daarboven kost €0,50 x 4 (levering + ophaling, telkens heen en terug).
// Enkel van toepassing bij "levering" - bij "afhaling" haalt de klant zelf op.
function berekenTransportkost(afstandKm, leveringswijze) {
  if (leveringswijze !== 'levering') return 0;
  if (afstandKm == null) return null;
  const belastbareKm = Math.max(0, afstandKm - GRATIS_KM);
  return Math.round(belastbareKm * RIT_FACTOR * TARIEF_PER_KM * 100) / 100;
}

module.exports = {
  ONS_MAGAZIJN_ADRES,
  GRATIS_KM,
  TARIEF_PER_KM,
  RIT_FACTOR,
  geocodeAdres,
  berekenAfstandKm,
  berekenTransportkost,
};
