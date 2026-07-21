// Third Eye Computer Solutions - POS System
// ZATCA (Saudi Arabia) Phase 2 onboarding wizard. Walks the admin through
// the same steps ZATCA documents: seller info -> CSR -> Compliance CSID
// (needs an OTP from the Fatoora portal) -> compliance checks -> Production
// CSID -> live. Each step only unlocks once the previous one succeeds.
const ZatcaKsaScreen = {
  status: null,

  async render() {
    // ZATCA Phase 2 is Saudi-Arabia-only. The sidebar link is already hidden
    // for other countries, but guard the screen itself too in case someone
    // reaches this URL directly (e.g. an old bookmark or browser back button
    // from before the country was changed away from Saudi Arabia).
    if ((App.settings?.country || 'BH') !== 'SA') {
      Toast.error('ZATCA (Saudi Arabia) is only available when the shop country is set to Saudi Arabia.');
      Router.navigate('/settings');
      return;
    }
    Shell.mount('/zatca-ksa', `<div class="empty-state">Loading...</div>`);
    try {
      this.status = await Api.get('/zatca-ksa/status');
    } catch (err) {
      Toast.error(err.message);
      return;
    }
    this.renderScreen();
  },

  renderScreen() {
    const s = this.status;
    const step = s.hasProductionCsid ? 5
      : (s.complianceChecksPassed || []).includes('simplified') ? 4
      : s.hasComplianceCsid ? 3
      : s.hasCsr ? 2 : 1;

    const content = `
      <div class="page-header">
        <div>
          <h1>ZATCA (Saudi Arabia) - Phase 2</h1>
          <div class="page-subtitle">For shops that are VAT-registered and trading in Saudi Arabia. This is separate from the Bahrain simplified QR on receipts.</div>
        </div>
      </div>

      <div class="card" style="background:var(--warning-bg,#FFF7E6);border-color:#ECD6AE;margin-bottom:20px;font-size:0.86rem;color:#7a5710;line-height:1.6">
        <strong>Before you start:</strong> you need to have already been notified by ZATCA that you're in an
        active integration wave, and be logged into the <strong>Fatoora Portal</strong> yourself to generate the OTP each
        step below asks for. This wizard cannot create ZATCA account access for you - only your own CR/VAT
        credentials on ZATCA's portal can do that. Complete every step in <strong>Sandbox</strong>, and get every sample
        invoice ZATCA asks for to pass, before ever switching Environment to Production.
      </div>

      <div class="card-flat" style="margin-bottom:20px">
        <h3 style="margin-top:0">1. Seller Information</h3>
        <form id="zk-settings-form" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <label>Environment
            <select id="zk-environment" class="input">
              <option value="sandbox" ${s.environment === 'sandbox' ? 'selected' : ''}>Sandbox (developer testing)</option>
              <option value="simulation" ${s.environment === 'simulation' ? 'selected' : ''}>Simulation (pre-production)</option>
              <option value="production" ${s.environment === 'production' ? 'selected' : ''}>Production (LIVE)</option>
            </select>
          </label>
          <label>Enable ZATCA reporting for sales
            <select id="zk-enabled" class="input">
              <option value="false" ${!s.ksaEnabled ? 'selected' : ''}>Off</option>
              <option value="true" ${s.ksaEnabled ? 'selected' : ''}>On</option>
            </select>
          </label>
          <label>Shop / Legal Registration Name
            <input class="input" id="zk-shopName" value="${s.shopName || ''}" required>
          </label>
          <label>VAT Registration Number (15 digits)
            <input class="input" id="zk-vatNumber" value="${s.vatNumber || ''}" required>
          </label>
          <label>CR Number
            <input class="input" id="zk-crNumber" value="${s.crNumber || ''}" required>
          </label>
          <label>City
            <input class="input" id="zk-city" value="${s.city || ''}">
          </label>
          <label style="grid-column:1/-1">Address
            <input class="input" id="zk-address" value="${s.address || ''}">
          </label>
          <label>Currency
            <input class="input" id="zk-currency" value="${s.currency || 'SAR'}">
          </label>
          <label>VAT Rate (%)
            <input class="input" id="zk-vatRate" type="number" step="0.01" value="${s.vatRate ?? 15}">
          </label>
          <div style="grid-column:1/-1">
            <button type="submit" class="btn btn-gold">Save Seller Information</button>
          </div>
        </form>
      </div>

      <div class="card-flat" style="margin-bottom:20px">
        <h3 style="margin-top:0">2. Generate CSR &amp; Key Pair ${step > 1 ? '✅' : ''}</h3>
        <p style="color:var(--text-muted);font-size:0.88rem">Creates your EGS unit's key pair and Certificate Signing Request. Save your Seller Information above first.</p>
        <button class="btn btn-secondary" id="zk-gen-csr">Generate CSR</button>
        ${s.egsSerial ? `<div style="margin-top:10px;font-size:0.82rem;color:var(--text-muted)">EGS Serial: ${s.egsSerial}</div>` : ''}
      </div>

      <div class="card-flat" style="margin-bottom:20px;${step < 2 ? 'opacity:0.5;pointer-events:none' : ''}">
        <h3 style="margin-top:0">3. Compliance CSID ${step > 2 ? '✅' : ''}</h3>
        <p style="color:var(--text-muted);font-size:0.88rem">Log into the Fatoora Portal yourself, generate an OTP, and paste it here.</p>
        <div style="display:flex;gap:10px;align-items:center">
          <input class="input" id="zk-otp" placeholder="OTP from ZATCA Fatoora Portal" style="max-width:260px">
          <button class="btn btn-secondary" id="zk-gen-compliance">Get Compliance CSID</button>
        </div>
      </div>

      <div class="card-flat" style="margin-bottom:20px;${step < 3 ? 'opacity:0.5;pointer-events:none' : ''}">
        <h3 style="margin-top:0">4. Run Compliance Checks ${step > 3 ? '✅' : ''}</h3>
        <p style="color:var(--text-muted);font-size:0.88rem">Submits a sample simplified invoice to ZATCA for validation. Repeat until it passes - fix any rejection reason ZATCA returns.</p>
        <button class="btn btn-secondary" id="zk-run-compliance">Run Compliance Check (Simplified Invoice)</button>
        <div id="zk-compliance-result" style="margin-top:10px;font-size:0.82rem"></div>
      </div>

      <div class="card-flat" style="margin-bottom:20px;${step < 4 ? 'opacity:0.5;pointer-events:none' : ''}">
        <h3 style="margin-top:0">5. Request Production CSID ${step > 4 ? '✅' : ''}</h3>
        <p style="color:var(--text-muted);font-size:0.88rem">Only do this once compliance checks pass and you're confident in Sandbox/Simulation. This certificate signs your real, legally-binding tax invoices.</p>
        <button class="btn btn-gold" id="zk-gen-production">Request Production CSID</button>
      </div>

      <div class="card-flat">
        <h3 style="margin-top:0">Recent Reporting Activity</h3>
        <div id="zk-log">Loading...</div>
      </div>
    `;
    Shell.mount('/zatca-ksa', content);
    this.wireEvents();
    this.loadLog();
  },

  wireEvents() {
    document.getElementById('zk-settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        this.status = await Api.post('/zatca-ksa/settings', {
          environment: document.getElementById('zk-environment').value,
          ksaEnabled: document.getElementById('zk-enabled').value === 'true',
          shopName: document.getElementById('zk-shopName').value,
          vatNumber: document.getElementById('zk-vatNumber').value,
          crNumber: document.getElementById('zk-crNumber').value,
          city: document.getElementById('zk-city').value,
          address: document.getElementById('zk-address').value,
          currency: document.getElementById('zk-currency').value,
          vatRate: Number(document.getElementById('zk-vatRate').value),
        });
        Toast.success('Seller information saved.');
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });

    document.getElementById('zk-gen-csr').addEventListener('click', async () => {
      try {
        this.status = await Api.post('/zatca-ksa/csr', {});
        Toast.success('CSR generated.');
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });

    document.getElementById('zk-gen-compliance').addEventListener('click', async () => {
      const otp = document.getElementById('zk-otp').value.trim();
      if (!otp) return Toast.error('Enter the OTP from the Fatoora Portal first.');
      try {
        this.status = await Api.post('/zatca-ksa/compliance', { otp });
        Toast.success('Compliance CSID obtained.');
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });

    document.getElementById('zk-run-compliance').addEventListener('click', async () => {
      const resultEl = document.getElementById('zk-compliance-result');
      resultEl.textContent = 'Submitting sample invoice...';
      try {
        const res = await Api.post('/zatca-ksa/compliance-check', {});
        this.status = res;
        resultEl.textContent = 'Passed: ' + JSON.stringify(res.zatcaResponse);
        Toast.success('Compliance check passed.');
        this.renderScreen();
      } catch (err) {
        resultEl.textContent = 'Rejected: ' + err.message;
        Toast.error(err.message);
      }
    });

    document.getElementById('zk-gen-production').addEventListener('click', async () => {
      if (!confirm('This issues a Production certificate for LIVE, legally-binding invoices. Continue?')) return;
      try {
        this.status = await Api.post('/zatca-ksa/production', {});
        Toast.success('Production CSID obtained. You are now live.');
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });
  },

  async loadLog() {
    const el = document.getElementById('zk-log');
    try {
      const rows = await Api.get('/zatca-ksa/log');
      if (!rows.length) { el.innerHTML = '<div class="empty-state">No invoices reported yet.</div>'; return; }
      el.innerHTML = `<table class="table"><thead><tr><th>Invoice</th><th>Status</th><th>When</th><th></th></tr></thead><tbody>
        ${rows.map(r => `<tr>
          <td>${r.invoiceNo}</td>
          <td>${r.status === 'reported' ? '✅ Reported' : r.status === 'report_error' ? '❌ Failed' : r.status}</td>
          <td>${new Date(r.createdAt).toLocaleString()}</td>
          <td>${r.status === 'report_error' ? `<button class="btn btn-sm btn-secondary" data-retry="${r.id}">Retry</button>` : ''}</td>
        </tr>`).join('')}
      </tbody></table>`;
      el.querySelectorAll('[data-retry]').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await Api.post(`/zatca-ksa/retry/${btn.dataset.retry}`, {});
            Toast.success('Retried.');
            this.loadLog();
          } catch (err) { Toast.error(err.message); }
        });
      });
    } catch (err) {
      el.innerHTML = `<div class="empty-state">${err.message}</div>`;
    }
  },
};
