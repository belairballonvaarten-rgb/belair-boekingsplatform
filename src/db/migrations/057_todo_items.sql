-- Jonas' eigen, vrije TODO-lijstje (op vraag van Jonas: "random zaken die ik
-- nog wil doen", los van boekingen/klanten) — getoond als apart paneel naast
-- "Nog te factureren" op de Dagoverzicht-pagina. Bewust GEEN koppeling naar
-- boekingen/klanten: puur losse tekst + afgevinkt of niet.
CREATE TABLE todo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tekst TEXT NOT NULL,
  afgewerkt BOOLEAN NOT NULL DEFAULT false,
  aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT now(),
  afgewerkt_op TIMESTAMPTZ
);
