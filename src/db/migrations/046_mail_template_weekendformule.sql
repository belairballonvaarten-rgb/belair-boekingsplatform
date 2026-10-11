-- Tweede aanvraagbevestigings-template, op vraag van Jonas: in drukke
-- periodes (bv. 2027) verhuurt hij bepaalde producten enkel nog per volledig
-- weekend, niet per losse dag. Een aanvraag voor 1 dag in zo'n periode wordt
-- dan niet zomaar bevestigd, maar moet eerst uitgelegd/herkaderd worden naar
-- de klant toe (de weekendformule, met de slecht-weer-garantie) — vandaar een
-- EIGEN template i.p.v. de bestaande "Aanvraagbevestiging" (rol
-- 'aanvraag_bevestiging', die blijft dus ongewijzigd voor het gangbare,
-- directe geval).
--
-- Bewust GEEN rol (rol = NULL): dit wordt NIET aan Knop 1 bovenaan het
-- dossier gekoppeld (dat blijft de bestaande, directe template), maar
-- verschijnt gewoon als extra keuze in de vrije templatelijst bij
-- Communicatie in elk dossier — Jonas kiest per aanvraag welke van de twee
-- van toepassing is.
--
-- Zelfde opbouw/plaatshouders als de bestaande aanvraagbevestiging (zie
-- migratie 039 en utils/mailTemplates.js): {{header_afbeelding}},
-- {{gegevensblok}} en {{producten_kaarten}} geven dezelfde header/klantkader/
-- productkaartjes, {{prijsblok}} toont de ECHTE, berekende prijs van DEZE
-- boeking (dus geen vast bedrag zoals "220€" overnemen uit Jonas' eigen
-- voorbeeldmail — dat zou bij een ander product/periode fout staan), en
-- {{bevestig_knop}} is dezelfde bevestigingsknop als bij de andere template.
INSERT INTO mail_templates (naam, onderwerp, inhoud, rol) VALUES (
  'Aanvraagbevestiging — weekendformule (drukke periode)',
  'Goed nieuws over uw aanvraag ({{producten}}) — weekendformule — Belair-Fun',
  '{{header_afbeelding}}
{{gegevensblok}}
{{producten_kaarten}}
<p>Om alles vlot, veilig en zonder stress te laten verlopen, werken wij in de drukkere periodes uitsluitend met onze zorgeloze weekendformule.</p>
<p>Deze aanpak wijkt inderdaad licht af van een klassieke dagverhuur, maar wordt door klanten net gekozen omwille van het comfort en de rust die ze biedt.</p>
<p><strong>Wat betekent dit concreet voor u?</strong></p>
<ul>
<li>levering op voorhand (vrijdag of zaterdag, afhankelijk van de planning)</li>
<li>geen tijdsdruk of vaste ophaaltijd tijdens het feest</li>
<li>ophaling pas zondagavond of maandag</li>
<li>meer flexibiliteit bij wisselende weersomstandigheden</li>
</ul>
<p>Zo kan het feest rustig verlopen en hoeft u zich op de dag zelf nergens zorgen over te maken.</p>
{{prijsblok}}
<p>Na uw bevestiging bezorgen wij u een betaalverzoek. De reservatie is definitief na ontvangst van de betaling, zodat wij alles correct kunnen vastleggen in onze planning en dubbele boekingen vermijden.</p>
<p><strong>💧 Slecht-weer garantie</strong><br>Bij slecht weer kan de reservatie tot 12 uur voor levering kosteloos geannuleerd worden. In dat geval wordt het volledige bedrag teruggestort.</p>
<p>Kan u ons bevestigen dat u de reservatie met deze weekendformule wenst te maken? Klik hieronder op de knop om uw aanvraag definitief vast te leggen.</p>
{{bevestig_knop}}
<p>Met vriendelijke groeten,<br>Belair-Fun</p>',
  NULL
);
