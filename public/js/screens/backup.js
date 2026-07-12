// Third Eye Computer Solutions - POS System
// Backup & Restore screen

const BackupScreen = {
  async render() {
    Shell.mount('/backup', this.buildHtml());
    this.checkLastBackup();
    this.wireEvents();
    this.loadRecipients();
  },

  buildHtml() {
    return `
    <div class="screen-header">
      <h1 class="screen-title">Backup &amp; Restore</h1>
      <p class="screen-sub">Download your data or restore from a previous backup file.</p>
    </div>
    <div class="backup-grid">

      <div class="backup-card">
        <div class="backup-icon" style="background:#d1fae5;color:#065f46">⬇</div>
        <h2 class="backup-card-title">Download Backup</h2>
        <p class="backup-card-desc">Download all your data — products, sales, customers, vendors, employees and settings — as a single backup file.</p>
        <button class="btn btn-gold" id="dl-btn" style="width:100%;justify-content:center;padding:12px">
          ⬇ Download Backup Now
        </button>
        <div id="dl-status" style="margin-top:10px;font-size:13px"></div>
      </div>

      <div class="backup-card">
        <div class="backup-icon" style="background:#dbeafe;color:#1e3a8a">🕛</div>
        <h2 class="backup-card-title">Auto Backup</h2>
        <p class="backup-card-desc">System automatically downloads a backup file at your chosen frequency. Keep backup files on a USB or Google Drive.</p>
        <div style="margin-bottom:12px">
          <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px">BACKUP FREQUENCY</label>
          <div style="display:flex;gap:8px">
            ${['off','hourly','daily'].map(f => {
              const active = (localStorage.getItem('autoBackupFreq')||'daily') === f;
              return `<button onclick="AutoBackup.schedule('${f}');this.parentElement.querySelectorAll('button').forEach(b=>b.style.background='var(--surface-1)');this.style.background='var(--gold-500)';this.style.color='#fff'" style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--border);font-size:12px;font-weight:600;cursor:pointer;background:${active?'var(--gold-500)':'var(--surface-1)'};color:${active?'#fff':'var(--text-primary)'}">${f.charAt(0).toUpperCase()+f.slice(1)}</button>`;
            }).join('')}
          </div>
        </div>
        <button onclick="AutoBackup.run()" class="btn btn-gold" style="width:100%;justify-content:center">
          ⬇ Backup Now
        </button>
        <div id="last-backup-info" style="font-size:13px;color:var(--text-muted);padding:10px;background:var(--surface-1);border-radius:8px;margin-top:8px">
          Checking...
        </div>
      </div>

      <div class="backup-card" style="grid-column:1/-1">
        <div class="backup-icon" style="background:#ede9fe;color:#5b21b6">✉️</div>
        <h2 class="backup-card-title">Automatic Daily Email Backup</h2>
        <p class="backup-card-desc">Every night at 12:00 AM, the server automatically backs up your data and emails it to the addresses below — no need to keep this screen or your computer open.</p>
        <details style="margin-bottom:12px;font-size:12.5px;color:var(--text-muted);background:var(--surface-1);border-radius:8px;padding:10px 12px">
          <summary style="cursor:pointer;font-weight:600;color:var(--text-primary)">⚙️ How to set this up (one-time, in Railway)</summary>
          <ol style="margin:8px 0 0 18px;padding:0;line-height:1.7">
            <li>Get an SMTP mailbox to send from. Easiest option: a Gmail account with a 16-character <strong>App Password</strong> (Google Account → Security → 2-Step Verification → App passwords). Any provider's SMTP works too (Outlook, Zoho, your host's email, etc).</li>
            <li>Open your project on <strong>railway.app</strong> → this service → <strong>Variables</strong> tab.</li>
            <li>Add these 4 variables: <code>SMTP_HOST</code> (e.g. smtp.gmail.com), <code>SMTP_PORT</code> (587), <code>SMTP_USER</code> (your mailbox address), <code>SMTP_PASS</code> (the app password, not your normal login password).</li>
            <li>Railway redeploys automatically after saving variables. Come back here and click "Send Test Backup Email Now" below.</li>
          </ol>
        </details>
        <div id="recipients-list" style="margin-bottom:12px"></div>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <input type="email" id="new-recipient-email" placeholder="owner@example.com" style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--border);font-size:13px">
          <button id="add-recipient-btn" class="btn btn-gold" style="padding:8px 16px">+ Add</button>
        </div>
        <button id="send-test-btn" style="background:var(--surface-1);border:1px solid var(--border);border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer">
          ✉️ Send Test Backup Email Now
        </button>
        <div id="recipient-status" style="margin-top:10px;font-size:13px"></div>
      </div>

      <div class="backup-card" style="grid-column:1/-1">
        <div class="backup-icon" style="background:#fef3c7;color:#92400e">⬆</div>
        <h2 class="backup-card-title">Restore From Backup</h2>
        <p class="backup-card-desc">Upload a backup file to restore all your data. <strong style="color:#b45309">Warning: This will replace ALL current data.</strong></p>
        <div class="restore-zone" id="restore-zone">
          <div style="font-size:32px">📁</div>
          <div style="font-size:14px;font-weight:600;margin-top:8px">Click here to select backup file</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Select a .json backup file downloaded from this system</div>
        </div>
        <input type="file" id="backup-file-input" accept=".json" style="display:none">
        <div id="restore-status" style="margin-top:12px"></div>
      </div>

    </div>

    <style>
      .backup-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:24px; }
      @media(max-width:700px){ .backup-grid{ grid-template-columns:1fr; } }
      .backup-card { background:var(--surface-2); border:0.5px solid var(--border); border-radius:16px; padding:24px; }
      .backup-icon { width:48px; height:48px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:22px; margin-bottom:16px; }
      .backup-card-title { font-size:16px; font-weight:600; margin-bottom:8px; }
      .backup-card-desc { font-size:13px; color:var(--text-secondary); line-height:1.6; margin-bottom:16px; }
      .restore-zone { border:2px dashed var(--border-strong); border-radius:12px; padding:32px; text-align:center; cursor:pointer; margin-top:8px; transition:all 0.2s; }
      .restore-zone:hover { border-color:#f59e0b; background:#fef9ec; }
    </style>
    `;
  },

  wireEvents() {
    const dlBtn = document.getElementById('dl-btn');
    if (dlBtn) dlBtn.addEventListener('click', () => this.downloadBackup());

    const zone = document.getElementById('restore-zone');
    const fileInput = document.getElementById('backup-file-input');
    if (zone) zone.addEventListener('click', () => fileInput && fileInput.click());
    if (fileInput) fileInput.addEventListener('change', (e) => this.handleBackupFile(e));

    const addBtn = document.getElementById('add-recipient-btn');
    if (addBtn) addBtn.addEventListener('click', () => this.addRecipient());
    const emailInput = document.getElementById('new-recipient-email');
    if (emailInput) emailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.addRecipient(); });
    const testBtn = document.getElementById('send-test-btn');
    if (testBtn) testBtn.addEventListener('click', () => this.sendTestEmail());
  },

  async loadRecipients() {
    const list = document.getElementById('recipients-list');
    if (!list) return;
    try {
      const res = await fetch('/api/backup/recipients');
      const recipients = await res.json();
      if (!recipients.length) {
        list.innerHTML = '<div style="font-size:13px;color:var(--text-muted)">No recipients yet — add an email below.</div>';
        return;
      }
      list.innerHTML = recipients.map(r => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--surface-1);border-radius:8px;margin-bottom:6px">
          <span style="font-size:13px">${r.email}</span>
          <button data-id="${r.id}" class="remove-recipient-btn" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:13px">Remove</button>
        </div>`).join('');
      list.querySelectorAll('.remove-recipient-btn').forEach(btn => {
        btn.addEventListener('click', () => this.removeRecipient(btn.dataset.id));
      });
    } catch (e) {
      list.innerHTML = '<div style="font-size:13px;color:#dc2626">Could not load recipients.</div>';
    }
  },

  async addRecipient() {
    const input = document.getElementById('new-recipient-email');
    const status = document.getElementById('recipient-status');
    const email = input.value.trim();
    if (!email) return;
    try {
      const res = await fetch('/api/backup/recipients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email })
      });
      const result = await res.json();
      if (!res.ok) { status.innerHTML = `<span style="color:#dc2626">${result.error}</span>`; return; }
      input.value = '';
      status.innerHTML = '<span style="color:#065f46">✅ Added.</span>';
      this.loadRecipients();
    } catch (e) {
      status.innerHTML = '<span style="color:#dc2626">Failed to add recipient.</span>';
    }
  },

  async removeRecipient(id) {
    await fetch(`/api/backup/recipients/${id}`, { method: 'DELETE' });
    this.loadRecipients();
  },

  async sendTestEmail() {
    const status = document.getElementById('recipient-status');
    const btn = document.getElementById('send-test-btn');
    btn.disabled = true; btn.textContent = '⏳ Sending...';
    try {
      const res = await fetch('/api/backup/send-now', { method: 'POST' });
      const result = await res.json();
      if (!res.ok || result.sent === false) {
        status.innerHTML = `<span style="color:#dc2626">❌ ${result.error || result.reason}</span>`;
      } else {
        status.innerHTML = `<span style="color:#065f46">✅ Sent to ${result.recipients.join(', ')}</span>`;
      }
    } catch (e) {
      status.innerHTML = '<span style="color:#dc2626">❌ Failed to send. Check SMTP settings.</span>';
    } finally {
      btn.disabled = false; btn.textContent = '✉️ Send Test Backup Email Now';
    }
  },

  checkLastBackup() {
    const info = document.getElementById('last-backup-info');
    if (!info) return;
    const lastBackup = localStorage.getItem('lastBackupTime');
    if (!lastBackup) {
      info.textContent = '⚠️ No backup downloaded yet. Please download a backup today.';
      info.style.color = '#b45309';
      return;
    }
    const last = new Date(lastBackup);
    const hoursAgo = Math.floor((new Date() - last) / (1000 * 60 * 60));
    const daysAgo = Math.floor(hoursAgo / 24);
    if (daysAgo === 0) {
      info.textContent = `✅ Last backup: Today at ${last.toLocaleTimeString()}`;
      info.style.color = '#065f46';
    } else if (daysAgo === 1) {
      info.textContent = `⚠️ Last backup was yesterday. Please download today's backup.`;
      info.style.color = '#b45309';
    } else {
      info.textContent = `❌ Last backup was ${daysAgo} days ago. Please backup now!`;
      info.style.color = '#dc2626';
    }
  },

  async downloadBackup() {
    const btn = document.getElementById('dl-btn');
    const status = document.getElementById('dl-status');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Preparing...'; }
    try {
      const res = await fetch('/api/backup/download');
      if (!res.ok) throw new Error('Failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="([^"]+)"/);
      a.download = m ? m[1] : 'TECS-Backup.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      localStorage.setItem('lastBackupTime', new Date().toISOString());
      if (btn) { btn.textContent = '✅ Downloaded!'; btn.disabled = false; }
      if (status) { status.textContent = 'Saved to Downloads folder. Keep this file safe!'; status.style.color = '#065f46'; }
      this.checkLastBackup();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '⬇ Download Backup Now'; }
      if (status) { status.textContent = 'Failed. Please try again.'; status.style.color = '#dc2626'; }
    }
  },

  async handleBackupFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const status = document.getElementById('restore-status');
    status.innerHTML = '<div style="color:var(--text-muted);font-size:13px">⏳ Reading file...</div>';
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (!backup.version || !backup.tables) {
        status.innerHTML = '<div style="color:#dc2626;font-size:13px">❌ Invalid backup file.</div>';
        return;
      }
      let total = 0;
      Object.values(backup.tables).forEach(t => { if (Array.isArray(t)) total += t.length; });
      status.innerHTML = `
        <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;padding:16px;margin-top:8px">
          <div style="font-size:14px;font-weight:700;color:#92400e;margin-bottom:6px">⚠️ Confirm Restore</div>
          <div style="font-size:13px;margin-bottom:4px">Backup date: <strong>${new Date(backup.createdAt).toLocaleString()}</strong></div>
          <div style="font-size:13px;margin-bottom:12px">Total records: <strong>${total}</strong></div>
          <div style="font-size:12px;color:#92400e;margin-bottom:12px">This will replace ALL current data. Cannot be undone.</div>
          <button id="confirm-restore-btn" style="background:#d97706;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer;margin-right:8px">
            ✅ Yes Restore
          </button>
          <button id="cancel-restore-btn" style="background:var(--surface-1);color:var(--text-primary);border:1px solid var(--border);border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer">
            Cancel
          </button>
        </div>`;
      document.getElementById('confirm-restore-btn').addEventListener('click', () => this.confirmRestore(backup));
      document.getElementById('cancel-restore-btn').addEventListener('click', () => { status.innerHTML = ''; });
    } catch (e) {
      status.innerHTML = '<div style="color:#dc2626;font-size:13px">❌ Could not read file. Select a valid TECS backup.</div>';
    }
    event.target.value = '';
  },

  async confirmRestore(backup) {
    const status = document.getElementById('restore-status');
    status.innerHTML = '<div style="color:var(--text-muted);font-size:13px">⏳ Restoring... please wait...</div>';
    try {
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backup)
      });
      const result = await res.json();
      if (result.success) {
        status.innerHTML = `
          <div style="background:#d1fae5;border:1px solid #6ee7b7;border-radius:10px;padding:16px;margin-top:8px">
            <div style="font-size:14px;font-weight:700;color:#065f46;margin-bottom:8px">✅ Restore Complete!</div>
            <div style="font-size:13px;margin-bottom:12px">${result.message}</div>
            <button onclick="window.location.reload()" style="background:#059669;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer">
              Reload App
            </button>
          </div>`;
      } else {
        status.innerHTML = `<div style="color:#dc2626;font-size:13px">❌ ${result.error}</div>`;
      }
    } catch (e) {
      status.innerHTML = '<div style="color:#dc2626;font-size:13px">❌ Restore failed. Try again.</div>';
    }
  }
};

// ── Auto-backup system ─────────────────────────────────────────────────────
const AutoBackup = {
  INTERVALS: { off: 0, hourly: 60, daily: 1440 },

  init() {
    const freq = localStorage.getItem('autoBackupFreq') || 'daily';
    this.schedule(freq);
  },

  schedule(freq) {
    localStorage.setItem('autoBackupFreq', freq);
    if (this._timer) clearInterval(this._timer);
    const mins = this.INTERVALS[freq] || 0;
    if (!mins) return;
    this._timer = setInterval(() => this.run(), mins * 60 * 1000);
    // Also run immediately if it's been a while
    const last = localStorage.getItem('lastBackupTime');
    if (last) {
      const hoursAgo = (Date.now() - new Date(last)) / 3600000;
      if ((freq === 'hourly' && hoursAgo >= 1) || (freq === 'daily' && hoursAgo >= 23)) {
        this.run();
      }
    }
  },

  async run() {
    try {
      const res = await fetch('/api/backup/download');
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="([^"]+)"/);
      a.download = m ? m[1] : `TECS-AutoBackup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      localStorage.setItem('lastBackupTime', new Date().toISOString());
      if (window.showToast) showToast('✅ Auto-backup downloaded successfully', 'success');
    } catch (e) {}
  }
};

// Start auto-backup on load
AutoBackup.init();
