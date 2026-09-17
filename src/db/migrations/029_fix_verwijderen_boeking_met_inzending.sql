-- Bug: "Boeking volledig verwijderen" gaf een servererror zodra die boeking
-- via het website-formulier binnenkwam. Oorzaak: website_inzendingen.boeking_id
-- (toegevoegd in migratie 012) verwijst naar boekingen(id) zonder ON DELETE-
-- actie -> Postgres weigert de DELETE (foreign key constraint) zodra er nog
-- een inzending naar die boeking verwijst, en dat komt bij Jonas naar boven
-- als de generieke "Er ging iets mis op de server"-melding.
--
-- Fix: bij het verwijderen van een boeking laten we de bijhorende ruwe
-- website-inzending gewoon staan (dat blijft z'n eigen historiek, "enkel ter
-- observatie" zoals elders in de code staat) maar ontkoppelen we de link
-- ernaar (boeking_id -> NULL) in plaats van de verwijdering te blokkeren.
ALTER TABLE website_inzendingen DROP CONSTRAINT website_inzendingen_boeking_id_fkey;
ALTER TABLE website_inzendingen
  ADD CONSTRAINT website_inzendingen_boeking_id_fkey
  FOREIGN KEY (boeking_id) REFERENCES boekingen(id) ON DELETE SET NULL;
