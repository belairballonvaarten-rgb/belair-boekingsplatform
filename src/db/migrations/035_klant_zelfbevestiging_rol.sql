-- Aparte 6de rol voor de mail die AUTOMATISCH verstuurd wordt zodra een klant
-- zelf op de "Ik bevestig"-knop klikt (zie routes/klant-bevestiging.js,
-- migratie 034). Eerst hergebruikte die code de rol 'reservatie_bevestiging'
-- (knop 3 in een dossier) — maar dat is de VERKEERDE fase: die mail zegt
-- letterlijk "is definitief bevestigd" met {{totaal}}/{{betaald}}, en wordt
-- door Jonas nog eens manueel verstuurd wanneer de boeking ECHT (na inplannen
-- + betaalverzoek) bevestigd is — de klant zou zo twee keer een tegenstrijdige
-- "definitief bevestigd"-mail krijgen. Zelfde rol-mechanisme als migratie 028/032.
ALTER TABLE mail_templates DROP CONSTRAINT mail_templates_rol_check;
ALTER TABLE mail_templates ADD CONSTRAINT mail_templates_rol_check
  CHECK (rol IS NULL OR rol IN ('aanvraag_bevestiging', 'betaalverzoek', 'reservatie_bevestiging', 'review_verzoek', 'weigering', 'klant_zelfbevestiging'));

INSERT INTO mail_templates (naam, onderwerp, inhoud, rol) VALUES (
  'Bevestiging ontvangen (automatisch)',
  'Bedankt voor uw bevestiging — Belair-Fun',
  '<p>Beste {{klant_naam}},</p><p>Bedankt om uw aanvraag voor {{producten}} op {{periode}} te bevestigen!</p><p>We maken hier nu een reservatie van en sturen u binnenkort een betaalverzoek om deze definitief te maken.</p><p>Met vriendelijke groeten,<br>Belair-Fun</p>',
  'klant_zelfbevestiging'
);
