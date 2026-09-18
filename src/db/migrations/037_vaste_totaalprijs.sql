-- Laat Jonas de totaalprijs van een boeking overrulen met een vast bedrag,
-- voor de gevallen waarin hij telefonisch/ter plaatse een vaste prijs
-- afspreekt met de klant die niet noodzakelijk overeenkomt met de som van de
-- productenprijzen + transportkost + toeslag/korting. NULL (standaard) = geen
-- overrule, de prijs blijft gewoon berekend zoals voorheen. Zie
-- src/utils/prijstabel.js voor waar dit toegepast wordt.
ALTER TABLE boekingen ADD COLUMN vaste_totaalprijs NUMERIC(10,2);
