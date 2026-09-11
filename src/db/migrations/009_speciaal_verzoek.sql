-- "Speciaal verzoek"-markering voor een boeking (bv. allergie, extra toegangscode,
-- een moeilijke locatie, ...), zodat dit visueel opvalt (paars accent) in het
-- Boekingenoverzicht, de Aanvragen-inbox en het dossier zelf.
ALTER TABLE boekingen ADD COLUMN speciaal_verzoek BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE boekingen ADD COLUMN speciaal_verzoek_notitie TEXT;
