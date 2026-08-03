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

export const api = {
  // Bingo Board endpoints
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
    const response = await fetch(`${API_BASE_URL}/leaderboard?mode=${mode}&v=${version}${periodParam}`, { cache: 'no-store' });
    if (!response.ok) throw httpError('Failed to fetch leaderboard', response.status);
    return response.json();
  },

  getLeaderboardPeriods: async () => {
    const response = await fetch(`${API_BASE_URL}/leaderboard/periods`, { cache: 'no-store' });
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