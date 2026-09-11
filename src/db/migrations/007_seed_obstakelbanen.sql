-- Nieuwe categorie "Obstakelbanen", overgenomen van belair-fun.be/obstakelbanen/.
-- Drakenburcht en Wickie De Viking stonden al in de databank (dubbel vermeld
-- op de website, bij zowel Springkastelen als Obstakelbanen) - die krijgen
-- gewoon de extra categorie erbij i.p.v. een dubbele rij.

UPDATE producten SET categorieen = array_append(categorieen, 'Obstakelbanen')
  WHERE sku = 'springkasteel-drakenburcht' AND NOT ('Obstakelbanen' = ANY(categorieen));
UPDATE producten SET categorieen = array_append(categorieen, 'Obstakelbanen')
  WHERE sku = 'springkasteel-wickie-de-viking' AND NOT ('Obstakelbanen' = ANY(categorieen));

INSERT INTO producten (naam, categorieen, sku, prijs, weekendprijs, afhaalprijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Flamingo Run', ARRAY['Obstakelbanen'], 'obstakelbaan-flamingo-run', 310, 480, 420, '13m x 3.3m x 4.4m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Y4A7213.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, weekendprijs, afhaalprijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Pop art-run 3 delen', ARRAY['Obstakelbanen'], 'obstakelbaan-pop-art-run-3-delen', 399, 520, 480, '21m x 4m x 5.4m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/POP-ART-RUN-3-PARTS.png'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, weekendprijs, afhaalprijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Pop art-run 2 delen', ARRAY['Obstakelbanen'], 'obstakelbaan-pop-art-run-2-delen', 310, 480, 400, '15m x 4m x 5.3m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/2-Parts-Popart-Run-detail-4-768x768-1.png'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, weekendprijs, afhaalprijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Campus 12 Obstakelbaan', ARRAY['Obstakelbanen'], 'obstakelbaan-campus-12-obstakelbaan', 325, 480, 420, '15m x 4m x 4m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Campus12-1024x684.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, weekendprijs, afhaalprijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Nachtwacht obstakelbaan', ARRAY['Obstakelbanen'], 'obstakelbaan-nachtwacht-obstakelbaan', 325, NULL, 480, '15m x 4m x 4m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Nachtwacht1-1024x684.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, weekendprijs, afhaalprijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Time Run Obstakelbaan', ARRAY['Obstakelbanen'], 'obstakelbaan-time-run-obstakelbaan', 325, 450, 410, '15m x 4m x 5.5m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/timerun2.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, weekendprijs, afhaalprijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Cowboy-run stormbaan', ARRAY['Obstakelbanen'], 'obstakelbaan-cowboy-run-stormbaan', 290, 380, 330, '17.3m x 4m x 6m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Cowboy-run-stormbaan-.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

