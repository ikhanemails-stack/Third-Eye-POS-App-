const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Get database from app locals
    const db = req.app.locals.db;

    if (!db) {
      return res.status(500).json({ success: false, message: 'Database not connected' });
    }

    // Find user directly from MongoDB collection
    const user = await db.collection('users').findOne({ username: username });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    // Check if passwordHash exists
    if (!user.passwordHash) {
      return res.status(401).json({ success: false, message: 'User account not fully set up' });
    }

    // Compare password
    const isMatch = bcrypt.compareSync(password, user.passwordHash);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    // Set session
    req.session.userId = user._id.toString();
    req.session.role = user.role;

    res.json({
      success: true,
      user: {
        id: user._id.toString(),
        username: user.username,
        name: user.name || user.username,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const db = req.app.locals.db;
    const ObjectId = require('mongodb').ObjectId;
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.session.userId) });

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user._id.toString(),
        username: user.username,
        name: user.name || user.username,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Auth check error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;