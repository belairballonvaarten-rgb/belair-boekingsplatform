-- E-mailtemplates per boeking (op vraag van Jonas): een beperkte set
-- vaste, maar door hem zelf aanpasbare, sjablonen die hij manueel vanuit een
-- boekingdossier verstuurt via zijn eigen Microsoft 365 (zie utils/mailer.js).
-- {{...}}-plaatshouders worden bij het versturen vervangen door de gegevens
-- van die ene boeking (zie utils/mailTemplates.js). Nieuwe templates kunnen
-- gewoon via Instellingen bijgemaakt worden ("eventueel andere templates
-- kunnen ten alle tijde nog toegevoegd worden" — letterlijke vraag van Jonas).
CREATE TABLE mail_templates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    naam          TEXT NOT NULL,
    onderwerp     TEXT NOT NULL,
    inhoud        TEXT NOT NULL,
    aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT now(),
    bijgewerkt_op TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO mail_templates (naam, onderwerp, inhoud) VALUES
(
  'Aanvraag goed ontvangen',
  'Uw aanvraag bij Belair-Fun — {{producten}}',
  'Beste {{klant_naam}},

Bedankt voor uw aanvraag en interesse in Belair-Fun!

Goed nieuws: {{producten}} is beschikbaar op {{periode}}.

De prijs hiervoor bedraagt {{prijs}}. Transportkost: {{transportkost}} (afhankelijk van de afstand, zie hieronder). Totaal: {{totaal}}.

Kan u ons bevestigen dat u de reservatie wenst te maken? Antwoord gerust op deze mail — na uw bevestiging maken we er een definitieve reservatie van en ontvangt u een betaalverzoek.

Met vriendelijke groeten,
Belair-Fun'
),
(
  'Aanvraag Betaalverzoek',
  'Betaalverzoek ter bevestiging van uw reservatie — Belair-Fun',
  'Beste {{klant_naam}},

Bedankt voor uw bevestiging! Om uw reservatie voor {{producten}} op {{periode}} definitief te maken, vragen we u onderstaand bedrag te voldoen.

Totaalbedrag: {{totaal}}
Nog te betalen: {{saldo}}

Zodra de betaling binnen is, is uw reservatie definitief bevestigd.

Met vriendelijke groeten,
Belair-Fun'
),
(
  'Review mail',
  'Bedankt van Belair-Fun — mogen we u om een review vragen?',
  'Beste {{klant_naam}},

We hopen dat {{producten}} in de smaak viel! Zou u ons een dienst willen bewijzen door hierover een korte review achter te laten? Dat helpt ons enorm.

Alvast hartelijk bedankt.

Met vriendelijke groeten,
Belair-Fun'
);
