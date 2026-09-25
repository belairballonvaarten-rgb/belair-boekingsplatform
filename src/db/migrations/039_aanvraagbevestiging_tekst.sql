-- Tekst-feedback van Jonas op de nieuwe visuele aanvraagbevestiging (migratie
-- 038): vriendelijkere begroeting ("Hey ..., bedankt voor je aanvraag! Goed
-- nieuws — dit is nog beschikbaar." — nu in tekenGegevensblok() in
-- utils/mailTemplates.js, dus hier niet zichtbaar), een onderwerpregel/tekst
-- die niet meer op maat van precies één product geschreven is (was
-- "{{producten}} is beschikbaar" — fout bij meerdere producten, want dan
-- zou het "zijn" moeten zijn), en een duidelijke, aparte vermelding dat er
-- na bevestiging nog een betaalverzoek volgt.
--
-- LET OP: migratie 038 is (mogelijk) al uitgevoerd op de live database — een
-- reeds uitgevoerd migratiebestand wordt nooit opnieuw gedraaid (zie
-- scripts/migrate.js), dus de tekst hier NIET in 038 zelf aanpassen, maar in
-- een nieuw, opvolgend bestand zoals dit.
UPDATE mail_templates
SET
  onderwerp = 'Goed nieuws over uw aanvraag ({{producten}}) — Belair-Fun',
  inhoud = '{{header_afbeelding}}
{{gegevensblok}}
{{producten_kaarten}}
{{prijsblok}}
<p>Bevestig hieronder uw aanvraag om ze definitief vast te leggen.</p>
<p>Van zodra u bevestigt, ontvangt u van ons een betaalverzoek.</p>
{{bevestig_knop}}
<p>Met vriendelijke groeten,<br>Belair-Fun</p>',
  bijgewerkt_op = now()
WHERE rol = 'aanvraag_bevestiging';
