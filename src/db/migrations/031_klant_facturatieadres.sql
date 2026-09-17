-- Op vraag van Jonas: bij een klant (vooral bedrijven) kan het facturatieadres
-- afwijken van het gewone adres (bv. boekhouding op een ander adres dan de
-- vestiging/leveringslocatie). Los van 'adres' (gebruikt voor levering/locatie)
-- komt hier een apart, optioneel facturatieadres bij. Leeg = zelfde als het
-- gewone adres (zie zorgVoorKlant() in utils/eenvoudigFactureren.js, die hier
-- op terugvalt).
ALTER TABLE klanten ADD COLUMN facturatie_adres    TEXT;
ALTER TABLE klanten ADD COLUMN facturatie_postcode TEXT;
ALTER TABLE klanten ADD COLUMN facturatie_gemeente TEXT;
