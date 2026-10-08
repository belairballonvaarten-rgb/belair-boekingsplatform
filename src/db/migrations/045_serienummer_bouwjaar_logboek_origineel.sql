-- Op vraag van Jonas:
-- 1. Twee extra identificatievelden per product (serienummer, bouwjaar) —
--    gewoon tekst/jaartal bij het product, zie Productinformatie in
--    utils/productRapport.js.
-- 2. Een DERDE document naast certificaat en infofiche/handleiding: het
--    ORIGINELE logboek van de fabrikant (zie bv. de "Handleiding & Logboek"-
--    PDF's van JB-Inflatables die Jonas als voorbeeld gaf) — exact hetzelfde
--    opslagpatroon als certificaat_* (migratie 019) en infofiche_* (migratie
--    042). Dit wordt NIET apart als losse link getoond: bij het genereren van
--    het logboek-PDF (genereerProductRapportPdf, zie productRapport.js) wordt
--    dit origineel samengevoegd ACHTERAAN ons eigen gegenereerde rapport, zodat
--    Jonas één PDF heeft i.p.v. twee aparte documenten te moeten combineren.
-- 3. Wie de reiniging/controle/herstelling effectief uitvoerde — Jonas wil dat
--    nu ook kunnen noteren per logboek-invoer (vrije tekst, geen aparte
--    gebruikerslijst nodig: ook externe/tijdelijke medewerkers kunnen dit zijn).
ALTER TABLE producten ADD COLUMN serienummer TEXT;
ALTER TABLE producten ADD COLUMN bouwjaar INTEGER;

ALTER TABLE producten ADD COLUMN logboek_origineel_bestand BYTEA;
ALTER TABLE producten ADD COLUMN logboek_origineel_bestandsnaam TEXT;
ALTER TABLE producten ADD COLUMN logboek_origineel_mimetype TEXT;
ALTER TABLE producten ADD COLUMN logboek_origineel_upload_op TIMESTAMPTZ;

ALTER TABLE product_logboek ADD COLUMN uitgevoerd_door TEXT;
