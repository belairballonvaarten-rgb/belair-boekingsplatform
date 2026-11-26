-- Onthoudt of de prijs van een productregel manueel is ingesteld (bv. een
-- korting die Jonas zelf gaf via "Prijs en/of aantal bijsturen" in het
-- dossier, of een expliciete prijs bij het toevoegen van een product) i.p.v.
-- de automatische dagprijs/weekendprijs-formule. Nodig omdat PUT /:id
-- (boeking-periode wijzigen) voorheen ALTIJD alle productregel-prijzen
-- herberekende op basis van de nieuwe periode, en daarbij zo'n manuele
-- prijs stilletjes overschreef — gemeld door Jonas. Default false: bestaande
-- regels blijven gewoon meegerekend bij een volgende periodewijziging, zoals
-- voorheen.
ALTER TABLE boeking_producten ADD COLUMN IF NOT EXISTS prijs_handmatig BOOLEAN NOT NULL DEFAULT false;
