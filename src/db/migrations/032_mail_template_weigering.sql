-- Op vraag van Jonas: een 5de vaste dossierknop "Weigering" — voor wanneer een
-- aanvraag geweigerd wordt omdat het gevraagde product niet meer beschikbaar
-- is. Zelfde rol-mechanisme als de andere 4 (zie migratie 028).
ALTER TABLE mail_templates DROP CONSTRAINT mail_templates_rol_check;
ALTER TABLE mail_templates ADD CONSTRAINT mail_templates_rol_check
  CHECK (rol IS NULL OR rol IN ('aanvraag_bevestiging', 'betaalverzoek', 'reservatie_bevestiging', 'review_verzoek', 'weigering'));

INSERT INTO mail_templates (naam, onderwerp, inhoud, rol) VALUES (
  'Aanvraag geweigerd',
  'Uw aanvraag bij Belair-Fun — {{producten}}',
  '<p>Beste {{klant_naam}},</p><p>Alvast bedankt voor uw aanvraag voor {{producten}}!</p><p>Jammer genoeg is dit ondertussen niet meer beschikbaar op de gevraagde periode.</p><p>Check zeker onze website — misschien zijn er nog andere producten beschikbaar die ook aan jullie wens voldoen: <a href="https://www.belair-fun.be">www.belair-fun.be</a></p><p>Met vriendelijke groeten,<br>Belair-Fun</p>',
  'weigering'
);
