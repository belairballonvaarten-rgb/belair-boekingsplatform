-- Voegt de weekend- en afhaalprijs toe naast de bestaande dagprijs ("prijs").
-- Zo kan elk product 3 tarieven hebben, net als op belair-fun.be.
ALTER TABLE producten ADD COLUMN weekendprijs NUMERIC(10,2);
ALTER TABLE producten ADD COLUMN afhaalprijs NUMERIC(10,2);
