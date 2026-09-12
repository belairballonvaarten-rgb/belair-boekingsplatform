-- Volgt op 011_website_inzendingen.sql: een inzending kan nu automatisch
-- omgezet worden naar een echte aanvraag (boeking, bron='website'). We
-- houden bij naar welke boeking ze omgezet is (voor een directe link ernaar
-- toe), en waarom het niet lukte als dat zo is (bv. product niet herkend).
ALTER TABLE website_inzendingen
    ADD COLUMN boeking_id UUID REFERENCES boekingen(id),
    ADD COLUMN verwerkings_fout TEXT;
