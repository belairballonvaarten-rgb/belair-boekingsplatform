-- Seed: bestaande springkastelen overgenomen van belair-fun.be/springkastelen/
-- Enkel basisgegevens (naam, prijs, afmetingen, foto) — Jonas kan max. boekingen
-- per dag, buffer-dagen en zichtbaarheid nadien nog verfijnen per product.
-- ON CONFLICT (sku) DO NOTHING zodat dit veilig herhaald kan worden.

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Super Slide XXL', ARRAY['Springkastelen'], 'springkasteel-super-slide-xxl', 420, '10m x 7m x 7m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/comic-slide-2.0-4.jpg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Piet Piraat', ARRAY['Springkastelen'], 'springkasteel-piet-piraat', 190, '8m x 3.2m x 4m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Pietpiraat-1024x662.png'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Plop Melkherberg', ARRAY['Springkastelen'], 'springkasteel-plop-melkherberg', 199, '5m x 5m x 5m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/melkherberg.png'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Nachtwacht Combislide', ARRAY['Springkastelen'], 'springkasteel-nachtwacht-combislide', 190, '5.5m x 5.2m x 5.1m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Nachtwachtcombislide-1024x861.png'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Bumba Ballenbad', ARRAY['Springkastelen'], 'springkasteel-bumba-ballenbad', 140, '3.5m x 4.5m x 2.8m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Bumbaballenbadtekening-1024x861.png'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Comic Double Slide', ARRAY['Springkastelen'], 'springkasteel-comic-double-slide', 160, '5m x 4.7m x 3.5m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/01.066.001.102-0.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Summer Party', ARRAY['Springkastelen'], 'springkasteel-summer-party', 175, '5m x 5.5m x 4.2m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Funworld-Summer-Party-2-1.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Unicorn XL', ARRAY['Springkastelen'], 'springkasteel-unicorn-xl', 170, '5.5m x 5.5m x 3.2m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/XL-Unicorn-3.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Super Dino', ARRAY['Springkastelen'], 'springkasteel-super-dino', 185, '9m x 5.4m x 4m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Y4A0579-1.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Dino multiplay', ARRAY['Springkastelen'], 'springkasteel-dino-multiplay', 160, '5m x 5.5m x 4m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/multiplay-dino-2-940x652-1.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Speeleiland jungle', ARRAY['Springkastelen'], 'springkasteel-speeleiland-jungle', 150, '7m x 4m x 2.3m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Speeleiland-jungle-.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Unicorn XXL', ARRAY['Springkastelen'], 'springkasteel-unicorn-xxl', 185, '5.8m x 6m x 3.5m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Unicorn-XL--1024x469.jpg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Prinses multiplay', ARRAY['Springkastelen'], 'springkasteel-prinses-multiplay', 175, '5.2m x 5m x 3.2m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Prinses-1-.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Safaripark', ARRAY['Springkastelen'], 'springkasteel-safaripark', 140, '5m x 4m x 3.5m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Safaripark.png'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Legopark', ARRAY['Springkastelen'], 'springkasteel-legopark', 160, '5.2m x 5.6m x 3m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Legopark.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Gorilla Slide', ARRAY['Springkastelen'], 'springkasteel-gorilla-slide', 165, '4.5m x 3.6m x 4.3m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Gorilla-Slide-.webp'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Frozen', ARRAY['Springkastelen'], 'springkasteel-frozen', 155, '5.2m x 5m x 3.2m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Frozen-1024x576.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Drakenburcht', ARRAY['Springkastelen'], 'springkasteel-drakenburcht', 190, '8.5m x 2.8m x 4m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Drakenburcht.png'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Dinopark', ARRAY['Springkastelen'], 'springkasteel-dinopark', 150, '5.6m x 5.2m x 4m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Dinopark.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Beach Paradise', ARRAY['Springkastelen'], 'springkasteel-beach-paradise', 190, '9m x 5m x 4.7m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Beach-Paradise-.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Wickie De Viking', ARRAY['Springkastelen'], 'springkasteel-wickie-de-viking', 299, '14m x 4m x 5.8m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/thumb_wickie.png'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Aap springkasteel', ARRAY['Springkastelen'], 'springkasteel-aap-springkasteel', 150, '5.2m x 6.9m x 5m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Multifun-Jungle-nw-1-940x652-1.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Super Disco', ARRAY['Springkastelen'], 'springkasteel-super-disco', 195, '5.5m x 5.5m x 4m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Disco-multi-thema-55m-Grown-ups-2-940x652-1.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Disco party', ARRAY['Springkastelen'], 'springkasteel-disco-party', 185, '5m x 5m x 4m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Disco-multi-thema-35m-Kids-2-940x652-1.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Piraat shooter', ARRAY['Springkastelen'], 'springkasteel-piraat-shooter', 185, '6.3m x 5m x 4m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Shooting-combo-small-Piraat-1-940x652-1.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Brandweer', ARRAY['Springkastelen'], 'springkasteel-brandweer', 175, '6m x 6.5m x 2.8m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Indoor-springkussen-brandweer-1-940x652-1.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Prinsessia', ARRAY['Springkastelen'], 'springkasteel-prinsessia', 170, '5m x 5.5m x 4.2m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/9-1024x1024-1.png'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Kabouter Plop', ARRAY['Springkastelen'], 'springkasteel-kabouter-plop', 199, '6m x 7m x 4.2m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Plop1-1024x684.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Big Bellyslide', ARRAY['Springkastelen'], 'springkasteel-big-bellyslide', 250, '13.7m x 3.8m x 3.7m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Y4A6484-1.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Klimtoren Jungle', ARRAY['Springkastelen'], 'springkasteel-klimtoren-jungle', 240, '7m x 7m x 4.3m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/klimtoren-jungle-2-vrijstaand.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Party Animal', ARRAY['Springkastelen'], 'springkasteel-party-animal', 150, '4m x 4.3m x 3.5m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/L-Party-3-1.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Monkey Party', ARRAY['Springkastelen'], 'springkasteel-monkey-party', 150, '4m x 4.9m x 4m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Y4A5259-2.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Eenhoorn multiplay', ARRAY['Springkastelen'], 'springkasteel-eenhoorn-multiplay', 165, '5m x 5.5m x 4m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/unnamed-file-3.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Unicorn Combo', ARRAY['Springkastelen'], 'springkasteel-unicorn-combo', 150, '4.9m x 3.9m x 3.3m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/MG_3697-1.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Swing him off', ARRAY['Springkastelen'], 'springkasteel-swing-him-off', 210, '8m x 8m x 7.5m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/swing-him-off-4.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Bumba Minibounce', ARRAY['Springkastelen'], 'springkasteel-bumba-minibounce', 140, '3m x 3.4m x 2.1m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/bumbaspringkasteel-1-1024x768.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Bumba Kidszone', ARRAY['Springkastelen'], 'springkasteel-bumba-kidszone', 140, '6m x 4m x 1.8m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/6-1024x1024-1.png'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('K3 springkasteel', ARRAY['Springkastelen'], 'springkasteel-k3-springkasteel', 190, '5.3m x 5.4m x 3.2m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/K3multislide3D-1024x613-1.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Samson & Marie', ARRAY['Springkastelen'], 'springkasteel-samson-en-marie', 150, '5m x 4m x 3m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Samsonmarie1.png'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Maya De Bij', ARRAY['Springkastelen'], 'springkasteel-maya-de-bij', 190, '5m x 5.4m x 3.8m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/Maya1-1024x684.jpeg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO producten (naam, categorieen, sku, prijs, afmetingen, afbeeldingen, zichtbaarheid)
VALUES ('Rups kruiptunnel', ARRAY['Springkastelen'], 'springkasteel-rups-kruiptunnel', 170, '8m x 6m x 3m', ARRAY['https://cdn.belair-fun.be/wp-content/uploads/kruiptunnel-1024x553.jpg'], 'bookbaar')
ON CONFLICT (sku) DO NOTHING;

