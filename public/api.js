/**
 * Modul: API-Client
 * Zweck: Fetch-Wrapper mit Session-Auth, einheitlicher Fehlerbehandlung und JSON-Parsing
 * Abhängigkeiten: keine
 */

const API_BASE = '/api/v1';

/** In-Memory CSRF-Token (zuverlaessiger als document.cookie auf iOS Safari/PWA). */
let _csrfToken = '';

/** Liest den CSRF-Token: bevorzugt In-Memory, Fallback auf Cookie. */
function getCsrfToken() {
  if (_csrfToken) return _csrfToken;
  return document.cookie.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('csrf-token='))
    ?.slice('csrf-token='.length) ?? '';
}

/**
 * Zentraler Fetch-Wrapper.
 * Setzt Content-Type, handhabt 401-Redirects und parsed JSON-Fehler.
 *
 * @param {string} path - API-Pfad ohne /api/v1 (z.B. '/tasks')
 * @param {RequestInit} options - Fetch-Optionen
 * @returns {Promise<any>} Geparstes JSON oder wirft einen Fehler
 */
async function apiFetch(path, options = {}, _retried = false) {
  const url = `${API_BASE}${path}`;

  const method = options.method ?? 'GET';
  const stateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const { headers: optionHeaders = {}, ...fetchOptions } = options;

  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(stateChanging ? { 'X-CSRF-Token': getCsrfToken() } : {}),
      ...optionHeaders,
    },
  });

  if (response.status === 401) {
    // Beim Login-Endpunkt bedeutet 401 "falsche Zugangsdaten", nicht "Session abgelaufen".
    // auth:expired würde die Login-Seite neu rendern und die Fehlermeldung verwerfen.
    if (path !== '/auth/login') {
      window.dispatchEvent(new CustomEvent('auth:expired'));
      throw new Error('Sitzung abgelaufen.');
    }
    // Für /auth/login: fall-through zum generischen !response.ok-Handler unten.
  }

  // CSRF-Token-Desync (haeufig nach iOS-PWA-Resume): einmal GET /auth/me
  // ausfuehren um den CSRF-Token zu erneuern, dann den Request wiederholen.
  if (response.status === 403 && stateChanging && !_retried) {
    // Token aus der 403-Antwort selbst extrahieren (Server liefert den
    // korrekten Token im Header mit, auch bei Fehlschlag)
    const errorCsrf = response.headers.get('X-CSRF-Token');
    if (errorCsrf) {
      _csrfToken = errorCsrf;
      return apiFetch(path, options, true);
    }
    // Fallback: /auth/me aufrufen um Token zu erneuern
    const meRes = await fetch(`${API_BASE}/auth/me`, { credentials: 'same-origin', cache: 'no-store' });
    if (meRes.status === 401) {
      window.dispatchEvent(new CustomEvent('auth:expired'));
      throw new Error('Sitzung abgelaufen.');
    }
    const meData = await meRes.json().catch(() => null);
    if (meData?.csrfToken) _csrfToken = meData.csrfToken;
    return apiFetch(path, options, true);
  }

  // CSRF-Token aus Response-Header extrahieren (wird bei jeder API-Antwort mitgeliefert)
  const csrfHeader = response.headers.get('X-CSRF-Token');
  if (csrfHeader) _csrfToken = csrfHeader;

  const data = await response.json().catch(() => null);

  // Fallback: CSRF-Token aus Response-Body (fuer /auth/me und /auth/login)
  if (data?.csrfToken) _csrfToken = data.csrfToken;

  if (!response.ok) {
    const message = data?.error || `HTTP ${response.status}`;
    throw new ApiError(message, response.status, data);
  }

  return data;
}

/**
 * Strukturierter API-Fehler mit HTTP-Status-Code.
 */
class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// --------------------------------------------------------
// Convenience-Methoden
// --------------------------------------------------------

const api = {
  get: (path) => apiFetch(path, { method: 'GET' }),

  post: (path, body) => apiFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  rawPost: (path, body, headers = {}) => apiFetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      ...headers,
    },
    body,
  }),

  put: (path, body) => apiFetch(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  }),

  patch: (path, body) => apiFetch(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }),

  delete: (path) => apiFetch(path, { method: 'DELETE' }),
};

// --------------------------------------------------------
// Auth-spezifische Methoden
// --------------------------------------------------------

const auth = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  getUsers: () => api.get('/auth/users'),
  createUser: (data) => api.post('/auth/users', data),
  updateUser: (id, data) => api.patch(`/auth/users/${id}`, data),
  updateProfile: (data) => api.patch('/auth/me/profile', data),
  deleteUser: (id) => api.delete(`/auth/users/${id}`),
};

export { api, auth, apiFetch, ApiError };

// --------------------------------------------------------
// Mandatory Location Sharing Polling
// --------------------------------------------------------

let locationBannerActive = false;

function showLocationRequestBanner() {
  if (locationBannerActive) return;
  locationBannerActive = true;
  
  const banner = document.createElement('div');
  banner.id = 'oikos-location-banner';
  banner.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); width: 90%; max-width: 500px; background: var(--color-surface-elevated, #fff); z-index: 99999; display: flex; flex-direction: column; padding: 20px; border-radius: 16px; border: 2px solid var(--color-primary); box-shadow: 0 10px 30px rgba(0,0,0,0.2); font-family: system-ui; gap: 15px; animation: glass-modal-scale-in 0.3s ease-out;';
  
  banner.innerHTML = `
    <div>
      <h3 style="margin: 0 0 5px 0; font-size: 18px; color: var(--text-main, #000); display: flex; align-items: center; gap: 8px;">📍 Parent Requested Location</h3>
      <p style="margin: 0; font-size: 14px; color: var(--text-secondary, #666);">Your parent has requested to see your current location.</p>
    </div>
    <div style="display: flex; gap: 10px;">
      <button id="oikos-share-loc-btn" style="flex: 1; padding: 12px; font-size: 14px; font-weight: bold; border-radius: 8px; border: none; background: var(--color-primary, #007AFF); color: white; cursor: pointer; transition: all 0.2s;">Share Location</button>
      <button id="oikos-ignore-loc-btn" style="padding: 12px 20px; font-size: 14px; font-weight: bold; border-radius: 8px; border: 1px solid var(--color-border-subtle, #ddd); background: transparent; color: var(--text-secondary, #666); cursor: pointer; transition: all 0.2s;">Dismiss</button>
    </div>
    <p id="oikos-loc-error" style="color: var(--color-danger, #FF3B30); margin: 0; font-size: 13px; display: none;"></p>
  `;
  document.body.appendChild(banner);

  document.getElementById('oikos-ignore-loc-btn').onclick = () => {
    removeLocationBanner();
    // Temporarily ignore for this session (will reappear if page reloads or after 15 mins)
    sessionStorage.setItem('ignoredLocRequest', Date.now().toString());
  };

  document.getElementById('oikos-share-loc-btn').onclick = async (e) => {
    const btn = e.target;
    btn.innerText = 'Sharing...';
    btn.disabled = true;
    btn.style.opacity = '0.7';

    if (!navigator.geolocation) {
       const errEl = document.getElementById('oikos-loc-error');
       errEl.innerText = 'Geolocation not supported by browser.';
       errEl.style.display = 'block';
       btn.innerText = 'Share Location';
       btn.disabled = false;
       btn.style.opacity = '1';
       return;
    }

    navigator.geolocation.getCurrentPosition(async (pos) => {
       try {
         await apiFetch('/location', {
           method: 'POST',
           body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude })
         });
         removeLocationBanner();
         sessionStorage.removeItem('ignoredLocRequest');
       } catch (err) {
         const errEl = document.getElementById('oikos-loc-error');
         errEl.innerText = 'Failed to send to server.';
         errEl.style.display = 'block';
         btn.innerText = 'Share Location';
         btn.disabled = false;
         btn.style.opacity = '1';
       }
    }, (err) => {
       const errEl = document.getElementById('oikos-loc-error');
       errEl.innerText = 'Access Denied. You must allow location access in your browser settings.';
       errEl.style.display = 'block';
       btn.innerText = 'Share Location';
       btn.disabled = false;
       btn.style.opacity = '1';
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };
}

function removeLocationBanner() {
  locationBannerActive = false;
  const el = document.getElementById('oikos-location-banner');
  if (el) el.remove();
}

setInterval(async () => {
  try {
    const meRes = await fetch(`${API_BASE}/auth/me`, { credentials: 'same-origin', cache: 'no-store' }).catch(()=>null);
    if (!meRes || !meRes.ok) return;
    const me = await meRes.json();
    if (me && me.user && me.user.family_role === 'child') {
       // Check if child recently ignored the request
       const ignored = sessionStorage.getItem('ignoredLocRequest');
       if (ignored && (Date.now() - parseInt(ignored) < 900000)) {
         return; // Ignore for 15 mins if dismissed
       }
       
       const pendingRes = await fetch(`${API_BASE}/location/pending-status`, { credentials: 'same-origin', cache: 'no-store' }).catch(()=>null);
       if (pendingRes && pendingRes.ok) {
          const data = await pendingRes.json();
          if (data.pending) {
             showLocationRequestBanner();
          } else {
             removeLocationBanner();
          }
       }
    } else {
       removeLocationBanner();
    }
  } catch (e) {
    // Ignore offline errors
  }
}, 10000);
