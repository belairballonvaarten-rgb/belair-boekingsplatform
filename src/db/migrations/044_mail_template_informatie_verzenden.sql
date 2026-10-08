-- Op vraag van Jonas: niet langer een apart "Rapport"-knopje per product in
-- het boekingdossier, maar een 5de vaste dossierknop (zelfde rol-mechanisme
-- als migratie 028/032/035) bij Communicatie — "Informatie verzenden" — die
-- een sjabloon-mail opent met downloadlinks naar het logboek en de
-- certificaten van alle producten in die boeking ({{logboek_links}} en
-- {{certificaat_links}}, zie utils/mailTemplates.js).
ALTER TABLE mail_templates DROP CONSTRAINT mail_templates_rol_check;
ALTER TABLE mail_templates ADD CONSTRAINT mail_templates_rol_check
  CHECK (rol IS NULL OR rol IN ('aanvraag_bevestiging', 'betaalverzoek', 'reservatie_bevestiging', 'review_verzoek', 'weigering', 'klant_zelfbevestiging', 'informatie_verzenden'));

INSERT INTO mail_templates (naam, onderwerp, inhoud, rol) VALUES (
  'Informatie verzenden (logboek + certificaten)',
  'Logboek en certificaten — {{producten}}',
  '<p>Beste {{klant_naam}},</p><p>Hierbij de links naar het logboek en de certificaten van {{producten}}:</p>{{logboek_links}}{{certificaat_links}}<p>Met vriendelijke groeten,<br>Belair-Fun</p>',
  'informatie_verzenden'
);
