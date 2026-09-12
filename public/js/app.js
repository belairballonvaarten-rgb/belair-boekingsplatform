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
  if (status === 'betaald_volledig' && saldoOpenstaand != null && Number(saldoOpenstaand) > 0.01) {
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
  { label: 'Klaar voor levering', kleur: 'groen', statussen: ['betaald_volledig', 'gefactureerd'] },
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

const TIJDSTIP_HHMM_PATROON = /^([01]\d|2[0-3]):(00|15|30|45)$/;

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
const views = ['aanvragen', 'boekingen', 'beschikbaarheid', 'nieuwe-boeking', 'producten', 'webinzendingen', 'boeking-detail'];

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
  if (naam === 'webinzendingen') laadWebinzendingen();
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
function huidigeBoekingenFilterParams() {
  const status = document.getElementById('filter-status').value;
  const vanaf = document.getElementById('filter-vanaf').value;
  const tot = document.getElementById('filter-tot').value;
  const openSaldo = document.getElementById('filter-open-saldo').checked;
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (vanaf) params.set('vanaf', vanaf);
  if (tot) params.set('tot', tot);
  // Los van de gekozen periode: zowel toekomstige als reeds verlopen boekingen
  // met een openstaand saldo — daarom geen eigen datum-restrictie, enkel te
  // combineren met de bestaande periode-snelfilters/Vanaf-Tot hierboven.
  if (openSaldo) params.set('open_saldo', '1');
  return params;
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

// Korte code voor de "Ondergrond"-kolom in het boekingenoverzicht — enkel het
// onderscheid dat er praktisch toe doet bij het plaatsen (vastpinnen met
// grondpinnen kan op gras, op een harde ondergrond (steen/klinkers/...) niet).
// "O/G" = ondergrond gras, "O/H" = ondergrond hard (alle andere types).
function ondergrondAfkorting(type) {
  if (!type) return '—';
  return type.trim().toLowerCase() === 'gras' ? 'O/G' : 'O/H';
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

async function laadBoekingenOverzicht() {
  const params = huidigeBoekingenFilterParams();
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
    tbody.innerHTML = '<tr><td colspan="10" class="leeg-bericht">Geen boekingen gevonden.</td></tr>';
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
    tr.addEventListener('click', () => openDetail(b.id));
    tbody.appendChild(tr);
  }
}

document.getElementById('btn-filter-toepassen').addEventListener('click', laadBoekingenOverzicht);

// Exporteren (Excel/CSV) en afdrukken van het overzicht — op basis van dezelfde
// status/periode-filter die nu op het scherm staat.
document.getElementById('btn-boekingen-exporteren').addEventListener('click', () => {
  const params = huidigeBoekingenFilterParams();
  window.location.href = `/api/boekingen/export.csv?${params.toString()}`;
});

document.getElementById('btn-boekingen-afdrukken').addEventListener('click', () => {
  window.print();
});

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
  const productenHtml = b.producten
    .map((p) => `<div class="detail-rij product-regel"><span><strong>${p.product_naam}</strong>${p.aantal > 1 ? ' × ' + p.aantal : ''}</span><span>${fmtEuro(p.prijs)} <button type="button" class="linkbtn gevaar btn-product-verwijderen" data-id="${p.id}" title="Product verwijderen">✕</button></span></div>`)
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
      <div class="detail-kolom detail-kolom-producten paneel">
        <h4>Producten</h4>
        <div id="detail-producten-lijst">${productenHtml || '<p class="leeg-bericht">Geen producten</p>'}</div>
        <div class="product-toevoegen-rij">
          <select id="dp-categorie">${bouwCategorieOpties(dpEersteCategorie)}</select>
          <select id="dp-product">${bouwModelOpties(dpEersteCategorie, undefined, dpOnbeschikbaar)}</select>
          <button type="button" id="btn-product-toevoegen" class="secundair">+ Toevoegen</button>
        </div>
        <p id="product-toevoegen-fout" class="foutmelding"></p>
      </div>

      <div class="detail-kolom detail-kolom-financieel paneel">
        <h4>Periode</h4>
        <div id="kalender-dossier-periode" class="kalender-widget kalender-widget-compact"></div>
        <p id="periode-fout" class="foutmelding"></p>

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

    <div class="detail-kolom detail-kolom-klant paneel">
      <div class="detail-kolom-kop">
        <h4>Klantgegevens</h4>
        <button type="button" id="btn-klantgegevens-bewerken" class="linkbtn">✎ Bewerken</button>
      </div>

      <div id="klantgegevens-weergave" class="grid-2">
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

      <form id="form-klantgegevens-bewerken" class="grid-2" hidden>
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
        <label class="checkbox" style="grid-column: 1 / -1;">
          <input type="checkbox" id="kg-speciaal-verzoek" ${b.speciaal_verzoek ? 'checked' : ''} /> Speciaal verzoek voor deze boeking (paars sterretje in de overzichten)
        </label>
        <label style="grid-column: 1 / -1;">Toelichting speciaal verzoek<input type="text" id="kg-speciaal-verzoek-notitie" value="${b.speciaal_verzoek_notitie || ''}" placeholder="bv. allergie, extra toegangscode, moeilijke locatie, ..." /></label>
        <div class="form-acties">
          <button type="submit">Opslaan</button>
          <button type="button" id="btn-klantgegevens-annuleren" class="linkbtn">Annuleren</button>
        </div>
        <p id="klantgegevens-fout" class="foutmelding"></p>
      </form>
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

    <div class="paneel">
      <h4>Opmerkingen</h4>
      <form id="form-notities">
        <textarea id="dd-notities" rows="3" placeholder="Interne opmerkingen over deze boeking...">${b.notities || ''}</textarea>
        <button type="submit">Opmerkingen opslaan</button>
      </form>
    </div>

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
  document.getElementById('dp-categorie').addEventListener('change', (e) => {
    document.getElementById('dp-product').innerHTML = bouwModelOpties(e.target.value, undefined, dpOnbeschikbaar);
  });
  document.getElementById('btn-product-toevoegen').addEventListener('click', async () => {
    const elFout = document.getElementById('product-toevoegen-fout');
    elFout.textContent = '';
    const productId = document.getElementById('dp-product').value;
    if (!productId) { elFout.textContent = 'Kies eerst een model.'; return; }
    try {
      // Aantal is hier altijd 1: van elk springkasteel-model kan een aanvraag
      // maar 1 exemplaar kiezen (ook al hebben we van sommige modellen meerdere
      // fysieke exemplaren in voorraad). Enkel bij later toegevoegd meubilair
      // (waar een echt aantal zin heeft) komt er hier opnieuw een aantal-veld.
      await api(`/api/boekingen/${boekingId}/producten`, {
        method: 'POST',
        body: JSON.stringify({ product_id: productId, aantal: 1 }),
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
// START
// ============================================================
bouwTijdstipOpties(document.getElementById('voorkeur-levering'), '10:00');
bouwTijdstipOpties(document.getElementById('voorkeur-afhaling'), '20:00');
checkSessie();
