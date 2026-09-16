-- De crew-app had tot nu toe haar EIGEN, uitgebreidere materiaal-info per
-- product (aantal motors, verlengkabel standaard/dubbel, overige
-- benodigdheden, een vrije opmerking) — die viel weg bij de omschakeling naar
-- de gedeelde databank (stage 3) omdat het platform's "producten"-tabel deze
-- velden nog niet had. Vanaf nu is het platform de ENIGE bron van
-- materiaal-info (ook voor de laadlijst) — dus deze velden hier toevoegen en
-- verder aanvullen/beheren via de Producten-pagina op het platform.
ALTER TABLE producten ADD COLUMN aantal_motors INTEGER;
ALTER TABLE producten ADD COLUMN verlengkabel_standaard INTEGER;
ALTER TABLE producten ADD COLUMN verlengkabel_dubbel INTEGER;
ALTER TABLE producten ADD COLUMN overige_benodigdheden TEXT;
ALTER TABLE producten ADD COLUMN materiaal_opmerking TEXT;

-- Gemiddelde opsteltijd (in minuten) per product — gebruikt door de
-- routeplanner (Logistiek) om, naast een vaste stoptijd per stop, ook de tijd
-- voor het effectief opstellen/afbreken van dit specifieke product mee in te
-- schatten in de totale route-tijd.
ALTER TABLE producten ADD COLUMN gemiddelde_opsteltijd_minuten INTEGER;
