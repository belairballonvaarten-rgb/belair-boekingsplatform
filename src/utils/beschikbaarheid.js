const db = require('../db');

// Statussen die een product effectief "bezet" houden. 'geweigerd' telt niet mee.
// Bewust ruim gehouden: ook een nog niet geaccepteerde aanvraag blokkeert de datum,
// zodat er geen dubbele acceptatie kan gebeuren. Pas dit aan als dat niet gewenst is.
const BLOKKERENDE_STATUSSEN = [
  'nieuw',
  'in_behandeling',
  'geaccepteerd',
  'ingepland',
  'bevestigd',
  'betaalverzoek_verstuurd',
  'betaald_deels',
  'betaald_volledig',
  'gefactureerd',
];

function voegDagenToe(datum, dagen) {
  const d = new Date(datum);
  d.setUTCDate(d.getUTCDate() + dagen);
  return d;
}

function* dagenTussen(start, einde) {
  let d = new Date(start);
  const eindeD = new Date(einde);
  while (d <= eindeD) {
    yield new Date(d);
    d = voegDagenToe(d, 1);
  }
}

/**
 * Controleert of `product_id` beschikbaar is voor de periode [datumStart, datumEinde],
 * rekening houdend met max_boekingen_per_dag en availability_buffer_dagen.
 *
 * @param {string} productId
 * @param {string} datumStart  YYYY-MM-DD
 * @param {string} datumEinde  YYYY-MM-DD
 * @param {number} gevraagdAantal  hoeveel exemplaren van dit product worden aangevraagd
 * @param {string|null} exclBoekingId  boeking-id om te negeren (bij bewerken van een bestaande boeking)
 * @returns {Promise<{beschikbaar: boolean, reden?: string, bezetPerDag?: object}>}
 */
async function checkBeschikbaarheid(productId, datumStart, datumEinde, gevraagdAantal = 1, exclBoekingId = null) {
  const { rows: productRows } = await db.query('SELECT * FROM producten WHERE id = $1', [productId]);
  const product = productRows[0];
  if (!product) {
    return { beschikbaar: false, reden: 'Product niet gevonden' };
  }

  const buffer = product.availability_buffer_dagen || 0;
  // Zoekvenster verruimen met de buffer, zodat we ook botsingen door de buffer-periode vinden.
  const zoekStart = voegDagenToe(datumStart, -buffer);
  const zoekEinde = voegDagenToe(datumEinde, buffer);

  // Placeholders dynamisch nummeren i.p.v. hardcoded, zodat de tekst en de
  // parameterlijst altijd overeenkomen (ongeacht of exclBoekingId is meegegeven).
  const params = [productId, zoekEinde.toISOString().slice(0, 10), zoekStart.toISOString().slice(0, 10)];
  let exclClause = '';
  if (exclBoekingId) {
    params.push(exclBoekingId);
    exclClause = `AND b.id <> $${params.length}`;
  }
  params.push(BLOKKERENDE_STATUSSEN);
  const statusPlaceholder = `$${params.length}`;

  // LET OP: "gewenste_datum_start"/"gewenste_datum_einde" hieronder zijn de
  // EFFECTIEVE bezette dagen, niet noodzakelijk de huurperiode zelf — een
  // bewust afwijkende leverdatum/afhaaldatum (leveringen.leverdatum_afwijkend/
  // afhaaldatum_afwijkend, zie migratie 056 en utils/effectieveDatum.js) kan
  // de ploeg al een dag vroeger laten plaatsen of later laten afhalen dan de
  // met de klant afgesproken huurperiode. Die extra dag(en) moeten het product
  // ook effectief bezet houden voor ANDERE boekingen — anders kan Jonas per
  // ongeluk hetzelfde product dubbel inplannen op zo'n "logistieke" dag. De
  // huurperiode zelf (en dus de prijs) verandert hierdoor NIET, zie
  // berekenMeerdaagsePrijs in routes/boekingen.js — dit raakt enkel waar het
  // product als bezet geldt. LEAST/GREATEST zorgen ervoor dat een afwijkende
  // datum de bezette periode enkel kan VERRUIMEN, nooit verkleinen (een
  // eerdere afhaaldatum dan de huurperiode-einddatum mag het product dus niet
  // vroeger "vrij" maken dan de huurperiode zelf).
  const { rows: overlappendeBoekingen } = await db.query(
    `
    SELECT b.id,
           LEAST(b.gewenste_datum_start, COALESCE(l.leveringstijd::date, b.gewenste_datum_start)) AS gewenste_datum_start,
           GREATEST(b.gewenste_datum_einde, COALESCE(l.afhaaltijd::date, b.gewenste_datum_einde)) AS gewenste_datum_einde,
           bp.aantal
    FROM boekingen b
    JOIN boeking_producten bp ON bp.boeking_id = b.id
    LEFT JOIN leveringen l ON l.boeking_id = b.id
    WHERE bp.product_id = $1
      AND b.status = ANY(${statusPlaceholder})
      AND LEAST(b.gewenste_datum_start, COALESCE(l.leveringstijd::date, b.gewenste_datum_start)) <= $2
      AND GREATEST(b.gewenste_datum_einde, COALESCE(l.afhaaltijd::date, b.gewenste_datum_einde)) >= $3
      ${exclClause}
    `,
    params
  );

  // De concrete boekingen die de botsing veroorzaken — bv. om vanuit het
  // Beschikbaarheidsoverzicht rechtstreeks naar het dossier van "reeds bezet"
  // door te kunnen klikken (zie public/js/app.js, ververBeschikbaarheidsoverzicht()).
  const overlappendeBoekingIds = overlappendeBoekingen.map((b) => ({
    id: b.id,
    gewenste_datum_start: b.gewenste_datum_start,
    gewenste_datum_einde: b.gewenste_datum_einde,
  }));

  // Per dag in de aangevraagde periode (zonder buffer) tellen hoeveel er al bezet is,
  // rekening houdend met de buffer rond elke bestaande boeking.
  const bezetPerDag = {};
  for (const dag of dagenTussen(datumStart, datumEinde)) {
    const dagStr = dag.toISOString().slice(0, 10);
    let bezet = 0;
    for (const boeking of overlappendeBoekingen) {
      const boekingStartMetBuffer = voegDagenToe(boeking.gewenste_datum_start, -buffer);
      const boekingEindeMetBuffer = voegDagenToe(boeking.gewenste_datum_einde, buffer);
      if (dag >= boekingStartMetBuffer && dag <= boekingEindeMetBuffer) {
        bezet += boeking.aantal;
      }
    }
    bezetPerDag[dagStr] = bezet;
    if (bezet + gevraagdAantal > product.max_boekingen_per_dag) {
      return {
        beschikbaar: false,
        reden: `Niet genoeg voorraad op ${dagStr}: ${bezet} bezet + ${gevraagdAantal} gevraagd > max ${product.max_boekingen_per_dag}`,
        bezetPerDag,
        overlappendeBoekingen: overlappendeBoekingIds,
      };
    }
  }

  return { beschikbaar: true, bezetPerDag, overlappendeBoekingen: overlappendeBoekingIds };
}

/**
 * Zelfde berekening als checkBeschikbaarheid(), maar dan voor ALLE producten
 * tegelijk in één databankbevraging — gebruikt door de productenkiezer (zie
 * public/js/app.js) om per product meteen het werkelijk resterend aantal te
 * tonen i.p.v. per product een aparte aanroep te doen (traag bij veel
 * producten). Resultaat per product: het MINIMUM, over elke dag in de
 * periode, van (max_boekingen_per_dag - reeds bezet die dag) — kan negatief
 * zijn als er al overboekt is (zie force_overboeken bij het aanmaken/wijzigen
 * van een boeking); de UI toont dat dan gewoon als "0 nog vrij".
 *
 * @param {string} datumStart  YYYY-MM-DD
 * @param {string} datumEinde  YYYY-MM-DD
 * @param {string|null} exclBoekingId  boeking-id om te negeren (bij een bestaande boeking)
 * @returns {Promise<Array<{product_id: string, resterend: number, max: number}>>}
 */
async function berekenResterendeAantallen(datumStart, datumEinde, exclBoekingId = null) {
  const { rows: producten } = await db.query(
    'SELECT id, max_boekingen_per_dag, availability_buffer_dagen FROM producten'
  );
  if (!producten.length) return [];

  // Eén query voor de overlappende boekingen van ALLE producten tegelijk — de
  // buffer-afhankelijke grens zit rechtstreeks in de voorwaarde (elk product
  // zijn eigen availability_buffer_dagen telt automatisch mee), zelfde opzet
  // als de buffer-check in checkBeschikbaarheid() hierboven.
  const params = [datumStart, datumEinde];
  let exclClause = '';
  if (exclBoekingId) {
    params.push(exclBoekingId);
    exclClause = `AND b.id <> $${params.length}`;
  }
  params.push(BLOKKERENDE_STATUSSEN);
  const statusPlaceholder = `$${params.length}`;

  // Zelfde effectieve-bezette-periode-redenering als in checkBeschikbaarheid()
  // hierboven: een afwijkende leverdatum/afhaaldatum (migratie 056) verruimt
  // de bezette periode van een ANDERE boeking, nooit de prijs van die boeking.
  const { rows: overlappend } = await db.query(
    `
    SELECT bp.product_id,
           LEAST(b.gewenste_datum_start, COALESCE(l.leveringstijd::date, b.gewenste_datum_start)) AS gewenste_datum_start,
           GREATEST(b.gewenste_datum_einde, COALESCE(l.afhaaltijd::date, b.gewenste_datum_einde)) AS gewenste_datum_einde,
           bp.aantal
    FROM boekingen b
    JOIN boeking_producten bp ON bp.boeking_id = b.id
    JOIN producten p ON p.id = bp.product_id
    LEFT JOIN leveringen l ON l.boeking_id = b.id
    WHERE b.status = ANY(${statusPlaceholder})
      AND LEAST(b.gewenste_datum_start, COALESCE(l.leveringstijd::date, b.gewenste_datum_start)) <= ($2::date + (p.availability_buffer_dagen || ' days')::interval)
      AND GREATEST(b.gewenste_datum_einde, COALESCE(l.afhaaltijd::date, b.gewenste_datum_einde)) >= ($1::date - (p.availability_buffer_dagen || ' days')::interval)
      ${exclClause}
    `,
    params
  );

  const overlappendPerProduct = new Map();
  for (const rij of overlappend) {
    if (!overlappendPerProduct.has(rij.product_id)) overlappendPerProduct.set(rij.product_id, []);
    overlappendPerProduct.get(rij.product_id).push(rij);
  }

  return producten.map((product) => {
    const boekingen = overlappendPerProduct.get(product.id) || [];
    const buffer = product.availability_buffer_dagen || 0;
    let resterend = product.max_boekingen_per_dag;
    for (const dag of dagenTussen(datumStart, datumEinde)) {
      let bezet = 0;
      for (const boeking of boekingen) {
        const start = voegDagenToe(boeking.gewenste_datum_start, -buffer);
        const einde = voegDagenToe(boeking.gewenste_datum_einde, buffer);
        if (dag >= start && dag <= einde) bezet += boeking.aantal;
      }
      resterend = Math.min(resterend, product.max_boekingen_per_dag - bezet);
    }
    return { product_id: product.id, resterend, max: product.max_boekingen_per_dag };
  });
}

module.exports = { checkBeschikbaarheid, berekenResterendeAantallen, BLOKKERENDE_STATUSSEN };
