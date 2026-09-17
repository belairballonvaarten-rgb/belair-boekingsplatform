-- Eén gedeelde e-mailhandtekening (ruwe HTML) — op vraag van Jonas, die zijn
-- bestaande (Outlook-)handtekening wil hergebruiken. Wordt automatisch
-- onderaan elke via een template verstuurde mail geplakt (zie
-- haalIngevuldeTemplateOp() in routes/boekingen.js). Eén rij volstaat: een
-- handtekening is normaal overal dezelfde, dus geen aparte tabel per template.
-- De "boolean primary key + CHECK"-truc hieronder dwingt af dat er nooit meer
-- dan 1 rij kan bestaan.
CREATE TABLE platform_instellingen (
    id                 BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
    email_handtekening TEXT,
    bijgewerkt_op      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform_instellingen (id) VALUES (true);
