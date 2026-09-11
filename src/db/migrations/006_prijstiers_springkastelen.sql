-- Vult weekendprijs en afhaalprijs aan voor de springkastelen die al via
-- 004_seed_springkastelen.sql zijn toegevoegd, opgehaald van de individuele
-- productpagina's op belair-fun.be. Enkele producten tonen op de site zelf
-- een ongewone/ontbrekende prijs (zie opmerkingen) - gerust nakijken en
-- corrigeren via het productbeheerscherm indien nodig.

UPDATE producten SET weekendprijs = 580, afhaalprijs = 490 WHERE sku = 'springkasteel-super-slide-xxl';
UPDATE producten SET weekendprijs = 280, afhaalprijs = 255 WHERE sku = 'springkasteel-piet-piraat';
UPDATE producten SET weekendprijs = 295, afhaalprijs = 250 WHERE sku = 'springkasteel-plop-melkherberg';
UPDATE producten SET weekendprijs = 285, afhaalprijs = 240 WHERE sku = 'springkasteel-nachtwacht-combislide';
UPDATE producten SET weekendprijs = 240, afhaalprijs = 210 WHERE sku = 'springkasteel-bumba-ballenbad';
UPDATE producten SET weekendprijs = 255, afhaalprijs = 215 WHERE sku = 'springkasteel-comic-double-slide';
UPDATE producten SET weekendprijs = 270, afhaalprijs = 225 WHERE sku = 'springkasteel-summer-party';
UPDATE producten SET weekendprijs = 255, afhaalprijs = 215 WHERE sku = 'springkasteel-unicorn-xl';
UPDATE producten SET weekendprijs = 285, afhaalprijs = 230 WHERE sku = 'springkasteel-super-dino';
UPDATE producten SET weekendprijs = 260, afhaalprijs = 210 WHERE sku = 'springkasteel-dino-multiplay';
UPDATE producten SET weekendprijs = 230, afhaalprijs = 190 WHERE sku = 'springkasteel-speeleiland-jungle';
UPDATE producten SET weekendprijs = 265, afhaalprijs = 225 WHERE sku = 'springkasteel-unicorn-xxl';
UPDATE producten SET weekendprijs = 275, afhaalprijs = 225 WHERE sku = 'springkasteel-prinses-multiplay';
UPDATE producten SET weekendprijs = 230, afhaalprijs = 190 WHERE sku = 'springkasteel-safaripark';
UPDATE producten SET weekendprijs = 260, afhaalprijs = 210 WHERE sku = 'springkasteel-legopark';
UPDATE producten SET weekendprijs = 265, afhaalprijs = 215 WHERE sku = 'springkasteel-gorilla-slide';
UPDATE producten SET weekendprijs = NULL, afhaalprijs = NULL WHERE sku = 'springkasteel-frozen';
UPDATE producten SET weekendprijs = 280, afhaalprijs = 230 WHERE sku = 'springkasteel-drakenburcht';
UPDATE producten SET weekendprijs = 250, afhaalprijs = 210 WHERE sku = 'springkasteel-dinopark';
UPDATE producten SET weekendprijs = 260, afhaalprijs = 220 WHERE sku = 'springkasteel-beach-paradise';
UPDATE producten SET weekendprijs = 299, afhaalprijs = 450 WHERE sku = 'springkasteel-wickie-de-viking';
UPDATE producten SET weekendprijs = 250, afhaalprijs = 210 WHERE sku = 'springkasteel-aap-springkasteel';
UPDATE producten SET weekendprijs = 270, afhaalprijs = 225 WHERE sku = 'springkasteel-super-disco';
UPDATE producten SET weekendprijs = 265, afhaalprijs = 220 WHERE sku = 'springkasteel-disco-party';
UPDATE producten SET weekendprijs = 265, afhaalprijs = 210 WHERE sku = 'springkasteel-piraat-shooter';
UPDATE producten SET weekendprijs = 275, afhaalprijs = 220 WHERE sku = 'springkasteel-brandweer';
UPDATE producten SET weekendprijs = 170, afhaalprijs = 255 WHERE sku = 'springkasteel-prinsessia';
UPDATE producten SET weekendprijs = 199, afhaalprijs = 295 WHERE sku = 'springkasteel-kabouter-plop';
UPDATE producten SET weekendprijs = 370, afhaalprijs = 320 WHERE sku = 'springkasteel-big-bellyslide';
UPDATE producten SET weekendprijs = 350, afhaalprijs = 290 WHERE sku = 'springkasteel-klimtoren-jungle';
UPDATE producten SET weekendprijs = 250, afhaalprijs = 200 WHERE sku = 'springkasteel-party-animal';
UPDATE producten SET weekendprijs = 250, afhaalprijs = 220 WHERE sku = 'springkasteel-monkey-party';
UPDATE producten SET weekendprijs = 265, afhaalprijs = 210 WHERE sku = 'springkasteel-eenhoorn-multiplay';
UPDATE producten SET weekendprijs = 240, afhaalprijs = 190 WHERE sku = 'springkasteel-unicorn-combo';
UPDATE producten SET weekendprijs = 325, afhaalprijs = 285 WHERE sku = 'springkasteel-swing-him-off';
UPDATE producten SET weekendprijs = 240, afhaalprijs = 210 WHERE sku = 'springkasteel-bumba-minibounce';
UPDATE producten SET weekendprijs = 240, afhaalprijs = 210 WHERE sku = 'springkasteel-bumba-kidszone';
UPDATE producten SET weekendprijs = NULL, afhaalprijs = 275 WHERE sku = 'springkasteel-k3-springkasteel';
UPDATE producten SET weekendprijs = 225, afhaalprijs = 205 WHERE sku = 'springkasteel-samson-en-marie';
UPDATE producten SET weekendprijs = 285, afhaalprijs = 235 WHERE sku = 'springkasteel-maya-de-bij';
UPDATE producten SET weekendprijs = 185, afhaalprijs = 270 WHERE sku = 'springkasteel-rups-kruiptunnel';
