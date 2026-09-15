-- Cache voor de gegeocodeerde locatie van een levering/afhaling, gebruikt door
-- de kaart op het Dashboard. geocode_adres onthoudt WELK adres er gegeocodeerd
-- is, zodat een latere adreswijziging op de boeking automatisch een nieuwe
-- geocodering triggert i.p.v. de oude (foute) locatie te blijven tonen.
ALTER TABLE leveringen ADD COLUMN IF NOT EXISTS lat NUMERIC(9,6);
ALTER TABLE leveringen ADD COLUMN IF NOT EXISTS lng NUMERIC(9,6);
ALTER TABLE leveringen ADD COLUMN IF NOT EXISTS geocode_adres TEXT;
