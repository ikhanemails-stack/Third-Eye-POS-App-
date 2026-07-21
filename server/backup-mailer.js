// Third Eye Computer Solutions - POS System
// Sends the daily backup file by email to every configured recipient.
//
// Required Railway env vars for this to work:
//   SMTP_HOST   - e.g. smtp.gmail.com, smtp.office365.com, or your provider's host
//   SMTP_PORT   - e.g. 587 (STARTTLS) or 465 (SSL)
//   SMTP_USER   - the mailbox username to send FROM
//   SMTP_PASS   - the mailbox password / app password
//   SMTP_FROM   - (optional) the "From" address shown to recipients, defaults to SMTP_USER
//
// Recipients are managed per-shop via /api/backup/recipients (see routes/backup.js)
// and stored in the 'backup_recipients' table, so each shop's owner can add/edit/
// delete their own backup email addresses from Settings > Backup.

const db = require('./db');
const { buildBackupObjectForMailer } = require('./backup-shared');

let _nodemailer = null;
function getNodemailer() {
  if (_nodemailer) return _nodemailer;
  try {
    _nodemailer = require('nodemailer');
    return _nodemailer;
  } catch (e) {
    throw new Error("The 'nodemailer' package is not installed. Run: npm install nodemailer");
  }
}

function buildTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error('Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in Railway Variables.');
  }
  const nodemailer = getNodemailer();
  const port = Number(SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

async function runBackupAndEmail() {
  const { backup, filename } = await buildBackupObjectForMailer();

  const recipients = await db.all('backup_recipients');
  if (!recipients.length) {
    return { sent: false, reason: 'No backup email recipients configured yet. Add one in Settings > Backup.' };
  }

  const transport = buildTransport();
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const toList = recipients.map(r => r.email).join(', ');

  let totalRecords = 0;
  Object.values(backup.tables).forEach(t => { if (Array.isArray(t)) totalRecords += t.length; });

  await transport.sendMail({
    from: `"Third Eye POS Backup" <${fromAddress}>`,
    to: toList,
    subject: `TECS Daily Backup - ${backup.shopName || 'Your Shop'} - ${new Date().toLocaleDateString()}`,
    text: `Attached is your automatic daily backup for ${backup.shopName || 'your shop'}, generated on ${new Date(backup.createdAt).toLocaleString()}.\n\nTotal records: ${totalRecords}\n\nKeep this file somewhere safe. To restore it, go to Backup & Restore in the POS system and upload this file.\n\n- Third Eye Computer Solutions`,
    attachments: [{ filename, content: JSON.stringify(backup, null, 2) }]
  });

  // Record the run so the dashboard can show "last backup sent"
  const DATA_DIR = process.env.DATA_DIR || require('path').join(__dirname, '..', 'data');
  const fs = require('fs');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(require('path').join(DATA_DIR, 'last-backup.json'), JSON.stringify({
    lastEmailedAt: new Date().toISOString(),
    recipients: recipients.map(r => r.email),
    totalRecords
  }, null, 2));

  return { sent: true, recipients: recipients.map(r => r.email), totalRecords };
}

module.exports = { runBackupAndEmail };
