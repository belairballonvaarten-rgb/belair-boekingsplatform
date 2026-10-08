-- Infofiche/handleiding per product (bv. veiligheidsinstructies bij een
-- springkasteel) — Jonas moet dit vanaf nu kunnen aantonen/bezorgen aan de
-- klant (FOD-verplichting), maar wil het NIET standaard als bijlage bij elke
-- mail meesturen. Daarom exact hetzelfde opslagpatroon als het certificaat
-- hierboven (zie migratie 019): rechtstreeks als bytea bij het product,
-- zodat het via een eigen link (zie routes/product-info-publiek.js — publiek,
-- geen login nodig) altijd beschikbaar is zonder dat Jonas het zelf per mail
-- moet opzoeken/versturen. Een {{handleiding_links}}-plaatshouder in de
-- mailtemplate (zie utils/mailTemplates.js) kan die link tonen voor wie dat
-- in de tekst wil zetten — optioneel, nooit verplicht/automatisch.
ALTER TABLE producten ADD COLUMN infofiche_bestand BYTEA;
ALTER TABLE producten ADD COLUMN infofiche_bestandsnaam TEXT;
ALTER TABLE producten ADD COLUMN infofiche_mimetype TEXT;
ALTER TABLE producten ADD COLUMN infofiche_upload_op TIMESTAMPTZ;
