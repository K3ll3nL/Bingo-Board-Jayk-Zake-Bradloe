// DEV ONLY — "view as". On localhost `npm run dev` every request used to carry
// the fixed `dev_token`, so the API always saw the developer's own (moderator)
// account, even after `?realauth=1` signed the browser side out. This lets one
// tab be any of:
//   me     — the dev account (VITE_DEV_USER_ID / DEBUG_USER_ID), the old default
//   as     — a real user, impersonated on BOTH sides: the client user object and
//            the API (`dev_token:<uuid>`, honoured only outside production)
//   out    — signed out: no user, no Authorization header
// Per tab (sessionStorage), so a second tab can show a different view.
// Statically inert in production builds: import.meta.env.DEV is false there.

const KEY = 'devView';

export const isLocalDev = () =>
  import.meta.env.DEV &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const realAuth = () => {
  try { return sessionStorage.getItem('realauth') === '1'; } catch { return false; }
};

export const getDevView = () => {
  if (!isLocalDev()) return null;
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY));
    if (v && (v.mode === 'out' || (v.mode === 'as' && v.userId))) return v;
  } catch { /* fall through */ }
  return { mode: 'me' };
};

// Reloads: auth, mod flags and every cached fetch are resolved once at boot.
export const setDevView = (view) => {
  try {
    if (!view || view.mode === 'me') sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify(view));
  } catch { /* storage blocked: nothing to persist */ }
  window.location.reload();
};

// The Authorization header a dev-bypass request should carry.
//   undefined → not dev-bypassing (production, or ?realauth=1): use the real session
//   ''        → signed-out view: send nothing
export const devAuthHeader = () => {
  if (!isLocalDev() || realAuth()) return undefined;
  const v = getDevView();
  if (v.mode === 'out') return '';
  if (v.mode === 'as') return `Bearer dev_token:${v.userId}`;
  return 'Bearer dev_token';
};
