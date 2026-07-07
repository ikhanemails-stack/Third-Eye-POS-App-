const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');

// POST /api/auth/login
router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const users = await Promise.resolve(db.all('users'));
    const user = users.find(u => u.username === username);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    if (!user.passwordHash) {
      return res.status(401).json({ success: false, message: 'User account not fully set up' });
    }

    const isMatch = bcrypt.compareSync(password, user.passwordHash);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    req.session.userId = user.id;
    req.session.role = user.role;

    res.json({
      success: true,
      user: {
        id: user.id,
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
router.post('/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/auth/me', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const users = await Promise.resolve(db.all('users'));
    const user = users.find(u => u.id === req.session.userId);

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
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