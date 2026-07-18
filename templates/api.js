// ============================================================
// Fasal Bazaar — Shared API Utility
// Include this on EVERY page before the page-specific script.
// Provides: Auth, apiFetch, showNotification, initAuthUI (auto-called)
// ============================================================

const API_BASE = '/api';

// ── Token / user helpers ─────────────────────────────────────
const Auth = {
  getToken: () => {
    const t = localStorage.getItem('fb_token');
    return t ? t.replace(/^"|"$/g, '') : null;
  },
  setToken: (t) => localStorage.setItem('fb_token', t),
  getUser: () => {
    try { return JSON.parse(localStorage.getItem('fb_user') || 'null'); }
    catch (e) { return null; }
  },
  setUser: (u) => localStorage.setItem('fb_user', JSON.stringify(u)),
  clear: () => {
    localStorage.removeItem('fb_token');
    localStorage.removeItem('fb_user');
  },
  // FIX: use getToken() so a stored "null" string doesn't count as logged-in
  isLoggedIn: () => !!Auth.getToken(),
};

// ── Core fetch wrapper ───────────────────────────────────────
async function apiFetch(path, { method = 'GET', body, auth = false, geo = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = Auth.getToken();
    if (!token) throw new Error('Please login to continue');
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (geo) {
    const lat = localStorage.getItem('fb_lat');
    const lng = localStorage.getItem('fb_lng');
    if (lat && lng) {
      const separator = path.includes('?') ? '&' : '?';
      path += `${separator}lat=${lat}&lng=${lng}`;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data;
  try {
    data = await res.json();
  } catch (e) {
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return null;
  }

  if (!res.ok) {
    // Auto-clear stale/expired token and redirect to login
    if (res.status === 401) {
      Auth.clear();
      initAuthUI(); // re-render header to Login button immediately
      showNotification('Session expired. Please login again.', true);
      setTimeout(() => { window.location.href = 'Homepage.html'; }, 1500);
    }
    throw new Error(data?.error || data?.message || `Request failed: ${res.status}`);
  }

  return data;
}

// ── Universal Auth UI ────────────────────────────────────────
// Renders the correct header state on every page automatically.
// All pages only need: <div id="userSection"></div> in their <header>.
// No per-page checkAuth() or logout() needed anywhere.
function initAuthUI() {
  const section = document.getElementById('userSection');
  if (!section) return;

  const user = Auth.getUser();

  if (user) {
    section.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:14px;font-weight:600;color:#2e7d32;">
          <i class="fas fa-user-circle"></i> ${user.name}
        </span>
        <button
          onclick="Auth.clear(); window.location.href='Homepage.html';"
          style="background:none;border:1px solid #e53935;color:#e53935;
                 border-radius:6px;padding:4px 10px;cursor:pointer;
                 font-size:12px;font-weight:600;">
          Logout
        </button>
      </div>`;
  } else {
    // Opens auth modal if present on this page, otherwise redirects to Homepage
    section.innerHTML = `
      <button
        onclick="
          const m = document.getElementById('authModal');
          if (m) { m.style.display='block'; }
          else { window.location.href='Homepage.html'; }
        "
        style="background:#2e7d32;color:#fff;border:none;border-radius:6px;
               padding:7px 16px;cursor:pointer;font-size:13px;font-weight:600;">
        <i class="fas fa-user"></i> Login
      </button>`;
  }
}

// Auto-run on every page that includes api.js
document.addEventListener('DOMContentLoaded', initAuthUI);

// ── Shared notification ──────────────────────────────────────
function showNotification(message, isError = false) {
  const n = document.createElement('div');
  n.textContent = message;
  n.style.cssText = `position:fixed;top:20px;right:20px;
    background:${isError ? '#e53935' : '#4caf50'};color:white;
    padding:15px 25px;border-radius:8px;
    box-shadow:0 4px 15px rgba(0,0,0,0.2);z-index:9999;animation:slideInRight 0.3s;`;
  document.body.appendChild(n);
  setTimeout(() => {
    n.style.animation = 'slideOutRight 0.3s';
    setTimeout(() => n.remove(), 300);
  }, 2500);
}

// ── Animation CSS (injected once) ────────────────────────────
const _animStyle = document.createElement('style');
_animStyle.textContent = `
  @keyframes slideInRight  { from{transform:translateX(100%);opacity:0;} to{transform:translateX(0);opacity:1;} }
  @keyframes slideOutRight { from{transform:translateX(0);opacity:1;}    to{transform:translateX(100%);opacity:0;} }
`;
document.head.appendChild(_animStyle);
