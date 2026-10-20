-- Op vraag van Jonas: bij het aanmaken van een klant een optionele 2de
-- adreslijn kunnen invullen (bv. naam van de feestzaal of andere openbare
-- locatie), naast het gewone adres. Niet verplicht. Deze lijn wordt mee
-- opgenomen in het leveringsadres wanneer een boeking "zelfde adres als de
-- klant" gebruikt (zie src/routes/boekingen.js), zodat de plaatsers ook
-- effectief zien dat het om zo'n locatie gaat.
ALTER TABLE klanten ADD COLUMN adres_lijn2 TEXT;
