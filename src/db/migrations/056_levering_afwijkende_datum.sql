-- "Leverdatum"/"afhaaldatum" kunnen bewust afwijken van de huurperiode
-- (boekingen.gewenste_datum_start/gewenste_datum_einde, die blijft bepalen
-- wat er gefactureerd wordt — zie meerdaagse_prijstabel/berekenMeerdaagsePrijs
-- in routes/boekingen.js). Typevoorbeeld: met de klant is een huurperiode van
-- 1 dag afgesproken, maar de plaatsing gebeurt om logistieke redenen al een
-- dag vroeger — de prijs/factuur moet dan "1 dag" blijven tonen, maar
-- Dashboard, Planning EN de leveringen-app (via sync.js) moeten weten dat de
-- ploeg al de dag vóór de huurperiode moet rijden.
--
-- leveringen.leveringstijd/afhaaltijd (bestaande kolommen) blijven HET veld
-- dat die 3 plekken effectief lezen voor het geplande moment — dat verandert
-- niet. Deze 2 nieuwe vlaggen zorgen er enkel voor dat de automatische
-- herberekening in routes/boekingen.js (die leveringstijd/afhaaltijd bij elke
-- wijziging van de huurperiode of het voorkeur-tijdstip opnieuw afleidt van
-- gewenste_datum_start/-einde) een BEWUST ingestelde afwijkende datum niet
-- zomaar overschrijft.
ALTER TABLE leveringen ADD COLUMN leverdatum_afwijkend BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE leveringen ADD COLUMN afhaaldatum_afwijkend BOOLEAN NOT NULL DEFAULT false;
