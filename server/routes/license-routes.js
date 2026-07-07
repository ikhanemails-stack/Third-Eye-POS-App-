// Third Eye Computer Solutions - POS System
// License activation routes.

const express = require('express');
const license = require('../license');

const router = express.Router();

router.get('/license/status', (req, res) => {
  res.json(license.getStatusAndTriggerCheck());
});

router.post('/license/recheck', async (req, res) => {
  await license.runRevocationCheck();
  res.json(license.getActivationStatus());
});

router.post('/license/activate', async (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey) return res.status(400).json({ error: 'Please enter a license key.' });
  const result = await license.activate(licenseKey);
  if (!result.success) {
    return res.status(400).json({ error: result.reason });
  }
  res.json({ success: true, payload: result.payload });
});

module.exports = router;
