-- Op vraag van Jonas: naast de manueel ingevoerde "grote controles" mag ook
-- elke effectief uitgevoerde plaatsing meetellen als visuele controle in het
-- logboek — de plaatser controleert het kasteel sowieso telkens bij het
-- opzetten (verankering, valmatten, kabels, netjes — zie de plaatsing_*
-- velden op 'leveringen', migratie 020). Zijn letterlijke redenering: "ik kan
-- ervanuit gaan dat wanneer het springkasteel geplaatst wordt er telkens een
-- visuele controle gebeurt door onze plaatsers", dus dat mag gewoon mee in
-- het logboek i.p.v. enkel apart ingevoerde controles.
--
-- Dit gebeurt via een DATABASE-trigger (i.p.v. applicatiecode in dit
-- platform) omdat het de leveringen-app is die 'plaatsing_bevestigd' zet
-- (de crew bevestigt de plaatsingschecklist daar) — een trigger op de
-- gedeelde 'leveringen'-tabel werkt sowieso, ongeacht welke van de twee apps
-- de UPDATE uitvoert, zonder dat de twee codebases iets van elkaar hoeven te
-- weten.

-- 'plaatsing' toevoegen als geldig logboek-type, naast de bestaande 3
-- (controle/reiniging/herstelling — die blijven uitsluitend manueel
-- invoerbaar, zie LOGBOEK_TYPES in routes/producten.js).
ALTER TABLE product_logboek DROP CONSTRAINT product_logboek_type_check;
ALTER TABLE product_logboek ADD CONSTRAINT product_logboek_type_check
    CHECK (type IN ('controle', 'reiniging', 'herstelling', 'plaatsing'));

-- Herkomst bijhouden (welke levering heeft deze logboekregel aangemaakt) —
-- vooral om de trigger hieronder idempotent te maken: zonder dit zou een
-- herhaalde UPDATE van 'plaatsing_bevestigd' (bv. per ongeluk twee keer
-- bevestigd) telkens een nieuwe dubbele logboekregel aanmaken.
ALTER TABLE product_logboek ADD COLUMN leveringen_id UUID REFERENCES leveringen(id) ON DELETE SET NULL;
CREATE INDEX idx_product_logboek_leveringen ON product_logboek (leveringen_id);

CREATE OR REPLACE FUNCTION fn_product_logboek_plaatsing() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO product_logboek (product_id, type, datum, notitie, leveringen_id)
  SELECT bp.product_id, 'plaatsing',
         COALESCE(NEW.plaatsing_bevestigd_op::date, CURRENT_DATE),
         'Automatisch toegevoegd: visuele controle bij plaatsing (bevestigd door de plaatser via de leveringen-app).',
         NEW.id
  FROM boeking_producten bp
  WHERE bp.boeking_id = NEW.boeking_id
    AND NOT EXISTS (
      SELECT 1 FROM product_logboek pl
      WHERE pl.leveringen_id = NEW.id AND pl.product_id = bp.product_id AND pl.type = 'plaatsing'
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- "UPDATE OF plaatsing_bevestigd" zorgt dat dit enkel afgaat als die kolom
-- expliciet mee in de UPDATE zit (niet bij elke andere wijziging aan de
-- levering) — de WHEN-conditie + de NOT EXISTS hierboven samen zorgen dat dit
-- per levering/product maar één keer een logboekregel aanmaakt, ook als de
-- trigger toch meermaals zou afgaan. Ook OR INSERT voor het geval een
-- levering ooit meteen met plaatsing_bevestigd = true aangemaakt wordt.
CREATE TRIGGER trg_product_logboek_plaatsing
    AFTER INSERT OR UPDATE OF plaatsing_bevestigd ON leveringen
    FOR EACH ROW
    WHEN (NEW.plaatsing_bevestigd IS TRUE)
    EXECUTE FUNCTION fn_product_logboek_plaatsing();
