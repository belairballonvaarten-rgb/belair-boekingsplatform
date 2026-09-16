-- De crew-app laat de chauffeur nu al aanvinken hoe een klant ter plekke betaalt
-- (reeds voldaan / cash / overschrijving / nog een factuur opmaken). Dat is een
-- praktische aantekening voor de chauffeur/Jonas, GEEN vervanging van de
-- officiële betaling/facturatie (tabel "betalingen", zie ook migratie 020's
-- opmerking bij de checklist-kolommen — zelfde principe: registreert enkel de
-- vaststelling, verandert nooit automatisch het echte saldo). Bewust puur
-- informatief zodat dit nooit per ongeluk de officiële facturatie kan verstoren;
-- Jonas verwerkt dit zelf manueel in het dossier zoals hij dat nu ook al doet.
ALTER TABLE leveringen ADD COLUMN betaling_ter_plekke_status TEXT
    CHECK (betaling_ter_plekke_status IN ('reeds-voldaan', 'voldaan-cash', 'voldaan-overschrijving', 'factuur'));
ALTER TABLE leveringen ADD COLUMN betaling_ter_plekke_opmerking TEXT;
