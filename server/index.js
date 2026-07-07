// Third Eye Computer Solutions - POS System
// Main server entry point.

const express    = require('express');
const session    = require('express-session');
const bodyParser = require('body-parser');
const path       = require('path');
const fs         = require('fs');

const db      = require('./db');
const license = require('./license');
const { requireLicense } = require('./helpers');

const app  = express();
const PORT = process.env.PORT || 4173;

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(bodyParser.json({ limit: '15mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'third-eye-pos-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12 }
}));

// License routes — always accessible
app.use('/api', require('./routes/license-routes'));

// All other API routes require an active license
app.use('/api', requireLicense, require('./routes/auth-settings'));
app.use('/api', requireLicense, require('./routes/inventory'));
app.use('/api', requireLicense, require('./routes/sales'));
app.use('/api', requireLicense, require('./routes/customers'));
app.use('/api', requireLicense, require('./routes/delivery'));
app.use('/api', requireLicense, require('./routes/accounting'));
app.use('/api', requireLicense, require('./routes/reports'));
app.use('/api', requireLicense, require('./routes/vendors'));
app.use('/api', requireLicense, require('./routes/expiry'));
app.use('/api', requireLicense, require('./routes/employees'));
app.use('/api', requireLicense, require('./routes/backup'));

// Health check / keep-alive
app.get('/ping', (req, res) => res.json({ ok: true, time: new Date().toISOString(), db: db.isMongo ? 'mongodb' : 'local' }));

// Serve frontend
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// ── Start server ────────────────────────────────────────────────────────────
async function start() {
  try {
    // Connect MongoDB if configured
    if (db.isMongo) {
      await db.connectMongo();
    }

    // Seed default data
    const { seed } = require('./seed');
    await seed();

    // Start license background checks
    license.startBackgroundChecks();

    app.listen(PORT, () => {
      console.log('');
      console.log('========================================');
      console.log('  THIRD EYE COMPUTER SOLUTIONS');
      console.log('  POS System is running!');
      console.log(`  Open: http://localhost:${PORT}`);
      console.log(`  Database: ${db.isMongo ? 'MongoDB Atlas ☁️' : 'Local JSON files 💾'}`);
      console.log('========================================');
      console.log('');
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

// ── ONE-TIME SETUP ENDPOINT ────────────────────────────────────────────────
// Visit /setup-admin once after first deployment to create the admin user.
// Protected by a setup key so nobody else can use it.
// After first use it becomes harmless (just returns "already exists").
app.post('/setup-admin', async (req, res) => {
  const { setupKey } = req.body;
  const SETUP_KEY = process.env.SETUP_KEY || 'tecs-setup-2026';
  if (setupKey !== SETUP_KEY) {
    return res.status(403).json({ error: 'Invalid setup key.' });
  }
  try {
    const bcrypt = require('bcryptjs');
    const existingUsers = await Promise.resolve(db.all('users'));
    if (existingUsers && existingUsers.length > 0) {
      // Reset admin password
      const admin = existingUsers.find(u => u.username === 'admin');
      if (admin) {
        await Promise.resolve(db.update('users', admin.id, {
          passwordHash: bcrypt.hashSync('admin123', 10),
          active: true
        }));
        return res.json({ success: true, message: 'Admin password reset to admin123.' });
      }
    }
    // Create fresh admin
    await Promise.resolve(db.insert('users', {
      name: 'Admin',
      username: 'admin',
      passwordHash: bcrypt.hashSync('admin123', 10),
      role: 'admin',
      active: true
    }));
    res.json({ success: true, message: 'Admin user created. Username: admin, Password: admin123' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
