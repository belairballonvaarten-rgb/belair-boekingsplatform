// Automatische prijsberekening op basis van het aantal dagen van de gekozen
// periode. Regel zoals Jonas ze hanteert: de "prijs" op een product is de
// dagprijs, en de weekendprijs is eigenlijk de prijs voor 2 dagen. Vanaf 3
// dagen worden weekend- en dagprijzen gewoon gecombineerd:
//   1 dag  -> dagprijs
//   2 dagen -> weekendprijs
//   3 dagen -> weekendprijs + dagprijs
//   4 dagen -> 2x weekendprijs
//   5 dagen -> 2x weekendprijs + dagprijs
//   ... enz. (telkens een paar dagen = weekendprijs, een overschot van 1 dag = dagprijs)
// Dit is een automatisch VOORSTEL bij het toevoegen van een product of het
// wijzigen van de periode — Jonas controleert dit en stuurt het handmatig bij
// per productregel waar nodig (bv. bij een uitzondering of afwijkende afspraak).

// Aantal dagen van een periode, inclusief begin- en einddatum (bv. maandag t.e.m.
// dinsdag = 2 dagen). Zonder einddatum (of gelijk aan de startdatum) = 1 dag.
function berekenAantalDagen(datumStart, datumEinde) {
  if (!datumStart) return 1;
  const start = new Date(datumStart);
  const einde = datumEinde ? new Date(datumEinde) : start;
  if (Number.isNaN(start.getTime()) || Number.isNaN(einde.getTime())) return 1;
  const verschilDagen = Math.round((einde.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  return verschilDagen > 0 ? verschilDagen : 1;
}

// product moet minstens { prijs, weekendprijs } bevatten (weekendprijs mag null zijn).
function berekenMeerdaagsePrijs(product, aantalDagen) {
  const dagprijs = Number(product.prijs) || 0;
  if (!aantalDagen || aantalDagen <= 1) return dagprijs;
  const weekendprijs = product.weekendprijs != null ? Number(product.weekendprijs) : null;
  if (weekendprijs == null) {
    // Geen weekendtarief gekend voor dit product -> gewoon dagprijs x aantal dagen.
    return Math.round(dagprijs * aantalDagen * 100) / 100;
  }
  const paren = Math.floor(aantalDagen / 2);
  const rest = aantalDagen % 2;
  return Math.round((paren * weekendprijs + rest * dagprijs) * 100) / 100;
}

module.exports = { berekenAantalDagen, berekenMeerdaagsePrijs };
