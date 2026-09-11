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
const views = ['aanvragen', 'boekingen', 'nieuwe-boeking'];

function wisselView(naam) {
  views.forEach((v) => {
    document.getElementById(`view-${v}`).hidden = v !== naam;
  });
  document.querySelectorAll('.navbtn').forEach((btn) => {
    btn.classList.toggle('actief', btn.dataset.view === naam);
  });
  if (naam === 'aanvragen') laadAanvragen();
  if (naam === 'boekingen') laadBoekingenOverzicht();
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
    sluitModal();
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
  const tbody = document.getElementById('tabel-boekingen');
  tbody.innerHTML = '';
  if (!boekingen.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="leeg-bericht">Geen boekingen gevonden.</td></tr>';
    return;
  }
  for (const b of boekingen) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDatum(b.gewenste_datum_start)}</td>
      <td>${b.klant_naam}</td>
      <td>—</td>
      <td><span class="status-pill">${STATUS_LABELS[b.status]}</span></td>
      <td>${b.leveringsadres || '—'}</td>
      <td>Bekijk →</td>
    `;
    tr.addEventListener('click', () => openDetail(b.id));
    tbody.appendChild(tr);
  }
}

document.getElementById('btn-filter-toepassen').addEventListener('click', laadBoekingenOverzicht);

// ============================================================
// BOEKING DETAIL (modal)
// ============================================================
const modal = document.getElementById('modal-detail');
document.getElementById('btn-modal-sluiten').addEventListener('click', sluitModal);
modal.addEventListener('click', (e) => { if (e.target === modal) sluitModal(); });

function sluitModal() { modal.hidden = true; }

async function openDetail(boekingId) {
  const b = await api(`/api/boekingen/${boekingId}`);
  const inhoud = document.getElementById('modal-detail-inhoud');

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

  inhoud.innerHTML = `
    <h3>${b.klant_naam} <span class="status-pill">${STATUS_LABELS[b.status]}</span></h3>
    <div class="detail-rij"><span>Periode</span><span>${fmtDatum(b.gewenste_datum_start)} – ${fmtDatum(b.gewenste_datum_einde)}</span></div>
    <div class="detail-rij"><span>Telefoon</span><span>${b.klant_telefoon || '—'}</span></div>
    <div class="detail-rij"><span>E-mail</span><span>${b.klant_email || '—'}</span></div>
    <div class="detail-rij"><span>Leveringswijze</span><span>${b.leveringswijze || '—'}</span></div>
    <div class="detail-rij"><span>Adres</span><span>${b.leveringsadres || '—'}</span></div>
    <div class="detail-rij"><span>Ondergrond</span><span>${b.type_ondergrond || '—'}</span></div>
    <div class="detail-rij"><span>Toegankelijkheid</span><span>${b.toegankelijkheid || '—'}</span></div>
    <div class="detail-rij"><span>Voorkeur levering</span><span>${b.voorkeur_tijdstip_levering || '—'}</span></div>
    <div class="detail-rij"><span>Voorkeur afhaling</span><span>${b.voorkeur_tijdstip_afhaling || '—'}</span></div>
    <div class="detail-rij"><span>Huurvoorwaarden</span><span>${b.huurvoorwaarden_geaccepteerd ? 'Geaccepteerd' : 'Niet geaccepteerd'}</span></div>
    <div class="detail-rij"><span>Notities</span><span>${b.notities || '—'}</span></div>

    <h4>Producten</h4>
    ${productenHtml || '<p class="leeg-bericht">Geen producten</p>'}

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

  modal.hidden = false;
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

// Productrijen
function nieuweProductRij() {
  const rij = document.createElement('div');
  rij.className = 'product-rij';
  const opties = productenCache.map((p) => `<option value="${p.id}">${p.naam}</option>`).join('');
  rij.innerHTML = `
    <label>Product<select class="rij-product">${opties}</select></label>
    <label>Aantal<input type="number" class="rij-aantal" value="1" min="1" /></label>
    <button type="button" class="verwijder">✕</button>
  `;
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

    const boeking = await api('/api/boekingen', {
      method: 'POST',
      body: JSON.stringify({
        klant_id: klantId,
        producten,
        gewenste_datum_start: document.getElementById('datum-start').value,
        gewenste_datum_einde: document.getElementById('datum-einde').value || document.getElementById('datum-start').value,
        leveringswijze: document.getElementById('leveringswijze').value,
        leveringsadres: document.getElementById('leveringsadres').value || null,
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
    nieuweProductRij();
  } catch (err) {
    elFout.textContent = err.message;
  }
});

// ============================================================
// START
// ============================================================
checkSessie();
