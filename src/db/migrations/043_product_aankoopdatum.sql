-- "kostprijs" bestond al (migratie 001, voor marge-berekening) maar stond
-- nergens in het scherm. Jonas wil nu ook zien WANNEER een product
-- terugverdiend is — daarvoor is naast de kostprijs ook de aankoopdatum
-- nodig (vanaf wanneer begint de omzet mee te tellen). Zie GET
-- /api/producten/:id/terugverdiend.
ALTER TABLE producten ADD COLUMN aankoopdatum DATE;
