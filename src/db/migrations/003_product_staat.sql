-- Houdt bij of een product proper is, of nog gereinigd moet worden na een
-- boeking (nat/vuil). Voorlopig manueel bij te werken vanuit het beheerscherm;
-- automatische koppeling met de leveringen-app volgt in een latere fase.
ALTER TABLE producten ADD COLUMN staat TEXT NOT NULL DEFAULT 'proper'
    CHECK (staat IN ('proper', 'vuil'));
ALTER TABLE producten ADD COLUMN staat_bijgewerkt_op TIMESTAMPTZ NOT NULL DEFAULT now();
