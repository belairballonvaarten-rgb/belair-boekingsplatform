-- Nieuwe "Logistiek"-categorie (Crew, Voertuigen, Routeplanning) op het
-- platform, met push-meldingen naar zowel individuele crewleden (indien ze de
-- crew-app gebruiken) als naar een vast "voertuig-account" op de iPad in het
-- voertuig zelf (los van wie er die dag in rijdt — zie 022_voertuig_bemanning_fase
-- voor de dag-/fase-gebonden bemanning zelf, dit hier is enkel voor de login+push).

-- "users" en "push_subscriptions" worden normaal gezien aangemaakt door de
-- leveringen-app zelf (CREATE TABLE IF NOT EXISTS bij het opstarten van die
-- service), niet door een migratie hier. Omdat beide services onafhankelijk
-- van elkaar deployen op dezelfde databank, zou deze migratie hier kunnen
-- draaien vóórdat de leveringen-app ooit is opgestart (bv. op een verse
-- databank) — vandaar deze defensieve kopie van exact hetzelfde schema
-- (zie leveringen-app/server.js), enkel als vangnet. Bestaat de tabel al
-- (het normale geval), dan doet dit niets.
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    naam          TEXT NOT NULL,
    rol           TEXT NOT NULL DEFAULT 'plaatser',
    created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT UNIQUE NOT NULL,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Extra info per crewlid (rechtstreeks in de crew-app's eigen "users"-tabel,
-- die intussen ook in deze gedeelde databank leeft sinds stage 3).
ALTER TABLE users ADD COLUMN telefoon TEXT;
ALTER TABLE users ADD COLUMN opmerking TEXT;

-- Toegangscode voor het vaste voertuig-account (de iPad logt hiermee in de
-- crew-app in, één keer, en blijft dan permanent ingelogd als "dat voertuig"
-- — onafhankelijk van welk crewlid er die dag mee rijdt). NULL = nog geen
-- toegang ingesteld voor dit voertuig.
ALTER TABLE voertuigen ADD COLUMN toegangscode TEXT;

-- Een pushabonnement hoort voortaan bij een gebruiker ÓF bij een voertuig
-- (nooit allebei) — user_id was al nullable, voertuig_id komt er nu bij.
ALTER TABLE push_subscriptions ADD COLUMN voertuig_id UUID REFERENCES voertuigen(id) ON DELETE CASCADE;

-- Bewaart elke verstuurde melding (naar een crewlid of een voertuig) als
-- eenvoudige geschiedenis — vooral bedoeld voor het voertuig-scherm op de
-- iPad, dat zo ook meldingen kan tonen die binnenkwamen terwijl de iPad dicht
-- of niet verbonden was (web push zelf onthoudt niets, dit tabelletje wel).
CREATE TABLE voertuig_meldingen (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voertuig_id    UUID REFERENCES voertuigen(id) ON DELETE CASCADE,
    gebruiker_id   INTEGER,
    titel          TEXT NOT NULL,
    bericht        TEXT NOT NULL,
    aangemaakt_op  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_voertuig_meldingen_voertuig ON voertuig_meldingen (voertuig_id, aangemaakt_op);
