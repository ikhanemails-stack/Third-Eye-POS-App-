// Third Eye Computer Solutions - POS System
// Shared helpers and middleware.

function requireLogin(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Not logged in.' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.userId && req.session.role === 'admin') return next();
  return res.status(403).json({ error: 'Admin access required.' });
}

function requireLicense(req, res, next) {
  const license = require('./license');
  const status = license.getActivationStatus();
  if (!status.activated) {
    return res.status(402).json({ error: 'LICENSE_INVALID', details: status });
  }
  next();
}

function roundMoney(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

module.exports = { requireLogin, requireAdmin, requireLicense, roundMoney };
