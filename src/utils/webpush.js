// Verstuurt push-meldingen naar crewleden (telefoon, via de leveringen-app)
// of naar een vast voertuig-toestel (iPad) — beide abonnementen staan in de
// gedeelde 'push_subscriptions'-tabel (zie migratie 025). Gebruikt dezelfde
// VAPID-sleutels als de leveringen-app: kopieer VAPID_PUBLIC_KEY/
// VAPID_PRIVATE_KEY/VAPID_SUBJECT van die Render-service naar deze.
const webpush = require('web-push');

let geconfigureerd = false;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:info@belair-fun.be',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  geconfigureerd = true;
}

function isGeconfigureerd() {
  return geconfigureerd;
}

// db: de gedeelde db-module (voor het opkuisen van verlopen abonnementen).
// subs: rijen uit push_subscriptions ({id, endpoint, p256dh, auth}).
// payload: object, wordt als JSON meegestuurd ({title, message, url?}).
async function stuurNaarAbonnementen(db, subs, payload) {
  let verstuurd = 0;
  let mislukt = 0;
  for (const sub of subs) {
    const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
    try {
      await webpush.sendNotification(pushSub, JSON.stringify(payload));
      verstuurd++;
    } catch (err) {
      mislukt++;
      if (err.statusCode === 404 || err.statusCode === 410) {
        await db.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
      }
    }
  }
  return { verstuurd, mislukt };
}

module.exports = { isGeconfigureerd, stuurNaarAbonnementen };
