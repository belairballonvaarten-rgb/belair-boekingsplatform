-- Voegt bij aan betalingen: hoeveel er al effectief ontvangen is, apart van het
-- totaal verschuldigde bedrag. Nodig om "openstaand saldo" en "ontvangen
-- betalingen" correct te kunnen tonen in het boekingenoverzicht.
ALTER TABLE betalingen ADD COLUMN betaald_bedrag NUMERIC(10,2) NOT NULL DEFAULT 0;
