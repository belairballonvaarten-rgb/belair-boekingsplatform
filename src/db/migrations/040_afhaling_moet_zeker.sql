-- "Moet zeker afgehaald worden" — een MANUELE vlag die Jonas zelf in het
-- boekingdossier kan aan/uit zetten (los van de automatische "zeker
-- afhalen"-berekening o.b.v. voorraad, zie utils/zekerAfhalen.js). Voor
-- gevallen die de automatische check niet kan zien (bv. een klant die al
-- staat te wachten op dit exemplaar om een andere reden dan voorraad).
-- Telt overal even zwaar mee als de automatische melding: op het Dashboard,
-- in Planning en in de leveringen-app (inclusief het vaste voertuig-scherm)
-- verschijnt hetzelfde "⏰"-icoontje zodra één van beide waar is.
--
-- Op de "leveringen"-tabel (niet "boekingen") omdat dit specifiek over de
-- afhaling-uitvoering gaat, net als de andere afhaling_*-kolommen daar.
ALTER TABLE leveringen
  ADD COLUMN IF NOT EXISTS afhaling_moet_zeker BOOLEAN NOT NULL DEFAULT false;
