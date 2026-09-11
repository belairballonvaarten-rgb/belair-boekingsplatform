-- Uitbreiding van het boekingsdossier: transportkost/toeslag op de boeking zelf,
-- een log van betalingstransacties (voor de prijstabel + "nieuwe betaling"-widget),
-- en een communicatielog (mails/telefoon/notities bijhouden per boeking).

ALTER TABLE boekingen ADD COLUMN transportkost NUMERIC(10,2);
ALTER TABLE boekingen ADD COLUMN toeslag_korting NUMERIC(10,2);
ALTER TABLE boekingen ADD COLUMN afstand_km NUMERIC(6,2); -- afstand tot Overmere; later automatisch via Google Maps

-- Eén 'betalingen'-overzichtsrecord per boeking (wordt bijgewerkt bij elke nieuwe
-- betalingstransactie), zodat bestaande rapportages op deze tabel kunnen blijven steunen.
ALTER TABLE betalingen ADD CONSTRAINT betalingen_boeking_id_key UNIQUE (boeking_id);

CREATE TABLE betaling_transacties (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    boeking_id    UUID NOT NULL REFERENCES boekingen(id) ON DELETE CASCADE,
    bedrag        NUMERIC(10,2) NOT NULL,
    opmerking     TEXT,
    aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_betaling_transacties_boeking ON betaling_transacties (boeking_id);

CREATE TABLE communicatie (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    boeking_id     UUID NOT NULL REFERENCES boekingen(id) ON DELETE CASCADE,
    type           TEXT NOT NULL DEFAULT 'notitie'
        CHECK (type IN ('email', 'telefoon', 'sms', 'notitie')),
    richting       TEXT NOT NULL DEFAULT 'intern'
        CHECK (richting IN ('uitgaand', 'inkomend', 'intern')),
    onderwerp      TEXT,
    inhoud         TEXT,
    aangemaakt_op  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_communicatie_boeking ON communicatie (boeking_id);
