-- Op vraag van Jonas: de klant moet bij de plaatsing (levering) tekenen voor
-- akkoord — een kort overzicht (springkasteel, adres, grasrobot uitgeschakeld,
-- aantal achtergelaten verlengkabels, ...) plus een handtekeningvak, zodra dat
-- getekend is telt de levering pas echt als afgewerkt. Zie leveringen-app
-- public/index.html (renderHandtekeningStap/setupSignaturePad) en de PUT
-- /api/deliveries/:id in leveringen-app/server.js, die deze kolommen samen met
-- de rest van de plaatsing-checklist wegschrijft.
--
-- plaatsing_handtekening bevat de handtekening zelf als base64 PNG data-URL
-- (een klein canvas-tekeningetje, geen foto — enkele KB's), dus gewoon TEXT
-- volstaat, zoals ook elders in dit schema voor afbeeldingen gebeurt (bv.
-- foto's van de levering/afhaling).
ALTER TABLE leveringen ADD COLUMN IF NOT EXISTS plaatsing_grasrobot_uit BOOLEAN;
ALTER TABLE leveringen ADD COLUMN IF NOT EXISTS plaatsing_handtekening TEXT;
ALTER TABLE leveringen ADD COLUMN IF NOT EXISTS plaatsing_handtekening_naam TEXT;
ALTER TABLE leveringen ADD COLUMN IF NOT EXISTS plaatsing_handtekening_op TIMESTAMPTZ;
