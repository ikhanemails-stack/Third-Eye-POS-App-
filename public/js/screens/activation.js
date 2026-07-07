// Third Eye Computer Solutions - POS System
// License activation screen - shown when no valid license is active.

const ActivationScreen = {
  async render(licenseStatus) {
    const isExpired = licenseStatus.expired;
    const isRevoked = licenseStatus.revoked;
    const isUnreachable = licenseStatus.unreachable;
    const app = document.getElementById('app');

    let title = 'Activate Your Software';
    let subtitle = 'Enter the license key provided by Third Eye Computer Solutions to activate this installation.';
    if (isExpired) {
      title = 'License Expired';
      subtitle = `Your license expired on ${licenseStatus.expiresAt ? formatDate(licenseStatus.expiresAt) : ''}. Enter a new license key to continue.`;
    } else if (isRevoked) {
      title = 'License Deactivated';
      subtitle = licenseStatus.reason || 'This license has been deactivated by Third Eye Computer Solutions. Please contact your provider for assistance.';
    } else if (isUnreachable) {
      title = 'Connection Required';
      subtitle = licenseStatus.reason || 'This device could not verify its license. Please connect to the internet and restart the software.';
    }

    app.innerHTML = `
      <div class="center-screen">
        <div class="auth-card">
          <div class="auth-logo">${Icon.key.replace('currentColor', 'var(--navy-900)')}</div>
          <h2>${title}</h2>
          <p class="auth-subtitle">${subtitle}</p>
          ${!isRevoked && !isUnreachable ? `
          <div id="activation-error"></div>
          <form id="activation-form">
            <div class="form-group">
              <label class="form-label">License Key</label>
              <textarea class="form-textarea" id="license-key-input" rows="3" placeholder="Paste your license key here" style="font-family: var(--font-mono); font-size: 0.8rem;" required></textarea>
            </div>
            <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:13px">
              Activate Software
            </button>
          </form>
          ` : `
          <button class="btn btn-outline" id="retry-btn" style="width:100%;justify-content:center;padding:13px">
            Try Again
          </button>
          `}
          <div class="brand-footer-mark">
            Licensed &amp; supported by <strong>Third Eye Computer Solutions</strong><br>
            ${isRevoked ? 'Contact your software provider to reactivate.' : isUnreachable ? 'This device checks in periodically to confirm your license is active.' : 'Need a license key? Contact your software provider.'}
          </div>
        </div>
      </div>
    `;

    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', async () => {
        retryBtn.textContent = 'Checking...';
        retryBtn.disabled = true;
        try {
          await Api.post('/license/recheck');
        } catch (e) { /* recheck endpoint may itself be license-gated on failure; ignore */ }
        App.boot();
      });
      return;
    }

    document.getElementById('activation-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const key = document.getElementById('license-key-input').value.trim();
      const errorBox = document.getElementById('activation-error');
      const submitBtn = e.target.querySelector('button[type="submit"]');
      errorBox.innerHTML = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Activating...';
      try {
        await Api.post('/license/activate', { licenseKey: key });
        Api._licenseLockTriggered = false;
        Toast.success('Software activated successfully.');
        App.boot();
      } catch (err) {
        errorBox.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Activate Software';
      }
    });
  }
};
