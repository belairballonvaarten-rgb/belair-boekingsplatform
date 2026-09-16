// Rijtijd-inschatting tussen opeenvolgende adressen, via OSRM — een gratis,
// sleutelloze routeringsdienst (de publieke demo-server van project-osrm.org).
// Bewust gekozen i.p.v. Google's Distance Matrix API voor deze routeplanner:
// geen extra betaalde API die Jonas apart zou moeten aanzetten. Enkel de
// rijtijd (duration) wordt gebruikt, niet de route zelf/navigatie.
//
// LET OP: dit is de gratis, gedeelde publieke OSRM-server — geen garanties
// op snelheid/beschikbaarheid, en dus bewust ook enkel gebruikt voor een
// "inschatting" (zoals Jonas het zelf ook noemt), niet voor iets kritisch.
async function berekenRijtijdenMinuten(coords) {
  // coords: [{lat, lng}, ...] in volgorde. Retourneert een lijst van
  // coords.length - 1 rijtijden (in minuten, afgerond) tussen elk
  // opeenvolgend paar.
  if (coords.length < 2) return [];
  const coordStr = coords.map((c) => `${c.lng},${c.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=false&annotations=duration`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let data;
  try {
    const resp = await fetch(url, { signal: controller.signal });
    data = await resp.json();
  } finally {
    clearTimeout(timeout);
  }

  if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
    throw new Error(`OSRM kon geen route berekenen (${data.code || 'onbekende fout'})`);
  }
  return data.routes[0].legs.map((l) => Math.round(l.duration / 60));
}

module.exports = { berekenRijtijdenMinuten };
