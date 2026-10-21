-- Op vraag van Jonas: de jaren 2022-2024 uit migratie 051 toch weer weghalen
-- ("te veel data") — hij levert zelf nieuwe, apart aangeleverde cijfers voor
-- 2025 en 2026. Enkel de maanden vanaf 2025 blijven staan; het paneel
-- "Populairste producten (historisch)" blijft ongewijzigd.
DELETE FROM historische_maandstatistieken WHERE maand < '2025-01-01';
