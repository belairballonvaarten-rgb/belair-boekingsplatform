-- Dagoverzicht: "Nog te factureren" moet een doorlopende lijst worden (ook
-- oudere, nog niet afgehandelde openstaande saldi blijven tonen, niet enkel
-- die van de gekozen dag), met een checkbox om een boeking af te vinken zodra
-- de factuur/opvolging effectief gebeurd is — pas dan verdwijnt ze uit de lijst.
-- Losstaand van de officiële boekingsstatus (die kan Jonas nog gewoon apart
-- doorschuiven in het dossier): dit is puur een "afgehandeld op mijn
-- dagelijkse checklist"-vinkje.
ALTER TABLE leveringen ADD COLUMN facturatie_afgehandeld BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE leveringen ADD COLUMN facturatie_afgehandeld_op TIMESTAMPTZ;
