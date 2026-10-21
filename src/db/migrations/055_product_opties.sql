-- Op vraag van Jonas: een product moet een keuzelijst van opties kunnen
-- hebben, die bij het boeken zelf gekozen wordt — bv. bij de Super Dino "met"
-- of "zonder zwembadje" (met eventuele meerkost), of bij statafels "met/zonder
-- hoezen" of "wit/zwart". Bewust max. 1 keuzelijst per product (bevestigd door
-- Jonas) — dus geen aparte "optiegroep"-tabel, elke rij in product_opties is
-- gewoon één keuze binnen de (enige) keuzelijst van dat product.
--
-- optie_label op het product zelf is de vrije naam van die keuzelijst (bv.
-- "Zwembadje" of "Hoezen"), getoond boven de keuze-dropdown bij het boeken —
-- optioneel, een product kan keuzes hebben zonder expliciet label.
ALTER TABLE producten ADD COLUMN optie_label TEXT;

-- UUID (net als alle andere tabellen hier, zie 001_init.sql) i.p.v. SERIAL —
-- anders kan de foreign key naar producten(id)/product_opties(id) hieronder
-- niet aangemaakt worden (incompatibel kolomtype).
CREATE TABLE product_opties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES producten(id) ON DELETE CASCADE,
  naam TEXT NOT NULL,
  meerkost NUMERIC(10,2) NOT NULL DEFAULT 0,
  standaard BOOLEAN NOT NULL DEFAULT false,
  aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_opties_product_id ON product_opties(product_id);
-- Maximum 1 standaard-keuze per product (de databank bewaakt dit mee, de
-- backend zorgt er zelf voor dat een vorige standaard-keuze eerst afgezet
-- wordt vóór een nieuwe aangezet wordt).
CREATE UNIQUE INDEX idx_product_opties_een_standaard ON product_opties(product_id) WHERE standaard;

-- Gekozen optie op een boekingsregel: optie_keuze_id verwijst terug naar de
-- keuze (voor eventueel later bewerken), optie_naam/optie_meerkost zijn een
-- VASTE momentopname (zelfde patroon als bp.prijs al niet live uit producten
-- herberekend wordt) — zo blijft een oude boeking correct tonen welke optie
-- gekozen was, ook als Jonas die keuze later hernoemt, de prijs aanpast, of
-- verwijdert (ON DELETE SET NULL: enkel de koppeling verdwijnt, optie_naam/
-- optie_meerkost blijven gewoon staan).
ALTER TABLE boeking_producten
  ADD COLUMN optie_keuze_id UUID REFERENCES product_opties(id) ON DELETE SET NULL,
  ADD COLUMN optie_naam TEXT,
  ADD COLUMN optie_meerkost NUMERIC(10,2);
