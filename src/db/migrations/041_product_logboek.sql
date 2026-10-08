-- Op vraag van Jonas, na een controle van de FOD Economie op buitenspeeldagen:
-- vanaf volgend jaar worden PLAATSERS van speeltoestellen (niet enkel de
-- inrichters van events) zelf gecontroleerd, en moet van elk springkasteel
-- ALTIJD een logboek onmiddellijk voorgelegd kunnen worden — met daarin
-- minstens de nazichten (opgeven dat ze het minimum 5x/jaar nakijken/
-- reinigen/drogen in het magazijn), plus herstellingen. Jonas hield dit tot
-- nu enkel op papier bij (en zelfs daar enkel de herstellingen) — dit maakt
-- er een digitaal logboek per product van, zodat hij bij een controle alles
-- meteen kan tonen/afdrukken i.p.v. te moeten zoeken.
CREATE TABLE product_logboek (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id    UUID NOT NULL REFERENCES producten(id) ON DELETE CASCADE,
    type          TEXT NOT NULL CHECK (type IN ('controle', 'reiniging', 'herstelling')),
    datum         DATE NOT NULL,
    notitie       TEXT,
    aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_logboek_product ON product_logboek (product_id);
-- Vooral gebruikt om snel "hoeveel controles dit jaar al?" per product op te
-- tellen (zie GET /api/producten/logboek-overzicht) — datum + type samen.
CREATE INDEX idx_product_logboek_type_datum ON product_logboek (type, datum);
