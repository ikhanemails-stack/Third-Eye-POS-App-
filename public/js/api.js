// Third Eye Computer Solutions - POS System
// API client with immediate license revocation support.

const Api = {
  _licenseLockTriggered: false,

  async request(method, url, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    let res, data = null;
    try {
      res = await fetch('/api' + url, opts);
      try { data = await res.json(); } catch(e) {}
    } catch(e) {
      throw new Error('Network error. Please check your connection.');
    }

    // LICENSE REVOKED → immediate logout and lock screen
    if (res.status === 402 && data && data.error === 'LICENSE_INVALID') {
      if (!Api._licenseLockTriggered) {
        Api._licenseLockTriggered = true;
        console.warn('🔒 License invalid - locking screen immediately');
        if (typeof App !== 'undefined' && typeof ActivationScreen !== 'undefined') {
          ActivationScreen.render(data.details || { activated:false, reason:'Your license is no longer valid.' });
        } else {
          window.location.reload();
        }
      }
      const err = new Error((data.details && data.details.reason) || 'License is no longer valid.');
      err.status = 402; err.data = data; throw err;
    }

    // NOT LOGGED IN → redirect to login
    if (res.status === 401) {
      if (typeof App !== 'undefined' && App.session) {
        App.session = null;
        window.location.hash = '#/login';
      }
      const err = new Error('Not logged in.'); err.status = 401; throw err;
    }

    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status; err.data = data; throw err;
    }
    return data;
  },

  get(url)          { return this.request('GET', url); },
  post(url, body)   { return this.request('POST', url, body); },
  put(url, body)    { return this.request('PUT', url, body); },
  patch(url, body)  { return this.request('PATCH', url, body); },
  delete(url)       { return this.request('DELETE', url); }
};
