// Effectieve dag voor levering/afhaling-logistiek: standaard dezelfde dag als
// de huurperiode (boekingen.gewenste_datum_start/gewenste_datum_einde — die
// blijft bepalen wat er gefactureerd wordt), maar een bewust afwijkende
// leverdatum/afhaaldatum (leveringen.leverdatum_afwijkend/afhaaldatum_afwijkend,
// zie migratie 056 en de upsert-logica in routes/boekingen.js) weegt zwaarder:
// dat is de dag waarop de ploeg ECHT moet rijden, los van de met de klant
// afgesproken huurperiode (bv. plaatsing al een dag vroeger om logistieke
// redenen). leveringen.leveringstijd/afhaaltijd draagt die datum zelf al —
// hier dus gewoon de datumcomponent daarvan gebruiken wanneer gezet, anders
// terugvallen op de huurperiode.
//
// Verwacht dat de query de boekingen-tabel als "b" en de leveringen-tabel
// (LEFT JOIN, kan ontbreken) als "l" aliast. Gedeeld door dashboard.js,
// planning.js en sync.js (de koppeling met de leveringen-app), zodat die 3
// plekken altijd exact dezelfde dag tonen/doorsturen.
const EFFECTIEVE_DATUM_SQL = {
  levering: 'COALESCE(l.leveringstijd::date, b.gewenste_datum_start)',
  afhaling: 'COALESCE(l.afhaaltijd::date, b.gewenste_datum_einde)',
};

module.exports = { EFFECTIEVE_DATUM_SQL };
