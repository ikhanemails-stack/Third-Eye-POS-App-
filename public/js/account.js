// Third Eye Computer Solutions - License Manager
// My Account screen - change password.

const AccountScreen = {
  render() {
    Shell.mount('/account', `
      <div class="page-header">
        <div>
          <h1>My Account</h1>
          <div class="page-subtitle">Manage your License Manager login</div>
        </div>
      </div>
      <div class="card-flat" style="max-width:420px">
        <h3 style="font-size:1rem;margin-bottom:16px">Change Password</h3>
        <form id="password-form">
          <div class="form-group">
            <label class="form-label">Current Password</label>
            <input class="form-input" id="current-password" type="password" required>
          </div>
          <div class="form-group">
            <label class="form-label">New Password</label>
            <input class="form-input" id="new-password" type="password" required minlength="6">
            <div class="form-hint">At least 6 characters.</div>
          </div>
          <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">Update Password</button>
        </form>
      </div>
    `);
    document.getElementById('password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = document.getElementById('current-password').value;
      const newPassword = document.getElementById('new-password').value;
      try {
        await Api.put('/auth/password', { currentPassword, newPassword });
        Toast.success('Password updated successfully.');
        document.getElementById('password-form').reset();
      } catch (err) {
        Toast.error(err.message);
      }
    });
  }
};
