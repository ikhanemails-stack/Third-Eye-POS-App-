// Third Eye Computer Solutions - License Manager
// Login screen.

const LoginScreen = {
  render() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="center-screen">
        <div class="auth-card">
          <div class="auth-logo">TE</div>
          <h2>Third Eye Computer Solutions</h2>
          <p class="auth-subtitle">License Manager — Sign in to continue</p>
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
        const admin = await Api.post('/auth/login', { username, password });
        App.admin = admin;
        Router.navigate('/dashboard');
        App.boot();
      } catch (err) {
        errorBox.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
      }
    });
  }
};
