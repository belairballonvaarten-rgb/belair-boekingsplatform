// Belair-boekingsplatform — beheerscherm (vanilla JS, geen framework nodig)

const STATUS_LABELS = {
  nieuw: 'Nieuw',
  in_behandeling: 'In behandeling',
  geaccepteerd: 'Geaccepteerd',
  geweigerd: 'Geweigerd',
  ingepland: 'Ingepland',
  bevestigd: 'Bevestigd',
  betaalverzoek_verstuurd: 'Betaalverzoek verstuurd',
  betaald_deels: 'Betaald (deels)',
  betaald_volledig: 'Betaald (volledig)',
  gefactureerd: 'Gefactureerd',
  voldaan_manueel: 'Voldaan manueel',
};

// Kleurcode per status, voor snel visueel overzicht: rood = nog niet bevestigd
// door de klant, geel = bevestigd maar betaalverzoek nog niet verstuurd, oranje =
// betaalverzoek onderweg of gedeeltelijk betaald, groen = volledig betaald/
// gefactureerd en klaar voor transportplanning, grijs = geweigerd.
const STATUS_KLEUR = {
  nieuw: 'rood',
  in_behandeling: 'rood',
  geaccepteerd: 'rood',
  ingepland: 'rood',
  bevestigd: 'geel',
  betaalverzoek_verstuurd: 'oranje',
  betaald_deels: 'oranje',
  betaald_volledig: 'groen',
  gefactureerd: 'groen',
  voldaan_manueel: 'groen',
  geweigerd: 'grijs',
};

// De letterlijke status "Betaald (volledig)" garandeert niet dat het saldo ook
// echt op 0 staat — Jonas kan via de statusbalk bewust rechtstreeks naar de
// fase "Klaar voor levering" springen zonder het betaalverzoek-tussenstapje te
// doorlopen. Overal waar de status als badge/pill getoond wordt (dossier,
// boekingenoverzicht, ...) moet dit dan ook duidelijk zijn — dezelfde regel
// die de statusbalk zelf al gebruikt (zie statusStepperHtml hieronder).
// saldoOpenstaand is optioneel: enkel meegeven waar het gekend is.
function weergaveStatusLabel(status, saldoOpenstaand) {
  if (['betaald_volledig', 'gefactureerd', 'voldaan_manueel'].includes(status)
    && saldoOpenstaand != null && Number(saldoOpenstaand) > 0.01) {
    return 'Klaar voor levering (open saldo)';
  }
  return STATUS_LABELS[status];
}

function statusPillHtml(status, saldoOpenstaand) {
  return `<span class="status-pill status-${STATUS_KLEUR[status] || 'grijs'}">${weergaveStatusLabel(status, saldoOpenstaand)}</span>`;
}

// Kleine, kort-zichtbare bevestiging onderaan het scherm — vooral bedoeld voor
// acties die meteen een volledige herrender veroorzaken (zoals de periode- of
// prijs-kalender/invoer in het dossier), zodat Jonas zeker weet dat een wijziging
// ook echt is opgeslagen, zelfs al verdwijnt de rest van het scherm meteen erna.
function toonToast(bericht) {
  let el = document.getElementById('globale-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'globale-toast';
    document.body.appendChild(el);
  }
  el.textContent = `✓ ${bericht}`;
  el.classList.remove('toast-zichtbaar');
  // Force reflow zodat de transitie ook opnieuw start bij een snel opeenvolgende toast.
  void el.offsetWidth;
  el.classList.add('toast-zichtbaar');
  clearTimeout(el._verbergTimer);
  el._verbergTimer = setTimeout(() => el.classList.remove('toast-zichtbaar'), 2200);
}

// Sterretje bij een speciaal verzoek — bedoeld om achteraan de reservatiebalk
// (kaart/rij) te staan, los van de statuskleur die de rand/achtergrond gebruikt.
function speciaalSterHtml(b) {
  if (!b.speciaal_verzoek) return '';
  const titel = b.speciaal_verzoek_notitie ? `Speciaal verzoek: ${b.speciaal_verzoek_notitie}` : 'Speciaal verzoek';
  return `<span class="ster-speciaal" title="${titel.replace(/"/g, '&quot;')}">⭑</span>`;
}

// Vier grote fases voor de statusbalk bovenaan het dossier — een vereenvoudigde,
// visuele samenvatting van de fijnmazigere TOEGELATEN_OVERGANGEN-statemachine
// hieronder. "Geweigerd" valt hier los van buiten.
const STATUS_FASEN = [
  { label: 'In verwerking', kleur: 'rood', statussen: ['nieuw', 'in_behandeling', 'geaccepteerd', 'ingepland'] },
  { label: 'Bevestigd', kleur: 'geel', statussen: ['bevestigd'] },
  { label: 'Betaalverzoek', kleur: 'oranje', statussen: ['betaalverzoek_verstuurd', 'betaald_deels'] },
  { label: 'Klaar voor levering', kleur: 'groen', statussen: ['betaald_volledig', 'gefactureerd', 'voldaan_manueel'] },
];

// saldoOpenstaand is optioneel: enkel gekend/relevant in het dossier zelf (niet in
// de kleinere kaarten/rijen in de aanvragen-inbox of het overzicht). Wanneer de
// actieve fase "Klaar voor levering" is, tonen we tussen haakjes of dit ook
// effectief (al) volledig betaald is — want de status alleen garandeert dat niet,
// zeker niet als een tussenstap (zoals het betaalverzoek) bewust overgeslagen werd.
// De vier grote fase-knoppen zijn klikbaar: een klik op een andere fase springt
// er meteen naartoe (voorste status van die fase), en een klik op de reeds
// actieve fase "deselecteert" ze weer — terug naar de laatste status van de
// vorige fase. Zo kan Jonas ook makkelijk terug naar een vorige status zonder
// een aparte "wijzig status"-knop/keuzelijst. "Geweigerd" is een aparte knop
// die altijd zichtbaar blijft (ook als het niet de actieve status is), zodat
// je er zowel naartoe als vanaf kan schakelen.
function statusStepperHtml(status, saldoOpenstaand) {
  const huidigeIndex = STATUS_FASEN.findIndex((f) => f.statussen.includes(status));
  const stappenHtml = STATUS_FASEN.map((f, i) => {
    let klasse = 'stepper-stap';
    let label = f.label;
    if (huidigeIndex >= 0 && i < huidigeIndex) klasse += ' stepper-voltooid';
    else if (i === huidigeIndex) {
      klasse += ` stepper-actief stepper-${f.kleur}`;
      if (i === STATUS_FASEN.length - 1 && saldoOpenstaand != null) {
        label += Number(saldoOpenstaand) > 0.01 ? ' (open saldo)' : ' (betaald)';
      }
    }
    return `<button type="button" class="${klasse}" data-fase="${i}">${label}</button>`;
  }).join('<span class="stepper-pijl">›</span>');
  const geweigerdKlasse = status === 'geweigerd' ? 'stepper-stap stepper-actief stepper-grijs' : 'stepper-stap stepper-geweigerd-optie';
  return `<div class="status-stepper">${stappenHtml}<span class="stepper-pijl">›</span><button type="button" class="${geweigerdKlasse}" data-fase="geweigerd">✕ Geweigerd</button></div>`;
}

// Voorgestelde/logische volgende stappen per status — dit is enkel nog de leidraad
// voor de snelknoppen in de UI (het gangbare pad), GEEN harde blokkade meer: Jonas
// kan via de "Andere status instellen"-keuzelijst hieronder ten allen tijde vrij
// naar eender welke status overschakelen, ook een stap overslaan (bv. voor een
// vaste klant meteen naar "klaar voor levering" zonder betaalverzoek). De server
// aanvaardt dit ook (enkel een check dat de status geldig/gekend is).
const TOEGELATEN_OVERGANGEN = {
  nieuw: ['in_behandeling', 'geaccepteerd', 'geweigerd'],
  in_behandeling: ['geaccepteerd', 'geweigerd'],
  geaccepteerd: ['ingepland', 'geweigerd'],
  ingepland: ['bevestigd'],
  bevestigd: ['betaalverzoek_verstuurd'],
  betaalverzoek_verstuurd: ['betaald_deels', 'betaald_volledig'],
  betaald_deels: ['betaald_volledig', 'gefactureerd', 'voldaan_manueel'],
  betaald_volledig: ['gefactureerd', 'voldaan_manueel'],
  geweigerd: [],
  gefactureerd: [],
  voldaan_manueel: [],
};

async function api(pad, opties = {}) {
  const resp = await fetch(pad, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opties,
  });
  let data = null;
  try { data = await resp.json(); } catch (_) { /* geen JSON-body */ }
  if (resp.status === 401 && pad !== '/api/auth/me' && pad !== '/api/auth/login') {
    // Sessie is (ondertussen) verlopen of ongeldig: toon meteen het inlogscherm
    // opnieuw, in plaats van dat de rest van de pagina stil blijft hangen of leeg lijkt.
    document.getElementById('login-fout').textContent = 'Je sessie is verlopen. Log opnieuw in.';
    toonLogin();
  }
  if (!resp.ok) {
    const fout = new Error((data && data.fout) || `Fout (${resp.status})`);
    fout.data = data;
    fout.status = resp.status;
    throw fout;
  }
  return data;
}

function fmtDatum(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtEuro(bedrag) {
  return `€ ${Number(bedrag || 0).toFixed(2)}`;
}

// Tijdstip-dropdown voor levering/afhaling (zoals in het oude bookingonline.co.uk-
// systeem): vaste tijdsloten per 15 minuten, met bovenaan een gratis flexibel tijdsvak.
const TIJDSTIP_FLEXIBEL_WAARDE = 'Tussen 07:00 en 12:00 uur (gratis)';

const TIJDSTIP_HHMM_PATROON = /^([01]\d|2[0-3]):(00|15|30|45)$/;

// Losse kwartier-opties (00:00 t/m 23:45), herbruikt door zowel het
// voorkeur-tijdstip-veld in het reservatieformulier als de Dashboard-selects.
function genereerKwartierOpties(geselecteerdeTijd) {
  const opties = [];
  for (let m = 0; m < 24 * 60; m += 15) {
    const uur = String(Math.floor(m / 60)).padStart(2, '0');
    const minuut = String(m % 60).padStart(2, '0');
    const tijd = `${uur}:${minuut}`;
    opties.push(`<option value="${tijd}"${tijd === geselecteerdeTijd ? ' selected' : ''}>${tijd}</option>`);
  }
  return opties.join('');
}

function bouwTijdstipOpties(selectEl, standaardTijd) {
  if (!selectEl) return;
  const isBekendeWaarde = standaardTijd === undefined
    || standaardTijd === TIJDSTIP_FLEXIBEL_WAARDE
    || TIJDSTIP_HHMM_PATROON.test(standaardTijd);

  const opties = [
    `<option value=""${standaardTijd === undefined ? ' selected' : ''}>Geen voorkeur</option>`,
  ];
  if (!isBekendeWaarde) {
    // Een bestaande vrije-tekst waarde (bv. van vóór de vaste tijdslots bestonden)
    // niet stilzwijgend laten verdwijnen als het bewerkformulier opgeslagen wordt
    // zonder dat dit veld aangepast werd.
    opties.push(`<option value="${standaardTijd}" selected>${standaardTijd} (bestaande waarde)</option>`);
  }
  opties.push(`<option value="${TIJDSTIP_FLEXIBEL_WAARDE}">Tussen 07:00 en 12:00 uur (GRATIS)</option>`);
  opties.push(genereerKwartierOpties(standaardTijd));
  selectEl.innerHTML = opties.join('');
}

function naarISO(datum) {
  const jaar = datum.getFullYear();
  const maand = String(datum.getMonth() + 1).padStart(2, '0');
  const dag = String(datum.getDate()).padStart(2, '0');
  return `${jaar}-${maand}-${dag}`;
}

// ============================================================
// LOGIN / SESSIE
// ============================================================
const elLogin = document.getElementById('view-login');
const elShell = document.getElementById('app-shell');

// Wie momenteel is ingelogd — vooral nodig op de Gebruikers-pagina, om jezelf
// niet per ongeluk te kunnen verwijderen (de server blokkeert dit ook, maar
// zo is het meteen duidelijk in de lijst zelf).
let huidigeGebruiker = null;

async function checkSessie() {
  try {
    huidigeGebruiker = await api('/api/auth/me');
    toonApp();
  } catch (_) {
    toonLogin();
  }
}

function toonLogin() {
  elLogin.hidden = false;
  elShell.hidden = true;
}

function toonApp() {
  elLogin.hidden = true;
  elShell.hidden = false;
  Promise.all([laadProductenCache(), laadVoertuigen()]).then(() => {
    vulBoekingenProductFilter();
    wisselView('dashboard');
  });
}

document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const wachtwoord = document.getElementById('login-wachtwoord').value;
  const elFout = document.getElementById('login-fout');
  elFout.textContent = '';
  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, wachtwoord }) });
    huidigeGebruiker = await api('/api/auth/me');
    toonApp();
  } catch (err) {
    elFout.textContent = 'Ongeldige inloggegevens.';
  }
});

document.getElementById('btn-uitloggen').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  toonLogin();
});

// ============================================================
// NAVIGATIE
// ============================================================
const views = ['dashboard', 'planning', 'aanvragen', 'boekingen', 'klanten', 'beschikbaarheid', 'nieuwe-boeking', 'producten', 'reservatie-import', 'statistieken', 'gebruikers', 'instellingen', 'boeking-detail', 'klant-detail'];
// Let op: de 'webinzendingen'-pagina (ruwe website-formulier-inzendingen, enkel
// ter observatie/debug) is bewust uit de navigatie gehaald op vraag van Jonas —
// de pagina, route en webhook zelf blijven gewoon bestaan en werken (de
// binnenkomende aanvragen van de website blijven dus normaal binnenlopen),
// enkel het "test"-tabblad is niet langer zichtbaar in het menu.

function huidigeViewNaam() {
  return views.find((v) => v !== 'boeking-detail' && !document.getElementById(`view-${v}`).hidden) || 'boekingen';
}

function wisselView(naam) {
  views.forEach((v) => {
    document.getElementById(`view-${v}`).hidden = v !== naam;
  });
  document.querySelectorAll('.navbtn').forEach((btn) => {
    btn.classList.toggle('actief', btn.dataset.view === naam);
  });
  if (naam === 'dashboard') laadDashboard();
  if (naam === 'planning') laadPlanning();
  if (naam === 'aanvragen') laadAanvragen();
  if (naam === 'boekingen') laadBoekingenOverzicht();
  if (naam === 'klanten') laadKlantenOverzicht();
  if (naam === 'beschikbaarheid') laadBeschikbaarheidsoverzicht();
  if (naam === 'nieuwe-boeking' && !document.getElementById('producten-rijen').children.length) nieuweProductRij();
  if (naam === 'producten') laadProductenOverzicht();
  if (naam === 'statistieken') laadStatistieken();
  if (naam === 'gebruikers') laadGebruikersOverzicht();
  if (naam === 'instellingen') laadInstellingen();
  if (naam === 'webinzendingen') laadWebinzendingen();
}

document.querySelectorAll('.navbtn').forEach((btn) => {
  btn.addEventListener('click', () => wisselView(btn.dataset.view));
});

// ============================================================
// DASHBOARD
// ============================================================
// Toont wat er op een gekozen dag te leveren en af te halen is, met een kaart
// bovenaan (indien een Google Maps-sleutel geconfigureerd is) en per kaart een
// eenvoudig invoerveld om het geplande tijdstip aan te passen. Dit tijdstip
// wordt bewaard in de leveringen-tabel — dezelfde die later gekoppeld wordt aan
// de leveringen-app, zodat een live status daar gewoon bovenop kan.
let dashboardKaartInstantie = null;
let dashboardKaartMarkers = [];
let dashboardGoogleMapsLaadPoging = null;
// 'dag' = één specifieke dag (Vandaag/Morgen/de datumkiezer met pijltjes);
// 'bereik' = een periode (Deze week/Vorige week/Vorige maand/Aangepast) —
// dan groeperen de kolommen de kaarten per dag i.p.v. één platte lijst.
let dashboardModus = 'dag';
let dashboardBereikVanaf = null;
let dashboardBereikTot = null;

function dashboardVandaagIso() {
  const nu = new Date();
  nu.setMinutes(nu.getMinutes() - nu.getTimezoneOffset()); // lokale datum, niet UTC
  return nu.toISOString().slice(0, 10);
}

async function laadDashboard() {
  const leveringenEl = document.getElementById('dashboard-leveringen-lijst');
  const ophalingenEl = document.getElementById('dashboard-ophalingen-lijst');
  leveringenEl.innerHTML = '<p class="leeg-bericht">Laden...</p>';
  ophalingenEl.innerHTML = '<p class="leeg-bericht">Laden...</p>';

  const bereikModus = dashboardModus === 'bereik';
  let data;
  if (bereikModus) {
    data = await api(`/api/dashboard?vanaf=${dashboardBereikVanaf}&tot=${dashboardBereikTot}`);
  } else {
    const datumVeld = document.getElementById('dashboard-datum');
    if (!datumVeld.value) datumVeld.value = dashboardVandaagIso();
    data = await api(`/api/dashboard?datum=${datumVeld.value}`);
  }

  dashboardZetKolomTitel('dash-titel-leveringen', '📦 Te leveren', '📦 Eerstvolgende levering', data.leveringenType, data.leveringenDatum);
  dashboardZetKolomTitel('dash-titel-ophalingen', '🔙 Af te halen', '🔙 Eerstvolgende afhaling', data.ophalingenType, data.ophalingenDatum);
  document.getElementById('dash-aantal-leveringen').textContent = `(${data.leveringen.length})`;
  document.getElementById('dash-aantal-ophalingen').textContent = `(${data.ophalingen.length})`;

  renderDashboardKolom(leveringenEl, data.leveringen, 'levering', { bereikModus });
  renderDashboardKolom(ophalingenEl, data.ophalingen, 'afhaling', { bereikModus });
  dashboardRenderKaart(data);
}

function dashboardZetKolomTitel(elId, titelVandaag, titelEerstvolgende, type, kolomDatum) {
  const el = document.getElementById(elId);
  el.textContent = type === 'eerstvolgende' ? `${titelEerstvolgende} — ${fmtDatum(kolomDatum)}` : titelVandaag;
  el.classList.toggle('dashboard-titel-eerstvolgende', type === 'eerstvolgende');
}

function dashboardAdresTekst(b) {
  if (b.leveringswijze === 'afhaling') return 'Klant haalt zelf op / brengt zelf terug';
  return b.leveringsadres
    || [b.klant_adres, [b.klant_postcode, b.klant_gemeente].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    || 'Geen adres gekend';
}

// Beheerbare lijst voertuigen (zie Planning-pagina) — geladen bij het opstarten
// en na elke wijziging daar. "naam" is meteen ook de volledige waarde die
// opgeslagen wordt en die later matcht met de teamnaam in de leveringen-app
// bij de sync. Start leeg zodat de eerste render niet op een verouderde/
// hardgecodeerde lijst draait; laadVoertuigen() vult dit aan bij het opstarten.
let VOERTUIGEN = [];

async function laadVoertuigen() {
  try {
    VOERTUIGEN = await api('/api/voertuigen');
  } catch (err) {
    VOERTUIGEN = [];
  }
}

function voertuigSelectOpties(huidigVoertuig) {
  return ['<option value="">🚐 —</option>']
    .concat(VOERTUIGEN.map((v) => `<option value="${v.naam}"${huidigVoertuig === v.naam ? ' selected' : ''}>🚐 ${v.naam}</option>`))
    .join('');
}

function renderDashboardKolom(container, items, type, opties = {}) {
  const { bereikModus = false } = opties;
  if (!items.length) {
    container.innerHTML = `<p class="leeg-bericht">Niets gepland ${bereikModus ? 'in deze periode' : 'voor deze dag'}.</p>`;
    return;
  }
  // Compacte 2-regelige kaart (i.p.v. de eerdere 5 gestapelde regels) — op een
  // drukke dag zijn dit er soms 20+, dus elke kaart moet klein blijven. Regel 1:
  // tijdstip, voertuig, klant, status en de acties (bellen/route/dossier) als
  // iconen op één lijn; regel 2: adres + producten, kleiner en gedimd. De
  // voorkeur van de klant blijft wel bewaard, maar als tooltip i.p.v. een eigen regel.
  const tijdVeld = type === 'levering' ? 'leveringstijd' : 'afhaaltijd';
  const datumVeld = type === 'levering' ? 'gewenste_datum_start' : 'gewenste_datum_einde';
  const voorkeurVeld = type === 'levering' ? 'voorkeur_tijdstip_levering' : 'voorkeur_tijdstip_afhaling';
  const voltooidVeld = type === 'levering' ? 'levering_voltooid' : 'afhaling_voltooid';
  const voltooidWoord = type === 'levering' ? 'geleverd' : 'opgehaald';

  const kaartHtml = (b) => {
    const adres = dashboardAdresTekst(b);
    // Elke kaart draagt haar eigen datum (i.p.v. één gedeelde kolomdatum) — zo
    // werkt hetzelfde stukje HTML zowel op een gewone dag, bij "eerstvolgende"
    // (een andere dag dan de gekozen lege dag) als bij een bereik met meerdere
    // dagen door elkaar, zonder aparte gevallen.
    const kaartDatum = (b[datumVeld] || '').slice(0, 10);
    const tijdWaarde = b[tijdVeld] ? new Date(b[tijdVeld]).toISOString().slice(11, 16) : '';
    const kaartLink = b.leveringswijze !== 'afhaling'
      ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adres)}" target="_blank" rel="noopener" class="dashboard-icoonbtn dashboard-kaart-routelink" title="Route naar ${adres}">📍</a>`
      : '';
    const telLink = b.klant_telefoon
      ? `<a href="tel:${b.klant_telefoon}" class="dashboard-icoonbtn" title="Bel ${b.klant_telefoon}">📞</a>`
      : '';
    // Hoofditem is het (eerste) product i.p.v. de klantnaam — bij meerdere
    // producten in deze boeking duidt "…" aan dat het er meer dan 1 zijn (de
    // volledige lijst staat als tooltip en in de kaart-detail).
    const eersteProduct = b.eerste_product_naam || (b.producten_namen || '').split(',')[0].trim() || '—';
    const meerdereProducten = Number(b.aantal_producten) > 1;
    const productHeadline = meerdereProducten ? `${eersteProduct}…` : eersteProduct;
    const isVoltooid = !!b[voltooidVeld];
    // Korte labels (V1/V2 i.p.v. de volledige naam) om de kaart compact te
    // houden — de volledige naam staat als title-tooltip op de select zelf.
    // Levering en afhaling van dezelfde boeking krijgen elk hun EIGEN voertuig
    // (bv. geleverd met de camionette, later opgehaald met de bus) — dus
    // altijd het veld voor dit specifieke "type" lezen/tonen, nooit gedeeld.
    const voertuigVeld = type === 'levering' ? 'voertuig_levering' : 'voertuig_afhaling';
    const huidigVoertuig = b[voertuigVeld];
    const voertuigOpties = voertuigSelectOpties(huidigVoertuig);
    // Standaard 08:00 bij levering, 20:00 bij afhaling zodat het veld nooit
    // leeg oogt — pas effectief opgeslagen zodra iemand het veld ook echt wijzigt.
    const standaardTijd = type === 'levering' ? '08:00' : '20:00';
    // Rij 1 blijft beperkt tot de compacte bedieningselementen (tijd, voertuig,
    // status, acties) — de productnaam kreeg daar te weinig plaats en werd
    // afgekapt. Rij 2 toont nu productnaam + adres op volle breedte; de
    // klantnaam blijft als tooltip beschikbaar i.p.v. op de kaart zelf.
    return `
      <div class="dashboard-kaart${isVoltooid ? ' dashboard-kaart-voltooid' : ''}" data-boeking-id="${b.id}" data-klant="${b.klant_naam}">
        <div class="dashboard-kaart-rij1">
          <button type="button" class="dashboard-icoonbtn dashboard-kaart-voltooid-toggle"
                  data-boeking-id="${b.id}" data-type="${type}" data-voltooid="${isVoltooid}"
                  title="${isVoltooid ? `Gemarkeerd als ${voltooidWoord} — klik om terug te zetten` : `Markeer als ${voltooidWoord}`}">${isVoltooid ? '✅' : '⬜'}</button>
          <select class="dashboard-tijd-input" data-boeking-id="${b.id}" data-type="${type}" data-datum="${kaartDatum}" title="Tijdstip">${genereerKwartierOpties(tijdWaarde || standaardTijd)}</select>
          <select class="dashboard-voertuig-select" data-boeking-id="${b.id}" data-type="${type}" title="${huidigVoertuig ? `Voertuig: ${huidigVoertuig}` : 'Geen voertuig toegewezen'}">${voertuigOpties}</select>
          ${statusPillHtml(b.status)}
          <span class="dashboard-kaart-acties">
            ${telLink}
            ${kaartLink}
            <button type="button" class="linkbtn dashboard-kaart-dossier" title="Open dossier">Dossier →</button>
          </span>
        </div>
        <div class="dashboard-kaart-rij2" title="${b.klant_naam}${b[voorkeurVeld] ? ` — voorkeur klant: ${b[voorkeurVeld]}` : ''}">
          <strong class="dashboard-kaart-product" title="${b.producten_namen || ''}">${productHeadline}</strong> · <span class="dashboard-kaart-adres">${adres}</span>
        </div>
      </div>
    `;
  };

  if (!bereikModus) {
    container.innerHTML = items.map(kaartHtml).join('');
  } else {
    // Bij een periode (meerdere dagen) groeperen we per dag, zodat het net zo
    // overzichtelijk blijft als de dagweergave — gewoon meerdere dagen na elkaar.
    const groepen = new Map();
    items.forEach((b) => {
      const d = (b[datumVeld] || '').slice(0, 10);
      if (!groepen.has(d)) groepen.set(d, []);
      groepen.get(d).push(b);
    });
    container.innerHTML = [...groepen.entries()]
      .sort(([a], [c]) => a.localeCompare(c))
      .map(([d, lijst]) => `<div class="dashboard-datumgroep-kop">${fmtDatum(d)}</div>${lijst.map(kaartHtml).join('')}`)
      .join('');
  }

  container.querySelectorAll('.dashboard-kaart-dossier').forEach((btn) => {
    btn.addEventListener('click', () => openDetail(btn.closest('.dashboard-kaart').dataset.boekingId));
  });
  container.querySelectorAll('.dashboard-tijd-input').forEach((input) => {
    input.addEventListener('change', async () => {
      if (!input.value) return;
      try {
        await api(`/api/dashboard/${input.dataset.boekingId}/tijdstip`, {
          method: 'PUT',
          body: JSON.stringify({ type: input.dataset.type, datum: input.dataset.datum, tijd: input.value }),
        });
        toonToast('Tijdstip opgeslagen');
      } catch (err) {
        alert(err.message);
      }
    });
  });
  container.querySelectorAll('.dashboard-kaart-voltooid-toggle').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const kaart = btn.closest('.dashboard-kaart');
      const nieuweWaarde = btn.dataset.voltooid !== 'true';
      const woord = btn.dataset.type === 'levering' ? 'geleverd' : 'opgehaald';
      try {
        await api(`/api/dashboard/${btn.dataset.boekingId}/voltooid`, {
          method: 'PUT',
          body: JSON.stringify({ type: btn.dataset.type, voltooid: nieuweWaarde }),
        });
        btn.dataset.voltooid = String(nieuweWaarde);
        btn.textContent = nieuweWaarde ? '✅' : '⬜';
        btn.title = nieuweWaarde ? `Gemarkeerd als ${woord} — klik om terug te zetten` : `Markeer als ${woord}`;
        kaart.classList.toggle('dashboard-kaart-voltooid', nieuweWaarde);
        toonToast(nieuweWaarde ? 'Gemarkeerd als voltooid' : 'Markering ongedaan gemaakt');
      } catch (err) {
        alert(err.message);
      }
    });
  });
  container.querySelectorAll('.dashboard-voertuig-select').forEach((select) => {
    select.addEventListener('change', async () => {
      try {
        await api(`/api/dashboard/${select.dataset.boekingId}/voertuig`, {
          method: 'PUT',
          body: JSON.stringify({ voertuig: select.value, type: select.dataset.type }),
        });
        toonToast(select.value ? `${select.value} toegewezen` : 'Voertuig verwijderd');
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function dashboardLaadGoogleMapsScript(apiKey) {
  if (window.google && window.google.maps) return;
  if (!dashboardGoogleMapsLaadPoging) {
    dashboardGoogleMapsLaadPoging = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Google Maps kon niet geladen worden'));
      document.head.appendChild(script);
    });
  }
  await dashboardGoogleMapsLaadPoging;
}

async function dashboardRenderKaart(data) {
  const mapEl = document.getElementById('dashboard-map');
  const meldingEl = document.getElementById('dashboard-maps-niet-geconfigureerd');

  if (!data.googleMapsApiKey) {
    mapEl.hidden = true;
    meldingEl.hidden = false;
    return;
  }

  try {
    await dashboardLaadGoogleMapsScript(data.googleMapsApiKey);
  } catch (err) {
    mapEl.hidden = true;
    meldingEl.hidden = false;
    meldingEl.textContent = 'De kaart kon niet geladen worden — de rest van het Dashboard werkt gewoon verder.';
    return;
  }

  meldingEl.hidden = true;
  mapEl.hidden = false;

  const alleLocaties = [
    ...(data.magazijn ? [{ ...data.magazijn, soort: 'magazijn', label: 'Belair-Fun (magazijn)' }] : []),
    ...data.leveringen.filter((b) => b.lat != null).map((b) => ({ ...b, soort: 'levering', label: `${b.klant_naam} — levering` })),
    ...data.ophalingen.filter((b) => b.lat != null).map((b) => ({ ...b, soort: 'afhaling', label: `${b.klant_naam} — afhaling` })),
  ];

  if (!dashboardKaartInstantie) {
    dashboardKaartInstantie = new google.maps.Map(mapEl, {
      center: { lat: 51.05, lng: 3.85 }, // ongeveer regio Overmere, tot er markers zijn
      zoom: 10,
    });
  }

  dashboardKaartMarkers.forEach((m) => m.setMap(null));
  dashboardKaartMarkers = [];

  if (!alleLocaties.length) return;

  const KLEUR = { magazijn: 'green', levering: 'blue', afhaling: 'orange' };
  const bounds = new google.maps.LatLngBounds();
  alleLocaties.forEach((loc) => {
    const positie = { lat: Number(loc.lat), lng: Number(loc.lng) };
    const marker = new google.maps.Marker({
      position: positie,
      map: dashboardKaartInstantie,
      title: loc.label,
      icon: `https://maps.google.com/mapfiles/ms/icons/${KLEUR[loc.soort]}-dot.png`,
    });
    dashboardKaartMarkers.push(marker);
    bounds.extend(positie);
  });
  dashboardKaartInstantie.fitBounds(bounds);
}

// Toont/verbergt de dagkiezer (pijltjes + datumveld) t.o.v. de periode-info,
// naargelang de huidige modus, en markeert de actieve snelfilterknop.
function dashboardToonModusUI(actieveSleutel) {
  document.getElementById('dashboard-datumkiezer').hidden = dashboardModus === 'bereik';
  const bereikInfoEl = document.getElementById('dashboard-bereik-info');
  bereikInfoEl.hidden = dashboardModus !== 'bereik';
  if (dashboardModus === 'bereik') {
    bereikInfoEl.textContent = `${fmtDatum(dashboardBereikVanaf)} — ${fmtDatum(dashboardBereikTot)}`;
  }
  document.querySelectorAll('#dashboard-snelfilters button').forEach((btn) => {
    btn.classList.toggle('actief', btn.dataset.dbereik === actieveSleutel);
  });
}

function dashboardGaNaarDag(iso) {
  dashboardModus = 'dag';
  document.getElementById('dashboard-aangepast-bereik').hidden = true;
  document.getElementById('dashboard-datum').value = iso;
  dashboardToonModusUI(iso === dashboardVandaagIso() ? 'vandaag' : null);
  laadDashboard();
}

function dashboardGaNaarBereik(vanaf, tot, sleutel) {
  dashboardModus = 'bereik';
  dashboardBereikVanaf = vanaf;
  dashboardBereikTot = tot;
  document.getElementById('dashboard-aangepast-bereik').hidden = sleutel !== 'aangepast';
  dashboardToonModusUI(sleutel);
  laadDashboard();
}

document.getElementById('dashboard-datum').addEventListener('change', (e) => dashboardGaNaarDag(e.target.value));
document.getElementById('btn-dashboard-vandaag').addEventListener('click', () => dashboardGaNaarDag(dashboardVandaagIso()));
document.getElementById('btn-dashboard-vorige').addEventListener('click', () => {
  const veld = document.getElementById('dashboard-datum');
  const d = new Date(veld.value || dashboardVandaagIso());
  d.setDate(d.getDate() - 1);
  dashboardGaNaarDag(d.toISOString().slice(0, 10));
});
document.getElementById('btn-dashboard-volgende').addEventListener('click', () => {
  const veld = document.getElementById('dashboard-datum');
  const d = new Date(veld.value || dashboardVandaagIso());
  d.setDate(d.getDate() + 1);
  dashboardGaNaarDag(d.toISOString().slice(0, 10));
});

// Snelfilters boven de kaart: Vandaag/Morgen (dagmodus) en Deze/Vorige week,
// Vorige maand (periodemodus, met de kaarten per dag gegroepeerd) — dezelfde
// datumberekeningen als bij Reservatieoverzicht (zie berekenDatumRange), plus
// "Aangepast" voor een zelf gekozen periode.
document.querySelectorAll('#dashboard-snelfilters button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const sleutel = btn.dataset.dbereik;
    if (sleutel === 'aangepast') {
      const [vanaf, tot] = dashboardModus === 'bereik'
        ? [dashboardBereikVanaf, dashboardBereikTot]
        : [dashboardVandaagIso(), dashboardVandaagIso()];
      document.getElementById('dashboard-bereik-vanaf').value = vanaf;
      document.getElementById('dashboard-bereik-tot').value = tot;
      document.getElementById('dashboard-aangepast-bereik').hidden = false;
      document.querySelectorAll('#dashboard-snelfilters button').forEach((b) => b.classList.toggle('actief', b === btn));
      return;
    }
    if (sleutel === 'vandaag' || sleutel === 'morgen') {
      const [iso] = berekenDatumRange(sleutel);
      dashboardGaNaarDag(iso);
      return;
    }
    const [vanaf, tot] = berekenDatumRange(sleutel);
    dashboardGaNaarBereik(vanaf, tot, sleutel);
  });
});

document.getElementById('btn-dashboard-bereik-toepassen').addEventListener('click', () => {
  const vanaf = document.getElementById('dashboard-bereik-vanaf').value;
  const tot = document.getElementById('dashboard-bereik-tot').value;
  if (!vanaf || !tot) return alert('Kies zowel een "van"- als een "tot"-datum.');
  if (vanaf > tot) return alert('De "van"-datum moet vóór de "tot"-datum liggen.');
  dashboardGaNaarBereik(vanaf, tot, 'aangepast');
});

// ============================================================
// PLANNING (routes opstellen: voertuig + volgorde per dag)
// ============================================================
// Enkel handmatige volgorde (slepen) — geen automatische routeberekening/
// -optimalisatie (geen kaartafstanden, verkeer, ...). Jonas bouwt de route
// zelf op basis van zijn eigen kennis van het traject; dit is dus bewust een
// eenvoudig hulpmiddel, geen navigatiesysteem.
let planningHuidigeDatum = null;
let planningLaatsteData = null; // voor de PDF-knoppen (laadlijst/leveringslijst/afhaallijst)

// 'dag' = één specifieke dag (Vandaag/Morgen/de datumkiezer met pijltjes, met
// voertuig-toewijzing en sleepbare volgorde); 'bereik' = een periode (Deze
// week/Volgende week/Aangepast, ...) — enkel-lezen overzicht, per dag en dan
// per voertuig gegroepeerd, want de volgorde is altijd per dag bepaald.
let planningModus = 'dag';
let planningBereikVanaf = null;
let planningBereikTot = null;

function planningVandaagIso() {
  const nu = new Date();
  nu.setMinutes(nu.getMinutes() - nu.getTimezoneOffset());
  return nu.toISOString().slice(0, 10);
}

// Effectief tijdstip voor weergave én sortering: zolang niemand het tijdstip
// expliciet instelde (zie Dashboard) blijft leveringstijd/afhaaltijd leeg —
// zonder terugval hierop toonde Planning dan "--:--" en werkte de gevraagde
// "initieel op tijd sorteren" niet. Zelfde standaardwaarden als Dashboard
// (08:00 bij levering, 20:00 bij afhaling).
function planningStandaardTijd(type) {
  return type === 'levering' ? '08:00' : '20:00';
}
function planningEffectieveTijdWaarde(b, type) {
  const tijdVeld = type === 'levering' ? 'leveringstijd' : 'afhaaltijd';
  return b[tijdVeld] ? new Date(b[tijdVeld]).toISOString().slice(11, 16) : planningStandaardTijd(type);
}
function planningTijdNaarMinuten(hhmm) {
  const [u, m] = String(hhmm).split(':').map(Number);
  return (u || 0) * 60 + (m || 0);
}

async function laadVoertuigenBeheer() {
  const container = document.getElementById('planning-voertuigen-lijst');
  container.innerHTML = VOERTUIGEN.map((v) => `
    <span class="voertuig-chip">🚐 ${v.naam} <button type="button" class="voertuig-chip-verwijder" data-id="${v.id}" data-naam="${v.naam}" title="Voertuig verwijderen">✕</button></span>
  `).join('') || '<span class="leeg-bericht">Nog geen voertuigen.</span>';

  container.querySelectorAll('.voertuig-chip-verwijder').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(`"${btn.dataset.naam}" verwijderen uit de lijst? Al toegewezen leveringen/afhalingen blijven gewoon staan, enkel als keuze voor nieuwe toewijzingen verdwijnt hij.`)) return;
      await api(`/api/voertuigen/${btn.dataset.id}`, { method: 'DELETE' });
      await laadVoertuigen();
      laadVoertuigenBeheer();
      laadPlanning();
    });
  });
}

document.getElementById('form-planning-voertuig-toevoegen').addEventListener('submit', async (e) => {
  e.preventDefault();
  const veld = document.getElementById('planning-nieuw-voertuig');
  const naam = veld.value.trim();
  if (!naam) return;
  try {
    await api('/api/voertuigen', { method: 'POST', body: JSON.stringify({ naam }) });
    veld.value = '';
    await laadVoertuigen();
    laadVoertuigenBeheer();
    laadPlanning();
  } catch (err) {
    alert(err.message);
  }
});

// Groepeert de items van één richting per voertuig (en een "Niet toegewezen"
// groep voor de rest), gesorteerd op de handmatige volgorde — ontbreekt die
// (nog nooit gesleept), dan valt de sortering terug op het tijdstip.
function planningGroepeerPerVoertuig(items, type) {
  const voertuigVeld = type === 'levering' ? 'voertuig_levering' : 'voertuig_afhaling';
  const volgordeVeld = type === 'levering' ? 'volgorde_levering' : 'volgorde_afhaling';

  const groepen = new Map();
  VOERTUIGEN.forEach((v) => groepen.set(v.naam, []));
  groepen.set('', []); // "Niet toegewezen" — altijd laatst getoond

  items.forEach((b) => {
    const voertuig = b[voertuigVeld] || '';
    if (!groepen.has(voertuig)) groepen.set(voertuig, []); // ondertussen verwijderd voertuig, maar nog toegewezen: toch tonen
    groepen.get(voertuig).push(b);
  });

  groepen.forEach((lijst) => {
    lijst.sort((a, b) => {
      const va = a[volgordeVeld];
      const vb = b[volgordeVeld];
      if (va != null && vb != null) return va - vb;
      if (va != null) return -1;
      if (vb != null) return 1;
      // Nog nooit gesleept: initieel gewoon op (effectief) tijdstip sorteren
      // i.p.v. op willekeurige volgorde — zie planningEffectieveTijdWaarde.
      return planningTijdNaarMinuten(planningEffectieveTijdWaarde(a, type)) - planningTijdNaarMinuten(planningEffectieveTijdWaarde(b, type));
    });
  });

  return groepen;
}

function planningStopHtml(b, type, groepNaam) {
  const adres = dashboardAdresTekst(b);
  const tijdWaarde = planningEffectieveTijdWaarde(b, type);
  const eersteProduct = b.eerste_product_naam || (b.producten_namen || '').split(',')[0].trim() || '—';
  const meerdereProducten = Number(b.aantal_producten) > 1;
  const productHeadline = meerdereProducten ? `${eersteProduct}…` : eersteProduct;
  const voertuigVeld = type === 'levering' ? 'voertuig_levering' : 'voertuig_afhaling';
  const voltooidVeld = type === 'levering' ? 'levering_voltooid' : 'afhaling_voltooid';
  return `
    <div class="planning-stop planning-stop-sleepbaar${b[voltooidVeld] ? ' planning-stop-voltooid' : ''}" draggable="true" data-boeking-id="${b.id}" data-klant="${b.klant_naam}" data-groep="${groepNaam}">
      <span class="planning-stop-greep" title="Sleep om de volgorde te wijzigen">⠿</span>
      <span class="planning-stop-tijd">${tijdWaarde}</span>
      <span class="planning-stop-info" title="${b.klant_naam}">
        <strong>${productHeadline}</strong> · ${adres}
      </span>
      <select class="planning-stop-voertuig" data-boeking-id="${b.id}" data-type="${type}" title="Voertuig">${voertuigSelectOpties(b[voertuigVeld])}</select>
    </div>
  `;
}

// Bijgehouden tussen dragstart en drop: het gesleepte element zelf en zijn
// kolom (leveringen- of ophalingenlijst) — enkel binnen dezelfde kolom ÉN
// dezelfde voertuiggroep mag een stop verplaatst worden.
let planningGesleeptStop = null;
let planningGesleeptContainer = null;

function planningKoppelDragDrop(container, type) {
  container.querySelectorAll('.planning-stop-sleepbaar').forEach((stop) => {
    stop.addEventListener('dragstart', () => {
      planningGesleeptStop = stop;
      planningGesleeptContainer = container;
      stop.classList.add('planning-stop-wordt-gesleept');
    });
    stop.addEventListener('dragend', () => {
      stop.classList.remove('planning-stop-wordt-gesleept');
      container.querySelectorAll('.planning-stop-sleep-over').forEach((el) => el.classList.remove('planning-stop-sleep-over'));
      planningGesleeptStop = null;
      planningGesleeptContainer = null;
    });
    stop.addEventListener('dragover', (e) => {
      if (!planningGesleeptStop || planningGesleeptStop === stop || planningGesleeptContainer !== container) return;
      if (stop.dataset.groep !== planningGesleeptStop.dataset.groep) return; // enkel binnen dezelfde voertuiggroep
      e.preventDefault();
      stop.classList.add('planning-stop-sleep-over');
    });
    stop.addEventListener('dragleave', () => stop.classList.remove('planning-stop-sleep-over'));
    stop.addEventListener('drop', async (e) => {
      e.preventDefault();
      stop.classList.remove('planning-stop-sleep-over');
      if (!planningGesleeptStop || planningGesleeptStop === stop) return;
      if (planningGesleeptContainer !== container || stop.dataset.groep !== planningGesleeptStop.dataset.groep) return;

      // Vóór of na het doelelement invoegen, naargelang de muispositie t.o.v.
      // het midden ervan.
      const rect = stop.getBoundingClientRect();
      const voorHelft = (e.clientY - rect.top) < rect.height / 2;
      stop.parentNode.insertBefore(planningGesleeptStop, voorHelft ? stop : stop.nextSibling);

      const groep = stop.dataset.groep;
      const volgorde = [...container.querySelectorAll('.planning-stop')]
        .filter((el) => el.dataset.groep === groep)
        .map((el, i) => ({ boekingId: el.dataset.boekingId, positie: i + 1 }));
      try {
        await api('/api/planning/volgorde', { method: 'PUT', body: JSON.stringify({ type, volgorde }) });
        laadPlanning();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function planningRenderKolom(container, items, type) {
  if (!items.length) {
    container.innerHTML = '<p class="leeg-bericht">Niets gepland voor deze dag.</p>';
    return;
  }
  const groepen = planningGroepeerPerVoertuig(items, type);
  let html = '';
  groepen.forEach((lijst, voertuigNaam) => {
    if (!lijst.length) return;
    html += `<div class="planning-voertuiggroep-kop">${voertuigNaam ? `🚐 ${voertuigNaam}` : '⬜ Niet toegewezen'} (${lijst.length})</div>`;
    html += lijst.map((b) => planningStopHtml(b, type, voertuigNaam)).join('');
  });
  container.innerHTML = html;

  container.querySelectorAll('.planning-stop-voertuig').forEach((select) => {
    select.addEventListener('change', async () => {
      try {
        await api(`/api/dashboard/${select.dataset.boekingId}/voertuig`, {
          method: 'PUT',
          body: JSON.stringify({ voertuig: select.value, type: select.dataset.type }),
        });
        toonToast(select.value ? `${select.value} toegewezen` : 'Voertuig verwijderd');
        laadPlanning();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  planningKoppelDragDrop(container, type);
}

// Bereik-weergave (Deze week/Volgende week/Aangepast, ...): enkel-lezen
// overzicht, per dag gegroepeerd en daarbinnen per voertuig — geen slepen
// (de volgorde is altijd per dag) en geen voertuig-select (dat doe je op de
// dag zelf, via "Vandaag"/de datumkiezer).
function planningBereikStopHtml(b, type) {
  const adres = dashboardAdresTekst(b);
  const tijdWaarde = planningEffectieveTijdWaarde(b, type);
  const eersteProduct = b.eerste_product_naam || (b.producten_namen || '').split(',')[0].trim() || '—';
  const meerdereProducten = Number(b.aantal_producten) > 1;
  const productHeadline = meerdereProducten ? `${eersteProduct}…` : eersteProduct;
  return `
    <div class="planning-stop" data-klant="${b.klant_naam}">
      <span class="planning-stop-tijd">${tijdWaarde}</span>
      <span class="planning-stop-info" title="${b.klant_naam}">
        <strong>${productHeadline}</strong> · ${adres}
      </span>
    </div>
  `;
}

function planningRenderBereikKolom(container, items, type) {
  if (!items.length) {
    container.innerHTML = '<p class="leeg-bericht">Niets gepland in deze periode.</p>';
    return;
  }
  const datumVeld = type === 'levering' ? 'gewenste_datum_start' : 'gewenste_datum_einde';
  const perDag = new Map();
  items.forEach((b) => {
    const dag = (b[datumVeld] || '').slice(0, 10);
    if (!perDag.has(dag)) perDag.set(dag, []);
    perDag.get(dag).push(b);
  });

  let html = '';
  [...perDag.entries()].sort(([a], [c]) => a.localeCompare(c)).forEach(([dag, lijst]) => {
    html += `<div class="planning-dag-kop">${fmtDatum(dag)}</div>`;
    const groepen = planningGroepeerPerVoertuig(lijst, type);
    groepen.forEach((groepLijst, voertuigNaam) => {
      if (!groepLijst.length) return;
      html += `<div class="planning-voertuiggroep-kop">${voertuigNaam ? `🚐 ${voertuigNaam}` : '⬜ Niet toegewezen'} (${groepLijst.length})</div>`;
      html += groepLijst.map((b) => planningBereikStopHtml(b, type)).join('');
    });
  });
  container.innerHTML = html;
}

// Toont/verbergt de dagkiezer, voertuigbeheer en PDF-knoppen t.o.v. de
// periode-info, naargelang de huidige modus — zelfde principe als
// dashboardToonModusUI hierboven.
function planningToonModusUI(actieveSleutel) {
  document.getElementById('planning-datumkiezer').hidden = planningModus === 'bereik';
  const bereikInfoEl = document.getElementById('planning-bereik-info');
  bereikInfoEl.hidden = planningModus !== 'bereik';
  if (planningModus === 'bereik') {
    bereikInfoEl.textContent = `${fmtDatum(planningBereikVanaf)} — ${fmtDatum(planningBereikTot)}`;
  }
  document.querySelectorAll('#planning-snelfilters button').forEach((btn) => {
    btn.classList.toggle('actief', btn.dataset.pbereik === actieveSleutel);
  });
  document.getElementById('planning-uitleg').hidden = planningModus === 'bereik';
  document.getElementById('planning-uitleg-bereik').hidden = planningModus !== 'bereik';
  document.getElementById('planning-voertuigbeheer').hidden = planningModus === 'bereik';
  document.querySelectorAll('#planning-dashboard-kolommen .planning-kolom-acties').forEach((el) => {
    el.hidden = planningModus === 'bereik';
  });
}

function planningGaNaarDag(iso) {
  planningModus = 'dag';
  document.getElementById('planning-aangepast-bereik').hidden = true;
  document.getElementById('planning-datum').value = iso;
  planningToonModusUI(iso === planningVandaagIso() ? 'vandaag' : null);
  laadPlanning();
}

function planningGaNaarBereik(vanaf, tot, sleutel) {
  planningModus = 'bereik';
  planningBereikVanaf = vanaf;
  planningBereikTot = tot;
  document.getElementById('planning-aangepast-bereik').hidden = sleutel !== 'aangepast';
  planningToonModusUI(sleutel);
  laadPlanning();
}

async function laadPlanning() {
  await laadVoertuigen();
  laadVoertuigenBeheer();

  const leveringenEl = document.getElementById('planning-leveringen-lijst');
  const ophalingenEl = document.getElementById('planning-ophalingen-lijst');
  leveringenEl.innerHTML = '<p class="leeg-bericht">Laden...</p>';
  ophalingenEl.innerHTML = '<p class="leeg-bericht">Laden...</p>';

  const bereikModus = planningModus === 'bereik';
  let data;
  if (bereikModus) {
    data = await api(`/api/planning?vanaf=${planningBereikVanaf}&tot=${planningBereikTot}`);
  } else {
    const datumVeld = document.getElementById('planning-datum');
    if (!datumVeld.value) datumVeld.value = planningVandaagIso();
    planningHuidigeDatum = datumVeld.value;
    data = await api(`/api/planning?datum=${planningHuidigeDatum}`);
  }
  planningLaatsteData = data;

  document.getElementById('planning-aantal-leveringen').textContent = `(${data.leveringen.length})`;
  document.getElementById('planning-aantal-ophalingen').textContent = `(${data.ophalingen.length})`;

  if (bereikModus) {
    planningRenderBereikKolom(leveringenEl, data.leveringen, 'levering');
    planningRenderBereikKolom(ophalingenEl, data.ophalingen, 'afhaling');
  } else {
    planningRenderKolom(leveringenEl, data.leveringen, 'levering');
    planningRenderKolom(ophalingenEl, data.ophalingen, 'afhaling');
  }
}

document.getElementById('planning-datum').addEventListener('change', (e) => planningGaNaarDag(e.target.value));
document.getElementById('btn-planning-vorige').addEventListener('click', () => {
  const veld = document.getElementById('planning-datum');
  const d = new Date(veld.value || planningVandaagIso());
  d.setDate(d.getDate() - 1);
  planningGaNaarDag(d.toISOString().slice(0, 10));
});
document.getElementById('btn-planning-volgende').addEventListener('click', () => {
  const veld = document.getElementById('planning-datum');
  const d = new Date(veld.value || planningVandaagIso());
  d.setDate(d.getDate() + 1);
  planningGaNaarDag(d.toISOString().slice(0, 10));
});
document.getElementById('btn-planning-vandaag').addEventListener('click', () => planningGaNaarDag(planningVandaagIso()));

// Snelfilters boven Planning: Vandaag/Morgen (dagmodus, zelfde als de
// datumkiezer) en Deze/Volgende/Vorige week, Vorige maand (bereik-modus,
// enkel-lezen) — hergebruikt dezelfde berekenDatumRange als het Dashboard.
document.querySelectorAll('#planning-snelfilters button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const sleutel = btn.dataset.pbereik;
    if (sleutel === 'aangepast') {
      const [vanaf, tot] = planningModus === 'bereik'
        ? [planningBereikVanaf, planningBereikTot]
        : [planningVandaagIso(), planningVandaagIso()];
      document.getElementById('planning-bereik-vanaf').value = vanaf;
      document.getElementById('planning-bereik-tot').value = tot;
      document.getElementById('planning-aangepast-bereik').hidden = false;
      document.querySelectorAll('#planning-snelfilters button').forEach((b) => b.classList.toggle('actief', b === btn));
      return;
    }
    if (sleutel === 'vandaag' || sleutel === 'morgen') {
      const [iso] = berekenDatumRange(sleutel);
      planningGaNaarDag(iso);
      return;
    }
    const [vanaf, tot] = berekenDatumRange(sleutel);
    planningGaNaarBereik(vanaf, tot, sleutel);
  });
});

document.getElementById('btn-planning-bereik-toepassen').addEventListener('click', () => {
  const vanaf = document.getElementById('planning-bereik-vanaf').value;
  const tot = document.getElementById('planning-bereik-tot').value;
  if (!vanaf || !tot) return alert('Kies zowel een "van"- als een "tot"-datum.');
  if (vanaf > tot) return alert('De "van"-datum moet vóór de "tot"-datum liggen.');
  planningGaNaarBereik(vanaf, tot, 'aangepast');
});

// ============================================================
// PLANNING — laadlijst / leveringslijst / afhaallijst (PDF)
// ============================================================
// Geen aparte PDF-bibliotheek nodig: net als "Print drop sheet" bij
// Boekingenoverzicht (zie bouwDropSheetHtml hierboven) bouwen we een
// afdrukvriendelijke HTML-versie op en gebruiken we window.print() — in het
// printvenster kiest Jonas gewoon "Opslaan als PDF" i.p.v. een fysieke printer.
function planningLogistiekTotalen(b) {
  const producten = b.producten_detail || [];
  const totalen = { gewicht: 0, valmatten: 0, piketten: 0, zandzakken: 0, motoren: new Set() };
  producten.forEach((p) => {
    const aantal = Number(p.aantal) || 1;
    totalen.gewicht += (Number(p.gewicht_kg) || 0) * aantal;
    totalen.valmatten += (Number(p.aantal_valmatten) || 0) * aantal;
    totalen.piketten += (Number(p.aantal_piketten) || 0) * aantal;
    totalen.zandzakken += (Number(p.aantal_zandzakken) || 0) * aantal;
    if (p.motor_type) totalen.motoren.add(p.motor_type);
  });
  return totalen;
}

function planningPrintKopHtml(titel, subtitel) {
  const vandaag = new Date().toLocaleDateString('nl-BE');
  return `<h2>${titel}</h2><p class="uitleg">${subtitel} — afgedrukt op ${vandaag}</p>`;
}

// Laadlijst: per voertuig, met per stop de logistieke gegevens (gewicht,
// motor, valmatten/piketten/zandzakken) en een subtotaal per voertuig +
// eindtotaal — wat Jonas nodig heeft om de wagen(s) te beladen. Enkel zinvol
// voor een specifieke dag, dus enkel beschikbaar in dagmodus (zie
// planningToonModusUI, die de knop dan verbergt).
function planningBouwLaadlijstHtml() {
  const data = planningLaatsteData;
  if (!data || !data.leveringen.length) return '<p class="leeg-bericht">Niets te leveren op deze dag.</p>';
  const groepen = planningGroepeerPerVoertuig(data.leveringen, 'levering');
  let html = planningPrintKopHtml('Laadlijst', `Te leveren op ${fmtDatum(planningHuidigeDatum)}`);
  const eindtotaal = { gewicht: 0, valmatten: 0, piketten: 0, zandzakken: 0 };

  groepen.forEach((lijst, voertuigNaam) => {
    if (!lijst.length) return;
    html += `<div class="planning-print-groep-kop">${voertuigNaam ? `🚐 ${voertuigNaam}` : '⬜ Niet toegewezen'}</div>`;
    html += `<table class="planning-print-tabel"><thead><tr>
      <th>Tijd</th><th>Klant</th><th>Product(en)</th><th>Motor</th>
      <th>Gewicht</th><th>Valmatten</th><th>Piketten</th><th>Zandzakken</th>
    </tr></thead><tbody>`;
    const subtotaal = { gewicht: 0, valmatten: 0, piketten: 0, zandzakken: 0 };
    lijst.forEach((b) => {
      const t = planningLogistiekTotalen(b);
      subtotaal.gewicht += t.gewicht;
      subtotaal.valmatten += t.valmatten;
      subtotaal.piketten += t.piketten;
      subtotaal.zandzakken += t.zandzakken;
      html += `<tr>
        <td>${planningEffectieveTijdWaarde(b, 'levering')}</td>
        <td>${b.klant_naam}</td>
        <td>${b.producten_namen || '—'}</td>
        <td>${[...t.motoren].join(', ') || '—'}</td>
        <td>${t.gewicht ? t.gewicht.toFixed(0) + ' kg' : '—'}</td>
        <td>${t.valmatten || '—'}</td>
        <td>${t.piketten || '—'}</td>
        <td>${t.zandzakken || '—'}</td>
      </tr>`;
    });
    html += `<tr class="planning-print-totaalrij">
      <td colspan="4">Subtotaal ${voertuigNaam || 'niet toegewezen'}</td>
      <td>${subtotaal.gewicht.toFixed(0)} kg</td><td>${subtotaal.valmatten}</td><td>${subtotaal.piketten}</td><td>${subtotaal.zandzakken}</td>
    </tr>`;
    html += '</tbody></table>';
    eindtotaal.gewicht += subtotaal.gewicht;
    eindtotaal.valmatten += subtotaal.valmatten;
    eindtotaal.piketten += subtotaal.piketten;
    eindtotaal.zandzakken += subtotaal.zandzakken;
  });

  html += `<p class="planning-print-eindtotaal">Totaal alle voertuigen: ${eindtotaal.gewicht.toFixed(0)} kg · ${eindtotaal.valmatten} valmatten · ${eindtotaal.piketten} piketten · ${eindtotaal.zandzakken} zandzakken</p>`;
  return html;
}

// Leveringslijst/afhaallijst: eenvoudige, per voertuig gegroepeerde route-
// lijst (tijd/klant/telefoon/adres/producten) zonder de logistieke totalen —
// dit is wat de chauffeur onderweg nodig heeft, geen laadgegevens.
function planningBouwEenvoudigeLijstHtml(items, type, titel) {
  if (!items.length) return '<p class="leeg-bericht">Niets gepland op deze dag.</p>';
  const groepen = planningGroepeerPerVoertuig(items, type);
  let html = planningPrintKopHtml(titel, `${type === 'levering' ? 'Te leveren' : 'Af te halen'} op ${fmtDatum(planningHuidigeDatum)}`);
  groepen.forEach((lijst, voertuigNaam) => {
    if (!lijst.length) return;
    html += `<div class="planning-print-groep-kop">${voertuigNaam ? `🚐 ${voertuigNaam}` : '⬜ Niet toegewezen'} (${lijst.length})</div>`;
    html += `<table class="planning-print-tabel"><thead><tr><th>Tijd</th><th>Klant</th><th>Telefoon</th><th>Adres</th><th>Product(en)</th></tr></thead><tbody>`;
    lijst.forEach((b) => {
      const adres = dashboardAdresTekst(b);
      html += `<tr>
        <td>${planningEffectieveTijdWaarde(b, type)}</td>
        <td>${b.klant_naam}</td>
        <td>${b.klant_telefoon || '—'}</td>
        <td>${adres}</td>
        <td>${b.producten_namen || '—'}</td>
      </tr>`;
    });
    html += '</tbody></table>';
  });
  return html;
}

function planningAfdrukken(html) {
  document.getElementById('planning-print').innerHTML = html;
  document.body.classList.add('print-modus-planning');
  window.print();
}

document.getElementById('btn-planning-laadlijst').addEventListener('click', () => planningAfdrukken(planningBouwLaadlijstHtml()));
document.getElementById('btn-planning-leveringslijst').addEventListener('click', () => {
  planningAfdrukken(planningBouwEenvoudigeLijstHtml(planningLaatsteData ? planningLaatsteData.leveringen : [], 'levering', 'Leveringslijst'));
});
document.getElementById('btn-planning-afhaallijst').addEventListener('click', () => {
  planningAfdrukken(planningBouwEenvoudigeLijstHtml(planningLaatsteData ? planningLaatsteData.ophalingen : [], 'afhaling', 'Afhaallijst'));
});

// ============================================================
// AANVRAGEN-INBOX
// ============================================================
async function laadAanvragen() {
  const container = document.getElementById('lijst-aanvragen');
  container.innerHTML = '<p class="leeg-bericht">Laden...</p>';
  const [nieuw, inBehandeling] = await Promise.all([
    api('/api/boekingen?status=nieuw'),
    api('/api/boekingen?status=in_behandeling'),
  ]);
  const aanvragen = [...nieuw, ...inBehandeling];

  const badge = document.getElementById('badge-aanvragen');
  if (aanvragen.length > 0) {
    badge.hidden = false;
    badge.textContent = aanvragen.length;
  } else {
    badge.hidden = true;
  }

  if (!aanvragen.length) {
    container.innerHTML = '<p class="leeg-bericht">Geen openstaande aanvragen.</p>';
    return;
  }

  container.innerHTML = '';
  for (const b of aanvragen) {
    const kaart = document.createElement('div');
    kaart.className = 'kaart';
    kaart.innerHTML = `
      <div class="kaart-info">
        <h3>${b.klant_naam} ${statusPillHtml(b.status)}${speciaalSterHtml(b)}</h3>
        <p>📅 ${fmtDatum(b.gewenste_datum_start)}${b.gewenste_datum_start !== b.gewenste_datum_einde ? ' – ' + fmtDatum(b.gewenste_datum_einde) : ''}</p>
        <p>🎪 ${b.producten_namen || '—'}</p>
        <p>📍 ${b.leveringsadres || '—'}</p>
        <p>📞 ${b.klant_telefoon || '—'}</p>
        <p class="beschikbaarheid-badge" data-boeking-id="${b.id}">⏳ Beschikbaarheid controleren…</p>
      </div>
      <div class="kaart-acties"></div>
    `;
    const acties = kaart.querySelector('.kaart-acties');

    if (b.status === 'nieuw') {
      acties.appendChild(maakActieKnop('In behandeling nemen', 'btn-behandeling', () => wijzigStatus(b.id, 'in_behandeling')));
    }
    acties.appendChild(maakActieKnop('Accepteren', 'btn-accepteren', () => wijzigStatus(b.id, 'geaccepteerd')));
    acties.appendChild(maakActieKnop('Weigeren', 'btn-weigeren', () => {
      const reden = prompt('Reden van weigering (optioneel):') || '';
      wijzigStatus(b.id, 'geweigerd', reden);
    }));
    const bekijkKnop = maakActieKnop('Bekijk', '', () => openDetail(b.id));
    acties.appendChild(bekijkKnop);

    container.appendChild(kaart);
  }

  // Beschikbaarheid per aanvraag apart (en async) ophalen i.p.v. de hele lijst te
  // laten wachten op elke controle — zo verschijnt de inbox meteen, en verschijnt
  // de beschikbaarheid-badge van elke kaart zodra die gekend is. Belangrijk bij
  // (o.a. automatisch vanuit het website-formulier aangemaakte) aanvragen die al
  // even blijven liggen: de beschikbaarheid kan ondertussen gewijzigd zijn door
  // een andere boeking op dezelfde datum.
  for (const b of aanvragen) {
    api(`/api/boekingen/${b.id}/beschikbaarheid`)
      .then((resultaat) => {
        const el = container.querySelector(`.beschikbaarheid-badge[data-boeking-id="${b.id}"]`);
        if (!el) return;
        if (resultaat.beschikbaar) {
          el.textContent = '✓ Nog beschikbaar';
          el.className = 'beschikbaarheid-badge beschikbaarheid-ok';
        } else {
          el.textContent = `⚠ Niet meer beschikbaar — ${resultaat.problemen.join('; ')}`;
          el.className = 'beschikbaarheid-badge beschikbaarheid-fout';
        }
      })
      .catch(() => {
        const el = container.querySelector(`.beschikbaarheid-badge[data-boeking-id="${b.id}"]`);
        if (el) el.textContent = '';
      });
  }
}

function maakActieKnop(label, klasse, onClick) {
  const btn = document.createElement('button');
  btn.textContent = label;
  if (klasse) btn.className = klasse;
  btn.addEventListener('click', onClick);
  return btn;
}

async function wijzigStatus(boekingId, nieuweStatus, opmerking) {
  try {
    await api(`/api/boekingen/${boekingId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: nieuweStatus, opmerking }),
    });
    laadAanvragen();
    if (!document.getElementById('view-boekingen').hidden) laadBoekingenOverzicht();
    // Bij een statuswijziging vanuit het dossier zelf (snelknoppen of de vrije "Andere
    // status instellen"-lijst) blijven we in het dossier — enkel de inhoud herladen,
    // zodat Jonas meteen de bijgewerkte statusbalk/kleur ziet in plaats van uit het
    // dossier te worden gestuurd. Vanuit de Aanvragen-inbox (waar het dossier niet
    // zichtbaar is) verandert er hier niets: dat blijft gewoon de kaartenlijst tonen.
    if (!document.getElementById('view-boeking-detail').hidden) openDetail(boekingId);
  } catch (err) {
    alert(err.message);
  }
}

// ============================================================
// BOEKINGENOVERZICHT
// ============================================================
// De actieve status/periode-filters van het Boekingenoverzicht — gedeeld tussen het
// laden van de lijst en de export/afdruk-knoppen, zodat die altijd overeenkomen
// met wat er op het scherm staat.
// "Laatste nieuwe reservaties" is een losse sorteer-knop (geen periode/status-
// filter): toont wat het RECENTST is aangemaakt, los van de leverdatum — handig
// om snel na te kijken wat er net is ingevoerd/geïmporteerd. Blijft aanstaan tot
// Jonas hem opnieuw uitklikt of op "Filteren" klikt.
let boekingenSorteringLaatsteNieuwe = false;

function huidigeBoekingenFilterParams() {
  const status = document.getElementById('filter-status').value;
  const productId = document.getElementById('filter-product').value;
  const vanaf = document.getElementById('filter-vanaf').value;
  const tot = document.getElementById('filter-tot').value;
  const zoek = document.getElementById('filter-zoek').value;
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (productId) params.set('product_id', productId);
  if (vanaf) params.set('vanaf', vanaf);
  if (tot) params.set('tot', tot);
  if (zoek.trim()) params.set('zoek', zoek.trim());
  if (boekingenSorteringLaatsteNieuwe) params.set('sortering', 'laatst_toegevoegd');
  return params;
}

// Productfilter-dropdown vullen zodra de productenlijst gekend is (gedeelde
// cache, zie laadProductenCache) — gegroepeerd per categorie, zoals overal elders.
function vulBoekingenProductFilter() {
  const select = document.getElementById('filter-product');
  if (select.dataset.gevuld) return;
  const groepen = groepeerLijstPerCategorie(productenCache);
  let html = '<option value="">Alle</option>';
  groepen.forEach((lijst, categorie) => {
    if (!lijst.length) return;
    html += `<optgroup label="${categorie}">${lijst.map((p) => `<option value="${p.id}">${p.naam}</option>`).join('')}</optgroup>`;
  });
  select.innerHTML = html;
  select.dataset.gevuld = '1';
}

// Ontleedt het (vrije-tekst) leveringsadres of het klantadres in 3 kolommen:
// straat + nr, postcode, gemeente (zie dezelfde helper server-side in boekingen.js
// voor de CSV-export — beide moeten identiek splitsen).
function ontleedAdres(b) {
  if (b.leveringswijze === 'afhaling') {
    return { straat: 'Afhaling', postcode: '', gemeente: '' };
  }
  if (b.leveringsadres) {
    const match = b.leveringsadres.match(/^(.*?),?\s*(\d{4})\s+(.+)$/);
    if (match) {
      return { straat: match[1].trim(), postcode: match[2], gemeente: match[3].trim() };
    }
    return { straat: b.leveringsadres, postcode: '', gemeente: '' };
  }
  return {
    straat: b.klant_adres || '—',
    postcode: b.klant_postcode || '',
    gemeente: b.klant_gemeente || '',
  };
}

// Zelfde opsplitsing, maar rechtstreeks op een kant-en-klare adrestekst (bv. voor
// de klantgegevens in het dossier, waar "Afhaling" geen rol speelt — daar toont
// de "Leveringswijze"-rij dat al apart).
function ontleedAdresVrijeTekst(adres) {
  if (!adres) return { straat: '—', postcode: '', gemeente: '' };
  const match = adres.match(/^(.*?),?\s*(\d{4})\s+(.+)$/);
  if (match) return { straat: match[1].trim(), postcode: match[2], gemeente: match[3].trim() };
  return { straat: adres, postcode: '', gemeente: '' };
}

// Zelfde opsplitsing als hierboven, maar voor het VOORINVULLEN van een
// bewerkbaar formulierveld — daar mag geen "—" in het straat-veld verschijnen
// als het adres leeg is (dat betekent hier: "leeg = adres van de klant" moet
// leeg blijven, niet stilzwijgend vastklikken op de weergave-placeholder).
function ontleedAdresVoorFormulier(adres) {
  if (!adres) return { straat: '', postcode: '', gemeente: '' };
  return ontleedAdresVrijeTekst(adres);
}

// Vaste opties voor "Type ondergrond"/"Toegankelijkheid" in het dossier — zelfde
// lijst als het dropdown-menu op het live aanvraagformulier van de website.
// "Toegankelijkheid" stond op het aanvraagformulier enkel als voorbeeldwaarde
// ("Vrije doorgang") zichtbaar, niet als volledige lijst — deze 4 opties zijn
// een redelijke inschatting; Jonas kan dit laten aanpassen indien de website
// een andere/langere lijst gebruikt.
const ONDERGROND_OPTIES = ['Gras', 'Steen', 'Braakliggend', 'Zand', 'Klinkers'];
const TOEGANKELIJKHEID_OPTIES = ['Vrije doorgang', 'Smalle doorgang', 'Trappen aanwezig', 'Moeilijk bereikbaar'];

// Korte code per type ondergrond voor de "Ondergrond"-kolom in het
// boekingenoverzicht — één afkorting per keuze uit ONDERGROND_OPTIES i.p.v.
// enkel het binaire gras/hard-onderscheid van voorheen.
const ONDERGROND_AFKORTINGEN = {
  Gras: 'O/G',
  Steen: 'O/S',
  Braakliggend: 'O/B',
  Zand: 'O/Z',
  Klinkers: 'O/K',
};
function ondergrondAfkorting(type) {
  if (!type) return '—';
  const waarde = type.trim();
  if (ONDERGROND_AFKORTINGEN[waarde]) return ONDERGROND_AFKORTINGEN[waarde];
  // Oudere vrije-tekst-waarde van vóór de dropdown-conversie, of een type dat
  // niet in de lijst staat: toon toch een korte afkorting o.b.v. de eerste
  // letter i.p.v. niets te tonen.
  return waarde ? 'O/' + waarde.charAt(0).toUpperCase() : '—';
}

// Bouwt <option>-elementen voor een vaste keuzelijst, met een lege eerste optie
// (voor "niet ingevuld") en — belangrijk — de HUIDIGE waarde als extra optie
// toegevoegd wanneer die niet in de standaardlijst voorkomt. Zo verdwijnt een
// oudere, vrij ingetypte waarde (van vóór deze dropdown er was) niet stilzwijgend
// uit beeld zodra het dossier opnieuw bewaard wordt.
function bouwKeuzeOpties(opties, huidigeWaarde) {
  const lijst = opties.slice();
  if (huidigeWaarde && !lijst.includes(huidigeWaarde)) lijst.push(huidigeWaarde);
  return '<option value=""></option>' + lijst
    .map((o) => `<option value="${o}" ${o === huidigeWaarde ? 'selected' : ''}>${o}</option>`)
    .join('');
}

// Laatst opgehaalde lijst bijhouden, zodat "Print drop sheet" dezelfde
// resultaten kan hergebruiken zonder een aparte fetch (en zodat de kolom exact
// overeenkomt met wat op het scherm staat).
let laatsteBoekingenOverzichtData = [];

async function laadBoekingenOverzicht() {
  const params = huidigeBoekingenFilterParams();
  const boekingen = await api(`/api/boekingen?${params.toString()}`);
  laatsteBoekingenOverzichtData = boekingen;

  const totaal = boekingen.reduce((som, b) => som + Number(b.waarde || 0), 0);
  const ontvangen = boekingen.reduce((som, b) => som + Number(b.betaling_ontvangen || 0), 0);
  const openstaand = totaal - ontvangen;
  const gemiddeld = boekingen.length ? totaal / boekingen.length : 0;
  document.getElementById('stat-aantal').textContent = boekingen.length;
  document.getElementById('stat-totaal').textContent = fmtEuro(totaal);
  document.getElementById('stat-openstaand').textContent = fmtEuro(openstaand);
  document.getElementById('stat-ontvangen').textContent = fmtEuro(ontvangen);
  document.getElementById('stat-gemiddeld').textContent = fmtEuro(gemiddeld);

  const tbody = document.getElementById('tabel-boekingen');
  tbody.innerHTML = '';
  document.getElementById('check-alles').checked = false;
  if (!boekingen.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="leeg-bericht">Geen boekingen gevonden.</td></tr>';
    return;
  }
  for (const b of boekingen) {
    const adres = ontleedAdres(b);
    // Openstaand saldo i.p.v. de totale waarde: zo is in één oogopslag duidelijk
    // of een boeking nog betaald moet worden, of al volledig voldaan is.
    const saldo = Math.round((Number(b.waarde || 0) - Number(b.betaling_ontvangen || 0)) * 100) / 100;
    const saldoVoldaan = saldo <= 0.01;
    const tr = document.createElement('tr');
    tr.className = `rij-kleur-${STATUS_KLEUR[b.status] || 'grijs'}`;
    tr.innerHTML = `
      <td><input type="checkbox" class="check-boeking-rij" data-boeking-id="${b.id}" /></td>
      <td>${fmtDatum(b.gewenste_datum_start)}</td>
      <td>${b.producten_namen || '—'}</td>
      <td>${adres.straat}</td>
      <td>${adres.postcode}</td>
      <td>${adres.gemeente}</td>
      <td>${b.klant_naam}</td>
      <td class="saldo-cel${saldoVoldaan ? ' voldaan' : ''}" title="Totale waarde: ${fmtEuro(b.waarde)}">${saldoVoldaan ? '✓ Voldaan' : fmtEuro(saldo)}</td>
      <td>${statusPillHtml(b.status, saldo)}${speciaalSterHtml(b)}</td>
      <td title="${b.type_ondergrond || ''}">${ondergrondAfkorting(b.type_ondergrond)}</td>
      <td>Bekijk →</td>
    `;
    tr.querySelector('.check-boeking-rij').addEventListener('click', (e) => e.stopPropagation());
    tr.addEventListener('click', () => openDetail(b.id));
    tbody.appendChild(tr);
  }
}

document.getElementById('check-alles').addEventListener('change', (e) => {
  document.querySelectorAll('#tabel-boekingen .check-boeking-rij').forEach((c) => { c.checked = e.target.checked; });
});

document.getElementById('btn-filter-toepassen').addEventListener('click', () => {
  boekingenSorteringLaatsteNieuwe = false;
  document.getElementById('btn-laatste-nieuwe').classList.remove('actief');
  laadBoekingenOverzicht();
});
// Ook filteren bij Enter in het zoekveld, zonder dat "Filteren" apart aangeklikt hoeft te worden.
document.getElementById('filter-zoek').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-filter-toepassen').click();
});

document.getElementById('btn-laatste-nieuwe').addEventListener('click', (e) => {
  boekingenSorteringLaatsteNieuwe = !boekingenSorteringLaatsteNieuwe;
  e.target.classList.toggle('actief', boekingenSorteringLaatsteNieuwe);
  laadBoekingenOverzicht();
});

// Exporteren (Excel/CSV) en afdrukken van het overzicht — op basis van dezelfde
// status/periode-filter die nu op het scherm staat.
document.getElementById('btn-boekingen-exporteren').addEventListener('click', () => {
  const params = huidigeBoekingenFilterParams();
  window.location.href = `/api/boekingen/export.csv?${params.toString()}`;
});

document.getElementById('btn-boekingen-afdrukken').addEventListener('click', () => {
  window.print();
});

// "Print drop sheet": een leveringsgerichte afdruk (i.p.v. de gewone tabel) voor
// de chauffeur/crew — adres, tijdstip en product groot en overzichtelijk, met
// ruimte om af te vinken. Werkt op dezelfde, al geladen resultaten als het scherm
// (zelfde filter/periode), gesorteerd op leverdatum zodat de route logisch loopt.
function bouwDropSheetHtml(boekingenLijst) {
  if (!boekingenLijst.length) {
    return '<p class="leeg-bericht">Geen boekingen in deze selectie.</p>';
  }
  const gesorteerd = boekingenLijst.slice().sort((a, b) => (a.gewenste_datum_start || '').localeCompare(b.gewenste_datum_start || ''));
  const rijenHtml = gesorteerd.map((b) => {
    const adres = ontleedAdres(b);
    const adresTekst = b.leveringswijze === 'afhaling' ? 'Afhaling in het depot' : [adres.straat, [adres.postcode, adres.gemeente].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return `
      <tr>
        <td class="ds-vink"><span class="ds-checkbox"></span></td>
        <td>${fmtDatum(b.gewenste_datum_start)}${b.gewenste_datum_einde && b.gewenste_datum_einde !== b.gewenste_datum_start ? ' t/m ' + fmtDatum(b.gewenste_datum_einde) : ''}</td>
        <td>${b.voorkeur_tijdstip_levering || '—'} / ${b.voorkeur_tijdstip_afhaling || '—'}</td>
        <td>${b.producten_namen || '—'}</td>
        <td><strong>${b.klant_naam}</strong><br>${b.klant_telefoon || ''}</td>
        <td>${adresTekst}</td>
        <td class="ds-opmerking"></td>
      </tr>`;
  }).join('');
  const vandaag = new Date().toLocaleDateString('nl-BE');
  return `
    <h2>Drop sheet — afgedrukt op ${vandaag}</h2>
    <table class="ds-tabel">
      <thead>
        <tr><th></th><th>Datum</th><th>Levering / afhaling</th><th>Product(en)</th><th>Klant</th><th>Adres</th><th>Opmerking</th></tr>
      </thead>
      <tbody>${rijenHtml}</tbody>
    </table>`;
}

document.getElementById('btn-drop-sheet').addEventListener('click', () => {
  document.getElementById('drop-sheet-print').innerHTML = bouwDropSheetHtml(laatsteBoekingenOverzichtData);
  document.body.classList.add('print-modus-dropsheet');
  window.print();
});
window.addEventListener('afterprint', () => {
  document.body.classList.remove('print-modus-dropsheet');
  document.body.classList.remove('print-modus-planning');
});

// Bulk e-mail: verstuurt via Jonas' eigen Microsoft 365-account (Graph API,
// zie src/utils/mailer.js) naar de klanten van de aangevinkte boekingen.
const modalBulkEmail = document.getElementById('modal-bulk-email');
document.getElementById('btn-modal-bulk-email-sluiten').addEventListener('click', () => { modalBulkEmail.hidden = true; });
modalBulkEmail.addEventListener('click', (e) => { if (e.target === modalBulkEmail) modalBulkEmail.hidden = true; });

function geselecteerdeBoekingIds() {
  return Array.from(document.querySelectorAll('#tabel-boekingen .check-boeking-rij:checked')).map((c) => c.dataset.boekingId);
}

function bouwBulkEmailNietGeconfigureerdHtml() {
  return `
    <h3>✉️ Bulk e-mail versturen</h3>
    <p class="leeg-bericht">Microsoft 365 is nog niet gekoppeld aan dit platform. Zodra dat is ingesteld (zie de opzet-instructies), kan je hier mails versturen vanaf je eigen mailadres.</p>
  `;
}

function bouwBulkEmailFormulierHtml(aantal) {
  return `
    <h3>✉️ Bulk e-mail versturen</h3>
    <p class="uitleg">Naar de klanten van de ${aantal} geselecteerde boeking${aantal === 1 ? '' : 'en'}. Gebruik <code>{{naam}}</code> in onderwerp of tekst om automatisch de klantnaam in te vullen. De mail vertrekt vanaf je eigen gekoppelde mailadres.</p>
    <form id="form-bulk-email">
      <label>Onderwerp<input type="text" id="be-onderwerp" placeholder="bv. Herinnering: uw reservatie bij Belair-Fun" required /></label>
      <label>Bericht<textarea id="be-inhoud" rows="8" placeholder="Beste {{naam}}," required></textarea></label>
      <p class="foutmelding" id="be-fout"></p>
      <button type="submit">Versturen</button>
    </form>
    <div id="be-resultaten"></div>
  `;
}

function bouwBulkEmailResultatenHtml(resultaten) {
  const statusLabel = { verstuurd: '✓ Verstuurd', overgeslagen: '⚠ Overgeslagen', mislukt: '✗ Mislukt' };
  const rijen = resultaten
    .map((r) => `<div class="be-resultaat-rij be-resultaat-${r.status}"><span>${r.klant_naam}</span><span>${statusLabel[r.status] || r.status}${r.reden ? ' — ' + r.reden : ''}</span></div>`)
    .join('');
  const aantalVerstuurd = resultaten.filter((r) => r.status === 'verstuurd').length;
  return `
    <h4>Resultaat: ${aantalVerstuurd} van ${resultaten.length} verstuurd</h4>
    <div class="be-resultaten-lijst">${rijen}</div>
  `;
}

document.getElementById('btn-bulk-email').addEventListener('click', async () => {
  const ids = geselecteerdeBoekingIds();
  if (!ids.length) {
    alert('Vink eerst één of meer boekingen aan in de tabel.');
    return;
  }
  const inhoud = document.getElementById('modal-bulk-email-inhoud');
  inhoud.innerHTML = '<p class="leeg-bericht">Bezig met laden…</p>';
  modalBulkEmail.hidden = false;

  const status = await api('/api/boekingen/mail-status');
  if (!status.geconfigureerd) {
    inhoud.innerHTML = bouwBulkEmailNietGeconfigureerdHtml();
    return;
  }
  inhoud.innerHTML = bouwBulkEmailFormulierHtml(ids.length);

  document.getElementById('form-bulk-email').addEventListener('submit', async (e) => {
    e.preventDefault();
    const elFout = document.getElementById('be-fout');
    const knop = e.target.querySelector('button[type="submit"]');
    elFout.textContent = '';
    knop.disabled = true;
    knop.textContent = 'Bezig met versturen…';
    try {
      const resultaat = await api('/api/boekingen/bulk-email', {
        method: 'POST',
        body: JSON.stringify({
          boeking_ids: ids,
          onderwerp: document.getElementById('be-onderwerp').value,
          inhoud: document.getElementById('be-inhoud').value,
        }),
      });
      document.getElementById('be-resultaten').innerHTML = bouwBulkEmailResultatenHtml(resultaat.resultaten);
      e.target.hidden = true;
    } catch (err) {
      elFout.textContent = err.message;
      knop.disabled = false;
      knop.textContent = 'Versturen';
    }
  });
});

// KLANTEN: lijst + zoeken, en klantdetail (gegevens + volledige boekingshistoriek).
async function laadKlantenOverzicht() {
  const zoek = document.getElementById('klanten-zoek').value.trim();
  const params = new URLSearchParams();
  if (zoek) params.set('zoek', zoek);
  const klanten = await api(`/api/klanten?${params.toString()}`);

  const tbody = document.getElementById('tabel-klanten');
  tbody.innerHTML = '';
  if (!klanten.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="leeg-bericht">Geen klanten gevonden.</td></tr>';
    return;
  }
  for (const k of klanten) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${k.naam}</td>
      <td>${k.klant_type === 'bedrijf' ? 'Bedrijf' : 'Particulier'}</td>
      <td>${k.telefoon || '—'}</td>
      <td>${k.email || '—'}</td>
      <td>${k.aantal_boekingen}</td>
      <td>${fmtEuro(k.totale_waarde)}</td>
      <td>${k.laatste_boeking ? fmtDatum(k.laatste_boeking) : '—'}</td>
      <td>Bekijk →</td>
    `;
    tr.addEventListener('click', () => openKlantDetail(k.id));
    tbody.appendChild(tr);
  }
}

document.getElementById('btn-klanten-filter-toepassen').addEventListener('click', () => laadKlantenOverzicht());
document.getElementById('klanten-zoek').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-klanten-filter-toepassen').click();
});

document.getElementById('btn-klant-detail-terug').addEventListener('click', () => wisselView('klanten'));

async function openKlantDetail(klantId) {
  const k = await api(`/api/klanten/${klantId}`);
  const inhoud = document.getElementById('klant-detail-inhoud');

  const boekingenRijenHtml = (k.boekingen || []).length
    ? k.boekingen.map((b) => `
        <tr class="klikbaar-rij" data-boeking-id="${b.id}">
          <td>${fmtDatum(b.gewenste_datum_start)}${b.gewenste_datum_einde && b.gewenste_datum_einde !== b.gewenste_datum_start ? ' t/m ' + fmtDatum(b.gewenste_datum_einde) : ''}</td>
          <td>${b.producten_namen || '—'}</td>
          <td>${fmtEuro(b.waarde)}</td>
          <td>${statusPillHtml(b.status)}</td>
          <td>Bekijk →</td>
        </tr>`).join('')
    : '<tr><td colspan="5" class="leeg-bericht">Nog geen boekingen.</td></tr>';

  inhoud.innerHTML = `
    <div class="detail-layout">
      <div class="detail-kolom detail-kolom-links">
        <div class="paneel">
          <div class="detail-kolom-kop">
            <h3>${k.naam}</h3>
            <button type="button" id="btn-klant-bewerken" class="linkbtn">✎ Bewerken</button>
          </div>
          <div id="klant-gegevens-weergave">
            <div class="detail-rij"><span>Type</span><span>${k.klant_type === 'bedrijf' ? 'Bedrijf' : 'Particulier'}</span></div>
            ${k.klant_type === 'bedrijf' ? `<div class="detail-rij"><span>BTW-nummer</span><span>${k.btw_nummer || '—'}</span></div>` : ''}
            <div class="detail-rij"><span>Telefoon</span><span>${k.telefoon || '—'}</span></div>
            <div class="detail-rij"><span>E-mail</span><span>${k.email || '—'}</span></div>
            <div class="detail-rij"><span>Adres</span><span>${[k.adres, [k.postcode, k.gemeente].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'}</span></div>
            <div class="detail-rij"><span>Marketing opt-in</span><span>${{ ja: 'Ja', nee: 'Nee', nog_niet_gevraagd: 'Nog niet gevraagd' }[k.marketing_opt_in] || '—'}</span></div>
          </div>
          <form id="form-klant-bewerken" hidden>
            <label>Naam / bedrijfsnaam<input type="text" id="kb-naam" value="${k.naam || ''}" /></label>
            <label>Type
              <select id="kb-type">
                <option value="particulier" ${k.klant_type !== 'bedrijf' ? 'selected' : ''}>Particulier</option>
                <option value="bedrijf" ${k.klant_type === 'bedrijf' ? 'selected' : ''}>Bedrijf</option>
              </select>
            </label>
            <label>BTW-nummer (indien bedrijf)<input type="text" id="kb-btw" value="${k.btw_nummer || ''}" /></label>
            <label>Telefoon<input type="text" id="kb-telefoon" value="${k.telefoon || ''}" /></label>
            <label>E-mail<input type="email" id="kb-email" value="${k.email || ''}" /></label>
            <label>Adres<input type="text" id="kb-adres" value="${k.adres || ''}" /></label>
            <label>Postcode<input type="text" id="kb-postcode" value="${k.postcode || ''}" /></label>
            <label>Gemeente<input type="text" id="kb-gemeente" value="${k.gemeente || ''}" /></label>
            <label>Marketing opt-in
              <select id="kb-marketing">
                <option value="nog_niet_gevraagd" ${k.marketing_opt_in === 'nog_niet_gevraagd' ? 'selected' : ''}>Nog niet gevraagd</option>
                <option value="ja" ${k.marketing_opt_in === 'ja' ? 'selected' : ''}>Ja</option>
                <option value="nee" ${k.marketing_opt_in === 'nee' ? 'selected' : ''}>Nee</option>
              </select>
            </label>
            <div class="form-acties">
              <button type="submit">Opslaan</button>
              <button type="button" id="btn-klant-bewerken-annuleren" class="linkbtn">Annuleren</button>
            </div>
            <p id="klant-bewerken-fout" class="foutmelding"></p>
          </form>
        </div>
      </div>
      <div class="detail-kolom detail-kolom-rechts">
        <div class="paneel">
          <h4>Boekingshistoriek (${k.aantal_boekingen} boeking${k.aantal_boekingen === 1 ? '' : 'en'}, totaal ${fmtEuro(k.totale_waarde)})</h4>
          <table class="tabel">
            <thead><tr><th>Datum</th><th>Product(en)</th><th>Waarde</th><th>Status</th><th></th></tr></thead>
            <tbody>${boekingenRijenHtml}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  inhoud.querySelectorAll('.klikbaar-rij').forEach((tr) => {
    tr.addEventListener('click', () => openDetail(tr.dataset.boekingId));
  });

  document.getElementById('btn-klant-bewerken').addEventListener('click', () => {
    document.getElementById('klant-gegevens-weergave').hidden = true;
    document.getElementById('form-klant-bewerken').hidden = false;
  });
  document.getElementById('btn-klant-bewerken-annuleren').addEventListener('click', () => {
    document.getElementById('klant-gegevens-weergave').hidden = false;
    document.getElementById('form-klant-bewerken').hidden = true;
  });
  document.getElementById('form-klant-bewerken').addEventListener('submit', async (e) => {
    e.preventDefault();
    const elFout = document.getElementById('klant-bewerken-fout');
    elFout.textContent = '';
    try {
      await api(`/api/klanten/${klantId}`, {
        method: 'PUT',
        body: JSON.stringify({
          naam: document.getElementById('kb-naam').value.trim() || null,
          klant_type: document.getElementById('kb-type').value,
          btw_nummer: document.getElementById('kb-btw').value.trim() || null,
          telefoon: document.getElementById('kb-telefoon').value.trim() || null,
          email: document.getElementById('kb-email').value.trim() || null,
          adres: document.getElementById('kb-adres').value.trim() || null,
          postcode: document.getElementById('kb-postcode').value.trim() || null,
          gemeente: document.getElementById('kb-gemeente').value.trim() || null,
          marketing_opt_in: document.getElementById('kb-marketing').value,
        }),
      });
      openKlantDetail(klantId);
    } catch (err) {
      elFout.textContent = err.message;
    }
  });

  wisselView('klant-detail');
}

// GEBRUIKERS: accounts voor het beheerscherm — lijst, toevoegen, bewerken
// (naam/e-mail/wachtwoord resetten) en verwijderen. Elke ingelogde gebruiker
// mag dit beheren; de server blokkeert enkel zelf-verwijderen en het
// verwijderen van de laatste overblijvende gebruiker.
async function laadGebruikersOverzicht() {
  const gebruikers = await api('/api/gebruikers');
  const tbody = document.getElementById('tabel-gebruikers');
  tbody.innerHTML = '';
  for (const g of gebruikers) {
    const isJezelf = huidigeGebruiker && g.id === huidigeGebruiker.adminId;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${g.naam || '—'}${isJezelf ? ' <span class="uitleg">(jij)</span>' : ''}</td>
      <td>${g.email}</td>
      <td>${fmtDatum(g.aangemaakt_op)}</td>
      <td><button type="button" class="linkbtn btn-gebruiker-bewerken" data-id="${g.id}">✎ Bewerken</button></td>
      <td>${isJezelf ? '' : `<button type="button" class="linkbtn gevaar btn-gebruiker-verwijderen" data-id="${g.id}" data-naam="${(g.naam || g.email).replace(/"/g, '&quot;')}">🗑 Verwijderen</button>`}</td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.btn-gebruiker-bewerken').forEach((btn) => {
    btn.addEventListener('click', () => openGebruikerBewerken(btn.dataset.id, gebruikers.find((g) => g.id === btn.dataset.id)));
  });
  tbody.querySelectorAll('.btn-gebruiker-verwijderen').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Gebruiker "${btn.dataset.naam}" verwijderen? Die kan dan niet meer inloggen.`)) return;
      try {
        await api(`/api/gebruikers/${btn.dataset.id}`, { method: 'DELETE' });
        laadGebruikersOverzicht();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

document.getElementById('form-nieuwe-gebruiker').addEventListener('submit', async (e) => {
  e.preventDefault();
  const elFout = document.getElementById('nieuwe-gebruiker-fout');
  elFout.textContent = '';
  try {
    await api('/api/gebruikers', {
      method: 'POST',
      body: JSON.stringify({
        naam: document.getElementById('ng-naam').value.trim() || null,
        email: document.getElementById('ng-email').value.trim(),
        wachtwoord: document.getElementById('ng-wachtwoord').value,
      }),
    });
    document.getElementById('form-nieuwe-gebruiker').reset();
    document.getElementById('nieuwe-gebruiker-details').open = false;
    laadGebruikersOverzicht();
  } catch (err) {
    elFout.textContent = err.message;
  }
});

const modalGebruikerBewerken = document.getElementById('modal-gebruiker-bewerken');
document.getElementById('btn-modal-gebruiker-bewerken-sluiten').addEventListener('click', () => { modalGebruikerBewerken.hidden = true; });
modalGebruikerBewerken.addEventListener('click', (e) => { if (e.target === modalGebruikerBewerken) modalGebruikerBewerken.hidden = true; });

function openGebruikerBewerken(id, gebruiker) {
  const inhoud = document.getElementById('modal-gebruiker-bewerken-inhoud');
  inhoud.innerHTML = `
    <h3>Gebruiker bewerken</h3>
    <form id="form-gebruiker-bewerken">
      <label>Naam<input type="text" id="gb-naam" value="${gebruiker.naam || ''}" /></label>
      <label>E-mail<input type="email" id="gb-email" value="${gebruiker.email}" /></label>
      <label>Nieuw wachtwoord <span class="uitleg">(leeg laten om het huidige te behouden)</span><input type="password" id="gb-wachtwoord" minlength="8" /></label>
      <div class="form-acties">
        <button type="submit">Opslaan</button>
        <button type="button" id="btn-gebruiker-bewerken-annuleren" class="linkbtn">Annuleren</button>
      </div>
      <p id="gebruiker-bewerken-fout" class="foutmelding"></p>
    </form>
  `;
  document.getElementById('btn-gebruiker-bewerken-annuleren').addEventListener('click', () => { modalGebruikerBewerken.hidden = true; });
  document.getElementById('form-gebruiker-bewerken').addEventListener('submit', async (e) => {
    e.preventDefault();
    const elFout = document.getElementById('gebruiker-bewerken-fout');
    elFout.textContent = '';
    try {
      const wachtwoord = document.getElementById('gb-wachtwoord').value;
      await api(`/api/gebruikers/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          naam: document.getElementById('gb-naam').value.trim() || null,
          email: document.getElementById('gb-email').value.trim(),
          wachtwoord: wachtwoord || undefined,
        }),
      });
      modalGebruikerBewerken.hidden = true;
      laadGebruikersOverzicht();
    } catch (err) {
      elFout.textContent = err.message;
    }
  });
  modalGebruikerBewerken.hidden = false;
}

// Snelfilters (zoals in het huidige bookingonline.co.uk-systeem)
function berekenDatumRange(bereik) {
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);

  switch (bereik) {
    case 'vandaag':
      return [naarISO(vandaag), naarISO(vandaag)];
    case 'morgen': {
      const morgen = new Date(vandaag);
      morgen.setDate(morgen.getDate() + 1);
      return [naarISO(morgen), naarISO(morgen)];
    }
    case 'vorige-week': {
      const dagVanWeek = (vandaag.getDay() + 6) % 7; // 0 = maandag
      const start = new Date(vandaag);
      start.setDate(vandaag.getDate() - dagVanWeek - 7);
      const eind = new Date(start);
      eind.setDate(start.getDate() + 6);
      return [naarISO(start), naarISO(eind)];
    }
    case 'deze-week': {
      const dagVanWeek = (vandaag.getDay() + 6) % 7; // 0 = maandag
      const start = new Date(vandaag);
      start.setDate(vandaag.getDate() - dagVanWeek);
      const eind = new Date(start);
      eind.setDate(start.getDate() + 6);
      return [naarISO(start), naarISO(eind)];
    }
    case 'volgende-week': {
      const dagVanWeek = (vandaag.getDay() + 6) % 7; // 0 = maandag
      const start = new Date(vandaag);
      start.setDate(vandaag.getDate() - dagVanWeek + 7);
      const eind = new Date(start);
      eind.setDate(start.getDate() + 6);
      return [naarISO(start), naarISO(eind)];
    }
    case 'deze-maand': {
      const start = new Date(vandaag.getFullYear(), vandaag.getMonth(), 1);
      const eind = new Date(vandaag.getFullYear(), vandaag.getMonth() + 1, 0);
      return [naarISO(start), naarISO(eind)];
    }
    case 'volgende-maand': {
      const start = new Date(vandaag.getFullYear(), vandaag.getMonth() + 1, 1);
      const eind = new Date(vandaag.getFullYear(), vandaag.getMonth() + 2, 0);
      return [naarISO(start), naarISO(eind)];
    }
    case 'vorige-maand': {
      const start = new Date(vandaag.getFullYear(), vandaag.getMonth() - 1, 1);
      const eind = new Date(vandaag.getFullYear(), vandaag.getMonth(), 0);
      return [naarISO(start), naarISO(eind)];
    }
    case 'komende-6-maanden': {
      const eind = new Date(vandaag);
      eind.setMonth(eind.getMonth() + 6);
      return [naarISO(vandaag), naarISO(eind)];
    }
    case 'dit-jaar': {
      const start = new Date(vandaag.getFullYear(), 0, 1);
      const eind = new Date(vandaag.getFullYear(), 11, 31);
      return [naarISO(start), naarISO(eind)];
    }
    case 'vorig-jaar': {
      const start = new Date(vandaag.getFullYear() - 1, 0, 1);
      const eind = new Date(vandaag.getFullYear() - 1, 11, 31);
      return [naarISO(start), naarISO(eind)];
    }
    // "Alles" toont niet letterlijk alles: het verleden moet je bewust opzoeken
    // (via "Vorige maand", de eigen Vanaf/Tot-datums, ...) — de standaardweergave
    // toont vanaf vandaag, zodat afgelopen boekingen niet standaard tussen de
    // toekomstige blijven staan.
    case 'alles':
    default:
      return [naarISO(vandaag), ''];
  }
}

document.querySelectorAll('#snelfilters button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const [vanaf, tot] = berekenDatumRange(btn.dataset.range);
    document.getElementById('filter-vanaf').value = vanaf;
    document.getElementById('filter-tot').value = tot;
    document.querySelectorAll('#snelfilters button').forEach((b) => b.classList.toggle('actief', b === btn));
    boekingenSorteringLaatsteNieuwe = false;
    document.getElementById('btn-laatste-nieuwe').classList.remove('actief');
    laadBoekingenOverzicht();
  });
});

// Bij het laden van de pagina staat "Alles" al actief (zie index.html) — meteen
// hetzelfde "vanaf vandaag"-standaardbereik toepassen, zodat het Boekingenoverzicht
// er meteen zo uitziet als na een klik op die knop.
{
  const [standaardVanaf, standaardTot] = berekenDatumRange('alles');
  document.getElementById('filter-vanaf').value = standaardVanaf;
  document.getElementById('filter-tot').value = standaardTot;
}

// ============================================================
// BOEKING DETAIL (volledige pagina)
// ============================================================
let boekingDetailVorigeView = 'boekingen';
document.getElementById('btn-boeking-detail-terug').addEventListener('click', () => wisselView(boekingDetailVorigeView));

const COMMUNICATIE_TYPE_LABELS = { email: 'E-mail', telefoon: 'Telefoon', sms: 'SMS', notitie: 'Notitie' };
const COMMUNICATIE_RICHTING_LABELS = { uitgaand: 'Uitgaand', inkomend: 'Inkomend', intern: 'Intern' };

async function openDetail(boekingId) {
  // openDetail() wordt op twee verschillende manieren aangeroepen: (1) om
  // vanuit een lijst (Aanvragen/Boekingenoverzicht) NAAR het dossier te
  // navigeren, en (2) om enkel de inhoud van een reeds open dossier te
  // verversen na een opslag-actie (prijs/aantal wijzigen, betaling loggen, ...).
  // Onthoud hier VOOR de (asynchrone) fetch of we al in het dossier zaten —
  // enkel in geval (1) moet aan het einde ook effectief naar die pagina
  // omgeschakeld worden. Zonder deze check kon een trage ververs-aanroep na
  // een opslag Jonas tegen zijn wil terug het dossier intrekken, ook nadat hij
  // ondertussen alweer naar een ander tabblad was geklikt.
  const navigeertNaarDetail = document.getElementById('view-boeking-detail').hidden;
  // Onthoud van welke pagina we komen, zodat "Terug naar overzicht" daar naartoe gaat.
  if (navigeertNaarDetail) {
    boekingDetailVorigeView = huidigeViewNaam();
  }
  const b = await api(`/api/boekingen/${boekingId}`);
  const inhoud = document.getElementById('boeking-detail-inhoud');

  // Deze pagina wordt na elke opslag-actie (product toevoegen, betaling, communicatie
  // loggen, ...) volledig herrenderd. Zonder dit zou een ingeklapt paneel dat de
  // gebruiker net had opengeklapt (bv. om een communicatie-item te loggen) meteen
  // weer dichtklappen na het opslaan — net wanneer je het resultaat wil zien. Onthoud
  // daarom welke secties open stonden vóór de herrender, en herstel dat nadien.
  const geopendeSecties = ['details-locatie-transport', 'details-communicatie', 'details-historiek']
    .filter((id) => document.getElementById(id)?.open);

  // Welke producten zijn nog vrij op de (huidige) periode van deze boeking, voor de
  // "product toevoegen"-select — de boeking zelf mag niet meetellen als bezetting.
  const dpOnbeschikbaar = await bepaalOnbeschikbareProductIds(b.gewenste_datum_start, b.gewenste_datum_einde, boekingId);
  const dpEersteCategorie = eersteCategorieMetProducten();

  // De prijs zelf wordt niet meer hier, maar in de Prijstabel hiernaast getoond/
  // bewerkt (zie prijstabelProductenHtml) — hier enkel welke producten (en
  // hoeveel) er op deze boeking staan, en de mogelijkheid om er één te verwijderen.
  // Klein thumbnailtje van het product (indien er één is ingesteld bij het
  // product zelf) zodat een springkasteel meteen visueel herkenbaar is — ook
  // handig voor de laadlijsten/routeplanner die hier later op verder bouwen.
  const productThumbnailHtml = (p) => {
    const url = p.product_afbeeldingen && p.product_afbeeldingen[0];
    return url ? `<img class="product-thumbnail" src="${url}" alt="" />` : '';
  };

  // Bij Feestmaterialen/Servies/Bestek (zie AANTAL_CATEGORIEEN) is het aantal
  // ook ná het toevoegen nog manueel bij te sturen (bv. toch 4 stoelen i.p.v.
  // 3) — bij de andere categorieën (max. 1 exemplaar per model per boeking)
  // blijft het gewoon een vaste tekst.
  const productenHtml = b.producten
    .map((p) => {
      const magAantalAanpassen = (p.product_categorieen || []).some((c) => AANTAL_CATEGORIEEN.includes(c));
      const aantalHtml = magAantalAanpassen
        ? ` × <input type="number" min="1" class="product-aantal-invoer" data-id="${p.id}" value="${p.aantal}" title="Aantal" />`
        : (p.aantal > 1 ? ` × ${p.aantal}` : '');
      const certificaatKnop = p.product_heeft_certificaat
        ? `<button type="button" class="linkbtn btn-stuur-certificaat" data-product-id="${p.product_id}" title="Stuur het certificaat van ${p.product_naam} naar ${b.klant_email || 'de klant'}">📄 Certificaat</button>`
        : '';
      return `<div class="detail-rij product-regel"><span>${productThumbnailHtml(p)}<strong>${p.product_naam}</strong>${aantalHtml}</span><span>${certificaatKnop}${fmtEuro(p.prijs)} <button type="button" class="linkbtn gevaar btn-product-verwijderen" data-id="${p.id}" title="Product verwijderen">✕</button></span></div>`;
    })
    .join('');

  // In de Prijstabel zelf staat elk product als aparte, manueel bij te sturen
  // regel (automatisch voorgesteld o.b.v. dagprijs/weekendprijs en het aantal
  // dagen, maar hier altijd te overschrijven) — dat is waar Jonas de prijzen
  // effectief controleert/aanpast, los van de Producten-lijst hiernaast die
  // enkel gaat over wélke producten (en hoeveel) er op deze boeking staan.
  const prijstabelProductenHtml = b.producten.length
    ? b.producten.map((pr) => `<div class="prijstabel-rij prijstabel-productregel"><span>${pr.product_naam}${pr.aantal > 1 ? ' × ' + pr.aantal : ''}</span><span class="prijstabel-prijs-invoer-wrap">€<input type="number" step="0.01" min="0" class="product-prijs-invoer" data-id="${pr.id}" value="${Number(pr.prijs).toFixed(2)}" title="Automatisch voorgestelde prijs o.b.v. dagprijs/weekendprijs — hier manueel bij te sturen" /></span></div>`).join('')
    : '<div class="prijstabel-rij prijstabel-sub"><span>Geen producten</span><span></span></div>';

  const historiekHtml = b.historiek
    .map((h) => `<div class="historiek-item">${fmtDatum(h.gewijzigd_op)} — ${h.van_status ? STATUS_LABELS[h.van_status] + ' → ' : ''}${STATUS_LABELS[h.naar_status]}${h.opmerking ? ' (' + h.opmerking + ')' : ''}</div>`)
    .join('');

  const overgangen = TOEGELATEN_OVERGANGEN[b.status] || [];
  const actiesHtml = overgangen
    .map((s) => `<button data-status="${s}">${STATUS_LABELS[s]}</button>`)
    .join('');

  // Volledig adres samenstellen voor de Google Maps-link (geen API-sleutel nodig voor
  // een eenvoudige "bekijk op kaart"-link — enkel een echte afstandsberekening vergt er een).
  const adresVolledig = b.leveringsadres || [b.klant_adres, [b.klant_postcode, b.klant_gemeente].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const mapsUrl = adresVolledig ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresVolledig)}` : null;
  const adresOntleed = ontleedAdresVrijeTekst(adresVolledig);
  // Voor het bewerkformulier: enkel het echte plaatsingsadres (b.leveringsadres),
  // NIET de fallback naar het adres van de klant — anders zou "leeg = adres van
  // de klant" bij het opslaan stilzwijgend veranderen in een hardgecodeerde kopie.
  const kgAdresOntleed = ontleedAdresVoorFormulier(b.leveringsadres);

  const p = b.prijstabel;
  const betalingLogHtml = (b.betaling_transacties || [])
    .slice().reverse()
    .map((t) => `<div class="historiek-item betaling-item">
        <span>${fmtDatum(t.aangemaakt_op)} — ${fmtEuro(t.bedrag)} ontvangen${t.opmerking ? ' (' + t.opmerking + ')' : ''}</span>
        <button type="button" class="linkbtn gevaar btn-betaling-verwijderen" data-id="${t.id}" title="Betaling verwijderen">✕</button>
      </div>`)
    .join('') || '<p class="leeg-bericht">Nog geen betalingen geregistreerd.</p>';

  // Voorgestelde transportkost (o.b.v. de gekende afstand) tonen zolang die nog niet
  // (of niet meer, na een adreswijziging) overeenkomt met de bevestigde transportkost.
  const voorgesteldeTransportkost = b.voorgestelde_transportkost;
  const huidigeTransportkost = b.transportkost != null ? Number(b.transportkost) : null;
  const toonBevestigBalk = b.leveringswijze === 'levering'
    && voorgesteldeTransportkost != null
    && (huidigeTransportkost == null || Math.round(voorgesteldeTransportkost * 100) !== Math.round(huidigeTransportkost * 100));

  const communicatieHtml = (b.communicatie || [])
    .map((c) => `<div class="communicatie-item">
        <div class="communicatie-item-kop"><span>${COMMUNICATIE_TYPE_LABELS[c.type] || c.type} · ${COMMUNICATIE_RICHTING_LABELS[c.richting] || c.richting}</span><span>${fmtDatum(c.aangemaakt_op)}</span></div>
        ${c.onderwerp ? `<div class="communicatie-item-onderwerp">${c.onderwerp}</div>` : ''}
        ${c.inhoud ? `<div class="communicatie-item-inhoud">${c.inhoud}</div>` : ''}
      </div>`)
    .join('') || '<p class="leeg-bericht">Nog geen communicatie gelogd.</p>';

  inhoud.innerHTML = `
    <div class="paneel">
      <h3>${b.klant_naam} ${statusPillHtml(b.status, b.prijstabel.saldo_openstaand)}${speciaalSterHtml(b)}</h3>
      ${b.speciaal_verzoek ? `<div class="speciaal-verzoek-banner">⭑ Speciaal verzoek${b.speciaal_verzoek_notitie ? ': ' + b.speciaal_verzoek_notitie : ''}</div>` : ''}
      ${statusStepperHtml(b.status, b.prijstabel.saldo_openstaand)}
      <p class="uitleg" style="margin: 0 0 0.4rem;">Klik op een fase hierboven om ernaartoe te springen, of klik de actieve fase nogmaals aan om terug te gaan naar de vorige status.</p>
      <div class="status-acties">${actiesHtml || '<p class="leeg-bericht">Geen volgende stap voorgesteld</p>'}</div>
    </div>

    <div class="detail-layout">
      <div class="detail-kolom detail-kolom-links">
        <div class="detail-kolom-klant paneel">
          <div class="detail-kolom-kop">
            <h4>Klantgegevens</h4>
            <button type="button" id="btn-klantgegevens-bewerken" class="linkbtn">✎ Bewerken</button>
          </div>

          <div id="klantgegevens-weergave">
            <div class="detail-rij"><span>Telefoon</span><span>${b.klant_telefoon || '—'}</span></div>
            <div class="detail-rij"><span>E-mail</span><span>${b.klant_email || '—'}</span></div>
            <div class="detail-rij"><span>Leveringswijze</span><span>${b.leveringswijze || '—'}</span></div>
            <div class="detail-rij"><span>Straat + nr</span><span>${adresOntleed.straat || '—'}</span></div>
            <div class="detail-rij"><span>Postcode</span><span>${adresOntleed.postcode || '—'}</span></div>
            <div class="detail-rij"><span>Gemeente</span><span>${adresOntleed.gemeente || '—'}</span></div>
            <div class="detail-rij"><span>Ondergrond</span><span>${b.type_ondergrond || '—'}</span></div>
            <div class="detail-rij"><span>Toegankelijkheid</span><span>${b.toegankelijkheid || '—'}</span></div>
            <div class="detail-rij"><span>Voorkeur levering</span><span>${b.voorkeur_tijdstip_levering || '—'}</span></div>
            <div class="detail-rij"><span>Voorkeur afhaling</span><span>${b.voorkeur_tijdstip_afhaling || '—'}</span></div>
            <div class="detail-rij"><span>Huurvoorwaarden</span><span>${b.huurvoorwaarden_geaccepteerd ? 'Geaccepteerd' : 'Niet geaccepteerd'}</span></div>
            <div class="detail-rij"><span>Speciaal verzoek</span><span>${b.speciaal_verzoek ? (b.speciaal_verzoek_notitie || 'Ja') : '—'}</span></div>
          </div>

          <form id="form-klantgegevens-bewerken" hidden>
            <label>Naam<input type="text" id="kg-naam" value="${b.klant_naam || ''}" /></label>
            <label>Telefoon<input type="text" id="kg-telefoon" value="${b.klant_telefoon || ''}" /></label>
            <label>E-mail<input type="email" id="kg-email" value="${b.klant_email || ''}" /></label>
            <label>Leveringswijze
              <select id="kg-leveringswijze">
                <option value="levering" ${b.leveringswijze === 'levering' ? 'selected' : ''}>Levering door ons team</option>
                <option value="afhaling" ${b.leveringswijze === 'afhaling' ? 'selected' : ''}>Afhaling door klant</option>
              </select>
            </label>
            <label>Straat + nr<input type="text" id="kg-straat" value="${kgAdresOntleed.straat}" placeholder="leeg = adres van de klant" /></label>
            <label>Postcode<input type="text" id="kg-postcode" value="${kgAdresOntleed.postcode}" /></label>
            <label>Gemeente<input type="text" id="kg-gemeente" value="${kgAdresOntleed.gemeente}" /></label>
            <label>Type ondergrond<select id="kg-ondergrond">${bouwKeuzeOpties(ONDERGROND_OPTIES, b.type_ondergrond)}</select></label>
            <label>Toegankelijkheid<select id="kg-toegankelijkheid">${bouwKeuzeOpties(TOEGANKELIJKHEID_OPTIES, b.toegankelijkheid)}</select></label>
            <label>Tijdstip levering<select id="kg-tijdstip-levering"></select></label>
            <label>Tijdstip afhaling<select id="kg-tijdstip-afhaling"></select></label>
            <label class="checkbox">
              <input type="checkbox" id="kg-speciaal-verzoek" ${b.speciaal_verzoek ? 'checked' : ''} /> Speciaal verzoek voor deze boeking (paars sterretje in de overzichten)
            </label>
            <label>Toelichting speciaal verzoek<input type="text" id="kg-speciaal-verzoek-notitie" value="${b.speciaal_verzoek_notitie || ''}" placeholder="bv. allergie, extra toegangscode, moeilijke locatie, ..." /></label>
            <div class="form-acties">
              <button type="submit">Opslaan</button>
              <button type="button" id="btn-klantgegevens-annuleren" class="linkbtn">Annuleren</button>
            </div>
            <p id="klantgegevens-fout" class="foutmelding"></p>
          </form>
        </div>

        <div class="detail-kolom-producten paneel">
          <h4>Producten</h4>
          <div id="detail-producten-lijst">${productenHtml || '<p class="leeg-bericht">Geen producten</p>'}</div>
          <div class="product-toevoegen-rij">
            <select id="dp-categorie">${bouwCategorieOpties(dpEersteCategorie)}</select>
            <select id="dp-product">${bouwModelOpties(dpEersteCategorie, undefined, dpOnbeschikbaar)}</select>
            <input type="number" id="dp-aantal" value="1" min="1" title="Aantal" ${AANTAL_CATEGORIEEN.includes(dpEersteCategorie) ? '' : 'hidden'} />
            <button type="button" id="btn-product-toevoegen" class="secundair">+ Toevoegen</button>
          </div>
          <p id="product-toevoegen-fout" class="foutmelding"></p>
        </div>

        <div class="detail-kolom-opmerkingen paneel">
          <h4>Opmerkingen</h4>
          <form id="form-notities">
            <textarea id="dd-notities" rows="3" placeholder="Interne opmerkingen over deze boeking...">${b.notities || ''}</textarea>
            <button type="submit">Opmerkingen opslaan</button>
          </form>
        </div>
      </div>

      <div class="detail-kolom detail-kolom-financieel">
        <div class="detail-kolom-periode paneel">
          <h4>Periode</h4>
          <div id="kalender-dossier-periode" class="kalender-widget kalender-widget-compact"></div>
          <p id="periode-fout" class="foutmelding"></p>
        </div>

        <div class="detail-kolom-prijstabel paneel">
          <h4>Prijstabel &amp; betaling</h4>
          <div class="prijstabel">
            ${prijstabelProductenHtml}
            <div class="prijstabel-rij prijstabel-sub"><span>Subtotaal producten</span><span>${fmtEuro(p.subtotaal_producten)}</span></div>
            <div class="prijstabel-rij"><span>Levering / transport</span><span>${fmtEuro(p.transportkost)}</span></div>
            <div class="prijstabel-rij">
              <span>Toeslag / korting</span>
              <span class="toeslag-invoer">
                <input type="number" id="dd-toeslag-korting" step="0.01" value="${b.toeslag_korting != null ? b.toeslag_korting : ''}" placeholder="0.00" />
                <select id="dd-toeslag-type" title="Vast bedrag (€) of percentage (%) van het productensubtotaal">
                  <option value="bedrag" ${(b.toeslag_korting_type || 'bedrag') === 'bedrag' ? 'selected' : ''}>€</option>
                  <option value="percentage" ${b.toeslag_korting_type === 'percentage' ? 'selected' : ''}>%</option>
                </select>
              </span>
            </div>
            ${b.toeslag_korting_type === 'percentage' && b.toeslag_korting != null
              ? `<div class="prijstabel-rij prijstabel-sub"><span></span><span>= ${fmtEuro(p.toeslag_korting)}</span></div>`
              : ''}
            <button type="button" id="btn-toeslag-opslaan" class="secundair">Toeslag/korting opslaan</button>
            <div class="prijstabel-rij prijstabel-totaal"><span>Totaal</span><span>${fmtEuro(p.totaal)}</span></div>
            <div class="prijstabel-rij prijstabel-sub"><span>Incl. BTW (${p.btw_percentage}%)</span><span>${fmtEuro(p.btw_bedrag)}</span></div>
            <div class="prijstabel-rij"><span>Reeds betaald</span><span>${fmtEuro(p.betaald_bedrag)}</span></div>
            <div class="prijstabel-rij prijstabel-saldo ${p.saldo_openstaand <= 0 ? 'voldaan' : ''}"><span>Openstaand saldo</span><span>${fmtEuro(p.saldo_openstaand)}</span></div>
          </div>
          <form id="form-nieuwe-betaling" class="grid-2">
            <label>Bedrag (€)<input type="number" id="np-betaling-bedrag" step="0.01" min="0.01" placeholder="bedrag, Enter om op te slaan" /></label>
            <label>Opmerking<input type="text" id="np-betaling-opmerking" placeholder="optioneel, bv. 'overschrijving'" /></label>
          </form>
          <div class="betaling-log">${betalingLogHtml}</div>
        </div>
      </div>
    </div>

    <details class="paneel" id="details-locatie-transport" ${(toonBevestigBalk || geopendeSecties.includes('details-locatie-transport')) ? 'open' : ''}>
      <summary>Locatie &amp; transportkost${toonBevestigBalk ? '<span class="details-badge">bevestiging nodig</span>' : ''}</summary>
      <div class="paneel-inhoud">
        ${mapsUrl ? `<div class="detail-rij"><span></span><span><a href="${mapsUrl}" target="_blank" rel="noopener">Bekijk op Google Maps ↗</a></span></div>` : ''}
        <form id="form-locatie" class="grid-2">
          <label>Afstand tot Overmere (km)<input type="number" id="dd-afstand-km" step="0.1" min="0" value="${b.afstand_km != null ? b.afstand_km : ''}" placeholder="automatisch of manueel" /></label>
        </form>
        <button type="button" id="btn-herbereken-afstand" class="secundair">↻ Afstand herberekenen via Google Maps</button>
        <p id="herbereken-afstand-status" class="uitleg" style="margin-top:0.3rem"></p>
        <p class="uitleg">De afstand wordt automatisch berekend (eerste 10km gratis, dan € 0,50/km x4 voor levering + ophaling). Dit gebeurt automatisch; hieronder enkel bevestigen of manueel bijsturen indien nodig.</p>
        ${toonBevestigBalk ? `
          <div class="bevestig-balk">
            <span>Voorgestelde transportkost o.b.v. ${b.afstand_km} km: <strong>${fmtEuro(voorgesteldeTransportkost)}</strong></span>
            <button type="button" id="btn-bevestig-transportkost" class="secundair">✓ Bevestig transportkost</button>
          </div>
        ` : ''}
        <div class="prijstabel-rij" style="max-width:320px">
          <span>Transportkost</span>
          <span class="veld-met-wissen">
            <input type="number" id="dd-transportkost" step="0.01" min="0" value="${b.transportkost != null ? b.transportkost : ''}" placeholder="0.00" />
            <button type="button" id="btn-transportkost-wissen" class="linkbtn gevaar" title="Transportkost wissen">✕</button>
          </span>
        </div>
      </div>
    </details>

    <details class="paneel" id="details-communicatie" ${geopendeSecties.includes('details-communicatie') ? 'open' : ''}>
      <summary>Communicatie</summary>
      <div class="paneel-inhoud">
        <form id="form-communicatie" class="grid-2">
          <label>Type
            <select id="cm-type">
              <option value="email">E-mail</option>
              <option value="telefoon">Telefoon</option>
              <option value="sms">SMS</option>
              <option value="notitie">Notitie</option>
            </select>
          </label>
          <label>Richting
            <select id="cm-richting">
              <option value="uitgaand">Uitgaand</option>
              <option value="inkomend">Inkomend</option>
              <option value="intern">Intern</option>
            </select>
          </label>
          <label>Onderwerp<input type="text" id="cm-onderwerp" placeholder="bv. Bevestigingsmail" /></label>
          <label>Inhoud/notitie<input type="text" id="cm-inhoud" placeholder="korte samenvatting" /></label>
          <button type="submit">+ Toevoegen aan log</button>
        </form>
        <p class="uitleg" style="margin-top:0.3rem">Mails automatisch versturen vanuit dit dossier komt in een latere fase — voorlopig log je hier manueel wat je verstuurd/besproken hebt.</p>
        <div class="communicatie-lijst">${communicatieHtml}</div>
      </div>
    </details>

    <details class="paneel" id="details-historiek" ${geopendeSecties.includes('details-historiek') ? 'open' : ''}>
      <summary>Historiek</summary>
      <div class="paneel-inhoud">
        ${historiekHtml || '<p class="leeg-bericht">Geen historiek</p>'}
      </div>
    </details>

    <div class="paneel gevaar-zone">
      <button type="button" id="btn-boeking-verwijderen" class="linkbtn gevaar">🗑 Boeking volledig verwijderen</button>
    </div>
  `;

  bouwTijdstipOpties(document.getElementById('kg-tijdstip-levering'), b.voorkeur_tijdstip_levering || undefined);
  bouwTijdstipOpties(document.getElementById('kg-tijdstip-afhaling'), b.voorkeur_tijdstip_afhaling || undefined);

  document.getElementById('btn-klantgegevens-bewerken').addEventListener('click', () => {
    document.getElementById('klantgegevens-weergave').hidden = true;
    document.getElementById('form-klantgegevens-bewerken').hidden = false;
  });
  document.getElementById('btn-klantgegevens-annuleren').addEventListener('click', () => {
    document.getElementById('klantgegevens-weergave').hidden = false;
    document.getElementById('form-klantgegevens-bewerken').hidden = true;
  });
  document.getElementById('form-klantgegevens-bewerken').addEventListener('submit', async (e) => {
    e.preventDefault();
    const elFout = document.getElementById('klantgegevens-fout');
    elFout.textContent = '';
    try {
      // Straat/postcode/gemeente herbouwen tot één adresstring (zoals overal
      // elders in de app opgeslagen/getoond) — enkel wanneer minstens één van
      // de 3 velden is ingevuld; anders blijft dit null, dus "leeg = adres van
      // de klant" (zie ontleedAdresVoorFormulier hierboven).
      const kgStraat = document.getElementById('kg-straat').value.trim();
      const kgPostcode = document.getElementById('kg-postcode').value.trim();
      const kgGemeente = document.getElementById('kg-gemeente').value.trim();
      const kgLeveringsadres = (kgStraat || kgPostcode || kgGemeente)
        ? [kgStraat, [kgPostcode, kgGemeente].filter(Boolean).join(' ')].filter(Boolean).join(', ')
        : null;
      await Promise.all([
        api(`/api/klanten/${b.klant_id}`, {
          method: 'PUT',
          body: JSON.stringify({
            naam: document.getElementById('kg-naam').value.trim() || null,
            telefoon: document.getElementById('kg-telefoon').value.trim() || null,
            email: document.getElementById('kg-email').value.trim() || null,
          }),
        }),
        api(`/api/boekingen/${boekingId}`, {
          method: 'PUT',
          body: JSON.stringify({
            leveringswijze: document.getElementById('kg-leveringswijze').value,
            leveringsadres: kgLeveringsadres,
            type_ondergrond: document.getElementById('kg-ondergrond').value.trim() || null,
            toegankelijkheid: document.getElementById('kg-toegankelijkheid').value.trim() || null,
            voorkeur_tijdstip_levering: document.getElementById('kg-tijdstip-levering').value || null,
            voorkeur_tijdstip_afhaling: document.getElementById('kg-tijdstip-afhaling').value || null,
            speciaal_verzoek: document.getElementById('kg-speciaal-verzoek').checked,
            speciaal_verzoek_notitie: document.getElementById('kg-speciaal-verzoek-notitie').value.trim() || null,
          }),
        }),
      ]);
      openDetail(boekingId);
      laadBoekingenOverzicht();
    } catch (err) {
      elFout.textContent = err.message;
    }
  });

  document.getElementById('btn-boeking-verwijderen').addEventListener('click', async () => {
    const bevestiging = confirm(
      `Boeking van ${b.klant_naam} (${fmtDatum(b.gewenste_datum_start)}) volledig en onherroepelijk verwijderen?\n\nDit verwijdert ook alle betalingen, communicatie en historiek van deze boeking.`
    );
    if (!bevestiging) return;
    try {
      await api(`/api/boekingen/${boekingId}`, { method: 'DELETE' });
      laadAanvragen();
      laadBoekingenOverzicht();
      wisselView(boekingDetailVorigeView);
    } catch (err) {
      alert(err.message);
    }
  });

  inhoud.querySelectorAll('.status-acties button').forEach((btn) => {
    btn.addEventListener('click', () => {
      let opmerking;
      if (btn.dataset.status === 'geweigerd') {
        opmerking = prompt('Reden van weigering (optioneel):') || '';
      }
      wijzigStatus(b.id, btn.dataset.status, opmerking);
    });
  });

  // De vier grote fase-knoppen bovenaan: een klik op een andere fase springt
  // meteen naar de eerste status van die fase (ook een stap overslaan/teruggaan
  // is toegelaten); een klik op de reeds actieve fase "deselecteert" ze weer,
  // terug naar de laatste status van de vorige fase. "Geweigerd" is een eigen
  // knop die altijd zichtbaar is, zowel om naartoe als vanaf te schakelen.
  inhoud.querySelectorAll('.status-stepper button[data-fase]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const faseAttr = btn.dataset.fase;
      if (faseAttr === 'geweigerd') {
        if (b.status === 'geweigerd') {
          wijzigStatus(b.id, 'nieuw');
        } else {
          const reden = prompt('Reden van weigering (optioneel):') || '';
          wijzigStatus(b.id, 'geweigerd', reden);
        }
        return;
      }
      const faseIndex = Number(faseAttr);
      const huidigeIndex = STATUS_FASEN.findIndex((f) => f.statussen.includes(b.status));
      if (faseIndex === huidigeIndex) {
        if (faseIndex === 0) return; // al de eerste fase, niets om naar terug te gaan
        const vorigeFase = STATUS_FASEN[faseIndex - 1];
        wijzigStatus(b.id, vorigeFase.statussen[vorigeFase.statussen.length - 1]);
      } else {
        wijzigStatus(b.id, STATUS_FASEN[faseIndex].statussen[0]);
      }
    });
  });

  document.getElementById('btn-toeslag-opslaan').addEventListener('click', async () => {
    const toeslagKorting = document.getElementById('dd-toeslag-korting').value;
    const toeslagKortingType = document.getElementById('dd-toeslag-type').value;
    await api(`/api/boekingen/${boekingId}`, {
      method: 'PUT',
      body: JSON.stringify({
        toeslag_korting: toeslagKorting !== '' ? parseFloat(toeslagKorting) : null,
        toeslag_korting_type: toeslagKortingType,
      }),
    });
    openDetail(boekingId);
    laadBoekingenOverzicht();
  });

  // Transportkost zit in het inklapbare "Locatie & transportkost"-blok — dit
  // gebeurt normaal automatisch, dus sla meteen op bij wijziging (net als afstand).
  document.getElementById('dd-transportkost').addEventListener('change', async (e) => {
    const transportkost = e.target.value;
    await api(`/api/boekingen/${boekingId}`, {
      method: 'PUT',
      body: JSON.stringify({ transportkost: transportkost !== '' ? parseFloat(transportkost) : null }),
    });
    openDetail(boekingId);
    laadBoekingenOverzicht();
  });

  document.getElementById('btn-transportkost-wissen').addEventListener('click', async () => {
    await api(`/api/boekingen/${boekingId}`, {
      method: 'PUT',
      body: JSON.stringify({ transportkost: null }),
    });
    openDetail(boekingId);
    laadBoekingenOverzicht();
  });

  const btnBevestigTransportkost = document.getElementById('btn-bevestig-transportkost');
  if (btnBevestigTransportkost) {
    btnBevestigTransportkost.addEventListener('click', async () => {
      await api(`/api/boekingen/${boekingId}`, {
        method: 'PUT',
        body: JSON.stringify({ transportkost: voorgesteldeTransportkost }),
      });
      openDetail(boekingId);
      laadBoekingenOverzicht();
    });
  }

  inhoud.querySelectorAll('.btn-betaling-verwijderen').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Deze betaling verwijderen?')) return;
      await api(`/api/boekingen/${boekingId}/betaling/${btn.dataset.id}`, { method: 'DELETE' });
      openDetail(boekingId);
      laadBoekingenOverzicht();
    });
  });

  document.getElementById('form-locatie').addEventListener('change', async (e) => {
    if (e.target.id !== 'dd-afstand-km') return;
    const afstand = e.target.value;
    await api(`/api/boekingen/${boekingId}`, {
      method: 'PUT',
      body: JSON.stringify({ afstand_km: afstand !== '' ? parseFloat(afstand) : null }),
    });
  });

  // Periode wijzigen (bv. telefonische correctie) — sla meteen op bij een klik
  // in de kalender, net als de afstand hierboven. De backend controleert of de
  // reeds toegevoegde producten nog wel beschikbaar zijn op de nieuwe datum(s).
  const origineleStart = b.gewenste_datum_start ? String(b.gewenste_datum_start).slice(0, 10) : null;
  const origineleEinde = b.gewenste_datum_einde ? String(b.gewenste_datum_einde).slice(0, 10) : null;
  const dossierPeriodeKalender = maakKalenderWidget({
    container: document.getElementById('kalender-dossier-periode'),
    initieleStart: origineleStart,
    initieleEinde: origineleEinde,
    toonDagBereikKnoppen: true,
    opWijziging: async (start, einde) => {
      const elFout = document.getElementById('periode-fout');
      elFout.textContent = '';
      try {
        await api(`/api/boekingen/${boekingId}`, {
          method: 'PUT',
          body: JSON.stringify({ gewenste_datum_start: start, gewenste_datum_einde: einde || start }),
        });
        toonToast('Periode opgeslagen');
        openDetail(boekingId);
        laadBoekingenOverzicht();
      } catch (err) {
        elFout.textContent = err.message;
        dossierPeriodeKalender.stelIn(origineleStart, origineleEinde);
      }
    },
  });

  // Product toevoegen aan deze bestaande boeking (bv. telefonisch bijbesteld).
  // Het aantal-veld is enkel zichtbaar/bruikbaar bij categorieën waar een
  // aantal > 1 effectief zin heeft (zie AANTAL_CATEGORIEEN hierboven) — bij
  // Springkastelen/Attracties/Obstakelbanen kan een aanvraag maar 1 exemplaar
  // van elk model kiezen, ook al staan er meerdere fysieke exemplaren in
  // voorraad, dus daar blijft het simpelweg verborgen (en dus altijd 1).
  document.getElementById('dp-categorie').addEventListener('change', (e) => {
    document.getElementById('dp-product').innerHTML = bouwModelOpties(e.target.value, undefined, dpOnbeschikbaar);
    const elAantal = document.getElementById('dp-aantal');
    elAantal.hidden = !AANTAL_CATEGORIEEN.includes(e.target.value);
    elAantal.value = '1';
  });
  document.getElementById('btn-product-toevoegen').addEventListener('click', async () => {
    const elFout = document.getElementById('product-toevoegen-fout');
    elFout.textContent = '';
    const productId = document.getElementById('dp-product').value;
    if (!productId) { elFout.textContent = 'Kies eerst een model.'; return; }
    const elAantal = document.getElementById('dp-aantal');
    const aantal = elAantal.hidden ? 1 : (parseInt(elAantal.value, 10) || 1);
    try {
      await api(`/api/boekingen/${boekingId}/producten`, {
        method: 'POST',
        body: JSON.stringify({ product_id: productId, aantal }),
      });
      openDetail(boekingId);
      laadBoekingenOverzicht();
    } catch (err) {
      elFout.textContent = err.message;
    }
  });
  inhoud.querySelectorAll('.btn-product-verwijderen').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Dit product uit de boeking verwijderen?')) return;
      try {
        await api(`/api/boekingen/${boekingId}/producten/${btn.dataset.id}`, { method: 'DELETE' });
        toonToast('Product verwijderd');
        await openDetail(boekingId);
        laadBoekingenOverzicht();
      } catch (err) {
        // Zonder dit zou een mislukte verwijdering (bv. even geen verbinding)
        // stilzwijgend niets doen: het product blijft staan én het totaal
        // klopt dan nog steeds, maar zonder duidelijke melding lijkt dat een
        // bug ("ik heb het gewist maar het bedrag past niet aan").
        document.getElementById('product-toevoegen-fout').textContent = `Kon product niet verwijderen: ${err.message}`;
      }
    });
  });
  inhoud.querySelectorAll('.btn-stuur-certificaat').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!b.klant_email) return alert('Deze klant heeft geen e-mailadres gekend — voeg dat eerst toe bij de klant.');
      if (!confirm(`Certificaat versturen naar ${b.klant_email}?`)) return;
      try {
        await api(`/api/producten/${btn.dataset.productId}/certificaat/verstuur`, {
          method: 'POST',
          body: JSON.stringify({ email: b.klant_email }),
        });
        toonToast('Certificaat verstuurd naar ' + b.klant_email);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  // Prijs per productregel: automatisch voorgesteld o.b.v. dagprijs/weekendprijs
  // en het aantal dagen, maar hier altijd manueel bij te sturen.
  inhoud.querySelectorAll('.product-prijs-invoer').forEach((el) => {
    el.addEventListener('change', async () => {
      const nieuwePrijs = el.value !== '' ? parseFloat(el.value) : 0;
      try {
        await api(`/api/boekingen/${boekingId}/producten/${el.dataset.id}`, {
          method: 'PUT',
          body: JSON.stringify({ prijs: nieuwePrijs }),
        });
        toonToast('Prijs opgeslagen');
        await openDetail(boekingId);
        laadBoekingenOverzicht();
      } catch (err) {
        document.getElementById('product-toevoegen-fout').textContent = `Kon prijs niet opslaan: ${err.message}`;
      }
    });
  });

  // Aantal per productregel (enkel bij Feestmaterialen/Servies/Bestek, zie
  // AANTAL_CATEGORIEEN) — ook ná het toevoegen nog manueel bij te sturen.
  inhoud.querySelectorAll('.product-aantal-invoer').forEach((el) => {
    el.addEventListener('change', async () => {
      const nieuwAantal = parseInt(el.value, 10) || 1;
      try {
        await api(`/api/boekingen/${boekingId}/producten/${el.dataset.id}`, {
          method: 'PUT',
          body: JSON.stringify({ aantal: nieuwAantal }),
        });
        toonToast('Aantal opgeslagen');
        await openDetail(boekingId);
        laadBoekingenOverzicht();
      } catch (err) {
        document.getElementById('product-toevoegen-fout').textContent = `Kon aantal niet opslaan: ${err.message}`;
      }
    });
  });

  document.getElementById('btn-herbereken-afstand').addEventListener('click', async (e) => {
    const btn = e.target;
    const elStatus = document.getElementById('herbereken-afstand-status');
    btn.disabled = true;
    elStatus.textContent = 'Bezig met berekenen via Google Maps...';
    try {
      await api(`/api/boekingen/${boekingId}/herbereken-afstand`, { method: 'POST' });
      openDetail(boekingId);
      laadBoekingenOverzicht();
    } catch (err) {
      elStatus.textContent = err.message;
      btn.disabled = false;
    }
  });

  document.getElementById('form-nieuwe-betaling').addEventListener('submit', (e) => e.preventDefault());
  document.getElementById('np-betaling-bedrag').addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const bedrag = parseFloat(e.target.value);
    if (!bedrag || bedrag <= 0) return;
    const opmerking = document.getElementById('np-betaling-opmerking').value.trim();
    await api(`/api/boekingen/${boekingId}/betaling`, {
      method: 'POST',
      body: JSON.stringify({ bedrag, opmerking: opmerking || null }),
    });
    openDetail(boekingId);
    laadBoekingenOverzicht();
  });

  document.getElementById('form-notities').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api(`/api/boekingen/${boekingId}`, {
      method: 'PUT',
      body: JSON.stringify({ notities: document.getElementById('dd-notities').value }),
    });
    openDetail(boekingId);
  });

  document.getElementById('form-communicatie').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api(`/api/boekingen/${boekingId}/communicatie`, {
      method: 'POST',
      body: JSON.stringify({
        type: document.getElementById('cm-type').value,
        richting: document.getElementById('cm-richting').value,
        onderwerp: document.getElementById('cm-onderwerp').value.trim() || null,
        inhoud: document.getElementById('cm-inhoud').value.trim() || null,
      }),
    });
    openDetail(boekingId);
  });

  // Enkel effectief naar het dossier omschakelen als dit een echte navigatie
  // was (zie de uitleg bovenaan deze functie) — anders zou een trage
  // ververs-aanroep na een opslag Jonas terug het dossier kunnen intrekken
  // nadat hij ondertussen al naar een andere pagina was genavigeerd.
  if (navigeertNaarDetail) wisselView('boeking-detail');
}

// ============================================================
// NIEUWE BOEKING
// ============================================================
let productenCache = [];

async function laadProductenCache() {
  productenCache = await api('/api/producten');
}

// Klant zoeken
let zoekTimer = null;
document.getElementById('klant-zoek').addEventListener('input', (e) => {
  clearTimeout(zoekTimer);
  const term = e.target.value.trim();
  const resultaten = document.getElementById('klant-zoekresultaten');
  if (!term) { resultaten.innerHTML = ''; return; }
  zoekTimer = setTimeout(async () => {
    const klanten = await api(`/api/klanten?zoek=${encodeURIComponent(term)}`);
    resultaten.innerHTML = '';
    klanten.forEach((k) => {
      const div = document.createElement('div');
      div.className = 'resultaat';
      div.textContent = `${k.naam} — ${k.telefoon || k.email || ''}`;
      div.addEventListener('click', () => selecteerKlant(k));
      resultaten.appendChild(div);
    });
  }, 300);
});

function selecteerKlant(klant) {
  document.getElementById('klant-id').value = klant.id;
  const el = document.getElementById('klant-geselecteerd');
  el.hidden = false;
  el.textContent = `Geselecteerd: ${klant.naam}`;
  document.getElementById('klant-zoekresultaten').innerHTML = '';
  document.getElementById('klant-zoek').value = '';
  document.getElementById('nieuwe-klant-details').open = false;
}

// Plaatsingsadres: idem klant, of apart veld
document.getElementById('adres-idem-klant').addEventListener('change', (e) => {
  document.getElementById('veld-leveringsadres').hidden = e.target.checked;
});

// Productrijen — ingedeeld in secties (categorieën), en met live beschikbaarheid
const PRODUCT_CATEGORIE_VOLGORDE = ['Springkastelen', 'Attracties', 'Obstakelbanen', 'Feestmaterialen', 'Servies/Bestek/glazen'];
// Categorieën waar een aantal > 1 wél zin heeft (tafels, stoelen, glazen, ...) —
// bij Springkastelen/Attracties/Obstakelbanen kan een aanvraag maar 1 exemplaar
// van elk model kiezen, ook al staan er meerdere fysieke exemplaren in voorraad.
const AANTAL_CATEGORIEEN = ['Feestmaterialen', 'Servies/Bestek/glazen'];
// Speciale waarde voor de "+ Nieuwe categorie…" optie in de categorie-dropdowns.
const NIEUWE_CATEGORIE_WAARDE = '__nieuwe_categorie__';
let onbeschikbareProductIds = new Set();

// Alle categorieën: eerst de 5 vaste in hun vaste volgorde, daarna elke extra
// categorie die Jonas zelf heeft aangemaakt (via "+ Nieuwe categorie…"),
// alfabetisch. Zo krijgt een nieuwe categorie meteen overal haar eigen sectie
// i.p.v. onder "Overige" te belanden.
// Neemt optioneel een expliciete productenlijst i.p.v. de (mogelijk nog niet
// ververste) productenCache — belangrijk vlak na het aanmaken van een product
// in een gloednieuwe categorie, zodat die meteen in de juiste sectie verschijnt.
function alleCategorieen(bronProducten) {
  const bron = bronProducten || productenCache;
  const gevonden = new Set();
  bron.forEach((p) => (p.categorieen || []).forEach((c) => { if (c) gevonden.add(c); }));
  const extra = [...gevonden]
    .filter((c) => !PRODUCT_CATEGORIE_VOLGORDE.includes(c))
    .sort((a, b) => a.localeCompare(b, 'nl'));
  return [...PRODUCT_CATEGORIE_VOLGORDE, ...extra];
}

// Producten gegroepeerd per categorie (in de vaste volgorde + eigen categorieën, rest onder "Overige").
function productenPerCategorie() {
  const groepen = new Map();
  const categorieen = alleCategorieen();
  categorieen.forEach((c) => groepen.set(c, []));
  groepen.set('Overige', []);

  productenCache.forEach((p) => {
    const productCategorieen = p.categorieen || [];
    const gekozenCategorie = categorieen.find((c) => productCategorieen.includes(c)) || 'Overige';
    groepen.get(gekozenCategorie).push(p);
  });
  return groepen;
}

// Eerste categorie die effectief producten bevat (fallback voor een nieuwe rij).
function eersteCategorieMetProducten() {
  const groepen = productenPerCategorie();
  for (const [categorie, producten] of groepen) {
    if (producten.length) return categorie;
  }
  return '';
}

// Vaste lijst van de 5 échte categorieën, los van welke producten er op dit
// moment al in zitten — gebruikt bij het bewerken van een product, zodat je
// een product ook naar een (nu nog lege of verkeerd ingevulde) categorie kan
// verplaatsen.
function bouwCategorieKeuzeOpties(geselecteerdeCategorie) {
  const opties = alleCategorieen()
    .map((c) => `<option value="${c}" ${c === geselecteerdeCategorie ? 'selected' : ''}>${c}</option>`)
    .join('');
  return `${opties}<option value="${NIEUWE_CATEGORIE_WAARDE}">+ Nieuwe categorie…</option>`;
}

// Toont/verbergt het tekstveld voor een nieuwe categorienaam wanneer de
// "+ Nieuwe categorie…" optie gekozen wordt in een categorie-dropdown.
function koppelNieuweCategorieVeld(selectId, veldId) {
  const select = document.getElementById(selectId);
  const veld = document.getElementById(veldId);
  select.addEventListener('change', () => {
    veld.hidden = select.value !== NIEUWE_CATEGORIE_WAARDE;
    if (!veld.hidden) veld.querySelector('input').focus();
  });
}

// Geeft de effectieve categorienaam terug: de gekozen optie, of de ingevulde
// nieuwe naam als "+ Nieuwe categorie…" gekozen werd. Gooit een fout als die
// laatste leeg is.
function leesGekozenCategorie(selectId, nieuweNaamInputId) {
  const waarde = document.getElementById(selectId).value;
  if (waarde !== NIEUWE_CATEGORIE_WAARDE) return waarde;
  const nieuweNaam = document.getElementById(nieuweNaamInputId).value.trim();
  if (!nieuweNaam) throw new Error('Vul een naam in voor de nieuwe categorie.');
  return nieuweNaam;
}

function bouwCategorieOpties(geselecteerdeCategorie) {
  const groepen = productenPerCategorie();
  let html = '';
  groepen.forEach((producten, categorie) => {
    if (!producten.length) return;
    const selected = categorie === geselecteerdeCategorie ? 'selected' : '';
    html += `<option value="${categorie}" ${selected}>${categorie}</option>`;
  });
  return html;
}

// Modellen (producten) binnen één categorie — geen optgroups meer nodig, dus geen
// eindeloos scrollen door alle producten om een model te kiezen.
function bouwModelOpties(categorie, geselecteerdWaarde, onbeschikbareSetOverride) {
  const onbeschikbareSet = onbeschikbareSetOverride || onbeschikbareProductIds;
  const producten = productenPerCategorie().get(categorie) || [];
  return producten
    .map((p) => {
      const onbeschikbaar = onbeschikbareSet.has(p.id);
      const selected = p.id === geselecteerdWaarde ? 'selected' : '';
      return `<option value="${p.id}" ${selected} ${onbeschikbaar ? 'disabled' : ''}>${p.naam}${onbeschikbaar ? ' (niet beschikbaar op deze datum)' : ''}</option>`;
    })
    .join('');
}

function herbouwAlleProductSelects() {
  document.querySelectorAll('#producten-rijen .product-rij').forEach((rij) => {
    const categorieSelect = rij.querySelector('.rij-categorie');
    const productSelect = rij.querySelector('.rij-product');
    const huidigeWaarde = productSelect.value;
    productSelect.innerHTML = bouwModelOpties(categorieSelect.value, huidigeWaarde);
    if (huidigeWaarde && !onbeschikbareProductIds.has(huidigeWaarde)) {
      productSelect.value = huidigeWaarde;
    }
  });
}

// Voor een gegeven datum/periode: de product-id's die NIET beschikbaar zijn.
// Gedeeld door het "Nieuwe boeking"-formulier en het Beschikbaarheid-overzicht.
async function bepaalOnbeschikbareProductIds(datumStart, datumEinde, exclBoekingId) {
  const nieuweSet = new Set();
  await Promise.all(
    productenCache.map(async (p) => {
      try {
        const resultaat = await api('/api/boekingen/beschikbaarheid-check', {
          method: 'POST',
          body: JSON.stringify({
            product_id: p.id,
            gewenste_datum_start: datumStart,
            gewenste_datum_einde: datumEinde,
            aantal: 1,
            excl_boeking_id: exclBoekingId || undefined,
          }),
        });
        if (!resultaat.beschikbaar) nieuweSet.add(p.id);
      } catch (_) {
        // bij twijfel niet blokkeren
      }
    })
  );
  return nieuweSet;
}

// Zelfde beschikbaarheidscheck, maar dan met de concrete overlappende boeking(en)
// erbij — enkel gebruikt door het Beschikbaarheid-overzicht, om vanuit "reeds
// bezet" rechtstreeks naar die boeking te kunnen doorklikken.
async function bepaalBezetteProductenMetBoeking(datumStart, datumEinde) {
  const resultaatPerProduct = new Map();
  await Promise.all(
    productenCache.map(async (p) => {
      try {
        const resultaat = await api('/api/boekingen/beschikbaarheid-check', {
          method: 'POST',
          body: JSON.stringify({ product_id: p.id, gewenste_datum_start: datumStart, gewenste_datum_einde: datumEinde, aantal: 1 }),
        });
        if (!resultaat.beschikbaar) resultaatPerProduct.set(p.id, resultaat.overlappendeBoekingen || []);
      } catch (_) {
        // bij twijfel niet blokkeren
      }
    })
  );
  return resultaatPerProduct;
}

async function verversBeschikbaarheid() {
  const datumStart = document.getElementById('datum-start').value;
  if (!datumStart) {
    onbeschikbareProductIds = new Set();
    herbouwAlleProductSelects();
    return;
  }
  const datumEinde = document.getElementById('datum-einde').value || datumStart;
  onbeschikbareProductIds = await bepaalOnbeschikbareProductIds(datumStart, datumEinde);
  herbouwAlleProductSelects();
}

// ============================================================
// KALENDERWIDGET (herbruikbare component) — visuele maandkalender waarmee een
// dag of een periode rechtstreeks met de muis gekozen wordt. Gebruikt op
// Beschikbaarheid, Nieuwe boeking en in het boekingdossier (Periode-blok).
// Geen aparte datumvelden of Single Day/Date Range-knoppen meer: de eerste
// klik kiest een dag, een volgende (andere) klik maakt er een periode van, en
// een klik daarna start gewoon een nieuwe selectie. Elke instantie houdt zijn
// eigen maand/selectie bij en meldt wijzigingen via "opWijziging".
// ============================================================
const KALENDER_MAAND_NAMEN = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

function volgendeDagIso(iso) {
  const d = new Date(iso);
  d.setDate(d.getDate() + 1);
  return naarISO(d);
}

function maakKalenderWidget({
  container, initieleStart, initieleEinde, opWijziging, toonBekijkKnop, bekijkKnopTekst, opBekijk,
  toonDagBereikKnoppen,
}) {
  let start = initieleStart || null;
  let einde = initieleEinde || start;
  // Los van de huidige start/einde-waarden bijgehouden: een reeds vooraf
  // ingevulde datum (bv. "vandaag" als standaard) mag niet aanzien worden als
  // "de gebruiker klikte al één keer" — anders plakt de eerste echte klik zich
  // vast aan die vooraf ingevulde datum in plaats van een verse keuze te zijn.
  // (Enkel relevant voor de klassieke twee-klik-interactie hieronder.)
  let klaarVoorTweedeKlik = false;
  // Bij een expliciete Dag/Meerdere dagen-knoppenkeuze (toonDagBereikKnoppen) is
  // dit altijd expliciet bijgehouden i.p.v. afgeleid uit start/einde — dat was
  // precies de bron van de "werkt soms niet zuiver"-verwarring bij de impliciete
  // twee-klik-interactie (een derde klik die je niet als "nieuwe start" verwachtte).
  let modus = (initieleEinde && initieleEinde !== initieleStart) ? 'bereik' : 'dag';
  let weergaveMaand = new Date();
  if (start) {
    const d = new Date(start);
    if (!Number.isNaN(d.getTime())) weergaveMaand = new Date(d.getFullYear(), d.getMonth(), 1);
  }
  weergaveMaand.setDate(1);

  container.classList.add('kalender-widget');
  container.innerHTML = `
    <div class="kalender-nav">
      <button type="button" class="kal-vorige-maand linkbtn" aria-label="Vorige maand">‹</button>
      <span class="kal-maand-label"></span>
      <button type="button" class="kal-volgende-maand linkbtn" aria-label="Volgende maand">›</button>
    </div>
    <div class="kalender-dagnamen">
      <span>ma</span><span>di</span><span>wo</span><span>do</span><span>vr</span><span>za</span><span>zo</span>
    </div>
    <div class="kalender-grid"></div>
    ${toonDagBereikKnoppen ? `
      <div class="kalender-dag-bereik-toggle">
        <button type="button" class="kal-modus-knop" data-modus="dag">Dag</button>
        <button type="button" class="kal-modus-knop" data-modus="bereik">Meerdere dagen</button>
      </div>
    ` : ''}
    <div class="kalender-onderaan">
      <p class="kalender-geselecteerd-tekst"></p>
      ${toonBekijkKnop ? `<button type="button" class="kal-bekijk-knop linkbtn">${bekijkKnopTekst || 'Bekijk ↓'}</button>` : ''}
    </div>
  `;
  const elMaandLabel = container.querySelector('.kal-maand-label');
  const elGrid = container.querySelector('.kalender-grid');
  const elLabel = container.querySelector('.kalender-geselecteerd-tekst');

  container.querySelector('.kal-vorige-maand').addEventListener('click', () => {
    weergaveMaand.setMonth(weergaveMaand.getMonth() - 1);
    render();
  });
  container.querySelector('.kal-volgende-maand').addEventListener('click', () => {
    weergaveMaand.setMonth(weergaveMaand.getMonth() + 1);
    render();
  });
  if (toonBekijkKnop) {
    container.querySelector('.kal-bekijk-knop').addEventListener('click', () => opBekijk && opBekijk());
  }
  if (toonDagBereikKnoppen) {
    container.querySelectorAll('.kal-modus-knop').forEach((btn) => {
      btn.addEventListener('click', () => zetModus(btn.dataset.modus));
    });
  }

  // Wisselen tussen "Dag" en "Meerdere dagen": bij Dag wordt de selectie altijd
  // teruggebracht tot één dag; bij Meerdere dagen wordt een losse dag automatisch
  // meteen uitgebreid met de volgende dag, zodat er direct een balkje van 2 dagen
  // staat dat daarna manueel verder verlengd/verkort kan worden.
  function zetModus(nieuweModus) {
    if (nieuweModus === modus) return;
    modus = nieuweModus;
    if (modus === 'dag') {
      if (start) einde = start;
    } else if (start && (!einde || einde === start)) {
      einde = volgendeDagIso(start);
    }
    render();
    opWijziging(start, einde);
  }

  function kiesDag(iso) {
    if (toonDagBereikKnoppen) {
      if (modus === 'dag') {
        start = iso;
        einde = iso;
      } else if (!start) {
        start = iso;
        einde = iso;
      } else if (iso < start) {
        start = iso;
      } else {
        einde = iso;
      }
      render();
      opWijziging(start, einde);
      return;
    }
    if (!klaarVoorTweedeKlik) {
      // Eerste klik van een nieuwe selectie -> altijd een verse, eendaagse
      // keuze, ongeacht wat er toevallig al (bv. als standaard) ingesteld stond.
      start = iso;
      einde = iso;
      klaarVoorTweedeKlik = true;
    } else {
      // Tweede klik -> maakt er een periode van (kleinste datum = start, grootste = einde).
      const vorigeStart = start;
      start = iso < vorigeStart ? iso : vorigeStart;
      einde = iso < vorigeStart ? vorigeStart : iso;
      klaarVoorTweedeKlik = false;
    }
    render();
    opWijziging(start, einde);
  }

  function render() {
    const jaar = weergaveMaand.getFullYear();
    const maand = weergaveMaand.getMonth();
    elMaandLabel.textContent = `${KALENDER_MAAND_NAMEN[maand]} ${jaar}`;
    const vandaag = naarISO(new Date());
    const eersteDagVanMaand = new Date(jaar, maand, 1);
    // Maandag = eerste kolom (Europese conventie, zoals de rest van het scherm).
    const leadingLeeg = (eersteDagVanMaand.getDay() + 6) % 7;
    const aantalDagen = new Date(jaar, maand + 1, 0).getDate();

    let html = '';
    for (let i = 0; i < leadingLeeg; i++) html += '<span class="kalender-dag kalender-dag-leeg"></span>';
    for (let dag = 1; dag <= aantalDagen; dag++) {
      const iso = naarISO(new Date(jaar, maand, dag));
      let klasse = 'kalender-dag';
      if (iso === vandaag) klasse += ' kalender-vandaag';
      if (iso === start || iso === einde) klasse += ' kalender-geselecteerd';
      else if (start && einde && iso > start && iso < einde) klasse += ' kalender-in-bereik';
      html += `<button type="button" class="${klasse}" data-iso="${iso}">${dag}</button>`;
    }
    elGrid.innerHTML = html;
    elGrid.querySelectorAll('.kalender-dag:not(.kalender-dag-leeg)').forEach((el) => {
      el.addEventListener('click', () => kiesDag(el.dataset.iso));
    });

    if (toonDagBereikKnoppen) {
      container.querySelectorAll('.kal-modus-knop').forEach((btn) => {
        btn.classList.toggle('actief', btn.dataset.modus === modus);
      });
    }

    if (start && einde && start !== einde) {
      elLabel.textContent = `Periode: ${fmtDatum(start)} t.e.m. ${fmtDatum(einde)}`;
    } else if (start) {
      elLabel.textContent = `Datum: ${fmtDatum(start)}`;
    } else {
      elLabel.textContent = 'Kies een datum in de kalender.';
    }
  }

  render();

  return {
    stelIn(nieuweStart, nieuweEinde) {
      start = nieuweStart || null;
      einde = nieuweEinde || start;
      klaarVoorTweedeKlik = false;
      if (toonDagBereikKnoppen) modus = (einde && einde !== start) ? 'bereik' : 'dag';
      if (start) {
        const d = new Date(start);
        if (!Number.isNaN(d.getTime())) weergaveMaand = new Date(d.getFullYear(), d.getMonth(), 1);
      }
      render();
    },
  };
}

const nieuweBoekingKalender = maakKalenderWidget({
  container: document.getElementById('kalender-nieuwe-boeking'),
  toonDagBereikKnoppen: true,
  opWijziging: (start, einde) => {
    document.getElementById('datum-start').value = start || '';
    document.getElementById('datum-einde').value = (einde && einde !== start) ? einde : '';
    verversBeschikbaarheid();
  },
});

// ============================================================
// BESCHIKBAARHEID-OVERZICHT (snel zien wat nog vrij is op een datum/periode,
// bv. tijdens een telefonische aanvraag — met doorklik naar een nieuwe boeking)
// ============================================================
function groepeerLijstPerCategorie(lijst) {
  const groepen = new Map();
  const categorieen = alleCategorieen(lijst);
  categorieen.forEach((c) => groepen.set(c, []));
  groepen.set('Overige', []);
  lijst.forEach((p) => {
    const productCategorieen = p.categorieen || [];
    const gekozenCategorie = categorieen.find((c) => productCategorieen.includes(c)) || 'Overige';
    groepen.get(gekozenCategorie).push(p);
  });
  return groepen;
}

// "Reeds bezet" toont gewoon meteen alles — en is, sinds Jonas dat vroeg,
// aanklikbaar zodra we weten welke boeking het product bezet houdt: dan gaat
// een klik rechtstreeks naar dat dossier (bij meerdere overlappende boekingen
// naar de eerst gevonden). Zonder gekende boeking (zou niet mogen voorkomen,
// maar bij twijfel niet blokkeren) blijft het item gewoon niet-klikbaar.
// "Nog beschikbaar" toont per categorie een uitklapbare lijst (dicht bij
// binnenkomst) — met 107+ producten is een altijd-open lijst te lang, maar
// Jonas wil hier geen dropdown: een categorie aanklikken schuift open.
function renderBeschikbaarheidKolom(containerId, producten, modus, boekingPerProduct) {
  const container = document.getElementById(containerId);
  const groepen = groepeerLijstPerCategorie(producten);
  let html = '';
  groepen.forEach((lijst, categorie) => {
    if (!lijst.length) return;
    const itemsHtml = lijst
      .map((p) => {
        if (modus === 'bezet') {
          const boekingId = boekingPerProduct && boekingPerProduct.get(p.id);
          const klikbaar = !!boekingId;
          return `<div class="besch-item${klikbaar ? ' klikbaar' : ''}"${klikbaar ? ` data-boeking-id="${boekingId}" title="Klik om naar deze boeking te gaan"` : ''}>${p.naam}</div>`;
        }
        return `<div class="besch-item klikbaar" data-id="${p.id}">${p.naam}</div>`;
      })
      .join('');
    html += modus === 'beschikbaar'
      ? `<details class="besch-categorie">
           <summary>${categorie} (${lijst.length})</summary>
           ${itemsHtml}
         </details>`
      : `<div class="besch-categorie">
           <h4>${categorie} (${lijst.length})</h4>
           ${itemsHtml}
         </div>`;
  });
  container.innerHTML = html || '<p class="leeg-bericht">Geen producten in deze lijst.</p>';
  if (modus === 'beschikbaar') {
    container.querySelectorAll('.besch-item').forEach((el) => {
      el.addEventListener('click', () => {
        startNieuweBoekingVoorProduct(
          el.dataset.id,
          document.getElementById('besch-datum-start').value,
          document.getElementById('besch-datum-einde').value
        );
      });
    });
  } else {
    container.querySelectorAll('.besch-item.klikbaar').forEach((el) => {
      el.addEventListener('click', () => openDetail(el.dataset.boekingId));
    });
  }
}

async function ververBeschikbaarheidsoverzicht() {
  const datumStart = document.getElementById('besch-datum-start').value;
  if (!datumStart) {
    document.getElementById('besch-beschikbaar').innerHTML = '<p class="leeg-bericht">Kies eerst een datum.</p>';
    document.getElementById('besch-bezet').innerHTML = '';
    return;
  }
  const datumEinde = document.getElementById('besch-datum-einde').value || datumStart;
  const bezetMetBoeking = await bepaalBezetteProductenMetBoeking(datumStart, datumEinde);
  const beschikbaar = productenCache.filter((p) => !bezetMetBoeking.has(p.id));
  const bezet = productenCache.filter((p) => bezetMetBoeking.has(p.id));
  const boekingPerProduct = new Map();
  bezetMetBoeking.forEach((overlappendeBoekingen, productId) => {
    if (overlappendeBoekingen.length) boekingPerProduct.set(productId, overlappendeBoekingen[0].id);
  });
  renderBeschikbaarheidKolom('besch-beschikbaar', beschikbaar, 'beschikbaar');
  renderBeschikbaarheidKolom('besch-bezet', bezet, 'bezet', boekingPerProduct);
}

const beschikbaarheidKalender = maakKalenderWidget({
  container: document.getElementById('kalender-beschikbaarheid'),
  toonBekijkKnop: true,
  bekijkKnopTekst: 'Bekijk datum ↓',
  opBekijk: () => document.querySelector('.beschikbaarheid-kolommen').scrollIntoView({ behavior: 'smooth', block: 'start' }),
  opWijziging: (start, einde) => {
    document.getElementById('besch-datum-start').value = start || '';
    document.getElementById('besch-datum-einde').value = einde || start || '';
    ververBeschikbaarheidsoverzicht();
  },
});

function laadBeschikbaarheidsoverzicht() {
  const elStart = document.getElementById('besch-datum-start');
  const elEinde = document.getElementById('besch-datum-einde');
  if (!elStart.value) {
    elStart.value = naarISO(new Date());
    elEinde.value = elStart.value;
  }
  beschikbaarheidKalender.stelIn(elStart.value, elEinde.value || elStart.value);
  ververBeschikbaarheidsoverzicht();
}

// Vanuit het beschikbaarheidsoverzicht meteen een nieuwe boeking starten met het
// aangeklikte product en de gekozen datum/periode al ingevuld.
function startNieuweBoekingVoorProduct(productId, datumStart, datumEinde) {
  wisselView('nieuwe-boeking');
  document.getElementById('producten-rijen').innerHTML = '';
  nieuweProductRij(productId);
  document.getElementById('datum-start').value = datumStart;
  document.getElementById('datum-einde').value = (datumEinde && datumEinde !== datumStart) ? datumEinde : '';
  nieuweBoekingKalender.stelIn(datumStart, datumEinde || datumStart);
  verversBeschikbaarheid();
}

function nieuweProductRij(voorkeurProductId) {
  const rij = document.createElement('div');
  rij.className = 'product-rij';
  const voorkeurProduct = voorkeurProductId ? productenCache.find((p) => p.id === voorkeurProductId) : null;
  const categorieen = voorkeurProduct ? (voorkeurProduct.categorieen || []) : [];
  const startCategorie = (voorkeurProduct && PRODUCT_CATEGORIE_VOLGORDE.find((c) => categorieen.includes(c)))
    || (voorkeurProduct ? 'Overige' : eersteCategorieMetProducten());
  rij.innerHTML = `
    <label>Categorie<select class="rij-categorie">${bouwCategorieOpties(startCategorie)}</select></label>
    <label>Model<select class="rij-product">${bouwModelOpties(startCategorie, voorkeurProductId)}</select></label>
    <label class="rij-aantal-label" ${AANTAL_CATEGORIEEN.includes(startCategorie) ? '' : 'hidden'}>Aantal<input type="number" class="rij-aantal" value="1" min="1" /></label>
    <button type="button" class="verwijder">✕</button>
  `;
  // Aantal > 1 heeft enkel zin bij Feestmaterialen/Servies-Bestek (zie
  // AANTAL_CATEGORIEEN) — bij Springkastelen/Attracties/Obstakelbanen is er
  // sowieso maar 1 exemplaar per model per boeking, dus blijft dat veld hier
  // verborgen (en het aantal op 1) net zoals in het dossier zelf.
  rij.querySelector('.rij-categorie').addEventListener('change', (e) => {
    rij.querySelector('.rij-product').innerHTML = bouwModelOpties(e.target.value);
    const aantalLabel = rij.querySelector('.rij-aantal-label');
    aantalLabel.hidden = !AANTAL_CATEGORIEEN.includes(e.target.value);
    if (aantalLabel.hidden) rij.querySelector('.rij-aantal').value = 1;
  });
  rij.querySelector('.verwijder').addEventListener('click', () => rij.remove());
  document.getElementById('producten-rijen').appendChild(rij);
}

document.getElementById('btn-product-toevoegen').addEventListener('click', nieuweProductRij);

// Formulier indienen
document.getElementById('form-nieuwe-boeking').addEventListener('submit', async (e) => {
  e.preventDefault();
  const elFout = document.getElementById('nieuwe-boeking-fout');
  const elSucces = document.getElementById('nieuwe-boeking-succes');
  elFout.textContent = '';
  elSucces.hidden = true;

  try {
    let klantId = document.getElementById('klant-id').value;

    if (!klantId) {
      const naam = document.getElementById('nk-naam').value.trim();
      if (!naam) throw new Error('Kies een bestaande klant of vul minstens een naam in voor een nieuwe klant.');
      const nieuweKlant = await api('/api/klanten', {
        method: 'POST',
        body: JSON.stringify({
          naam,
          klant_type: document.getElementById('nk-type').value,
          btw_nummer: document.getElementById('nk-btw').value || null,
          telefoon: document.getElementById('nk-telefoon').value || null,
          email: document.getElementById('nk-email').value || null,
          adres: document.getElementById('nk-adres').value || null,
          postcode: document.getElementById('nk-postcode').value || null,
          gemeente: document.getElementById('nk-gemeente').value || null,
        }),
      });
      klantId = nieuweKlant.id;
    }

    const producten = Array.from(document.querySelectorAll('#producten-rijen .product-rij')).map((rij) => ({
      product_id: rij.querySelector('.rij-product').value,
      aantal: parseInt(rij.querySelector('.rij-aantal').value, 10) || 1,
    }));
    if (!producten.length) throw new Error('Voeg minstens één product toe.');
    if (!document.getElementById('datum-start').value) throw new Error('Kies een datum (of periode) in de kalender.');

    const adresIdemKlant = document.getElementById('adres-idem-klant').checked;
    const nbStraat = document.getElementById('leveringsadres-straat').value.trim();
    const nbPostcode = document.getElementById('leveringsadres-postcode').value.trim();
    const nbGemeente = document.getElementById('leveringsadres-gemeente').value.trim();
    const nbLeveringsadres = (nbStraat || nbPostcode || nbGemeente)
      ? [nbStraat, [nbPostcode, nbGemeente].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      : null;

    const boeking = await api('/api/boekingen', {
      method: 'POST',
      body: JSON.stringify({
        klant_id: klantId,
        producten,
        gewenste_datum_start: document.getElementById('datum-start').value,
        gewenste_datum_einde: document.getElementById('datum-einde').value || document.getElementById('datum-start').value,
        leveringswijze: document.getElementById('leveringswijze').value,
        adres_idem_klant: adresIdemKlant,
        leveringsadres: adresIdemKlant ? null : nbLeveringsadres,
        type_ondergrond: document.getElementById('type-ondergrond').value || null,
        toegankelijkheid: document.getElementById('toegankelijkheid').value || null,
        voorkeur_tijdstip_levering: document.getElementById('voorkeur-levering').value || null,
        voorkeur_tijdstip_afhaling: document.getElementById('voorkeur-afhaling').value || null,
        huurvoorwaarden_geaccepteerd: document.getElementById('huurvoorwaarden').checked,
        notities: document.getElementById('notities').value || null,
        bron: 'manueel',
      }),
    });

    elSucces.hidden = false;
    elSucces.textContent = `Boeking aangemaakt (status: ${STATUS_LABELS[boeking.status]}).`;
    document.getElementById('form-nieuwe-boeking').reset();
    document.getElementById('producten-rijen').innerHTML = '';
    document.getElementById('klant-id').value = '';
    document.getElementById('klant-geselecteerd').hidden = true;
    document.getElementById('veld-leveringsadres').hidden = false;
    onbeschikbareProductIds = new Set();
    nieuweProductRij();
    nieuweBoekingKalender.stelIn(null, null);
  } catch (err) {
    elFout.textContent = err.message;
  }
});

// ============================================================
// PRODUCTEN (beheer: overzicht per sectie, nieuw product, staat, keuringen)
// ============================================================
function groepeerPerCategorie(producten) {
  const groepen = new Map();
  const categorieen = alleCategorieen(producten);
  categorieen.forEach((c) => groepen.set(c, []));
  groepen.set('Overige', []);
  producten.forEach((p) => {
    const productCategorieen = p.categorieen || [];
    const gekozenCategorie = categorieen.find((c) => productCategorieen.includes(c)) || 'Overige';
    groepen.get(gekozenCategorie).push(p);
  });
  return groepen;
}

function productKaartHtml(p) {
  const afbeelding = (p.afbeeldingen && p.afbeeldingen[0]) || '';
  const staat = p.staat || 'proper';
  return `
    <div class="product-kaart" data-id="${p.id}">
      <button type="button" class="kaart-verwijder-knop" data-verwijder-id="${p.id}" title="Product verwijderen">✕</button>
      ${afbeelding
        ? `<img class="product-kaart-afbeelding" src="${afbeelding}" alt="${p.naam}" />`
        : '<div class="product-kaart-afbeelding"></div>'}
      <div class="product-kaart-inhoud">
        <h4>${p.naam}</h4>
        <span class="prijs prijs-tiers">
          <span>Dag: ${fmtEuro(p.prijs)}</span>
          <span>Weekend: ${p.weekendprijs != null ? fmtEuro(p.weekendprijs) : '–'}</span>
          <span>Afhaal: ${p.afhaalprijs != null ? fmtEuro(p.afhaalprijs) : '–'}</span>
        </span>
        <span class="afmetingen">${p.afmetingen || ''}</span>
        <span class="staat-badge ${staat}">${staat === 'proper' ? 'Proper' : 'Nat/vuil'}</span>
        <button type="button" class="staat-knop" data-staat-toggle="${p.id}" data-huidige-staat="${staat}">
          ${staat === 'proper' ? 'Markeer als nat/vuil' : 'Markeer als gereinigd'}
        </button>
      </div>
    </div>
  `;
}

async function laadProductenOverzicht() {
  const producten = await api('/api/producten');

  // Categorie-dropdown van "Nieuw product toevoegen" up-to-date houden, incl.
  // eventuele nieuwe categorieën die intussen zijn aangemaakt.
  const npCategorieSelect = document.getElementById('np-categorie');
  const huidigeKeuze = npCategorieSelect.value && npCategorieSelect.value !== NIEUWE_CATEGORIE_WAARDE ? npCategorieSelect.value : '';
  npCategorieSelect.innerHTML = bouwCategorieKeuzeOpties(huidigeKeuze);

  const groepen = groepeerPerCategorie(producten);
  const container = document.getElementById('producten-secties');
  container.innerHTML = '';
  groepen.forEach((lijst, categorie) => {
    if (!lijst.length) return;
    const sectie = document.createElement('div');
    sectie.className = 'producten-sectie';
    const verwijderAllesKnop = `<button type="button" class="linkbtn gevaar sectie-verwijder-alles" data-categorie="${categorie}">Verwijder alles in "${categorie}"</button>`;
    sectie.innerHTML = `
      <div class="producten-sectie-kop"><h3>${categorie} (${lijst.length})</h3>${verwijderAllesKnop}</div>
      <div class="product-kaarten-grid">${lijst.map(productKaartHtml).join('')}</div>
    `;
    container.appendChild(sectie);
  });

  container.querySelectorAll('.product-kaart').forEach((kaart) => {
    kaart.addEventListener('click', (e) => {
      if (e.target.closest('.staat-knop') || e.target.closest('.kaart-verwijder-knop')) return; // knoppen hebben eigen click-afhandeling
      openProductDetail(kaart.dataset.id);
    });
  });
  container.querySelectorAll('.staat-knop').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const nieuweStaat = btn.dataset.huidigeStaat === 'proper' ? 'vuil' : 'proper';
      await api(`/api/producten/${btn.dataset.staatToggle}`, {
        method: 'PUT',
        body: JSON.stringify({ staat: nieuweStaat }),
      });
      laadProductenOverzicht();
      laadProductenCache();
    });
  });

  // Snel één product verwijderen vanuit het overzicht, zonder de modal te openen.
  container.querySelectorAll('.kaart-verwijder-knop').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const naam = btn.closest('.product-kaart').querySelector('h4').textContent;
      if (!confirm(`"${naam}" definitief verwijderen? Dit kan niet ongedaan gemaakt worden.`)) return;
      try {
        await api(`/api/producten/${btn.dataset.verwijderId}`, { method: 'DELETE' });
        laadProductenOverzicht();
        laadProductenCache();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  // Een volledige categorie (bv. de opkuis van "Overige" na een import) in één
  // keer leegmaken — producten die al in een boeking gebruikt worden, worden
  // overgeslagen i.p.v. de hele actie te laten mislukken.
  container.querySelectorAll('.sectie-verwijder-alles').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const categorie = btn.dataset.categorie;
      const lijst = groepen.get(categorie) || [];
      if (!lijst.length) return;
      if (!confirm(`Alle ${lijst.length} producten in "${categorie}" definitief verwijderen? Dit kan niet ongedaan gemaakt worden.`)) return;
      let verwijderd = 0;
      let overgeslagen = 0;
      for (const p of lijst) {
        try {
          await api(`/api/producten/${p.id}`, { method: 'DELETE' });
          verwijderd += 1;
        } catch (err) {
          overgeslagen += 1;
        }
      }
      alert(`${verwijderd} product(en) verwijderd.${overgeslagen ? ` ${overgeslagen} niet verwijderd (al gebruikt in een boeking).` : ''}`);
      laadProductenOverzicht();
      laadProductenCache();
    });
  });
}

document.getElementById('form-nieuw-product').addEventListener('submit', async (e) => {
  e.preventDefault();
  const elFout = document.getElementById('nieuw-product-fout');
  elFout.textContent = '';
  try {
    const categorie = leesGekozenCategorie('np-categorie', 'np-nieuwe-categorie-naam');
    const afbeelding = document.getElementById('np-afbeelding').value.trim();
    await api('/api/producten', {
      method: 'POST',
      body: JSON.stringify({
        naam: document.getElementById('np-naam').value.trim(),
        categorieen: [categorie],
        prijs: parseFloat(document.getElementById('np-prijs').value) || 0,
        weekendprijs: document.getElementById('np-weekendprijs').value !== '' ? parseFloat(document.getElementById('np-weekendprijs').value) : null,
        afhaalprijs: document.getElementById('np-afhaalprijs').value !== '' ? parseFloat(document.getElementById('np-afhaalprijs').value) : null,
        afmetingen: document.getElementById('np-afmetingen').value || null,
        afbeeldingen: afbeelding ? [afbeelding] : [],
        max_boekingen_per_dag: parseInt(document.getElementById('np-max-per-dag').value, 10) || 1,
        availability_buffer_dagen: parseInt(document.getElementById('np-buffer-dagen').value, 10) || 0,
        zichtbaarheid: document.getElementById('np-zichtbaarheid').value,
        motor_type: document.getElementById('np-motor-type').value || null,
        gewicht_kg: document.getElementById('np-gewicht-kg').value !== '' ? parseFloat(document.getElementById('np-gewicht-kg').value) : null,
        aantal_valmatten: document.getElementById('np-aantal-valmatten').value !== '' ? parseInt(document.getElementById('np-aantal-valmatten').value, 10) : null,
        aantal_piketten: document.getElementById('np-aantal-piketten').value !== '' ? parseInt(document.getElementById('np-aantal-piketten').value, 10) : null,
        aantal_zandzakken: document.getElementById('np-aantal-zandzakken').value !== '' ? parseInt(document.getElementById('np-aantal-zandzakken').value, 10) : null,
      }),
    });
    document.getElementById('form-nieuw-product').reset();
    document.getElementById('np-nieuwe-categorie-veld').hidden = true;
    document.getElementById('nieuw-product-details').open = false;
    laadProductenOverzicht();
    laadProductenCache();
  } catch (err) {
    elFout.textContent = err.message;
  }
});
koppelNieuweCategorieVeld('np-categorie', 'np-nieuwe-categorie-veld');

document.getElementById('form-bulk-import').addEventListener('submit', async (e) => {
  e.preventDefault();
  const elFout = document.getElementById('bulk-import-fout');
  const elResultaat = document.getElementById('bulk-import-resultaat');
  elFout.textContent = '';
  elResultaat.textContent = '';
  const regels = document.getElementById('bi-regels').value;
  if (!regels.trim()) { elFout.textContent = 'Plak eerst de productenlijst hierboven.'; return; }
  try {
    const res = await api('/api/producten/bulk-import', {
      method: 'POST',
      body: JSON.stringify({ regels }),
    });
    elResultaat.textContent = `Klaar: ${res.aangemaakt} nieuw aangemaakt, ${res.bijgewerkt} bijgewerkt.`
      + (res.overgeslagen.length ? ` ${res.overgeslagen.length} overgeslagen (zie console).` : '')
      + (res.onherkendeCategorie && res.onherkendeCategorie.length
        ? ` Let op: bij ${res.onherkendeCategorie.length} product(en) werd de categorie niet herkend (in "Overige" beland, zie console) — controleer de schrijfwijze of pas de categorie manueel aan via het product.`
        : '');
    if (res.overgeslagen.length) console.warn('Overgeslagen rijen bij bulk-import:', res.overgeslagen);
    if (res.onherkendeCategorie && res.onherkendeCategorie.length) console.warn('Onherkende categorie bij bulk-import:', res.onherkendeCategorie);
    document.getElementById('bi-regels').value = '';
    document.getElementById('bulk-import-details').open = false;
    laadProductenOverzicht();
    laadProductenCache();
  } catch (err) {
    elFout.textContent = err.message;
  }
});

// Productdetail (modal): bewerken + keuringen/certificaten
const modalProduct = document.getElementById('modal-product');
document.getElementById('btn-modal-product-sluiten').addEventListener('click', () => { modalProduct.hidden = true; });
modalProduct.addEventListener('click', (e) => { if (e.target === modalProduct) modalProduct.hidden = true; });

// Leest een bestand (via een <input type="file">) in als base64-tekst, zonder
// de "data:...;base64," voorloop — dat is wat de certificaat-routes verwachten.
function leesBestandAlsBase64(bestand) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Kon het bestand niet inlezen'));
    reader.readAsDataURL(bestand);
  });
}

// Certificaat-blok in het product-bewerkscherm: toont het huidige document
// (met bekijk-/verwijderknop en een mini-formulier om het meteen naar een
// e-mailadres door te sturen) of, als er nog geen is, een upload-veld.
function certificaatBlokHtml(p) {
  if (!p.heeft_certificaat) {
    return `
      <form id="form-certificaat-upload" class="form-certificaat">
        <input type="file" id="cert-bestand" accept="application/pdf,image/jpeg,image/png" required />
        <button type="submit">Upload certificaat</button>
      </form>
      <p class="uitleg">PDF, JPG of PNG, max. 8MB.</p>
    `;
  }
  return `
    <div class="certificaat-huidig">
      <span>📄 ${p.certificaat_bestandsnaam}</span>
      <a href="/api/producten/${p.id}/certificaat" target="_blank" rel="noopener" class="linkbtn">Bekijken/downloaden</a>
      <button type="button" id="btn-certificaat-verwijderen" class="linkbtn gevaar">Verwijderen</button>
    </div>
    <form id="form-certificaat-verstuur" class="form-certificaat">
      <label>Doorsturen naar e-mailadres<input type="email" id="cert-email" placeholder="klant@voorbeeld.be" required /></label>
      <button type="submit">Verstuur</button>
    </form>
    <p id="certificaat-fout" class="foutmelding"></p>
  `;
}

function koppelCertificaatBlok(productId) {
  const uploadForm = document.getElementById('form-certificaat-upload');
  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const bestand = document.getElementById('cert-bestand').files[0];
      if (!bestand) return;
      try {
        const dataBase64 = await leesBestandAlsBase64(bestand);
        await api(`/api/producten/${productId}/certificaat`, {
          method: 'PUT',
          body: JSON.stringify({ bestandsnaam: bestand.name, mimetype: bestand.type, dataBase64 }),
        });
        toonToast('Certificaat geüpload');
        openProductDetail(productId);
      } catch (err) {
        alert(err.message);
      }
    });
  }

  const verwijderBtn = document.getElementById('btn-certificaat-verwijderen');
  if (verwijderBtn) {
    verwijderBtn.addEventListener('click', async () => {
      if (!confirm('Certificaat verwijderen?')) return;
      await api(`/api/producten/${productId}/certificaat`, { method: 'DELETE' });
      toonToast('Certificaat verwijderd');
      openProductDetail(productId);
    });
  }

  const verstuurForm = document.getElementById('form-certificaat-verstuur');
  if (verstuurForm) {
    verstuurForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const elFout = document.getElementById('certificaat-fout');
      elFout.textContent = '';
      try {
        await api(`/api/producten/${productId}/certificaat/verstuur`, {
          method: 'POST',
          body: JSON.stringify({ email: document.getElementById('cert-email').value.trim() }),
        });
        toonToast('Certificaat verstuurd');
        document.getElementById('cert-email').value = '';
      } catch (err) {
        elFout.textContent = err.message;
      }
    });
  }
}

async function openProductDetail(productId) {
  const p = await api(`/api/producten/${productId}`);
  const inhoud = document.getElementById('modal-product-inhoud');

  const keuringenHtml = (p.keuringen || [])
    .map((k) => `<div class="keuring-item"><span>${k.type_keuring}</span><span>Vervalt: ${fmtDatum(k.vervaldatum)}</span></div>`)
    .join('') || '<p class="leeg-bericht">Nog geen keuringen/certificaten toegevoegd.</p>';

  inhoud.innerHTML = `
    <h3>${p.naam}</h3>
    <form id="form-product-bewerken">
      <div class="grid-2">
        <label>Naam<input type="text" id="pb-naam" value="${p.naam}" /></label>
        <label>Categorie
          <select id="pb-categorie">${bouwCategorieKeuzeOpties((p.categorieen && p.categorieen[0]) || '')}</select>
        </label>
        <label id="pb-nieuwe-categorie-veld" hidden>Naam nieuwe categorie<input type="text" id="pb-nieuwe-categorie-naam" placeholder="bv. Verlichting" /></label>
        <label>Dagprijs (€)<input type="number" id="pb-prijs" step="0.01" min="0" value="${p.prijs}" /></label>
        <label>Weekendprijs (€)<input type="number" id="pb-weekendprijs" step="0.01" min="0" value="${p.weekendprijs != null ? p.weekendprijs : ''}" /></label>
        <label>Afhaalprijs (€)<input type="number" id="pb-afhaalprijs" step="0.01" min="0" value="${p.afhaalprijs != null ? p.afhaalprijs : ''}" /></label>
        <label>Afmetingen<input type="text" id="pb-afmetingen" value="${p.afmetingen || ''}" /></label>
        <label>Afbeelding (URL)<input type="text" id="pb-afbeelding" value="${(p.afbeeldingen && p.afbeeldingen[0]) || ''}" /></label>
        <label>Max. boekingen per dag<input type="number" id="pb-max-per-dag" min="1" value="${p.max_boekingen_per_dag}" /></label>
        <label>Buffer-dagen tussen boekingen<input type="number" id="pb-buffer-dagen" min="0" value="${p.availability_buffer_dagen}" /></label>
        <label>Zichtbaarheid
          <select id="pb-zichtbaarheid">
            <option value="bookbaar" ${p.zichtbaarheid === 'bookbaar' ? 'selected' : ''}>Bookbaar</option>
            <option value="featured" ${p.zichtbaarheid === 'featured' ? 'selected' : ''}>Featured</option>
            <option value="hidden" ${p.zichtbaarheid === 'hidden' ? 'selected' : ''}>Verborgen</option>
          </select>
        </label>
      </div>
      <p class="uitleg" style="margin-top:0.6rem">Voor de laadlijst per voertuig:</p>
      <div class="grid-2">
        <label>Type motor
          <select id="pb-motor-type">
            <option value="" ${!p.motor_type ? 'selected' : ''}>— Onbekend —</option>
            <option value="Standaard motor" ${p.motor_type === 'Standaard motor' ? 'selected' : ''}>Standaard motor</option>
            <option value="Zware motor" ${p.motor_type === 'Zware motor' ? 'selected' : ''}>Zware motor</option>
          </select>
        </label>
        <label>Gewicht unit (kg)<input type="number" id="pb-gewicht-kg" min="0" step="0.1" value="${p.gewicht_kg != null ? p.gewicht_kg : ''}" /></label>
        <label>Valmatten (harde ondergrond)<input type="number" id="pb-aantal-valmatten" min="0" step="1" value="${p.aantal_valmatten != null ? p.aantal_valmatten : ''}" /></label>
        <label>Piketten (zachte ondergrond)<input type="number" id="pb-aantal-piketten" min="0" step="1" value="${p.aantal_piketten != null ? p.aantal_piketten : ''}" /></label>
        <label>Zandzakken (harde ondergrond)<input type="number" id="pb-aantal-zandzakken" min="0" step="1" value="${p.aantal_zandzakken != null ? p.aantal_zandzakken : ''}" /></label>
      </div>
      <div class="form-acties">
        <button type="submit">Wijzigingen opslaan</button>
        <button type="button" id="btn-product-verwijderen" class="linkbtn gevaar">✕ Product verwijderen</button>
      </div>
      <p id="product-bewerken-fout" class="foutmelding"></p>
    </form>

    <h4>Keuringen / certificaten</h4>
    <div class="keuringen-lijst">${keuringenHtml}</div>
    <form id="form-keuring-toevoegen" class="form-keuring-toevoegen">
      <label>Type<input type="text" id="kt-type" placeholder="bv. jaarlijkse keuring" /></label>
      <label>Vervaldatum<input type="date" id="kt-vervaldatum" /></label>
      <button type="submit">+ Toevoegen</button>
    </form>

    <h4>Certificaat-document</h4>
    <div id="certificaat-blok">${certificaatBlokHtml(p)}</div>
  `;

  koppelNieuweCategorieVeld('pb-categorie', 'pb-nieuwe-categorie-veld');

  document.getElementById('form-product-bewerken').addEventListener('submit', async (e) => {
    e.preventDefault();
    const elFout = document.getElementById('product-bewerken-fout');
    elFout.textContent = '';
    try {
      const categorie = leesGekozenCategorie('pb-categorie', 'pb-nieuwe-categorie-naam');
      const afbeelding = document.getElementById('pb-afbeelding').value.trim();
      await api(`/api/producten/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({
          naam: document.getElementById('pb-naam').value,
          categorieen: [categorie],
          prijs: parseFloat(document.getElementById('pb-prijs').value) || 0,
          weekendprijs: document.getElementById('pb-weekendprijs').value !== '' ? parseFloat(document.getElementById('pb-weekendprijs').value) : null,
          afhaalprijs: document.getElementById('pb-afhaalprijs').value !== '' ? parseFloat(document.getElementById('pb-afhaalprijs').value) : null,
          afmetingen: document.getElementById('pb-afmetingen').value || null,
          afbeeldingen: afbeelding ? [afbeelding] : [],
          max_boekingen_per_dag: parseInt(document.getElementById('pb-max-per-dag').value, 10) || 1,
          availability_buffer_dagen: parseInt(document.getElementById('pb-buffer-dagen').value, 10) || 0,
          zichtbaarheid: document.getElementById('pb-zichtbaarheid').value,
          motor_type: document.getElementById('pb-motor-type').value || null,
          gewicht_kg: document.getElementById('pb-gewicht-kg').value !== '' ? parseFloat(document.getElementById('pb-gewicht-kg').value) : null,
          aantal_valmatten: document.getElementById('pb-aantal-valmatten').value !== '' ? parseInt(document.getElementById('pb-aantal-valmatten').value, 10) : null,
          aantal_piketten: document.getElementById('pb-aantal-piketten').value !== '' ? parseInt(document.getElementById('pb-aantal-piketten').value, 10) : null,
          aantal_zandzakken: document.getElementById('pb-aantal-zandzakken').value !== '' ? parseInt(document.getElementById('pb-aantal-zandzakken').value, 10) : null,
        }),
      });
      modalProduct.hidden = true;
      laadProductenOverzicht();
      laadProductenCache();
    } catch (err) {
      elFout.textContent = err.message;
    }
  });

  document.getElementById('btn-product-verwijderen').addEventListener('click', async () => {
    const elFout = document.getElementById('product-bewerken-fout');
    elFout.textContent = '';
    if (!confirm(`"${p.naam}" definitief verwijderen? Dit kan niet ongedaan gemaakt worden.`)) return;
    try {
      await api(`/api/producten/${productId}`, { method: 'DELETE' });
      modalProduct.hidden = true;
      laadProductenOverzicht();
      laadProductenCache();
    } catch (err) {
      elFout.textContent = err.message;
    }
  });

  document.getElementById('form-keuring-toevoegen').addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('kt-type').value.trim();
    const vervaldatum = document.getElementById('kt-vervaldatum').value;
    if (!type || !vervaldatum) return;
    await api(`/api/producten/${productId}/keuringen`, {
      method: 'POST',
      body: JSON.stringify({ type_keuring: type, vervaldatum }),
    });
    openProductDetail(productId); // herladen zodat de nieuwe keuring meteen zichtbaar is
  });

  koppelCertificaatBlok(productId);

  modalProduct.hidden = false;
}

// ============================================================
// WEBSITE-FORMULIER (test-koppeling) — toont ruwe inzendingen die via de
// webhook binnenkomen (bv. vanuit Gravity Forms), enkel ter observatie. Er
// wordt hier bewust nog niets automatisch omgezet in een aanvraag/boeking.
// ============================================================
function fmtDatumTijd(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('nl-BE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Best-effort: probeer een klantnaam te herkennen in de ruwe formulierdata,
// puur voor een leesbaar kaartopschrift — de rest van de velden tonen we
// hieronder gewoon allemaal, ongeacht hoe Gravity Forms ze precies noemt.
function raadWebinzendingTitel(data) {
  const voornaam = data['Voornaam'] || data.voornaam || '';
  const achternaam = data['Achternaam'] || data.achternaam || '';
  const naam = `${voornaam} ${achternaam}`.trim();
  return naam || data['Product'] || data.product || 'Website-inzending';
}

// ============================================================
// INSTELLINGEN (systeemkoppelingen)
// ============================================================
async function laadInstellingen() {
  const meldingNietGeconfigureerd = document.getElementById('instellingen-sync-niet-geconfigureerd');
  const knop = document.getElementById('btn-sync-leveringen-app');
  const resultaat = document.getElementById('instellingen-sync-resultaat');
  resultaat.hidden = true;
  try {
    const status = await api('/api/sync/leveringen-app/status');
    meldingNietGeconfigureerd.hidden = !!status.geconfigureerd;
    knop.disabled = !status.geconfigureerd;
  } catch (err) {
    meldingNietGeconfigureerd.hidden = true;
  }
}

document.getElementById('btn-sync-leveringen-app').addEventListener('click', async () => {
  const knop = document.getElementById('btn-sync-leveringen-app');
  const resultaat = document.getElementById('instellingen-sync-resultaat');
  knop.disabled = true;
  const oorspronkelijkeTekst = knop.textContent;
  knop.textContent = 'Synchroniseren...';
  resultaat.hidden = true;
  try {
    const data = await api('/api/sync/leveringen-app', { method: 'POST' });
    const onherkend = (data.onherkendeVoertuigen || []).length
      ? ` Let op — niet-herkende voertuignaam in de leveringen-app: ${data.onherkendeVoertuigen.join(', ')}.`
      : '';
    const fouten = (data.fouten || []).length ? ` (${data.fouten.length} fout(en), zie console)` : '';
    if ((data.fouten || []).length) console.error('Sync-fouten:', data.fouten);
    const teruggekoppeld = data.statusTeruggekoppeld ? ` "Voltooid"-status van ${data.statusTeruggekoppeld} boeking(en) teruggehaald.` : '';
    resultaat.textContent = `${data.verstuurd} boeking(en) verstuurd — ${data.aangemaakt} nieuw, ${data.bijgewerkt} bijgewerkt.${teruggekoppeld}${onherkend}${fouten}`;
    resultaat.className = 'melding ok';
    resultaat.hidden = false;
  } catch (err) {
    resultaat.textContent = err.message;
    resultaat.className = 'melding fout';
    resultaat.hidden = false;
  } finally {
    knop.disabled = false;
    knop.textContent = oorspronkelijkeTekst;
  }
});

// ============================================================
// STATISTIEKEN
// ============================================================
let statHuidigJaar = null;

function statEscapeHtml(s) {
  return (s || '').toString().replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Kolomgrafiek "Reservaties per maand" — 12 kolommen die vanaf dezelfde
// basislijn omhoog groeien, hoogte relatief t.o.v. de drukste maand. Bij
// "geen enkele boeking bevestigd dit jaar" krijgt elke kolom een minimale,
// duidelijk grijze streep i.p.v. een misleidend lege grafiek.
// Optioneel (toonVergelijking) een tweede reeks (vorig jaar) ernaast als
// gegroepeerde kolommen, zodat het verschil met vorig jaar in één oogopslag
// te zien is — beide reeksen delen dezelfde schaal (max over beide jaren).
function statRenderKolomgrafiek(perMaand, perMaandVorigJaar, toonVergelijking, huidigJaarLabel, vorigJaarLabel) {
  const reeksen = toonVergelijking ? perMaand.concat(perMaandVorigJaar) : perMaand;
  const maxAantal = Math.max(1, ...reeksen.map((m) => m.aantal));
  const hoogtePct = (aantal) => (aantal > 0 ? Math.max(4, Math.round((aantal / maxAantal) * 100)) : 3);
  return perMaand.map((m, i) => {
    const vorigM = perMaandVorigJaar[i];
    const huidigeBalk = `<div class="stat-kolom stat-kolom-huidig${m.aantal === 0 ? ' stat-leeg' : ''}" style="height: ${hoogtePct(m.aantal)}%" title="${huidigJaarLabel}: ${m.aantal}"></div>`;
    const vorigeBalk = toonVergelijking
      ? `<div class="stat-kolom stat-kolom-vorig${vorigM.aantal === 0 ? ' stat-leeg' : ''}" style="height: ${hoogtePct(vorigM.aantal)}%" title="${vorigJaarLabel}: ${vorigM.aantal}"></div>`
      : '';
    return `
      <div class="stat-kolom-item">
        <div class="stat-kolom-waarden">
          <span class="stat-kolom-waarde">${m.aantal > 0 ? m.aantal : ''}</span>
          ${toonVergelijking ? `<span class="stat-kolom-waarde stat-kolom-waarde-vorig">${vorigM.aantal > 0 ? vorigM.aantal : ''}</span>` : ''}
        </div>
        <div class="stat-kolom-paar">${huidigeBalk}${vorigeBalk}</div>
        <span class="stat-kolom-label">${m.label}</span>
      </div>`;
  }).join('');
}

// Balkgrafiek voor de top-gemeentes/top-producten — horizontale balken
// vanaf een gedeelde linker basislijn, lengte relatief t.o.v. het hoogste
// aantal in de getoonde top-8.
function statRenderBalkgrafiek(rijen, labelVeld) {
  if (!rijen.length) return '<p class="stat-leeg-bericht">Nog geen gegevens voor dit jaar.</p>';
  const maxAantal = Math.max(1, ...rijen.map((r) => r.aantal));
  return rijen.map((r) => {
    const breedtePct = Math.max(3, Math.round((r.aantal / maxAantal) * 100));
    const label = statEscapeHtml(r[labelVeld]);
    return `
      <div class="stat-balk-rij" title="${label}: ${r.aantal}">
        <span class="stat-balk-label">${label}</span>
        <div class="stat-balk-track"><div class="stat-balk-vulling" style="width: ${breedtePct}%"></div></div>
        <span class="stat-balk-waarde">${r.aantal}</span>
      </div>`;
  }).join('');
}

// Producten per categorie — per categorie een subkopje + dezelfde balkgrafiek
// als voorheen voor "top producten", maar nu per categorie i.p.v. één
// algemene top-8, en binnen de vrij gekozen periode (zie laadProductenPeriode).
// Elke categorie staat in een <details>, standaard ingeklapt (op vraag van
// Jonas — anders wordt dit paneel al snel te lang) — het totaal aantal
// verhuringen staat mee in de titel, zodat dat ook zichtbaar is zonder open te
// klappen. Zelfde uitklap-patroon als bij Beschikbaarheid hierboven.
function statRenderProductenPerCategorie(productenPerCategorie) {
  if (!productenPerCategorie.length) {
    return '<p class="stat-leeg-bericht">Geen verhuringen in deze periode.</p>';
  }
  return productenPerCategorie.map((cat) => {
    const totaalAantal = cat.producten.reduce((som, p) => som + Number(p.aantal || 0), 0);
    return `
    <details class="stat-categorie-blok">
      <summary class="stat-categorie-titel">${statEscapeHtml(cat.categorie)} <span class="stat-categorie-totaal">(${totaalAantal})</span></summary>
      <div class="stat-balkgrafiek">${statRenderBalkgrafiek(cat.producten, 'product_naam')}</div>
    </details>
  `;
  }).join('');
}

// Ververst enkel het "Producten per categorie"-paneel, o.b.v. de vrij gekozen
// vanaf/tot-periode — losgekoppeld van de jaar-selector die de rest van de
// pagina stuurt, want Jonas moet dit binnen élke gekozen periode kunnen zien.
async function laadProductenPeriode() {
  const vanaf = document.getElementById('stat-product-vanaf').value;
  const tot = document.getElementById('stat-product-tot').value;
  const params = new URLSearchParams();
  if (vanaf) params.set('vanaf', vanaf);
  if (tot) params.set('tot', tot);
  const data = await api(`/api/statistieken/producten${params.toString() ? '?' + params.toString() : ''}`);
  document.getElementById('stat-product-vanaf').value = data.vanaf;
  document.getElementById('stat-product-tot').value = data.tot;
  document.getElementById('stat-product-vanaf').dataset.aangepast = '1';
  document.getElementById('stat-producten-per-categorie').innerHTML = statRenderProductenPerCategorie(data.productenPerCategorie);
}

document.getElementById('btn-stat-product-periode').addEventListener('click', laadProductenPeriode);

async function laadStatistieken() {
  const selJaar = document.getElementById('stat-jaar');
  const jaarParam = statHuidigJaar || selJaar.value || '';
  const data = await api(`/api/statistieken${jaarParam ? '?jaar=' + jaarParam : ''}`);
  statHuidigJaar = data.jaar;

  if (!selJaar.dataset.gevuld) {
    selJaar.innerHTML = data.beschikbareJaren.map((j) => `<option value="${j}">${j}</option>`).join('');
    selJaar.dataset.gevuld = '1';
  }
  selJaar.value = data.jaar;

  document.getElementById('stat-tegel-aantal').textContent = data.totaalBoekingen;
  document.getElementById('stat-tegel-waarde').textContent = fmtEuro(data.totaleWaarde);
  document.getElementById('stat-tegel-bevestigd').textContent = data.totaalBevestigd;

  const toonVergelijking = document.getElementById('stat-vergelijk-vorig-jaar').checked;
  const huidigJaarLabel = String(data.jaar);
  const vorigJaarLabel = String(data.jaar - 1);
  document.getElementById('stat-grafiek-maand').innerHTML = statRenderKolomgrafiek(
    data.perMaand, data.perMaandVorigJaar, toonVergelijking, huidigJaarLabel, vorigJaarLabel
  );
  // Legende enkel tonen bij twee reeksen — bij één reeks zegt de titel al genoeg.
  const legende = document.getElementById('stat-legende');
  legende.hidden = !toonVergelijking;
  if (toonVergelijking) {
    legende.innerHTML = `
      <span class="stat-legende-item"><span class="stat-legende-swatch stat-legende-huidig"></span>${huidigJaarLabel}</span>
      <span class="stat-legende-item"><span class="stat-legende-swatch stat-legende-vorig"></span>${vorigJaarLabel}</span>`;
  }

  document.getElementById('stat-grafiek-gemeentes').innerHTML = statRenderBalkgrafiek(data.topGemeentes, 'gemeente');

  // Producten per categorie: standaard het volledige geselecteerde jaar, tenzij
  // Jonas via "Toepassen" al een eigen periode had gekozen (dan die behouden
  // i.p.v. te overschrijven bij elke jaarwissel).
  const productVanafVeld = document.getElementById('stat-product-vanaf');
  const productTotVeld = document.getElementById('stat-product-tot');
  if (!productVanafVeld.dataset.aangepast) {
    productVanafVeld.value = data.productVanaf;
    productTotVeld.value = data.productTot;
    document.getElementById('stat-producten-per-categorie').innerHTML = statRenderProductenPerCategorie(data.productenPerCategorie);
  }
}

document.getElementById('stat-jaar').addEventListener('change', (e) => {
  statHuidigJaar = e.target.value;
  // Bij een jaarwissel de producten-periode terug op "heel dat jaar" zetten —
  // een eerder handmatig gekozen periode (mogelijk van een ander jaar) zou
  // hier anders blijven hangen.
  delete document.getElementById('stat-product-vanaf').dataset.aangepast;
  laadStatistieken();
});
document.getElementById('stat-vergelijk-vorig-jaar').addEventListener('change', laadStatistieken);

async function laadWebinzendingen() {
  const container = document.getElementById('lijst-webinzendingen');
  container.innerHTML = '<p class="leeg-bericht">Laden...</p>';
  let inzendingen;
  try {
    inzendingen = await api('/api/webinzendingen/website-formulier');
  } catch (err) {
    container.innerHTML = `<p class="foutmelding">Kon inzendingen niet ophalen: ${err.message}</p>`;
    return;
  }
  if (!inzendingen.length) {
    container.innerHTML = '<p class="leeg-bericht">Nog geen inzendingen ontvangen. Zodra de webhook op de website is ingesteld, verschijnen nieuwe formulier-inzendingen hier.</p>';
    return;
  }
  container.innerHTML = inzendingen.map((inz) => {
    const succes = !!inz.boeking_id;
    const statusHtml = succes
      ? '<p class="webinzending-status webinzending-status-succes">✓ Automatisch omgezet naar een aanvraag</p>'
      : (inz.verwerkings_fout ? `<p class="webinzending-status webinzending-status-fout">⚠ ${inz.verwerkings_fout}</p>` : '');
    return `
    <div class="kaart webinzending${inz.verwerkt ? ' webinzending-bekeken' : ''}" data-id="${inz.id}">
      <div class="kaart-info">
        <h3>${raadWebinzendingTitel(inz.ruwe_data)}</h3>
        <p>${fmtDatumTijd(inz.ontvangen_op)}${!succes && inz.verwerkt ? ' · bekeken' : ''}</p>
        ${statusHtml}
        <div class="webinzending-velden">
          ${Object.entries(inz.ruwe_data || {}).map(([label, waarde]) => `
            <div class="detail-rij"><span>${label}</span><span>${(waarde ?? '—') || '—'}</span></div>
          `).join('')}
        </div>
      </div>
      <div class="kaart-acties">
        ${succes ? `<button type="button" class="secundair btn-webinzending-bekijk-aanvraag" data-boeking-id="${inz.boeking_id}">Bekijk aanvraag →</button>` : ''}
        ${!inz.verwerkt ? `<button type="button" class="btn-webinzending-bekeken" data-id="${inz.id}">Markeer als bekeken</button>` : ''}
      </div>
    </div>
  `;
  }).join('');
  container.querySelectorAll('.btn-webinzending-bekeken').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/api/webinzendingen/website-formulier/${btn.dataset.id}/verwerkt`, { method: 'POST' });
      laadWebinzendingen();
    });
  });
  container.querySelectorAll('.btn-webinzending-bekijk-aanvraag').forEach((btn) => {
    btn.addEventListener('click', () => openDetail(btn.dataset.boekingId));
  });
}

// ============================================================
// RESERVATIES IMPORTEREN (bulk, uit een Excel-export)
// Het bestand wordt hier in de browser ingelezen (met SheetJS, via CDN) —
// enkel de al ontlede gegevens per rij gaan naar de server voor matching
// tegen de productenlijst en het opsporen van mogelijke dubbels.
// ============================================================
const RI_KOLOM_VARIANTEN = {
  datumStart: ['delivery date'],
  tijdstipLevering: ['drop off'],
  datumEinde: ['collection date'],
  tijdstipAfhaling: ['collection'],
  klantNaam: ['customer name'],
  telefoon: ['mobile'],
  email: ['email'],
  adres: ['delivery address 1', 'delivery address'],
  gemeente: ['delivery town'],
  postcode: ['delivery postcode'],
  itemsTekst: ['item'],
  balance: ['balance'],
  ondergrondRuw: ['surface'],
  notities: ['customer notes'],
};

function riNormaliseerHeader(s) {
  return (s || '').toString().trim().toLowerCase();
}

// De echte kopregel staat niet noodzakelijk op de eerste rij (bv. als er een
// titel boven staat, zoals in Jonas' eigen exports) — we zoeken de eerste rij
// die "customer name" bevat.
function riVindHeaderRij(ruweRijen) {
  for (let i = 0; i < ruweRijen.length; i++) {
    const rij = (ruweRijen[i] || []).map(riNormaliseerHeader);
    if (rij.includes('customer name')) return i;
  }
  return -1;
}

function riBouwKolomIndex(headerRij) {
  const genormaliseerd = headerRij.map(riNormaliseerHeader);
  const index = {};
  Object.entries(RI_KOLOM_VARIANTEN).forEach(([veld, varianten]) => {
    const i = genormaliseerd.findIndex((h) => varianten.includes(h));
    if (i !== -1) index[veld] = i;
  });
  return index;
}

function riParseDatum(ruw) {
  const t = (ruw || '').toString().trim();
  if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0].slice(0, 10);
  const eu = t.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
  if (eu) return `${eu[3]}-${eu[2].padStart(2, '0')}-${eu[1].padStart(2, '0')}`;
  return null;
}

function riParseTijd(ruw) {
  const t = (ruw || '').toString().trim();
  if (!t || t === '00:00') return null; // "00:00" komt hier steeds voor als "niet ingevuld", niet als een echt tijdstip
  return t;
}

// In het echte exportbestand staat een deel van de GSM-nummers als een puur
// getal i.p.v. tekst (bv. 487018363 i.p.v. "0487/01 83 63") — Excel laat de
// voorloop-nul dan vallen. Belgische mobiele nummers hebben 9 cijfers ná de
// voorloop-nul, dus die zetten we er terug voor als het patroon klopt.
function riNormaliseerTelefoon(ruw) {
  const t = (ruw || '').toString().trim();
  if (!t) return null;
  if (/^\d{9}$/.test(t)) return `0${t}`; // bv. 487018363 -> 0487018363
  if (/^32\d{9}$/.test(t)) return `0${t.slice(2)}`; // bv. 32497853609 (landcode zonder +) -> 0497853609
  return t;
}

async function riLeesBestand(file) {
  const data = await file.arrayBuffer();
  const werkboek = XLSX.read(data, { type: 'array' });
  const blad = werkboek.Sheets[werkboek.SheetNames[0]];
  const ruweRijen = XLSX.utils.sheet_to_json(blad, { header: 1, defval: null, raw: false });

  const headerRijIndex = riVindHeaderRij(ruweRijen);
  if (headerRijIndex === -1) {
    throw new Error('Kon de kopregel niet vinden (verwacht o.a. een kolom "Customer Name"). Is dit het juiste bestand?');
  }
  const kolomIndex = riBouwKolomIndex(ruweRijen[headerRijIndex]);
  if (kolomIndex.klantNaam === undefined || kolomIndex.datumStart === undefined) {
    throw new Error('Kolommen "Customer Name" en/of "Delivery Date" niet gevonden in de kopregel.');
  }

  const veld = (rij, naam) => (kolomIndex[naam] !== undefined ? rij[kolomIndex[naam]] : null);
  const rijen = [];
  for (let i = headerRijIndex + 1; i < ruweRijen.length; i++) {
    const rij = ruweRijen[i] || [];
    if (!rij.some((c) => c != null && String(c).trim() !== '')) continue; // lege regel overslaan
    const itemsTekst = veld(rij, 'itemsTekst') || '';
    rijen.push({
      rijnummer: rijen.length + 1,
      klantNaam: veld(rij, 'klantNaam'),
      telefoon: riNormaliseerTelefoon(veld(rij, 'telefoon')),
      email: veld(rij, 'email'),
      adres: veld(rij, 'adres'),
      gemeente: veld(rij, 'gemeente'),
      postcode: veld(rij, 'postcode'),
      datumStart: riParseDatum(veld(rij, 'datumStart')),
      datumEinde: riParseDatum(veld(rij, 'datumEinde')),
      tijdstipLevering: riParseTijd(veld(rij, 'tijdstipLevering')),
      tijdstipAfhaling: riParseTijd(veld(rij, 'tijdstipAfhaling')),
      ondergrondRuw: veld(rij, 'ondergrondRuw'),
      notities: veld(rij, 'notities'),
      balance: veld(rij, 'balance'),
      itemsRuw: itemsTekst.split('/').map((s) => s.trim()).filter(Boolean),
    });
  }
  return rijen;
}

const RI_STATUS_LABEL = {
  nieuw: '<span class="status-pill status-groen">nieuw</span>',
  mogelijk_dubbel: '<span class="status-pill status-geel">mogelijke dubbel</span>',
  fout: '<span class="status-pill status-rood">niet importeerbaar</span>',
};
const RI_RIJ_KLEUR = { nieuw: 'groen', mogelijk_dubbel: 'geel', fout: 'rood' };

let riLaatsteRijen = [];

function riRenderTabel(rijen) {
  riLaatsteRijen = rijen;
  const container = document.getElementById('ri-tabel');
  container.innerHTML = `
    <table class="tabel">
      <thead>
        <tr>
          <th></th><th>Klant</th><th>Periode</th><th>Producten</th><th>Saldo</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rijen.map((r, i) => {
          const productenTekst = (r.producten || []).map((p) => `${p.naam}${p.aantal > 1 ? ' ×' + p.aantal : ''}`).join(', ')
            || '<em>geen</em>';
          const kanNiet = r.status === 'fout';
          const magStandaardAan = r.status === 'nieuw';
          const waarschuwingen = (r.waarschuwingen || []).concat(r.problemen || []);
          return `
            <tr class="rij-kleur-${RI_RIJ_KLEUR[r.status] || 'grijs'}">
              <td><input type="checkbox" class="ri-check" data-idx="${i}" ${magStandaardAan ? 'checked' : ''} ${kanNiet ? 'disabled' : ''} /></td>
              <td>${r.klantNaam || '<em>onbekend</em>'}<br><span class="uitleg">${r.email || r.telefoon || ''}</span></td>
              <td>${r.datumStart || '?'}${r.datumEinde && r.datumEinde !== r.datumStart ? ' t.e.m. ' + r.datumEinde : ''}</td>
              <td>${productenTekst}</td>
              <td>${fmtEuro(r.saldoOpenstaand)}</td>
              <td>
                ${RI_STATUS_LABEL[r.status] || r.status}
                ${r.dubbel ? `<div class="uitleg">lijkt op boeking van ${r.dubbel.klant_naam} (status: ${r.dubbel.status})</div>` : ''}
                ${waarschuwingen.map((w) => `<div class="uitleg">⚠ ${w}</div>`).join('')}
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

document.getElementById('ri-bestand').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const elStatus = document.getElementById('ri-laad-status');
  const elResultaat = document.getElementById('ri-resultaat');
  elResultaat.hidden = true;
  elStatus.textContent = '';
  if (!file) return;
  try {
    elStatus.textContent = 'Bestand inlezen...';
    const rijen = await riLeesBestand(file);
    if (!rijen.length) throw new Error('Geen bruikbare rijen gevonden in dit bestand.');
    elStatus.textContent = `${rijen.length} rij(en) gevonden — bezig met controleren tegen de productenlijst en bestaande boekingen...`;
    const res = await api('/api/reservatie-import/preview', {
      method: 'POST',
      body: JSON.stringify({ rijen }),
    });
    elStatus.textContent = `${res.rijen.length} rij(en) klaar om te bekijken hieronder.`;
    riRenderTabel(res.rijen);
    elResultaat.hidden = false;
  } catch (err) {
    elStatus.textContent = '';
    alert('Kon het bestand niet verwerken: ' + err.message);
  }
});

document.getElementById('ri-alles-aan').addEventListener('click', () => {
  document.querySelectorAll('.ri-check:not(:disabled)').forEach((el) => { el.checked = true; });
});
document.getElementById('ri-alles-uit').addEventListener('click', () => {
  document.querySelectorAll('.ri-check').forEach((el) => { el.checked = false; });
});

document.getElementById('ri-importeer-knop').addEventListener('click', async () => {
  const elStatus = document.getElementById('ri-import-status');
  const geselecteerd = Array.from(document.querySelectorAll('.ri-check:checked')).map((el) => riLaatsteRijen[Number(el.dataset.idx)]);
  if (!geselecteerd.length) { elStatus.textContent = 'Vink minstens één rij aan om te importeren.'; return; }
  if (!confirm(`${geselecteerd.length} reservatie(s) importeren?`)) return;
  elStatus.textContent = 'Bezig met importeren...';
  try {
    const res = await api('/api/reservatie-import/bevestig', {
      method: 'POST',
      body: JSON.stringify({ rijen: geselecteerd }),
    });
    let tekst = `Klaar: ${res.aangemaakt} reservatie(s) aangemaakt.`;
    if (res.overgeslagen.length) {
      tekst += ` ${res.overgeslagen.length} overgeslagen:`;
      tekst += res.overgeslagen.map((o) => `\n– rij ${o.rijnummer}: ${o.reden}`).join('');
    }
    elStatus.textContent = tekst;
    elStatus.style.whiteSpace = 'pre-line';
    if (res.overgeslagen.length) console.warn('Overgeslagen rijen bij reservatie-import:', res.overgeslagen);
    if (res.aangemaakt > 0) {
      document.getElementById('ri-resultaat').hidden = true;
      document.getElementById('ri-bestand').value = '';
    }
    laadBoekingenOverzicht();
  } catch (err) {
    elStatus.textContent = 'Fout: ' + err.message;
  }
});

// ============================================================
// START
// ============================================================
bouwTijdstipOpties(document.getElementById('voorkeur-levering'), '10:00');
bouwTijdstipOpties(document.getElementById('voorkeur-afhaling'), '20:00');
checkSessie();
