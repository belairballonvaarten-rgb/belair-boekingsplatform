-- Nieuwe, visuele opmaak voor de "Aanvraag goed ontvangen"-mail (op vraag van
-- Jonas, ter inspiratie van een gelijkaardige mail van een andere
-- verhuurder — kaartjes per product met eigen afbeelding, een opvallend
-- prijsvak, en de eigen Belair-Fun-huisstijlkleuren/logo-header).
--
-- BELANGRIJK: deze inhoud wordt in Instellingen bewerkt via Quill (de
-- rich-text-editor) — en Quill kent geen <table>-opmaak. Daarom bevat de
-- hieronder opgeslagen inhoud bewust GEEN ruwe <table>/kleur-HTML meer, enkel
-- platte plaatshouders + een paar korte, vrij te bewerken tekstregels. De
-- plaatshouders {{header_afbeelding}}, {{gegevensblok}}, {{producten_kaarten}}
-- en {{prijsblok}} worden pas op verzendmoment vervangen door kant-en-klare
-- HTML-blokken, opgebouwd in utils/mailTemplates.js — zo kan Jonas de tekst
-- hier gerust aanpassen zonder de opmaak te kunnen breken.
-- {{bevestig_knop}} (klantzelfbevestiging, migratie 034) blijft gewoon staan.
UPDATE mail_templates
SET
  onderwerp = 'Goed nieuws! {{producten}} is beschikbaar — Belair-Fun',
  inhoud = '{{header_afbeelding}}
{{gegevensblok}}
{{producten_kaarten}}
{{prijsblok}}
<p>Kan u ons bevestigen dat u de reservatie wenst te maken? Klik hieronder op de knop — na uw bevestiging maken we er een definitieve reservatie van en ontvangt u een betaalverzoek.</p>
{{bevestig_knop}}
<p>Met vriendelijke groeten,<br>Belair-Fun</p>',
  bijgewerkt_op = now()
WHERE rol = 'aanvraag_bevestiging';
