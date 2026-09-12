-- Ruwe opvang van formulier-inzendingen die van de (huidige en toekomstige)
-- website binnenkomen via een webhook (bv. Gravity Forms Webhooks-uitbreiding).
-- Bewust helemaal los van "aanvragen"/"boekingen": dit is voorlopig enkel om
-- te bekijken wat en hoe de data binnenkomt, zonder de bestaande e-mailflow
-- naar Jonas' mailbox te raken of automatisch iets aan te maken.
CREATE TABLE website_inzendingen (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ontvangen_op  TIMESTAMPTZ NOT NULL DEFAULT now(),
    bron          TEXT NOT NULL DEFAULT 'website-formulier',
    ruwe_data     JSONB NOT NULL,
    verwerkt      BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_website_inzendingen_ontvangen_op ON website_inzendingen (ontvangen_op DESC);
