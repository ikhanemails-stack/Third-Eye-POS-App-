// Third Eye Computer Solutions - POS System
// Toast notifications.

const Toast = {
  show(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type === 'error' ? 'toast-error' : type === 'success' ? 'toast-success' : ''}`;
    const iconSvg = type === 'error' ? Icon.alert : type === 'success' ? Icon.check : '';
    el.innerHTML = `${iconSvg ? `<span style="width:16px;height:16px;display:flex">${iconSvg}</span>` : ''}<span>${message}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.2s';
      setTimeout(() => el.remove(), 200);
    }, 3200);
  },
  error(msg) { this.show(msg, 'error'); },
  success(msg) { this.show(msg, 'success'); }
};
