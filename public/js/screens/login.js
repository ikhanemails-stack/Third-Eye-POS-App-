// Third Eye Computer Solutions - POS System
// Login screen.

const LoginScreen = {
  render() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="center-screen">
        <div class="auth-card">
          <div class="auth-logo">${(App.settings?.shopName || 'P')[0].toUpperCase()}</div>
          <h2>${escapeHtml(App.settings?.shopName || 'POS System')}</h2>
          <p class="auth-subtitle">Sign in to continue</p>
          <div id="login-error"></div>
          <form id="login-form">
            <div class="form-group">
              <label class="form-label">Username</label>
              <input class="form-input" id="login-username" autocomplete="username" required>
            </div>
            <div class="form-group">
              <label class="form-label">Password</label>
              <input class="form-input" id="login-password" type="password" autocomplete="current-password" required>
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;padding:13px">
              Sign In
            </button>
          </form>
          <div class="brand-footer-mark">Powered by Third Eye Computer Solutions</div>
        </div>
      </div>
    `;

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const errorBox = document.getElementById('login-error');
      errorBox.innerHTML = '';
      try {
        const user = await Api.post('/auth/login', { username, password });
        App.user = user;
        Router.navigate('/dashboard');
        App.boot();
      } catch (err) {
        errorBox.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
      }
    });
  }
};
