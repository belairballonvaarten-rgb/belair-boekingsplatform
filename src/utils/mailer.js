// Mail versturen via Jonas' eigen Microsoft 365-account (Graph API), zodat
// bulk-mails vanuit het platform écht vanaf zijn eigen mailadres vertrekken —
// i.p.v. via een aparte transactionele-mailprovider. Gebruikt de "client
// credentials"-OAuth-flow (app-only, geen inlogscherm nodig): het platform
// authenticeert zichzelf bij Microsoft met een App-registratie (zie
// SETUP-MICROSOFT365.md voor de opzet-stappen), en mag daarmee — met de juiste
// Mail.Send-toestemming — mail versturen namens één specifiek mailadres
// (AZURE_SENDER_EMAIL), zonder dat Jonas telkens moet inloggen.
//
// Vereiste omgevingsvariabelen (zie .env.example):
//   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_SENDER_EMAIL

const TOKEN_CACHE = { token: null, verlooptOp: 0 };

function controleerConfiguratie() {
  const ontbrekend = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_SENDER_EMAIL']
    .filter((naam) => !process.env[naam]);
  if (ontbrekend.length) {
    throw new Error(
      `Microsoft 365-koppeling is nog niet ingesteld (ontbrekende omgevingsvariabele(n): ${ontbrekend.join(', ')}). ` +
      'Zie SETUP-MICROSOFT365.md voor de opzet-stappen in Azure.'
    );
  }
}

// Haalt (en cachet, tot vlak voor het verloopt) een app-only toegangstoken op
// bij Microsoft — nodig voor elke Graph-aanroep.
async function haalToegangstoken() {
  const nu = Date.now();
  if (TOKEN_CACHE.token && nu < TOKEN_CACHE.verlooptOp - 60_000) {
    return TOKEN_CACHE.token;
  }
  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = process.env;
  const body = new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    client_secret: AZURE_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const resp = await fetch(`https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    const tekst = await resp.text().catch(() => '');
    throw new Error(`Kon geen toegangstoken ophalen bij Microsoft (${resp.status}): ${tekst.slice(0, 300)}`);
  }
  const data = await resp.json();
  TOKEN_CACHE.token = data.access_token;
  TOKEN_CACHE.verlooptOp = nu + data.expires_in * 1000;
  return TOKEN_CACHE.token;
}

// Verstuurt één mail via Graph, namens AZURE_SENDER_EMAIL.
async function verstuurMail({ naar, onderwerp, html }) {
  controleerConfiguratie();
  const token = await haalToegangstoken();
  const afzender = process.env.AZURE_SENDER_EMAIL;
  const resp = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(afzender)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: onderwerp,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: naar } }],
      },
      saveToSentItems: true,
    }),
  });
  if (!resp.ok) {
    const tekst = await resp.text().catch(() => '');
    throw new Error(`Versturen via Microsoft Graph mislukt (${resp.status}): ${tekst.slice(0, 300)}`);
  }
}

function isGeconfigureerd() {
  return ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_SENDER_EMAIL'].every((naam) => !!process.env[naam]);
}

module.exports = { verstuurMail, isGeconfigureerd };
