-- Stap 1 van de consolidatie met de crew-app (leveringen-app): de crew-app
-- houdt momenteel zijn EIGEN kopie bij van elke levering (status, voertuig,
-- checklist, foto's, betaling ter plekke) in een aparte database, en die
-- kopie wordt heen-en-weer gesynchroniseerd met dit platform via een fragiele
-- webhook. Deze migratie voegt de velden toe die de crew-app nodig heeft maar
-- hier nog niet bestaan, zodat de crew-app nadien kan overschakelen op DEZELFDE
-- database/tabellen i.p.v. zijn eigen kopie — waarna de hele sync-laag (en de
-- kans op "app en platform lopen uit elkaar") gewoon verdwijnt.
--
-- Bewust NIET aangepakt in deze stap: de crew-app's eigen 'users'-tabel (login
-- van de crewleden blijft voorlopig apart) en zijn 'producten'-tabel (die
-- schrappen we pas zodra de crew-app-code effectief overschakelt naar de
-- 'producten'-tabel van dit platform).

-- Plaatsing-checklist (bij levering) — velden zoals ze nu in de crew-app
-- bestaan (zie d.plaatsing in de crew-app), overgezet naar losse kolommen.
ALTER TABLE leveringen ADD COLUMN plaatsing_correct BOOLEAN;
ALTER TABLE leveringen ADD COLUMN plaatsing_bevestiging TEXT
    CHECK (plaatsing_bevestiging IN ('zandzakken', 'verankering', 'pinnen', 'geen'));
ALTER TABLE leveringen ADD COLUMN plaatsing_valmatten BOOLEAN;
ALTER TABLE leveringen ADD COLUMN plaatsing_verlengkabel BOOLEAN;
ALTER TABLE leveringen ADD COLUMN plaatsing_aantal_kabels INTEGER;
ALTER TABLE leveringen ADD COLUMN plaatsing_aantal_zandzakken INTEGER;
ALTER TABLE leveringen ADD COLUMN plaatsing_netjes BOOLEAN;
ALTER TABLE leveringen ADD COLUMN plaatsing_opmerkingen TEXT;
ALTER TABLE leveringen ADD COLUMN plaatsing_bevestigd BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE leveringen ADD COLUMN plaatsing_bevestigd_op TIMESTAMPTZ;

-- Afhaling-checklist (zie d.afhaling in de crew-app) — "nat_of_vuil" is
-- bewust hetzelfde begrip als producten.staat = 'vuil' (zie Dagoverzicht),
-- maar blijft hier apart per levering staan: het is de crew die vaststelt
-- welk PRODUCT vuil terugkwam, en dat vertaalt de applicatiecode nadien naar
-- producten.staat — dat blijft zo, deze kolom registreert enkel de vaststelling.
ALTER TABLE leveringen ADD COLUMN afhaling_valmatten_terug BOOLEAN;
ALTER TABLE leveringen ADD COLUMN afhaling_kabels_terug BOOLEAN;
ALTER TABLE leveringen ADD COLUMN afhaling_bevestiging_terug BOOLEAN;
ALTER TABLE leveringen ADD COLUMN afhaling_nat_of_vuil BOOLEAN;
ALTER TABLE leveringen ADD COLUMN afhaling_reiniging_nodig BOOLEAN;
ALTER TABLE leveringen ADD COLUMN afhaling_opmerkingen TEXT;
ALTER TABLE leveringen ADD COLUMN afhaling_bevestigd BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE leveringen ADD COLUMN afhaling_bevestigd_op TIMESTAMPTZ;

-- "Afhaling vandaag niet gelukt, verzet aangevraagd" — bestaat nog nergens in
-- het platform, puur een crew-app-functie tot nu toe.
ALTER TABLE leveringen ADD COLUMN afhaling_verzet_aangevraagd BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE leveringen ADD COLUMN afhaling_verzet_naar_datum DATE;
ALTER TABLE leveringen ADD COLUMN afhaling_verzet_reden TEXT;

-- Foto's bij plaatsing/afhaling (nu in de crew-app's eigen 'photos'-tabel,
-- gekoppeld aan zijn eigen 'deliveries.id' — hier gekoppeld aan leveringen.id).
CREATE TABLE leveringen_fotos (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leveringen_id UUID NOT NULL REFERENCES leveringen(id) ON DELETE CASCADE,
    fase          TEXT NOT NULL CHECK (fase IN ('plaatsing', 'afhaling')),
    naam          TEXT,
    data_url      TEXT NOT NULL,
    aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_leveringen_fotos_levering ON leveringen_fotos (leveringen_id);

-- Welke crewleden rijden vandaag met welk voertuig — Jonas stelt dit elke
-- ochtend/shift in (zie Planning-pagina), losstaand van welke leveringen dat
-- voertuig die dag doet (dat bepaalt de planning zelf al, zie voertuig_levering/
-- voertuig_afhaling). Vervangt het crew-app-begrip "team" (een vaste, apart
-- beheerde naam per voertuig) door een simpele dagelijkse toewijzing.
-- gebruiker_id verwijst naar de crew-app's eigen 'users'-tabel (dezelfde
-- database, maar geen DB-FK over de 2 codebases heen — die tabel bestaat pas
-- zodra de crew-app op deze database is aangesloten).
CREATE TABLE voertuig_bemanning (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voertuig_id UUID NOT NULL REFERENCES voertuigen(id) ON DELETE CASCADE,
    gebruiker_id INTEGER NOT NULL,
    gebruiker_naam TEXT NOT NULL, -- momentopname van de naam, voor weergave zonder afhankelijkheid van de crew-app-tabel
    datum       DATE NOT NULL,
    aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (voertuig_id, gebruiker_id, datum)
);
CREATE INDEX idx_voertuig_bemanning_datum ON voertuig_bemanning (datum);

-- Opkuis: 2 kolommen uit de allereerste opzet van 'leveringen', van vóór
-- Planning/voertuig_levering/afhaling_voltooid bestonden — nergens in de
-- huidige code nog gebruikt (geverifieerd), dus schrappen om verwarring met
-- de nieuwe kolommen hierboven te vermijden.
ALTER TABLE leveringen DROP COLUMN chauffeurs;
ALTER TABLE leveringen DROP COLUMN checklist_status;
