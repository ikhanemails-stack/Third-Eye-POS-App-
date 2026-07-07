// Third Eye Computer Solutions - POS System
// Settings screen - shop branding, VAT config, receipt customization.
// This is where each supermarket personalizes the software with their own identity.

const SettingsScreen = {
  settings: null,

  async render() {
    Shell.mount('/settings', `<div class="empty-state">Loading settings...</div>`);
    try {
      this.settings = await Api.get('/settings');
    } catch (err) {
      Toast.error(err.message);
      return;
    }
    this.renderScreen();
  },

  renderScreen() {
    const s = this.settings;
    const isAdmin = App.user.role === 'admin';
    const logoPreview = s.logoDataUrl
      ? `<img src="${s.logoDataUrl}" style="width:64px;height:64px;border-radius:10px;object-fit:cover;border:1px solid var(--border)">`
      : `<div style="width:64px;height:64px;border-radius:10px;background:var(--bg);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.7rem;text-align:center">No Logo</div>`;

    const content = `
      <div class="page-header">
        <div>
          <h1>Shop Settings</h1>
          <div class="page-subtitle">Customize your shop's branding, VAT, and receipt details</div>
        </div>
      </div>

      ${!isAdmin ? `<div class="card" style="background:var(--warning-bg);border-color:#ECD6AE;margin-bottom:20px;font-size:0.86rem;color:#7a5710">Only administrators can edit shop settings. Contact your admin account holder.</div>` : ''}

      <form id="settings-form">
        <div class="card-flat" style="margin-bottom:20px">
          <h3 style="font-size:1rem;margin-bottom:16px">Shop Identity</h3>
          <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:16px">
            ${logoPreview}
            <div style="flex:1">
              <label class="form-label">Shop Logo</label>
              <input type="file" id="logo-upload" accept="image/*" ${!isAdmin ? 'disabled' : ''}>
              <div class="form-hint">Recommended: square image, at least 200×200px.</div>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Shop Name (English)</label>
              <input class="form-input" id="s-shopName" value="${escapeHtml(s.shopName)}" ${!isAdmin ? 'disabled' : ''} required>
            </div>
            <div class="form-group">
              <label class="form-label">Shop Name (Arabic)</label>
              <input class="form-input" id="s-shopNameAr" value="${escapeHtml(s.shopNameAr || '')}" dir="rtl" ${!isAdmin ? 'disabled' : ''}>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Address</label>
            <input class="form-input" id="s-address" value="${escapeHtml(s.address || '')}" placeholder="e.g. Building 123, Road 456, Manama, Bahrain" ${!isAdmin ? 'disabled' : ''}>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Phone</label>
              <input class="form-input" id="s-phone" value="${escapeHtml(s.phone || '')}" placeholder="+973 XXXX XXXX" ${!isAdmin ? 'disabled' : ''}>
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input class="form-input" id="s-email" value="${escapeHtml(s.email || '')}" ${!isAdmin ? 'disabled' : ''}>
            </div>
          </div>
        </div>

        <div class="card-flat" style="margin-bottom:20px">
          <h3 style="font-size:1rem;margin-bottom:16px">Legal &amp; Tax Information</h3>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">CR Number (Commercial Registration)</label>
              <input class="form-input" id="s-crNumber" value="${escapeHtml(s.crNumber || '')}" ${!isAdmin ? 'disabled' : ''}>
            </div>
            <div class="form-group">
              <label class="form-label">VAT Registration Number</label>
              <input class="form-input" id="s-vatNumber" value="${escapeHtml(s.vatNumber || '')}" ${!isAdmin ? 'disabled' : ''}>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">VAT Rate (%)</label>
              <input class="form-input" id="s-vatRate" type="number" step="0.1" value="${s.vatRate}" ${!isAdmin ? 'disabled' : ''}>
              <div class="form-hint">Bahrain standard VAT rate is 10%.</div>
            </div>
            <div class="form-group">
              <label class="form-label">Currency</label>
              <input class="form-input" id="s-currency" value="${escapeHtml(s.currency)}" ${!isAdmin ? 'disabled' : ''}>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Currency Decimal Places</label>
            <input class="form-input" id="s-currencyDecimals" type="number" min="0" max="4" value="${s.currencyDecimals}" ${!isAdmin ? 'disabled' : ''}>
            <div class="form-hint">Bahraini Dinar (BHD) uses 3 decimal places, e.g. 1.250 BHD.</div>
          </div>
        </div>

        <div class="card-flat" style="margin-bottom:20px">
          <h3 style="font-size:1rem;margin-bottom:16px">Receipt &amp; Printer Settings</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
            <div>
              <div class="form-group">
                <label class="form-label">Receipt Footer Message</label>
                <textarea class="form-input" id="s-receiptFooter" rows="3" style="resize:vertical" ${!isAdmin ? 'disabled' : ''}>${escapeHtml(s.receiptFooter || '')}</textarea>
                <div class="form-hint">Each line prints as a separate line on the receipt.</div>
              </div>
              <div class="form-group">
                <label class="form-label">Receipt Header (shown below shop name)</label>
                <textarea class="form-input" id="s-receiptHeader" rows="2" style="resize:vertical" ${!isAdmin ? 'disabled' : ''}>${escapeHtml(s.receiptHeader || '')}</textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Default Low Stock Threshold</label>
                <input class="form-input" id="s-lowStockThreshold" type="number" min="0" value="${s.lowStockThreshold}" ${!isAdmin ? 'disabled' : ''}>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Printer Width</label>
                  <select class="form-select" id="s-receiptPaperWidth" ${!isAdmin ? 'disabled' : ''} onchange="SettingsScreen.updateLivePreview()">
                    <option value="58mm" ${s.receiptPaperWidth === '58mm' ? 'selected' : ''}>58mm (small)</option>
                    <option value="80mm" ${s.receiptPaperWidth === '80mm' || !s.receiptPaperWidth ? 'selected' : ''}>80mm (standard)</option>
                    <option value="a4" ${s.receiptPaperWidth === 'a4' ? 'selected' : ''}>A4</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Font Size</label>
                  <select class="form-select" id="s-receiptFontSize" ${!isAdmin ? 'disabled' : ''} onchange="SettingsScreen.updateLivePreview()">
                    <option value="small"  ${s.receiptFontSize === 'small'  ? 'selected' : ''}>Small (9px)</option>
                    <option value="normal" ${s.receiptFontSize === 'normal' || !s.receiptFontSize ? 'selected' : ''}>Normal (12px)</option>
                    <option value="large"  ${s.receiptFontSize === 'large'  ? 'selected' : ''}>Large (16px)</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Receipt Font Weight</label>
                <div style="display:flex;gap:8px">
                  ${['slim','normal','bold'].map(w => `
                  <button type="button" onclick="document.getElementById('s-receiptFontWeight').value='${w}';this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('btn-gold'));this.classList.add('btn-gold');SettingsScreen.updateLivePreview()"
                    class="btn ${(s.receiptFontWeight||'normal')===w?'btn-gold':'btn-outline'}" style="flex:1;justify-content:center">
                    ${w.charAt(0).toUpperCase()+w.slice(1)}
                  </button>`).join('')}
                </div>
                <input type="hidden" id="s-receiptFontWeight" value="${s.receiptFontWeight||'normal'}">
                <div class="form-hint">Slim is lighter, Bold is most visible on thermal paper.</div>
              </div>
              <div class="form-group">
                <label class="form-label" style="display:flex;align-items:center;gap:8px">
                  <input type="checkbox" id="s-receiptShowLogo" ${s.receiptShowLogo !== false ? 'checked' : ''} style="width:auto" ${!isAdmin ? 'disabled' : ''} onchange="SettingsScreen.updateLivePreview()">
                  Show shop logo on receipts
                </label>
              </div>
              <div style="display:flex;gap:8px;margin-top:8px">
                <button type="button" class="btn btn-outline" id="preview-receipt-btn">${Icon.printer} Print Sample</button>
                <button type="button" class="btn btn-outline" onclick="SettingsScreen.updateLivePreview()">🔄 Refresh Preview</button>
              </div>
            </div>

            <!-- Live Receipt Preview -->
            <div>
              <label class="form-label">📄 LIVE RECEIPT PREVIEW</label>
              <div id="live-receipt-preview" style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;max-height:500px;overflow-y:auto;font-size:12px">
                Loading preview...
              </div>
            </div>
          </div>
        </div>

        <div class="card-flat" style="margin-bottom:20px">
          <h3 style="font-size:1rem;margin-bottom:16px">Colour Theme</h3>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">
            ${[
              { key: 'default', label: '🌊 Navy Gold',    bg: '#0F2A3D', accent: '#F59E0B' },
              { key: 'purple',  label: '🔮 Purple Galaxy', bg: '#1a0533', accent: '#8b5cf6' },
              { key: 'green',   label: '🌿 Forest Green',  bg: '#022c22', accent: '#10b981' },
              { key: 'blue',    label: '🌏 Ocean Blue',    bg: '#0f172a', accent: '#3b82f6' },
              { key: 'red',     label: '🔴 Crimson Red',   bg: '#450a0a', accent: '#dc2626' },
              { key: 'dark',    label: '🌑 Dark Mode',     bg: '#111111', accent: '#f59e0b' }
            ].map(t => {
              const active = (localStorage.getItem('posTheme') || 'default') === t.key;
              return `
              <button onclick="applyTheme('${t.key}')" style="
                background:${t.bg};
                color:#fff;
                border:3px solid ${active ? t.accent : 'transparent'};
                border-radius:12px;
                padding:10px 16px;
                font-size:13px;
                font-weight:600;
                cursor:pointer;
                min-width:130px;
                text-align:left;
                box-shadow:${active ? '0 0 0 2px '+t.accent+'55' : 'none'}">
                ${t.label}
                ${active ? '<span style="float:right">✓</span>' : ''}
              </button>`;
            }).join('')}
          </div>

          <h3 style="font-size:1rem;margin-bottom:16px">Loyalty Program</h3>
          <div class="form-group">
            <label class="form-label" style="display:flex;align-items:center;gap:8px">
              <input type="checkbox" id="s-loyaltyEnabled" ${s.loyaltyEnabled !== false ? 'checked' : ''} style="width:auto" ${!isAdmin ? 'disabled' : ''}>
              Enable loyalty points on sales
            </label>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Points Earned per 1 ${escapeHtml(s.currency || 'BHD')} Spent</label>
              <input class="form-input" id="s-loyaltyEarnRate" type="number" step="0.1" min="0" value="${s.loyaltyEarnRate ?? 1}" ${!isAdmin ? 'disabled' : ''}>
            </div>
            <div class="form-group">
              <label class="form-label">Value per Point When Redeemed (${escapeHtml(s.currency || 'BHD')})</label>
              <input class="form-input" id="s-loyaltyRedemptionRate" type="number" step="0.001" min="0" value="${s.loyaltyRedemptionRate ?? 0.01}" ${!isAdmin ? 'disabled' : ''}>
            </div>
          </div>
          <div class="form-hint">Example: with these settings, a 100 ${escapeHtml(s.currency || 'BHD')} sale earns ${(100 * (s.loyaltyEarnRate ?? 1)).toFixed(0)} points, and each point is worth ${(s.loyaltyRedemptionRate ?? 0.01).toFixed(3)} ${escapeHtml(s.currency || 'BHD')} when redeemed.</div>
        </div>

        ${isAdmin ? `<button type="submit" class="btn btn-gold" style="padding:13px 28px">Save Settings</button>` : ''}
      </form>

      <div class="card-flat" style="margin-top:24px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <h3 style="font-size:1rem">Software License</h3>
          <button class="btn-icon-label" id="recheck-license-btn">${Icon.key} Check Now</button>
        </div>
        <div id="license-info">Loading license info...</div>
      </div>
    `;
    document.getElementById('content').innerHTML = content;

    if (isAdmin) {
      document.getElementById('settings-form').addEventListener('submit', (e) => this.saveSettings(e));
      document.getElementById('logo-upload').addEventListener('change', (e) => this.handleLogoUpload(e));
    }
    document.getElementById('preview-receipt-btn').addEventListener('click', () => this.previewReceipt());
    // Show live preview on load
    setTimeout(() => this.updateLivePreview(), 300);
    document.getElementById('recheck-license-btn').addEventListener('click', () => this.recheckLicense());
    this.loadLicenseInfo();
  },

  async recheckLicense() {
    const btn = document.getElementById('recheck-license-btn');
    btn.disabled = true;
    btn.textContent = 'Checking...';
    try {
      await Api.post('/license/recheck');
      Toast.success('License re-verified with Third Eye Computer Solutions.');
      await this.loadLicenseInfo();
    } catch (err) {
      Toast.error(err.message);
    }
    btn.disabled = false;
    btn.innerHTML = `${Icon.key} Check Now`;
  },

  previewReceipt() {
    const draftSettings = this.getDraftSettings();
    Receipt.print(Receipt.sampleSale(draftSettings), draftSettings);
  },

  getDraftSettings() {
    return {
      ...this.settings,
      shopName: document.getElementById('s-shopName')?.value.trim() || this.settings.shopName,
      address: document.getElementById('s-address')?.value.trim(),
      phone: document.getElementById('s-phone')?.value.trim(),
      crNumber: document.getElementById('s-crNumber')?.value.trim(),
      vatNumber: document.getElementById('s-vatNumber')?.value.trim(),
      vatRate: Number(document.getElementById('s-vatRate')?.value) || this.settings.vatRate,
      currency: document.getElementById('s-currency')?.value.trim() || this.settings.currency,
      currencyDecimals: Number(document.getElementById('s-currencyDecimals')?.value),
      receiptFooter: document.getElementById('s-receiptFooter')?.value.trim(),
      receiptHeader: document.getElementById('s-receiptHeader')?.value.trim(),
      receiptPaperWidth: document.getElementById('s-receiptPaperWidth')?.value,
      receiptFontSize: document.getElementById('s-receiptFontSize')?.value,
      receiptFontWeight: document.getElementById('s-receiptFontWeight')?.value || 'normal',
      receiptShowLogo: document.getElementById('s-receiptShowLogo')?.checked,
      logoDataUrl: this.settings.logoDataUrl || ''
    };
  },

  updateLivePreview() {
    const preview = document.getElementById('live-receipt-preview');
    if (!preview) return;
    const draftSettings = this.getDraftSettings();
    const sale = Receipt.sampleSale(draftSettings);
    // Build inline receipt HTML (no popup)
    const html = Receipt.buildHtml(sale, draftSettings);
    // Extract body content only
    const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    preview.innerHTML = match ? match[1] : html;
  },

  handleLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      Toast.error('Logo image must be smaller than 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.settings.logoDataUrl = reader.result;
      Toast.success('Logo loaded. Click "Save Settings" to apply.');
    };
    reader.readAsDataURL(file);
  },

  async saveSettings(e) {
    e.preventDefault();
    const payload = {
      shopName: document.getElementById('s-shopName').value.trim(),
      shopNameAr: document.getElementById('s-shopNameAr').value.trim(),
      address: document.getElementById('s-address').value.trim(),
      phone: document.getElementById('s-phone').value.trim(),
      email: document.getElementById('s-email').value.trim(),
      crNumber: document.getElementById('s-crNumber').value.trim(),
      vatNumber: document.getElementById('s-vatNumber').value.trim(),
      vatRate: Number(document.getElementById('s-vatRate').value),
      currency: document.getElementById('s-currency').value.trim(),
      currencyDecimals: Number(document.getElementById('s-currencyDecimals').value),
      receiptFooter: document.getElementById('s-receiptFooter').value.trim(),
      receiptPaperWidth: document.getElementById('s-receiptPaperWidth').value,
      receiptFontSize: document.getElementById('s-receiptFontSize').value,
      receiptShowLogo: document.getElementById('s-receiptShowLogo').checked,
      lowStockThreshold: Number(document.getElementById('s-lowStockThreshold').value),
      loyaltyEnabled: document.getElementById('s-loyaltyEnabled').checked,
      loyaltyEarnRate: Number(document.getElementById('s-loyaltyEarnRate').value),
      loyaltyRedemptionRate: Number(document.getElementById('s-loyaltyRedemptionRate').value),
      logoDataUrl: this.settings.logoDataUrl || ''
    };
    try {
      const updated = await Api.put('/settings', payload);
      App.settings = updated;
      Toast.success('Settings saved successfully.');
      this.settings = updated;
      Shell.mount('/settings', '');
      this.renderScreen();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async loadLicenseInfo() {
    const el = document.getElementById('license-info');
    try {
      const status = await Api.get('/license/status');
      el.innerHTML = `
        <div class="summary-row"><span>Shop Code</span><span style="font-family:var(--font-mono)">${escapeHtml(status.shopCode || '-')}</span></div>
        <div class="summary-row"><span>License Expires</span><span>${status.expiresAt ? formatDate(status.expiresAt) : '-'}</span></div>
        <div class="summary-row"><span>Days Remaining</span><span style="color:${status.daysLeft <= 14 ? 'var(--danger)' : 'var(--success)'};font-weight:600">${status.daysLeft}</span></div>
        <p style="color:var(--text-muted);font-size:0.78rem;margin-top:10px">To renew your license, contact Third Eye Computer Solutions.</p>
      `;
    } catch (err) {
      el.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem">Could not load license info.</p>`;
    }
  }
};
