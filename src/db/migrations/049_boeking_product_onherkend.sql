-- Op vraag van Jonas: wanneer een website-inzending een productnaam bevat die
-- niet herkend wordt in de productenlijst, mag dat de aanvraag niet langer
-- blokkeren (zie 012/src/routes/webinzendingen.js) — maar in plaats van het
-- onherkende productje enkel te vermelden in de Opmerkingen, moet het ook als
-- een echte (rode, "niet herkend") regel in de productenlijst van het dossier
-- verschijnen, zodat het meteen opvalt en makkelijk te vervangen/aan te vullen
-- is door het juiste product te kiezen.
--
-- product_id mag daarom nu leeg zijn (enkel voor dit soort placeholder-regels
-- — bij elke normale toevoeging via de app blijft dit gewoon altijd ingevuld),
-- met de letterlijke, onherkende naam uit het webformulier in ruwe_naam. Een
-- CHECK-constraint zorgt dat minstens één van de twee altijd ingevuld is.
ALTER TABLE boeking_producten
    ALTER COLUMN product_id DROP NOT NULL,
    ADD COLUMN ruwe_naam TEXT,
    ADD CONSTRAINT boeking_producten_product_of_ruwe_naam
        CHECK (product_id IS NOT NULL OR ruwe_naam IS NOT NULL);
