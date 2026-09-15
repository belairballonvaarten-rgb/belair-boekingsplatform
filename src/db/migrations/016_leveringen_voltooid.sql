-- Eenvoudige "afgevinkt"-status per richting (levering/afhaling), manueel aan
-- te vinken vanop het Dashboard zodat een kaart groen kleurt zodra het gebeurd
-- is. Dezelfde kolommen kan de leveringen-app straks automatisch bijwerken.
ALTER TABLE leveringen ADD COLUMN IF NOT EXISTS levering_voltooid BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE leveringen ADD COLUMN IF NOT EXISTS afhaling_voltooid BOOLEAN NOT NULL DEFAULT false;
