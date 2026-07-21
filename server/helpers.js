// Third Eye Computer Solutions - POS System
// Shared middleware helpers.

function requireLogin(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Not logged in.' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.userId && req.session.role === 'admin') return next();
  return res.status(403).json({ error: 'Admin access required.' });
}

// Driver accounts (role === 'driver') are restricted to the Delivery module
// only — they should not be able to see or touch sales, accounting,
// inventory edits, vendors, reports, staff accounts, backups, etc.
// Applied globally in index.js right after the session middleware.
// Allowed at all times: auth (login/logout/me), license status, settings
// (branding/currency needed for the shell to render), delivery + drivers.
// Allowed read-only (GET): products/categories + customers, since the
// Delivery screen (and Quick Cart, used from the driver's Delivery screen)
// needs to search products and look up/add customers.
//
// Bug fixed here: this used to check for a '/inventory' path prefix, but
// the app never actually mounts anything at /api/inventory — products live
// at /api/products and /api/categories. Every GET a driver made to load
// products, categories, or the drivers list (used for "assign driver") was
// silently 403'd, which is why the Delivery screen hung on
// "Loading deliveries..." forever and product/customer search did nothing
// for driver accounts.
function restrictDriver(req, res, next) {
  if (!req.session || req.session.role !== 'driver') return next();
  const p = req.path; // relative to the /api mount point
  const alwaysAllowed = ['/auth', '/license', '/delivery', '/drivers'];
  if (alwaysAllowed.some(prefix => p.startsWith(prefix))) return next();
  const readOnlyAllowed = ['/products', '/categories', '/customers', '/settings'];
  if (req.method === 'GET' && readOnlyAllowed.some(prefix => p.startsWith(prefix))) return next();
  // Drivers also need to be able to add a new customer from Quick Cart /
  // the delivery form (fixes issue #2/#3 for driver accounts specifically).
  if (req.method === 'POST' && p.startsWith('/customers') && !p.includes('/bulk-delete')) return next();
  return res.status(403).json({ error: 'Driver accounts only have access to the Delivery module.' });
}

function requireLicense(req, res, next) {
  const license = require('./license');
  // Check current status (uses in-memory cache - instant)
  const status = license.getActivationStatus();
  if (!status.activated) {
    // Destroy session immediately so user is logged out
    if (req.session) req.session.destroy(() => {});
    return res.status(402).json({ error: 'LICENSE_INVALID', details: status });
  }
  next();
}

function roundMoney(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

module.exports = { requireLogin, requireAdmin, requireLicense, restrictDriver, roundMoney };
