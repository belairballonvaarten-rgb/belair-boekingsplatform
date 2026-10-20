// Automatisch de gemeente opzoeken bij een Belgische postcode — puur gemak bij
// het invullen van een klant (nieuwe klant of klantfiche bewerken), zodat
// Jonas de gemeente niet meer zelf moet uittypen. Gebruikt de gratis, publieke
// Zippopotam-API i.p.v. een eigen postcodedatabank om bij te houden. Faalt dit
// (geen internet, onbekende/ongeldige postcode, API tijdelijk onbeschikbaar),
// dan blijft het gemeente-veld gewoon leeg — net zoals voorheen kan Jonas het
// dan nog altijd zelf intypen. Nooit blokkerend voor de rest van het formulier.
async function zoekGemeenteOpPostcode(postcode) {
  if (!/^\d{4}$/.test(String(postcode || ''))) return null;
  try {
    const resp = await fetch(`https://api.zippopotam.us/BE/${postcode}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.places?.[0]?.['place name'] || null;
  } catch (_) {
    return null;
  }
}

module.exports = { zoekGemeenteOpPostcode };
