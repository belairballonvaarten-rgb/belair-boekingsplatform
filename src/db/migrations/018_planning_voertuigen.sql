-- Voertuigen worden een beheerbare lijst (i.p.v. hardgecodeerd in de frontend),
-- zodat Jonas er zelf kan bijmaken/verwijderen naarmate het wagenpark groeit.
-- De 2 bestaande voertuigen worden hier meteen ingevuld, zodat de waarden die
-- al in leveringen.voertuig_levering/voertuig_afhaling staan blijven matchen.
CREATE TABLE voertuigen (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    naam          TEXT UNIQUE NOT NULL,
    aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO voertuigen (naam) VALUES ('Belair Camionette'), ('Linirent bus')
  ON CONFLICT (naam) DO NOTHING;

-- Route-volgorde per dag: de positie van een levering/afhaling binnen de route
-- van het voertuig die dag (1 = eerste stop). Losstaand van het tijdstip zelf —
-- Jonas kan de volgorde na het opstellen van een efficiënte route nog manueel
-- bijsturen zonder de tijdstippen te moeten herschikken.
ALTER TABLE leveringen ADD COLUMN volgorde_levering INTEGER;
ALTER TABLE leveringen ADD COLUMN volgorde_afhaling INTEGER;
