import { supabase } from '../contexts/AuthContext';

const API_BASE_URL = '/api';

// Helper to get auth header (if user is logged in)
export const getAuthHeaders = async () => {
  const headers = {
    'Content-Type': 'application/json'
  };

  // Development only: send the dev bypass token recognised by the API
  if (import.meta.env.DEV &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    headers['Authorization'] = 'Bearer dev_token';
    return headers;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch (err) {
    // No auth token - that's okay, API will show public board
    console.log('No auth session');
  }

  return headers;
};

// Attach the HTTP status to the thrown error so callers can distinguish
// "no active month" (404 — real empty state, don't spin retrying) from
// 5xx / network failures (transient — safe to auto-retry).
const httpError = (msg, status) => {
  const e = new Error(msg);
  e.status = status;
  return e;
};

// Pull a human-readable message out of a failed `fetch` Response WITHOUT ever
// throwing on a non-JSON body. The bug this exists for: components used to do
// `await response.json()` in their error branch, which throws a cryptic
// `SyntaxError: Unexpected token` whenever the body isn't JSON — a Vercel 413
// (request too large), a 502 gateway HTML page, an empty body, etc. — masking
// the real failure. Read as text once, try to parse it, and always fall back to
// a sensible message. Returns a string; never rejects.
//
// `fallbacks` lets a caller special-case common statuses, e.g.
//   parseApiError(res, { 413: 'That upload is too large.' })
export const parseApiError = async (response, fallbacks = {}) => {
  if (fallbacks[response.status]) return fallbacks[response.status];
  // A 413 almost always comes from the platform edge (non-JSON), so give it a
  // useful default even when the caller didn't special-case it.
  const genericByStatus = {
    413: 'That request was too large. Please reduce the file size and try again.',
    502: 'The server is temporarily unavailable. Please try again in a moment.',
    503: 'The server is temporarily unavailable. Please try again in a moment.',
    504: 'The request timed out. Please try again.',
  };
  let text = '';
  try {
    text = await response.text();
  } catch {
    return genericByStatus[response.status] || `Request failed (${response.status}).`;
  }
  if (text) {
    try {
      const data = JSON.parse(text);
      if (data && (data.error || data.message)) return data.error || data.message;
    } catch {
      // Not JSON (HTML error page, plain text). Fall through to a clean default
      // rather than surfacing raw markup to the user.
    }
  }
  return genericByStatus[response.status] || `Request failed (${response.status}).`;
};

export const api = {
  // Bingo Board endpoints
  // Counts only — deliberately not the full dex payload. See /api/pokedex.
  getPokedexCounts: async () => {
    const res = await fetch('/api/pokedex?counts=1', { headers: await getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load pokedex counts');
    return res.json();
  },

  getMonthPace: async () => {
    const res = await fetch('/api/user/pace', { headers: await getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load pace');
    return res.json();
  },

  getBadgeProgress: async (limit = 4) => {
    const res = await fetch(`/api/badges/progress?limit=${limit}`, { headers: await getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load badge progress');
    return res.json();
  },

  getBingoBoard: async (version = 0) => {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/bingo/board?v=${version}`, { headers, cache: 'no-store' });
    if (!response.ok) throw httpError('Failed to fetch bingo board', response.status);
    return response.json();
  },

  // Leaderboard endpoints
  getLeaderboard: async (viewMode = 'monthly', version = 0, periodMonthId = null) => {
    const VALID_MODES = ['monthly', 'alltime', 'season', 'year'];
    const mode = VALID_MODES.includes(viewMode) ? viewMode : 'monthly';
    const periodParam = periodMonthId ? `&period_month_id=${periodMonthId}` : '';
    // No `cache: 'no-store'` — freshness comes from the `?v=` version bump (which
    // changes the URL on approval), so the browser + Vercel edge can safely cache
    // each version and share it across viewers. See Cache-Control in leaderboard.js.
    const response = await fetch(`${API_BASE_URL}/leaderboard?mode=${mode}&v=${version}${periodParam}`);
    if (!response.ok) throw httpError('Failed to fetch leaderboard', response.status);
    return response.json();
  },

  // Twitch live-status map { twitchLogin: true } — split out of the leaderboard so
  // the standings can be long-cached while these dots refresh on their own short
  // cache. Overlaid onto rows client-side by twitch username.
  getLeaderboardLive: async () => {
    const response = await fetch(`${API_BASE_URL}/leaderboard/live`);
    if (!response.ok) return {};
    return response.json();
  },

  getLeaderboardPeriods: async () => {
    const response = await fetch(`${API_BASE_URL}/leaderboard/periods`);
    if (!response.ok) throw httpError('Failed to fetch periods', response.status);
    return response.json();
  },

  // Month Statistics endpoints
  getMonthStats: async (monthId = null) => {
    const headers = await getAuthHeaders();
    const q = monthId ? `?month_id=${monthId}` : '';
    const response = await fetch(`${API_BASE_URL}/stats/month${q}`, { headers, cache: 'no-store' });
    if (!response.ok) throw httpError('Failed to fetch month stats', response.status);
    return response.json();
  },

  // Community Tier List endpoints
  // `mode` is 'standard' | 'restricted' — two independent, optional rankings of
  // the same 24 board mons. Omitting it means Standard, which keeps every
  // existing caller (BannerBar's tier_list_incomplete resolver) unchanged.
  getTierList: async (monthId = null, mode = 'standard') => {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams({ mode });
    if (monthId) params.set('month_id', monthId);
    const response = await fetch(`${API_BASE_URL}/tier-list?${params}`, { headers, cache: 'no-store' });
    if (!response.ok) throw httpError('Failed to fetch tier list', response.status);
    return response.json();
  },

  // Who has ranked this month, in one mode. Public — browsing needs no auth,
  // but the header is sent so the response can mark the viewer's own row.
  // `withTiers` also returns each hunter's placements plus the month's pool, so
  // the Community tab draws every board from this one call.
  getTierListSubmissions: async (monthId = null, mode = 'standard', withTiers = false) => {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams({ mode });
    if (withTiers) params.set('include', 'tiers');
    if (monthId) params.set('month_id', monthId);
    const response = await fetch(`${API_BASE_URL}/tier-list/submissions?${params}`, { headers, cache: 'no-store' });
    if (!response.ok) throw httpError('Failed to fetch tier list submissions', response.status);
    return response.json();
  },

  getUserTierList: async (userId, monthId = null, mode = 'standard') => {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams({ mode });
    if (monthId) params.set('month_id', monthId);
    const response = await fetch(`${API_BASE_URL}/tier-list/user/${userId}?${params}`, { headers, cache: 'no-store' });
    if (!response.ok) throw httpError('Failed to fetch that player\'s tier list', response.status);
    return response.json();
  },

  saveTierList: async (monthId, tiers, mode = 'standard') => {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/tier-list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ month_id: monthId, mode, tiers }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const err = httpError(data.error || 'Failed to save tier list', response.status);
      err.migrationPending = Boolean(data.migration_pending);
      throw err;
    }
    return response.json();
  },
};