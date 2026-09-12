-- Toeslag/korting kan voortaan een vast bedrag (€) of een percentage (%) zijn.
-- Percentage wordt toegepast op het productensubtotaal (niet op transportkost).
-- 'bedrag' blijft het standaardgedrag voor alle bestaande boekingen.
ALTER TABLE boekingen ADD COLUMN toeslag_korting_type TEXT NOT NULL DEFAULT 'bedrag'
  CHECK (toeslag_korting_type IN ('bedrag', 'percentage'));
