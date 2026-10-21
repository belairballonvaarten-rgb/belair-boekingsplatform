-- Op vraag van Jonas: de Statistieken-pagina gebruikte voor dit platform
-- (sept. 2026) niet bestond, is er voor 2025 en begin 2026 geen enkele echte
-- boeking in onze eigen tabellen — die periode liep volledig via het vorige
-- systeem (Booking Online). Jonas leverde daarvan zelf een maandelijks
-- overzicht aan (omzet, aantal boekingen, eenheden, gemiddelde waarde,
-- online/manueel-verdeling) t.e.m. augustus 2026 — de maand net voor de
-- overstap, dus zonder overlap met de echte boekingen in onze tabellen vanaf
-- september 2026.
--
-- Dit zijn ENKEL maandtotalen — geen klantnamen, producten of gemeentes — dus
-- enkel de totalen (omzet/aantal boekingen/eenheden) op de Statistieken-pagina
-- kunnen hiermee aangevuld worden; de grafieken "Populairste gemeentes" en
-- "Producten per categorie" blijven voor deze maanden gewoon leeg (geen data
-- beschikbaar), zoals met Jonas afgesproken.
CREATE TABLE historische_maandstatistieken (
    maand             DATE PRIMARY KEY, -- altijd de 1e van de maand
    omzet             NUMERIC(10,2) NOT NULL,
    aantal_boekingen  INTEGER NOT NULL,
    eenheden          INTEGER NOT NULL,
    gemiddelde_waarde NUMERIC(10,2),
    online_pct        NUMERIC(5,2),
    manual_pct        NUMERIC(5,2)
);

INSERT INTO historische_maandstatistieken (maand, omzet, aantal_boekingen, eenheden, gemiddelde_waarde, online_pct, manual_pct) VALUES
    ('2024-12-01',   303.00,   3,   35, 101.00,   0.00, 100.00),
    ('2025-01-01',  1750.50,   9,  128, 194.50,   0.00, 100.00),
    ('2025-02-01',  1865.00,  12,   13, 155.42,   0.00, 100.00),
    ('2025-03-01',  8639.75,  43,   55, 200.92,   0.00, 100.00),
    ('2025-04-01', 20283.00,  87,  473, 233.14,   0.00, 100.00),
    ('2025-05-01', 71378.00, 298, 2884, 239.52,   0.00, 100.00),
    ('2025-06-01', 45076.00, 195,  654, 231.16,   0.00, 100.00),
    ('2025-07-01', 27139.00, 115,  447, 235.99,   0.00, 100.00),
    ('2025-08-01', 33472.50, 128,  756, 261.50,   0.00, 100.00),
    ('2025-09-01', 27137.00, 106,  845, 256.01,   0.00, 100.00),
    ('2025-10-01',  8849.00,  42,  810, 210.69,   0.00, 100.00),
    ('2025-11-01',  6727.00,  20,  322, 336.35,   0.00, 100.00),
    ('2025-12-01',  2811.00,   8,   19, 351.38,   0.00, 100.00),
    ('2026-01-01',  1194.00,   6,    9, 199.00,   0.00, 100.00),
    ('2026-02-01',  2116.00,  11,   33, 192.36,   0.00, 100.00),
    ('2026-03-01',  8265.00,  36,  301, 229.58,   0.00, 100.00),
    ('2026-04-01', 35350.10, 131,  678, 269.85,   0.00, 100.00),
    ('2026-05-01', 62069.70, 222, 1728, 279.59,   0.00, 100.00),
    ('2026-06-01', 33263.40, 123, 1078, 270.43,   0.00, 100.00),
    ('2026-07-01', 39384.50, 115, 1310, 342.47,   0.00, 100.00),
    ('2026-08-01', 27220.50, 106,  611, 256.80,   0.00, 100.00);
