// Third Eye Computer Solutions - POS System
// Employees / HR module with visa & passport expiry alerts.

const express = require('express');
const db = require('../db');
const { requireLogin, requireAdmin } = require('../helpers');

const router = express.Router();

const ALERT_WINDOW_DAYS = 14;

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / (24 * 60 * 60 * 1000));
}

router.get('/employees', requireLogin, (req, res) => {
  const employees = db.all('employees').map(e => ({
    ...e,
    visaDaysLeft: daysUntil(e.visaExpiry),
    passportDaysLeft: daysUntil(e.passportExpiry)
  }));
  res.json(employees);
});

router.get('/employees/alerts', requireLogin, (req, res) => {
  const employees = db.all('employees');
  const alerts = [];
  employees.forEach(e => {
    const visaDays = daysUntil(e.visaExpiry);
    const passportDays = daysUntil(e.passportExpiry);
    if (visaDays !== null && visaDays <= ALERT_WINDOW_DAYS) {
      alerts.push({ employeeId: e.id, employeeName: e.name, type: 'visa', daysLeft: visaDays, expiryDate: e.visaExpiry });
    }
    if (passportDays !== null && passportDays <= ALERT_WINDOW_DAYS) {
      alerts.push({ employeeId: e.id, employeeName: e.name, type: 'passport', daysLeft: passportDays, expiryDate: e.passportExpiry });
    }
  });
  alerts.sort((a, b) => a.daysLeft - b.daysLeft);
  res.json(alerts);
});

router.post('/employees', requireAdmin, (req, res) => {
  const { name, position, cprNumber, nationality, phone, visaExpiry, passportExpiry, salary, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Employee name is required.' });
  const employee = db.insert('employees', {
    name, position: position || '', cprNumber: cprNumber || '', nationality: nationality || '',
    phone: phone || '', visaExpiry: visaExpiry || null, passportExpiry: passportExpiry || null,
    salary: Number(salary) || 0, notes: notes || '', active: true
  });
  res.json(employee);
});

router.put('/employees/:id', requireAdmin, (req, res) => {
  const allowed = ['name', 'position', 'cprNumber', 'nationality', 'phone', 'visaExpiry', 'passportExpiry', 'salary', 'notes', 'active'];
  const updates = {};
  allowed.forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });
  const updated = db.update('employees', req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Employee not found.' });
  res.json(updated);
});

router.delete('/employees/:id', requireAdmin, (req, res) => {
  res.json({ success: db.delete('employees', req.params.id) });
});

router.post('/employees/bulk-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No employees selected.' });
  let deleted = 0;
  ids.forEach(id => { if (db.delete('employees', id)) deleted++; });
  res.json({ success: true, deleted });
});

// ---------- GENERAL REMINDERS ----------

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'once', 'range'];

function isReminderDueToday(reminder) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(reminder.startDate); start.setHours(0, 0, 0, 0);
  if (today < start) return false;

  if (reminder.frequency === 'once') {
    return today.getTime() === start.getTime();
  }
  if (reminder.frequency === 'daily') {
    return true;
  }
  if (reminder.frequency === 'weekly') {
    return today.getDay() === start.getDay();
  }
  if (reminder.frequency === 'monthly') {
    return today.getDate() === start.getDate();
  }
  if (reminder.frequency === 'range') {
    if (!reminder.endDate) return today >= start;
    const end = new Date(reminder.endDate); end.setHours(23, 59, 59, 999);
    return today >= start && today <= end;
  }
  return false;
}

router.get('/reminders', requireLogin, (req, res) => {
  res.json(db.all('reminders'));
});

router.get('/reminders/due-today', requireLogin, (req, res) => {
  const due = db.all('reminders').filter(isReminderDueToday);
  res.json(due);
});

router.post('/reminders', requireLogin, (req, res) => {
  const { description, frequency, startDate, endDate, notes } = req.body;
  if (!description) return res.status(400).json({ error: 'Description is required.' });
  if (!FREQUENCIES.includes(frequency)) return res.status(400).json({ error: `Frequency must be one of: ${FREQUENCIES.join(', ')}` });
  if (!startDate) return res.status(400).json({ error: 'Start date is required.' });
  const reminder = db.insert('reminders', {
    description, frequency, startDate, endDate: endDate || null, notes: notes || ''
  });
  res.json(reminder);
});

router.put('/reminders/:id', requireLogin, (req, res) => {
  const allowed = ['description', 'frequency', 'startDate', 'endDate', 'notes'];
  const updates = {};
  allowed.forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });
  const updated = db.update('reminders', req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Reminder not found.' });
  res.json(updated);
});

router.delete('/reminders/:id', requireLogin, (req, res) => {
  res.json({ success: db.delete('reminders', req.params.id) });
});

module.exports = router;
