-- Op vraag van Jonas: de e-mailhandtekening mag standaard de zijne blijven
-- (platform_instellingen.email_handtekening, zie migratie 030), maar een
-- andere ingelogde gebruiker (bv. Ria) moet zijn/haar EIGEN handtekening
-- kunnen instellen — die overschrijft dan enkel voor die gebruiker de
-- standaard. NULL/leeg = "gebruik de standaard" (zie haalIngevuldeTemplateOp()
-- in routes/boekingen.js, die eerst hier kijkt en anders terugvalt).
ALTER TABLE admins ADD COLUMN email_handtekening TEXT;
