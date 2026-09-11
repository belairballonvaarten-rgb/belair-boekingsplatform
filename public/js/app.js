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
};

// Zelfde toegelaten overgangen als in src/routes/boekingen.js — enkel voor de UI,
// de server is en blijft de bron van waarheid (valideert dit ook zelf).
const TOEGELATEN_OVERGANGEN = {
  nieuw: ['in_behandeling', 'geaccepteerd', 'geweigerd'],
  in_behandeling: ['geaccepteerd', 'geweigerd'],
  geaccepteerd: ['ingepland', 'geweigerd'],
  ingepland: ['bevestigd'],
  bevestigd: ['betaalverzoek_verstuurd'],
  betaalverzoek_verstuurd: ['betaald_deels', 'betaald_volledig'],
  betaald_deels: ['betaald_volledig', 'gefactureerd'],
  betaald_volledig: ['gefactureerd'],
  geweigerd: [],
  gefactureerd: [],
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

function bouwTijdstipOpties(selectEl, standaardTijd) {
  if (!selectEl) return;
  const opties = [
    `<option value=""${standaardTijd === undefined ? ' selected' : ''}>Geen voorkeur</option>`,
    `<option value="${TIJDSTIP_FLEXIBEL_WAARDE}">Tussen 07:00 en 12:00 uur (GRATIS)</option>`,
  ];
  for (let m = 0; m < 24 * 60; m += 15) {
    const uur = String(Math.floor(m / 60)).padStart(2, '0');
    const minuut = String(m % 60).padStart(2, '0');
    const tijd = `${uur}:${minuut}`;
    opties.push(`<option value="${tijd}"${tijd === standaardTijd ? ' selected' : ''}>${tijd}</option>`);
  }
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

async function checkSessie() {
  try {
    await api('/api/auth/me');
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
  laadProductenCache().then(() => {
    wisselView('aanvragen');
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
const views = ['aanvragen', 'boekingen', 'beschikbaarheid', 'nieuwe-boeking', 'producten', 'boeking-detail'];

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
  if (naam === 'aanvragen') laadAanvragen();
  if (naam === 'boekingen') laadBoekingenOverzicht();
  if (naam === 'beschikbaarheid') laadBeschikbaarheidsoverzicht();
  if (naam === 'nieuwe-boeking' && !document.getElementById('producten-rijen').children.length) nieuweProductRij();
  if (naam === 'producten') laadProductenOverzicht();
}

document.querySelectorAll('.navbtn').forEach((btn) => {
  btn.addEventListener('click', () => wisselView(btn.dataset.view));
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
        <h3>${b.klant_naam} <span class="status-pill">${STATUS_LABELS[b.status]}</span></h3>
        <p>📅 ${fmtDatum(b.gewenste_datum_start)}${b.gewenste_datum_start !== b.gewenste_datum_einde ? ' – ' + fmtDatum(b.gewenste_datum_einde) : ''}</p>
        <p>📍 ${b.leveringsadres || '—'}</p>
        <p>📞 ${b.klant_telefoon || '—'}</p>
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
    if (!document.getElementById('view-boeking-detail').hidden) wisselView(boekingDetailVorigeView);
  } catch (err) {
    alert(err.message);
  }
}

// ============================================================
// BOEKINGENOVERZICHT
// ============================================================
async function laadBoekingenOverzicht() {
  const status = document.getElementById('filter-status').value;
  const vanaf = document.getElementById('filter-vanaf').value;
  const tot = document.getElementById('filter-tot').value;
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (vanaf) params.set('vanaf', vanaf);
  if (tot) params.set('tot', tot);

  const boekingen = await api(`/api/boekingen?${params.toString()}`);

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
  if (!boekingen.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="leeg-bericht">Geen boekingen gevonden.</td></tr>';
    return;
  }
  for (const b of boekingen) {
    const locatie = b.leveringswijze === 'afhaling'
      ? 'Afhaling'
      : (b.leveringsadres
        || [b.klant_adres, [b.klant_postcode, b.klant_gemeente].filter(Boolean).join(' ')].filter(Boolean).join(', ')
        || '—');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDatum(b.gewenste_datum_start)}</td>
      <td>${b.producten_namen || '—'}</td>
      <td>${locatie}</td>
      <td>${b.klant_naam}</td>
      <td>${fmtEuro(b.waarde)}</td>
      <td><span class="status-pill">${STATUS_LABELS[b.status]}</span></td>
      <td>Bekijk →</td>
    `;
    tr.addEventListener('click', () => openDetail(b.id));
    tbody.appendChild(tr);
  }
}

document.getElementById('btn-filter-toepassen').addEventListener('click', laadBoekingenOverzicht);

// Snelfilters (zoals in het huidige bookingonline.co.uk-systeem)
function berekenDatumRange(bereik) {
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);

  switch (bereik) {
    case 'vandaag':
      return [naarISO(vandaag), naarISO(vandaag)];
    case 'deze-week': {
      const dagVanWeek = (vandaag.getDay() + 6) % 7; // 0 = maandag
      const start = new Date(vandaag);
      start.setDate(vandaag.getDate() - dagVanWeek);
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
    case 'alles':
    default:
      return ['', ''];
  }
}

document.querySelectorAll('#snelfilters button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const [vanaf, tot] = berekenDatumRange(btn.dataset.range);
    document.getElementById('filter-vanaf').value = vanaf;
    document.getElementById('filter-tot').value = tot;
    document.querySelectorAll('#snelfilters button').forEach((b) => b.classList.toggle('actief', b === btn));
    laadBoekingenOverzicht();
  });
});

// ============================================================
// BOEKING DETAIL (volledige pagina)
// ============================================================
let boekingDetailVorigeView = 'boekingen';
document.getElementById('btn-boeking-detail-terug').addEventListener('click', () => wisselView(boekingDetailVorigeView));

const COMMUNICATIE_TYPE_LABELS = { email: 'E-mail', telefoon: 'Telefoon', sms: 'SMS', notitie: 'Notitie' };
const COMMUNICATIE_RICHTING_LABELS = { uitgaand: 'Uitgaand', inkomend: 'Inkomend', intern: 'Intern' };

async function openDetail(boekingId) {
  // Onthoud van welke pagina we komen, zodat "Terug naar overzicht" daar naartoe gaat.
  if (document.getElementById('view-boeking-detail').hidden) {
    boekingDetailVorigeView = huidigeViewNaam();
  }
  const b = await api(`/api/boekingen/${boekingId}`);
  const inhoud = document.getElementById('boeking-detail-inhoud');

  const productenHtml = b.producten
    .map((p) => `<div class="detail-rij"><span>${p.product_naam} × ${p.aantal}</span><span>€ ${Number(p.prijs).toFixed(2)}</span></div>`)
    .join('');

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
    <h3>${b.klant_naam} <span class="status-pill">${STATUS_LABELS[b.status]}</span></h3>
    <div class="detail-rij"><span>Periode</span><span>${fmtDatum(b.gewenste_datum_start)} – ${fmtDatum(b.gewenste_datum_einde)}</span></div>
    <div class="detail-rij"><span>Telefoon</span><span>${b.klant_telefoon || '—'}</span></div>
    <div class="detail-rij"><span>E-mail</span><span>${b.klant_email || '—'}</span></div>
    <div class="detail-rij"><span>Leveringswijze</span><span>${b.leveringswijze || '—'}</span></div>
    <div class="detail-rij"><span>Ondergrond</span><span>${b.type_ondergrond || '—'}</span></div>
    <div class="detail-rij"><span>Toegankelijkheid</span><span>${b.toegankelijkheid || '—'}</span></div>
    <div class="detail-rij"><span>Voorkeur levering</span><span>${b.voorkeur_tijdstip_levering || '—'}</span></div>
    <div class="detail-rij"><span>Voorkeur afhaling</span><span>${b.voorkeur_tijdstip_afhaling || '—'}</span></div>
    <div class="detail-rij"><span>Huurvoorwaarden</span><span>${b.huurvoorwaarden_geaccepteerd ? 'Geaccepteerd' : 'Niet geaccepteerd'}</span></div>

    <h4>Locatie</h4>
    <div class="detail-rij"><span>Adres</span><span>${adresVolledig || '—'}</span></div>
    ${mapsUrl ? `<div class="detail-rij"><span></span><span><a href="${mapsUrl}" target="_blank" rel="noopener">Bekijk op Google Maps ↗</a></span></div>` : ''}
    <form id="form-locatie" class="grid-2">
      <label>Afstand tot Overmere (km)<input type="number" id="dd-afstand-km" step="0.1" min="0" value="${b.afstand_km != null ? b.afstand_km : ''}" placeholder="automatisch of manueel" /></label>
    </form>
    <button type="button" id="btn-herbereken-afstand" class="secundair">↻ Afstand herberekenen via Google Maps</button>
    <p id="herbereken-afstand-status" class="uitleg" style="margin-top:0.3rem"></p>
    <p class="uitleg">De afstand wordt automatisch berekend (eerste 10km gratis, dan € 0,50/km x4 voor levering + ophaling). De voorgestelde transportkost telt pas mee in het totaal nadat je die hieronder bevestigt.</p>
    ${toonBevestigBalk ? `
      <div class="bevestig-balk">
        <span>Voorgestelde transportkost o.b.v. ${b.afstand_km} km: <strong>${fmtEuro(voorgesteldeTransportkost)}</strong></span>
        <button type="button" id="btn-bevestig-transportkost" class="secundair">✓ Bevestig transportkost</button>
      </div>
    ` : ''}

    <h4>Producten</h4>
    ${productenHtml || '<p class="leeg-bericht">Geen producten</p>'}

    <h4>Prijstabel &amp; betaling</h4>
    <div class="prijstabel">
      <div class="prijstabel-rij"><span>Producten</span><span>${fmtEuro(p.subtotaal_producten)}</span></div>
      <div class="prijstabel-rij">
        <span>Levering / transport</span>
        <span class="veld-met-wissen">
          <input type="number" id="dd-transportkost" step="0.01" min="0" value="${b.transportkost != null ? b.transportkost : ''}" placeholder="0.00" />
          <button type="button" id="btn-transportkost-wissen" class="linkbtn gevaar" title="Transportkost wissen">✕</button>
        </span>
      </div>
      <div class="prijstabel-rij">
        <span>Toeslag / korting</span>
        <span><input type="number" id="dd-toeslag-korting" step="0.01" value="${b.toeslag_korting != null ? b.toeslag_korting : ''}" placeholder="0.00" /></span>
      </div>
      <button type="button" id="btn-prijstabel-opslaan" class="secundair">Levering/toeslag opslaan</button>
      <div class="prijstabel-rij prijstabel-totaal"><span>Totaal</span><span>${fmtEuro(p.totaal)}</span></div>
      <div class="prijstabel-rij prijstabel-sub"><span>Incl. BTW (${p.btw_percentage}%)</span><span>${fmtEuro(p.btw_bedrag)}</span></div>
      <div class="prijstabel-rij"><span>Reeds betaald</span><span>${fmtEuro(p.betaald_bedrag)}</span></div>
      <div class="prijstabel-rij prijstabel-saldo ${p.saldo_openstaand <= 0 ? 'voldaan' : ''}"><span>Openstaand saldo</span><span>${fmtEuro(p.saldo_openstaand)}</span></div>
    </div>
    <form id="form-nieuwe-betaling" class="grid-2">
      <label>Nieuwe betaling (€)<input type="number" id="np-betaling-bedrag" step="0.01" min="0.01" placeholder="bedrag, Enter om op te slaan" /></label>
      <label>Opmerking<input type="text" id="np-betaling-opmerking" placeholder="optioneel, bv. 'overschrijving'" /></label>
    </form>
    <div class="betaling-log">${betalingLogHtml}</div>

    <h4>Opmerkingen</h4>
    <form id="form-notities">
      <textarea id="dd-notities" rows="3" placeholder="Interne opmerkingen over deze boeking...">${b.notities || ''}</textarea>
      <button type="submit">Opmerkingen opslaan</button>
    </form>

    <h4>Communicatie</h4>
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

    <h4>Statusovergangen</h4>
    <div class="status-acties">${actiesHtml || '<p class="leeg-bericht">Geen overgangen meer mogelijk</p>'}</div>

    <h4>Historiek</h4>
    ${historiekHtml || '<p class="leeg-bericht">Geen historiek</p>'}
  `;

  inhoud.querySelectorAll('.status-acties button').forEach((btn) => {
    btn.addEventListener('click', () => {
      let opmerking;
      if (btn.dataset.status === 'geweigerd') {
        opmerking = prompt('Reden van weigering (optioneel):') || '';
      }
      wijzigStatus(b.id, btn.dataset.status, opmerking);
    });
  });

  document.getElementById('btn-prijstabel-opslaan').addEventListener('click', async () => {
    const transportkost = document.getElementById('dd-transportkost').value;
    const toeslagKorting = document.getElementById('dd-toeslag-korting').value;
    await api(`/api/boekingen/${boekingId}`, {
      method: 'PUT',
      body: JSON.stringify({
        transportkost: transportkost !== '' ? parseFloat(transportkost) : null,
        toeslag_korting: toeslagKorting !== '' ? parseFloat(toeslagKorting) : null,
      }),
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

  wisselView('boeking-detail');
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
let onbeschikbareProductIds = new Set();

// Producten gegroepeerd per categorie (in de vaste volgorde, rest onder "Overige").
function productenPerCategorie() {
  const groepen = new Map();
  PRODUCT_CATEGORIE_VOLGORDE.forEach((c) => groepen.set(c, []));
  groepen.set('Overige', []);

  productenCache.forEach((p) => {
    const categorieen = p.categorieen || [];
    const gekozenCategorie = PRODUCT_CATEGORIE_VOLGORDE.find((c) => categorieen.includes(c)) || 'Overige';
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
function bouwModelOpties(categorie, geselecteerdWaarde) {
  const producten = productenPerCategorie().get(categorie) || [];
  return producten
    .map((p) => {
      const onbeschikbaar = onbeschikbareProductIds.has(p.id);
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
async function bepaalOnbeschikbareProductIds(datumStart, datumEinde) {
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

document.getElementById('datum-start').addEventListener('change', verversBeschikbaarheid);
document.getElementById('datum-einde').addEventListener('change', verversBeschikbaarheid);

// ============================================================
// BESCHIKBAARHEID-OVERZICHT (snel zien wat nog vrij is op een datum/periode,
// bv. tijdens een telefonische aanvraag — met doorklik naar een nieuwe boeking)
// ============================================================
function groepeerLijstPerCategorie(lijst) {
  const groepen = new Map();
  PRODUCT_CATEGORIE_VOLGORDE.forEach((c) => groepen.set(c, []));
  groepen.set('Overige', []);
  lijst.forEach((p) => {
    const categorieen = p.categorieen || [];
    const gekozenCategorie = PRODUCT_CATEGORIE_VOLGORDE.find((c) => categorieen.includes(c)) || 'Overige';
    groepen.get(gekozenCategorie).push(p);
  });
  return groepen;
}

function renderBeschikbaarheidKolom(containerId, producten, klikbaar) {
  const container = document.getElementById(containerId);
  const groepen = groepeerLijstPerCategorie(producten);
  let html = '';
  groepen.forEach((lijst, categorie) => {
    if (!lijst.length) return;
    html += `<div class="besch-categorie"><h4>${categorie}</h4>${lijst
      .map((p) => `<div class="besch-item${klikbaar ? ' klikbaar' : ''}" data-id="${p.id}">${p.naam}</div>`)
      .join('')}</div>`;
  });
  container.innerHTML = html || '<p class="leeg-bericht">Geen producten in deze lijst.</p>';
  if (klikbaar) {
    container.querySelectorAll('.besch-item').forEach((el) => {
      el.addEventListener('click', () => {
        startNieuweBoekingVoorProduct(
          el.dataset.id,
          document.getElementById('besch-datum-start').value,
          document.getElementById('besch-datum-einde').value
        );
      });
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
  const onbeschikbaar = await bepaalOnbeschikbareProductIds(datumStart, datumEinde);
  const beschikbaar = productenCache.filter((p) => !onbeschikbaar.has(p.id));
  const bezet = productenCache.filter((p) => onbeschikbaar.has(p.id));
  renderBeschikbaarheidKolom('besch-beschikbaar', beschikbaar, true);
  renderBeschikbaarheidKolom('besch-bezet', bezet, false);
}

function laadBeschikbaarheidsoverzicht() {
  const elStart = document.getElementById('besch-datum-start');
  if (!elStart.value) elStart.value = naarISO(new Date());
  ververBeschikbaarheidsoverzicht();
}

document.getElementById('besch-datum-start').addEventListener('change', ververBeschikbaarheidsoverzicht);
document.getElementById('besch-datum-einde').addEventListener('change', ververBeschikbaarheidsoverzicht);

// Vanuit het beschikbaarheidsoverzicht meteen een nieuwe boeking starten met het
// aangeklikte product en de gekozen datum/periode al ingevuld.
function startNieuweBoekingVoorProduct(productId, datumStart, datumEinde) {
  wisselView('nieuwe-boeking');
  document.getElementById('producten-rijen').innerHTML = '';
  nieuweProductRij(productId);
  document.getElementById('datum-start').value = datumStart;
  document.getElementById('datum-einde').value = (datumEinde && datumEinde !== datumStart) ? datumEinde : '';
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
    <label>Aantal<input type="number" class="rij-aantal" value="1" min="1" /></label>
    <button type="button" class="verwijder">✕</button>
  `;
  rij.querySelector('.rij-categorie').addEventListener('change', (e) => {
    rij.querySelector('.rij-product').innerHTML = bouwModelOpties(e.target.value);
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

    const adresIdemKlant = document.getElementById('adres-idem-klant').checked;

    const boeking = await api('/api/boekingen', {
      method: 'POST',
      body: JSON.stringify({
        klant_id: klantId,
        producten,
        gewenste_datum_start: document.getElementById('datum-start').value,
        gewenste_datum_einde: document.getElementById('datum-einde').value || document.getElementById('datum-start').value,
        leveringswijze: document.getElementById('leveringswijze').value,
        adres_idem_klant: adresIdemKlant,
        leveringsadres: adresIdemKlant ? null : (document.getElementById('leveringsadres').value || null),
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
  } catch (err) {
    elFout.textContent = err.message;
  }
});

// ============================================================
// PRODUCTEN (beheer: overzicht per sectie, nieuw product, staat, keuringen)
// ============================================================
function groepeerPerCategorie(producten) {
  const groepen = new Map();
  PRODUCT_CATEGORIE_VOLGORDE.forEach((c) => groepen.set(c, []));
  groepen.set('Overige', []);
  producten.forEach((p) => {
    const categorieen = p.categorieen || [];
    const gekozenCategorie = PRODUCT_CATEGORIE_VOLGORDE.find((c) => categorieen.includes(c)) || 'Overige';
    groepen.get(gekozenCategorie).push(p);
  });
  return groepen;
}

function productKaartHtml(p) {
  const afbeelding = (p.afbeeldingen && p.afbeeldingen[0]) || '';
  const staat = p.staat || 'proper';
  return `
    <div class="product-kaart" data-id="${p.id}">
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
  const groepen = groepeerPerCategorie(producten);
  const container = document.getElementById('producten-secties');
  container.innerHTML = '';
  groepen.forEach((lijst, categorie) => {
    if (!lijst.length) return;
    const sectie = document.createElement('div');
    sectie.className = 'producten-sectie';
    sectie.innerHTML = `<h3>${categorie} (${lijst.length})</h3><div class="product-kaarten-grid">${lijst.map(productKaartHtml).join('')}</div>`;
    container.appendChild(sectie);
  });

  container.querySelectorAll('.product-kaart').forEach((kaart) => {
    kaart.addEventListener('click', (e) => {
      if (e.target.closest('.staat-knop')) return; // knop heeft eigen click-afhandeling
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
}

document.getElementById('form-nieuw-product').addEventListener('submit', async (e) => {
  e.preventDefault();
  const elFout = document.getElementById('nieuw-product-fout');
  elFout.textContent = '';
  try {
    const afbeelding = document.getElementById('np-afbeelding').value.trim();
    await api('/api/producten', {
      method: 'POST',
      body: JSON.stringify({
        naam: document.getElementById('np-naam').value.trim(),
        categorieen: [document.getElementById('np-categorie').value],
        prijs: parseFloat(document.getElementById('np-prijs').value) || 0,
        weekendprijs: document.getElementById('np-weekendprijs').value !== '' ? parseFloat(document.getElementById('np-weekendprijs').value) : null,
        afhaalprijs: document.getElementById('np-afhaalprijs').value !== '' ? parseFloat(document.getElementById('np-afhaalprijs').value) : null,
        afmetingen: document.getElementById('np-afmetingen').value || null,
        afbeeldingen: afbeelding ? [afbeelding] : [],
        max_boekingen_per_dag: parseInt(document.getElementById('np-max-per-dag').value, 10) || 1,
        availability_buffer_dagen: parseInt(document.getElementById('np-buffer-dagen').value, 10) || 0,
        zichtbaarheid: document.getElementById('np-zichtbaarheid').value,
      }),
    });
    document.getElementById('form-nieuw-product').reset();
    document.getElementById('nieuw-product-details').open = false;
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
      <button type="submit">Wijzigingen opslaan</button>
      <p id="product-bewerken-fout" class="foutmelding"></p>
    </form>

    <h4>Keuringen / certificaten</h4>
    <div class="keuringen-lijst">${keuringenHtml}</div>
    <form id="form-keuring-toevoegen" class="form-keuring-toevoegen">
      <label>Type<input type="text" id="kt-type" placeholder="bv. jaarlijkse keuring" /></label>
      <label>Vervaldatum<input type="date" id="kt-vervaldatum" /></label>
      <button type="submit">+ Toevoegen</button>
    </form>
    <p class="uitleg" style="margin-top:0.3rem">Certificaat als document (bv. PDF) bijvoegen komt in een latere fase.</p>
  `;

  document.getElementById('form-product-bewerken').addEventListener('submit', async (e) => {
    e.preventDefault();
    const elFout = document.getElementById('product-bewerken-fout');
    elFout.textContent = '';
    try {
      const afbeelding = document.getElementById('pb-afbeelding').value.trim();
      await api(`/api/producten/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({
          naam: document.getElementById('pb-naam').value,
          prijs: parseFloat(document.getElementById('pb-prijs').value) || 0,
          weekendprijs: document.getElementById('pb-weekendprijs').value !== '' ? parseFloat(document.getElementById('pb-weekendprijs').value) : null,
          afhaalprijs: document.getElementById('pb-afhaalprijs').value !== '' ? parseFloat(document.getElementById('pb-afhaalprijs').value) : null,
          afmetingen: document.getElementById('pb-afmetingen').value || null,
          afbeeldingen: afbeelding ? [afbeelding] : [],
          max_boekingen_per_dag: parseInt(document.getElementById('pb-max-per-dag').value, 10) || 1,
          availability_buffer_dagen: parseInt(document.getElementById('pb-buffer-dagen').value, 10) || 0,
          zichtbaarheid: document.getElementById('pb-zichtbaarheid').value,
        }),
      });
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

  modalProduct.hidden = false;
}

// ============================================================
// START
// ============================================================
bouwTijdstipOpties(document.getElementById('voorkeur-levering'), '10:00');
bouwTijdstipOpties(document.getElementById('voorkeur-afhaling'), '20:00');
checkSessie();
