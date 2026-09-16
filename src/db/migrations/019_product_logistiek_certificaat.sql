-- Extra logistieke gegevens per product, nodig om een laadlijst per voertuig
-- te kunnen opstellen (motorzwaarte/gewicht voor het inschatten van het
-- laadvermogen, en het benodigde materiaal per ondergrondtype).
ALTER TABLE producten ADD COLUMN motor_type TEXT; -- bv. 'Standaard motor' / 'Zware motor'
ALTER TABLE producten ADD COLUMN gewicht_kg NUMERIC(10,2);
ALTER TABLE producten ADD COLUMN aantal_valmatten INTEGER; -- bij plaatsing op harde ondergrond
ALTER TABLE producten ADD COLUMN aantal_piketten INTEGER; -- bij plaatsing op zachte ondergrond
ALTER TABLE producten ADD COLUMN aantal_zandzakken INTEGER; -- bij plaatsing op harde ondergrond

-- Keuringscertificaat als bestand bij het product zelf (i.p.v. enkel de
-- vervaldatum in "keuringen"), zodat het op aanvraag meteen naar een klant
-- doorgestuurd kan worden. Rechtstreeks in de databank bewaard (bytea) —
-- geen aparte bestandsopslag nodig, en werkt zo overal waar de app draait.
ALTER TABLE producten ADD COLUMN certificaat_bestand BYTEA;
ALTER TABLE producten ADD COLUMN certificaat_bestandsnaam TEXT;
ALTER TABLE producten ADD COLUMN certificaat_mimetype TEXT;
ALTER TABLE producten ADD COLUMN certificaat_upload_op TIMESTAMPTZ;
