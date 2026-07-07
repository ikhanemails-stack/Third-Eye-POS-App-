// Third Eye Computer Solutions - POS System
// Tiny API client wrapper around fetch.
// Globally intercepts license lockout (HTTP 402) so that ANY API call made
// anywhere in the app - mid-sale, mid-report, anywhere - immediately drops
// the user to the lock/activation screen instead of showing a confusing
// generic error. This is what makes server-side expiry enforcement actually
// "immediate" from the user's point of view, not just on next page load.

const Api = {
  async request(method, url, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch('/api' + url, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }

    if (res.status === 402 && data && data.error === 'LICENSE_INVALID') {
      // Don't loop: only trigger the lock screen once, even if several
      // requests are in flight when the license becomes invalid.
      if (!Api._licenseLockTriggered) {
        Api._licenseLockTriggered = true;
        if (typeof App !== 'undefined' && typeof ActivationScreen !== 'undefined') {
          ActivationScreen.render(data.details || { activated: false, reason: 'Your license is no longer valid.' });
        }
      }
      const err = new Error((data.details && data.details.reason) || 'License is no longer valid.');
      err.status = 402;
      err.data = data;
      throw err;
    }

    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  get(url) { return this.request('GET', url); },
  post(url, body) { return this.request('POST', url, body); },
  put(url, body) { return this.request('PUT', url, body); },
  del(url) { return this.request('DELETE', url); }
};

