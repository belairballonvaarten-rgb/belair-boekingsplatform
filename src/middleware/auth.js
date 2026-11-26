function vereistIngelogd(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  return res.status(401).json({ fout: 'Niet ingelogd' });
}

module.exports = { vereistIngelogd };
