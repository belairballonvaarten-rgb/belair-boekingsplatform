-- Koppeling met EenvoudigFactureren (facturatiesoftware van Jonas), via hun
-- REST API — zie src/utils/eenvoudigFactureren.js. We onthouden per klant het
-- klant-id dat EenvoudigFactureren teruggeeft (zodat we bij een volgende
-- factuur voor dezelfde klant niet telkens een nieuwe/dubbele klantenkaart
-- aanmaken daar), en per boeking de URL van de laatst aangemaakte
-- factuur/betaalverzoek (voor een link in het dossier).
ALTER TABLE klanten ADD COLUMN eenvoudigfactureren_klant_id TEXT;
ALTER TABLE boekingen ADD COLUMN eenvoudigfactureren_laatste_url TEXT;
