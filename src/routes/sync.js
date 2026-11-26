const express = require('express');
const { vereistIngelogd } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { voerSyncUit, isGeconfigureerd } = require('../utils/leveringenAppSync');
const { synchroniseerWebsiteBeschikbaarheid } = require('../utils/wordpressSync');

const router = express.Router();
router.use(vereistIngelogd);

router.get('/leveringen-app/status', asyncHandler(async (req, res) => {
  res.json({ geconfigureerd: isGeconfigureerd() });
}));

// Handmatige "Nu synchroniseren"-knop (Instellingen). De eigenlijke
// query/push/terugkoppel-logica zit sinds de automatische sync (zie
// utils/leveringenAppSync.js: plantAutoSync(), aangeroepen vanuit
// routes/planning.js, routes/dashboard.js en routes/boekingen.js bij elke
// wijziging die de planning raakt) niet meer hier, maar gedeeld in die
// utility — deze knop blijft gewoon als directe/handmatige terugvaloptie
// werken (bv. meteen willen zien dat het gelukt is, in plaats van de
// debounce van de automatische sync af te wachten).
router.post('/leveringen-app', asyncHandler(async (req, res) => {
  try {
    const resultaat = await voerSyncUit();
    res.json(resultaat);
  } catch (err) {
    res.status(err.status || 502).json({ fout: err.message, details: err.data });
  }
}));


// Handmatige testknop voor de website-sync (Instellingen) — dezelfde functie
// die automatisch ("vuur-en-vergeet") na elke boekingswijziging draait (zie
// utils/wordpressSync.js: plandWebsiteSync()), maar dan met het echte
// resultaat/foutmelding zichtbaar in de UI i.p.v. enkel in de Render-logs.
router.post('/website', asyncHandler(async (req, res) => {
  try {
    const resultaat = await synchroniseerWebsiteBeschikbaarheid({ fullSync: true });
    res.json(resultaat);
  } catch (err) {
    res.status(err.nietGeconfigureerd ? 400 : 502).json({ fout: err.message });
  }
}));

module.exports = router;
