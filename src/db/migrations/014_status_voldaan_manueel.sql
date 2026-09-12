-- Nieuwe eindstatus "voldaan_manueel" naast het bestaande "gefactureerd" —
-- beide betekenen voor Jonas "dit is afgehandeld, het saldo staat op nul",
-- zonder de betaalverzoek-tussenstap te moeten doorlopen.
ALTER TABLE boekingen DROP CONSTRAINT boekingen_status_check;
ALTER TABLE boekingen ADD CONSTRAINT boekingen_status_check CHECK (status IN (
    'nieuw',
    'in_behandeling',
    'geaccepteerd',
    'geweigerd',
    'ingepland',
    'bevestigd',
    'betaalverzoek_verstuurd',
    'betaald_deels',
    'betaald_volledig',
    'gefactureerd',
    'voldaan_manueel'
));
