-- Reservaties kunnen nu ook in bulk uit een Excel-bestand geïmporteerd worden
-- (naast 'website' en 'manueel') — zie src/routes/reservatie-import.js.
ALTER TABLE boekingen DROP CONSTRAINT boekingen_bron_check;
ALTER TABLE boekingen ADD CONSTRAINT boekingen_bron_check
    CHECK (bron IN ('website', 'manueel', 'excel-import'));
