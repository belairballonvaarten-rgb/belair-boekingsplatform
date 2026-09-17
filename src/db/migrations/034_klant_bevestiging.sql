-- Laat een klant zijn/haar aanvraag rechtstreeks bevestigen via een knop in de
-- "Aanvraag goed ontvangen"-mail, i.p.v. te moeten ANTWOORDEN op die mail
-- (wat Jonas dan zelf manueel moest lezen en verwerken). Zie
-- routes/klant-bevestiging.js voor de publieke (niet-ingelogde) link zelf, en
-- utils/mailTemplates.js voor de {{bevestig_link}}/{{bevestig_knop}}-
-- plaatshouders die deze link/knop in een template invullen.
--
-- klant_bevestigings_token: een eigen, niet-raadbare token per boeking, zodat
-- deze publieke link enkel voor DEZE ene aanvraag werkt — een aanvraagnummer
-- zelf zou te makkelijk te raden/te overlopen zijn.
-- klant_bevestigd_op: wanneer de klant op de knop geklikt heeft (NULL =
-- nog niet). Voorkomt dat eenzelfde link twee keer iets teweegbrengt.
ALTER TABLE boekingen ADD COLUMN klant_bevestigings_token UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE boekingen ADD CONSTRAINT boekingen_klant_bevestigings_token_uniek UNIQUE (klant_bevestigings_token);
ALTER TABLE boekingen ADD COLUMN klant_bevestigd_op TIMESTAMPTZ;

-- Zet de kant-en-klare bevestigingsknop meteen onderaan de bestaande
-- "Aanvraagbevestiging"-template (of Jonas' eigen, eventueel al aangepaste
-- versie ervan) — zodat dit meteen werkt zonder dat hij zelf eerst naar
-- Instellingen moet om {{bevestig_knop}} toe te voegen. De WHERE-voorwaarde
-- maakt dit ongevaarlijk om per ongeluk twee keer te draaien.
UPDATE mail_templates
SET inhoud = inhoud || '<p></p>{{bevestig_knop}}', bijgewerkt_op = now()
WHERE rol = 'aanvraag_bevestiging' AND inhoud NOT LIKE '%bevestig_knop%';
