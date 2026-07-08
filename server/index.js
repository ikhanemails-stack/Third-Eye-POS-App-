// Third Eye Computer Solutions - POS System
const express    = require('express');
const session    = require('express-session');
const bodyParser = require('body-parser');
const path       = require('path');
const fs         = require('fs');
const db         = require('./db');
const license    = require('./license');
const { requireLicense } = require('./helpers');

const app  = express();
const PORT = process.env.PORT || 4173;

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(bodyParser.json({ limit: '15mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'third-eye-pos-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12 }
}));

app.use('/api', require('./routes/license-routes'));
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

app.get('/ping', (req, res) => res.json({ ok: true, db: db.isMongo ? 'mongodb' : 'local' }));

// One-time admin setup endpoint
app.post('/setup-admin', async (req, res) => {
  const { setupKey } = req.body;
  if ((setupKey || '') !== (process.env.SETUP_KEY || 'tecs-setup-2026')) {
    return res.status(403).json({ error: 'Invalid setup key.' });
  }
  try {
    const bcrypt = require('bcryptjs');
    const users = db.all('users');
    const admin = users.find(u => u.username === 'admin');
    if (admin) {
      db.update('users', admin.id, { passwordHash: bcrypt.hashSync('admin123', 10), active: true });
      return res.json({ success: true, message: 'Admin password reset to admin123.' });
    }
    db.insert('users', { name:'Admin', username:'admin', passwordHash: bcrypt.hashSync('admin123',10), role:'admin', active:true });
    res.json({ success: true, message: 'Admin created. Username: admin, Password: admin123' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

async function start() {
  try {
    if (db.isMongo) {
      await db.initMongo(); // connects + loads all data into memory cache
    }
    const { seed } = require('./seed');
    await seed();
    license.startBackgroundChecks();
    app.listen(PORT, () => {
      console.log('');
      console.log('========================================');
      console.log('  THIRD EYE COMPUTER SOLUTIONS');
      console.log('  POS System is running!');
      console.log(`  Open: http://localhost:${PORT}`);
      console.log(`  Database: ${db.isMongo ? 'MongoDB Atlas ☁️' : 'Local JSON 💾'}`);
      console.log('========================================');
    });
  } catch(err) {
    console.error('Failed to start:', err.message);
    process.exit(1);
  }
}

start();
