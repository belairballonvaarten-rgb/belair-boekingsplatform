-- 'voertuig_bemanning' (migratie 020) had nog geen onderscheid tussen levering
-- en afhaling, maar Jonas wil dat een crewlid voor de levering in een ANDER
-- voertuig kan zitten dan voor de afhaling, op dezelfde dag, en dit op elk
-- moment kan wijzigen (nooit een voorstel/default van de vorige dag). Deze
-- tabel wordt nog nergens gebruikt (geen enkele rij ooit weggeschreven), dus
-- veilig om te herbouwen i.p.v. een aparte ALTER-reeks te doen.
DROP TABLE IF EXISTS voertuig_bemanning;

CREATE TABLE voertuig_bemanning (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voertuig_id    UUID NOT NULL REFERENCES voertuigen(id) ON DELETE CASCADE,
    gebruiker_id   INTEGER NOT NULL, -- verwijst naar de crew-app's 'users'-tabel (zelfde databank zodra stage 3 klaar is, maar bewust geen DB-FK over de 2 codebases heen)
    gebruiker_naam TEXT NOT NULL,    -- momentopname van de naam, voor weergave zonder afhankelijkheid van de crew-app-tabel
    datum          DATE NOT NULL,
    fase           TEXT NOT NULL CHECK (fase IN ('levering', 'afhaling')),
    aangemaakt_op  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (gebruiker_id, datum, fase) -- één voertuig per crewlid, per dag, per fase — wijzigen = upsert
);

CREATE INDEX idx_voertuig_bemanning_datum ON voertuig_bemanning (datum);
CREATE INDEX idx_voertuig_bemanning_voertuig_datum ON voertuig_bemanning (voertuig_id, datum);
