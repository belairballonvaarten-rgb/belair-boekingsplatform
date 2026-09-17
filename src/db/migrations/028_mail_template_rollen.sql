-- Op vraag van Jonas: de e-mailtemplates werken nog niet goed genoeg. Twee
-- concrete verbeteringen, hier in de databank voorbereid:
--
-- 1. Een echte opmaak-editor in Instellingen (geen platte tekst meer) — de
--    kolom 'inhoud' blijft gewoon TEXT, maar bevat voortaan HTML (opgemaakt
--    via de nieuwe rich-text-editor in de frontend, zie public/js/app.js).
--    Bestaande sjablonen worden hieronder eenmalig van platte tekst naar
--    eenvoudige HTML omgezet, zodat ze er meteen behoorlijk uitzien.
--
-- 2. Vier vaste knoppen bovenaan een boekingdossier (Aanvraagbevestiging,
--    Betaalverzoek, Reservatiebevestiging, Review-verzoek) die telkens één
--    welbepaalde template versturen. 'rol' legt die koppeling vast. Blijft
--    NULL voor overige/vrije templates — die blijven enkel bereikbaar via de
--    vrije lijst bij Communicatie in het dossier (letterlijke vraag van Jonas
--    bij het aanmaken van deze tabel: "eventueel andere templates kunnen ten
--    alle tijde nog toegevoegd worden").
ALTER TABLE mail_templates ADD COLUMN rol TEXT;

ALTER TABLE mail_templates ADD CONSTRAINT mail_templates_rol_check
  CHECK (rol IS NULL OR rol IN ('aanvraag_bevestiging', 'betaalverzoek', 'reservatie_bevestiging', 'review_verzoek'));

-- Elke rol mag maar bij één template horen, anders weet een dossierknop niet
-- welke te versturen.
CREATE UNIQUE INDEX mail_templates_rol_uniek ON mail_templates (rol) WHERE rol IS NOT NULL;

UPDATE mail_templates SET rol = 'aanvraag_bevestiging' WHERE naam = 'Aanvraag goed ontvangen';
UPDATE mail_templates SET rol = 'betaalverzoek' WHERE naam = 'Aanvraag Betaalverzoek';
UPDATE mail_templates SET rol = 'review_verzoek' WHERE naam = 'Review mail';

-- Vierde, nog ontbrekende sjabloon: reservatiebevestiging.
INSERT INTO mail_templates (naam, onderwerp, inhoud, rol) VALUES (
  'Reservatie bevestigd',
  'Uw reservatie bij Belair-Fun is bevestigd — {{producten}}',
  '<p>Beste {{klant_naam}},</p><p>Goed nieuws: uw reservatie voor <strong>{{producten}}</strong> op {{periode}} is definitief bevestigd!</p><p>Totaalbedrag: {{totaal}}<br>Reeds betaald: {{betaald}}</p><p>Wij nemen tijdig voor de levering/afhaling nog contact op met de praktische afspraken.</p><p>Met vriendelijke groeten,<br>Belair-Fun</p>',
  'reservatie_bevestiging'
);

-- Bestaande 3 sjablonen (nog platte tekst met '\n\n' tussen alinea's) omzetten
-- naar eenvoudige HTML, zodat de nieuwe editor ze meteen correct toont i.p.v.
-- als één platte tekstblok. Eerst dubbele newline -> alinea-scheiding
-- (via een tijdelijk merkteken, om te vermijden dat de volgende stap er ook
-- een <br> van maakt), dan de overblijvende enkele newline -> <br>.
UPDATE mail_templates
SET inhoud = regexp_replace(inhoud, E'\n\n+', '~~PARABREAK~~', 'g')
WHERE rol IN ('aanvraag_bevestiging', 'betaalverzoek', 'review_verzoek');
UPDATE mail_templates
SET inhoud = replace(inhoud, E'\n', '<br>')
WHERE rol IN ('aanvraag_bevestiging', 'betaalverzoek', 'review_verzoek');
UPDATE mail_templates
SET inhoud = '<p>' || replace(inhoud, '~~PARABREAK~~', '</p><p>') || '</p>'
WHERE rol IN ('aanvraag_bevestiging', 'betaalverzoek', 'review_verzoek');
