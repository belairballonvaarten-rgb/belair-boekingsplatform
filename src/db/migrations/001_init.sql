-- Belair-Fun boekingsplatform — initieel schema
-- Conform datamodel uit belair-boekingsplatform-plan.md

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- voor gen_random_uuid()

-- ============================================================
-- ADMIN (beheerders van het beheerscherm)
-- ============================================================
CREATE TABLE admins (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    wachtwoord_hash TEXT NOT NULL,
    naam          TEXT,
    aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- KLANT
-- ============================================================
CREATE TABLE klanten (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    naam             TEXT NOT NULL, -- voor bedrijven: bedrijfsnaam; voornaam/achternaam apart opslaan als dat later nodig blijkt
    klant_type       TEXT NOT NULL DEFAULT 'particulier'
        CHECK (klant_type IN ('particulier', 'bedrijf')),
    btw_nummer       TEXT, -- enkel relevant bij klant_type = 'bedrijf'
    adres            TEXT,
    postcode         TEXT,
    gemeente         TEXT,
    telefoon         TEXT,
    email            TEXT,
    marketing_opt_in TEXT NOT NULL DEFAULT 'nog_niet_gevraagd'
        CHECK (marketing_opt_in IN ('ja', 'nee', 'nog_niet_gevraagd')),
    aangemaakt_op    TIMESTAMPTZ NOT NULL DEFAULT now(),
    bijgewerkt_op    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_klanten_email ON klanten (email);
CREATE INDEX idx_klanten_naam ON klanten (naam);

-- ============================================================
-- PRODUCT
-- ============================================================
CREATE TABLE producten (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    naam                      TEXT NOT NULL,
    categorieen               TEXT[] NOT NULL DEFAULT '{}', -- bv. {'Springkastelen','Attracties'}
    sku                       TEXT UNIQUE,
    prijs                     NUMERIC(10,2) NOT NULL DEFAULT 0,
    weekdagprijs              NUMERIC(10,2),
    meerdaagse_prijstabel     JSONB DEFAULT '{}'::jsonb, -- bv. {"2": 300, "3": 400}
    max_boekingen_per_dag     INTEGER NOT NULL DEFAULT 1,
    availability_buffer_dagen INTEGER NOT NULL DEFAULT 0,
    overnachting_mogelijk     BOOLEAN NOT NULL DEFAULT false,
    overnachting_toeslag      NUMERIC(10,2),
    parent_id                 UUID REFERENCES producten(id), -- voor parent/child bundels
    korting_toegelaten        BOOLEAN NOT NULL DEFAULT true,
    zichtbaarheid             TEXT NOT NULL DEFAULT 'bookbaar'
        CHECK (zichtbaarheid IN ('featured', 'bookbaar', 'hidden')),
    afbeeldingen              TEXT[] DEFAULT '{}',
    afmetingen                TEXT,
    leeftijdscategorie        TEXT,
    kostprijs                 NUMERIC(10,2), -- optioneel, voor marge-berekening (niet publiek)
    aangemaakt_op             TIMESTAMPTZ NOT NULL DEFAULT now(),
    bijgewerkt_op             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_producten_zichtbaarheid ON producten (zichtbaarheid);
CREATE INDEX idx_producten_categorieen ON producten USING GIN (categorieen);

-- Accessoires: koppeltabel product <-> product (een accessoire is ook een product)
CREATE TABLE product_accessoires (
    product_id     UUID NOT NULL REFERENCES producten(id) ON DELETE CASCADE,
    accessoire_id  UUID NOT NULL REFERENCES producten(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, accessoire_id)
);

-- ============================================================
-- TEST / KEURING (per product)
-- ============================================================
CREATE TABLE keuringen (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id    UUID NOT NULL REFERENCES producten(id) ON DELETE CASCADE,
    type_keuring  TEXT NOT NULL,
    vervaldatum   DATE NOT NULL,
    aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_keuringen_vervaldatum ON keuringen (vervaldatum);
CREATE INDEX idx_keuringen_product ON keuringen (product_id);

-- ============================================================
-- AANVRAAG / BOEKING (één entiteit, evolueert via status)
-- ============================================================
CREATE TABLE boekingen (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    klant_id          UUID NOT NULL REFERENCES klanten(id),
    status            TEXT NOT NULL DEFAULT 'nieuw' CHECK (status IN (
                          'nieuw',
                          'in_behandeling',
                          'geaccepteerd',
                          'geweigerd',
                          'ingepland',
                          'bevestigd',
                          'betaalverzoek_verstuurd',
                          'betaald_deels',
                          'betaald_volledig',
                          'gefactureerd'
                      )),
    gewenste_datum_start DATE NOT NULL,
    gewenste_datum_einde  DATE NOT NULL, -- gelijk aan start bij een 1-dagsboeking
    leveringswijze    TEXT NOT NULL DEFAULT 'levering'
        CHECK (leveringswijze IN ('levering', 'afhaling')), -- "Levering door ons team" vs. "Afhaling door klant"
    leveringsadres    TEXT, -- plaatsingsadres — kan afwijken van het adres van de klant zelf
    type_ondergrond   TEXT, -- bv. steen, gras, ...
    toegankelijkheid  TEXT, -- bv. vrije doorgang, trap, smalle doorgang, ...
    voorkeur_tijdstip_levering  TEXT, -- vrije tekst, bv. "Tussen 07:00 en 09:00 uur"
    voorkeur_tijdstip_afhaling  TEXT,
    huurvoorwaarden_geaccepteerd    BOOLEAN NOT NULL DEFAULT false,
    huurvoorwaarden_geaccepteerd_op TIMESTAMPTZ,
    notities          TEXT,
    bron              TEXT NOT NULL DEFAULT 'manueel' CHECK (bron IN ('website', 'manueel')),
    weigeringsreden   TEXT,
    weigeringsmail_verstuurd_op TIMESTAMPTZ,
    aangemaakt_op     TIMESTAMPTZ NOT NULL DEFAULT now(),
    bijgewerkt_op     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_boekingen_status ON boekingen (status);
CREATE INDEX idx_boekingen_klant ON boekingen (klant_id);
CREATE INDEX idx_boekingen_datums ON boekingen (gewenste_datum_start, gewenste_datum_einde);

-- Producten binnen een boeking (aantal + prijs op moment van boeken)
CREATE TABLE boeking_producten (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    boeking_id  UUID NOT NULL REFERENCES boekingen(id) ON DELETE CASCADE,
    product_id  UUID NOT NULL REFERENCES producten(id),
    aantal      INTEGER NOT NULL DEFAULT 1,
    prijs       NUMERIC(10,2) NOT NULL -- prijs op moment van boeken (los van latere prijswijzigingen)
);

CREATE INDEX idx_boeking_producten_boeking ON boeking_producten (boeking_id);
CREATE INDEX idx_boeking_producten_product ON boeking_producten (product_id);

-- Statushistoriek (voor audit-trail / tijdlijn in boekingdetail)
CREATE TABLE boeking_status_historiek (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    boeking_id    UUID NOT NULL REFERENCES boekingen(id) ON DELETE CASCADE,
    van_status    TEXT,
    naar_status   TEXT NOT NULL,
    opmerking     TEXT,
    gewijzigd_op  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_status_historiek_boeking ON boeking_status_historiek (boeking_id);

-- ============================================================
-- LEVERING (koppeling naar leveringen-app — brondata, detailplanning leeft daar)
-- ============================================================
CREATE TABLE leveringen (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    boeking_id     UUID NOT NULL UNIQUE REFERENCES boekingen(id) ON DELETE CASCADE,
    voertuig       TEXT,
    leveringstijd  TIMESTAMPTZ,
    afhaaltijd     TIMESTAMPTZ,
    chauffeurs     TEXT[],
    checklist_status TEXT NOT NULL DEFAULT 'open',
    aangemaakt_op  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leveringen_boeking ON leveringen (boeking_id);

-- ============================================================
-- BETALING / FACTUUR
-- ============================================================
CREATE TABLE betalingen (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    boeking_id               UUID NOT NULL REFERENCES boekingen(id) ON DELETE CASCADE,
    bedrag                   NUMERIC(10,2) NOT NULL,
    betaalstatus             TEXT NOT NULL DEFAULT 'open'
        CHECK (betaalstatus IN ('open', 'deels', 'volledig')),
    betaalverzoek_verstuurd_op TIMESTAMPTZ,
    factuurstatus            TEXT NOT NULL DEFAULT 'nog_niet'
        CHECK (factuurstatus IN ('nog_niet', 'verstuurd', 'betaald')),
    manueel_aangevinkt_door  TEXT, -- naam van wie het manueel bevestigde (bv. "Jonas")
    aangemaakt_op            TIMESTAMPTZ NOT NULL DEFAULT now(),
    bijgewerkt_op            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_betalingen_boeking ON betalingen (boeking_id);

-- ============================================================
-- E-MAILTEMPLATE
-- ============================================================
CREATE TABLE email_templates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    naam          TEXT NOT NULL,
    onderwerp     TEXT NOT NULL,
    inhoud        TEXT NOT NULL, -- met placeholders zoals {{klantnaam}}, {{datum}}, {{producten}}
    trigger_moment TEXT NOT NULL CHECK (trigger_moment IN (
                        'aanvraag_ontvangen',
                        'bevestigd',
                        'geweigerd',
                        'factuur',
                        'herinnering',
                        'we_komen_eraan',
                        'review_verzoek'
                    )),
    aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT now(),
    bijgewerkt_op TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_email_templates_trigger ON email_templates (trigger_moment);
