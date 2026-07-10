// Third Eye Computer Solutions - POS System
// Runs the daily backup-and-email job at 12:00 AM every day.
//
// Timezone note: Railway containers run in UTC by default. Set the
// BACKUP_TZ env var to your shop's local timezone (e.g. "Asia/Bahrain")
// so "midnight" means midnight for the shop, not midnight UTC.

const cron = require('node-cron');
const { runBackupAndEmail } = require('./backup-mailer');

function startBackupScheduler() {
  const timezone = process.env.BACKUP_TZ || 'Asia/Bahrain';

  // '0 0 * * *' = at minute 0, hour 0, every day
  cron.schedule('0 0 * * *', async () => {
    console.log('🕛 Running scheduled midnight backup...');
    try {
      const result = await runBackupAndEmail();
      if (result.sent) {
        console.log(`✅ Backup emailed to: ${result.recipients.join(', ')}`);
      } else {
        console.log(`⚠️ Backup email skipped: ${result.reason}`);
      }
    } catch (err) {
      console.error('❌ Scheduled backup failed:', err.message);
    }
  }, { timezone });

  console.log(`🕛 Auto-backup scheduler started (runs daily at 12:00 AM ${timezone})`);
}

module.exports = { startBackupScheduler };
