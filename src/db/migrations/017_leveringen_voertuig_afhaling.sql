-- Levering en afhaling van dezelfde boeking kunnen door een ander voertuig
-- gebeuren (bv. geleverd met de camionette, later opgehaald met de bus) —
-- één gedeelde "voertuig"-kolom voor beide was dus fout. Hernoemd naar
-- voertuig_levering en een aparte voertuig_afhaling toegevoegd.
ALTER TABLE leveringen RENAME COLUMN voertuig TO voertuig_levering;
ALTER TABLE leveringen ADD COLUMN voertuig_afhaling TEXT;
