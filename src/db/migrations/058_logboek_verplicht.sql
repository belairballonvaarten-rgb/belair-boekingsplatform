-- Op vraag van Jonas: het Logboek-overzicht/"Snel invoeren" toonde ALLE
-- producten, ook categorieën waar de FOD-verplichting niet op slaat (bv.
-- feestmaterialen/servies-bestek/glazen) — veel te uitgebreid. Een vrij,
-- per-product aan/uit-vinkje (i.p.v. hardcoded op categorienaam filteren,
-- want categorieën zijn vrije tekst die Jonas zelf kan aanmaken/hernoemen)
-- bepaalt voortaan of een product in het Logboek-overzicht/Snel-invoeren
-- verschijnt. Standaard AAN (bestaand gedrag voor alles) — hieronder meteen
-- een redelijke startwaarde UIT zetten voor de 2 categorieën die Jonas zelf
-- als "hoort er niet bij" noemde; alle andere (incl. nieuwe/toekomstige
-- categorieën zoals "Sport en spel") blijven gewoon AAN staan. Nadien per
-- product vrij aan/uit te zetten via de productfiche.
ALTER TABLE producten ADD COLUMN logboek_verplicht BOOLEAN NOT NULL DEFAULT true;

UPDATE producten SET logboek_verplicht = false
WHERE categorieen && ARRAY['Feestmaterialen', 'Servies/Bestek/glazen'];
