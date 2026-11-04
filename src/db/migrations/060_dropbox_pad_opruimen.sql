-- Ruimt de dropbox_pad-kolom (migratie 059) weer op: de foto-naar-Dropbox-
-- sync is verplaatst naar de leveringen-app zelf (zodat de ORIGINELE,
-- niet-verkleinde foto naar Dropbox kan — vanuit deze databank kan dat nooit,
-- want hier staat sowieso al enkel de verkleinde versie). Zie
-- utils/dropboxSync.js voor de uitleg. IF EXISTS, want dit moet ook geen
-- probleem geven als migratie 059 hier nooit gedraaid heeft.
ALTER TABLE leveringen_fotos DROP COLUMN IF EXISTS dropbox_pad;
