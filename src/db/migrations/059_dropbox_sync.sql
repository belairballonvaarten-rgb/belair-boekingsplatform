-- Op vraag van Jonas: leveringsfoto's (genomen door de chauffeur in de
-- leveringen-app, die rechtstreeks in deze gedeelde databank schrijft — zie
-- leveringen_fotos) automatisch laten doorkopiëren naar Dropbox, zodat ze
-- niet enkel als ruwe data in de databank blijven zitten. dropbox_pad houdt
-- bij WAAR (welk pad) een foto in Dropbox staat, zodra ze gesynct is — NULL
-- betekent "nog niet gesynct", en dat is meteen ook hoe de periodieke sync
-- (zie utils/dropboxSync.js) weet welke foto's nog moeten gebeuren.
ALTER TABLE leveringen_fotos ADD COLUMN dropbox_pad TEXT;
