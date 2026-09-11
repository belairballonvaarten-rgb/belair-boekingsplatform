function vereistIngelogd(req, res, next) {
  // Tijdelijke diagnose-log (mag later terug weg) om het sessie/cookie-probleem te vinden.
  console.log(
    '[vereistIngelogd]', req.method, req.originalUrl,
    '| sessionID:', req.sessionID,
    '| adminId in sessie:', req.session && req.session.adminId,
    '| cookie-header aanwezig:', Boolean(req.headers.cookie)
  );
  if (req.session && req.session.adminId) {
    return next();
  }
  return res.status(401).json({ fout: 'Niet ingelogd' });
}

module.exports = { vereistIngelogd };
