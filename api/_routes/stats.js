/**
 * stats routes (1).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  GAME_LABELS,
  POKEMON_IMAGE_FIELDS,
  fetchTierSubmissions,
  getActiveMonth,
  getAuthenticatedUserId,
  resolveStatsMonth,
  supabase,
} = require('../_lib/core');

// ── "Watch out!" shapes ──────────────────────────────────────────────────────
// Board positions are 1..25 with a free space at 13 (24 pool mons + centre) —
// mirrors the board built in routes/bingo.js and the achievement checks inside
// the approve_submission RPC (supabase/migrations/…_remote_schema.sql). The X
// shape there requires BOTH diagonals, so it is one shape (their union), not two.
const WATCH_SHAPES = {
  row: [
    [1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15],
    [16, 17, 18, 19, 20], [21, 22, 23, 24, 25],
  ],
  column: [
    [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23],
    [4, 9, 14, 19, 24], [5, 10, 15, 20, 25],
  ],
  x: [[1, 7, 13, 19, 25, 5, 9, 17, 21]],
  blackout: [Array.from({ length: 25 }, (_, i) => i + 1)],
};
// Order is "easiest first" and doubles as the tie-break when two achievement
// types are the same number of catches away (Kellen's call): a row that is 2
// away leads over an X that is 2 away, because it is the likelier next claim.
const WATCH_TYPES = ['row', 'column', 'x', 'blackout'];
// Types are claimed once per month by the first player to complete them, so a
// claimed type is out of reach for everyone else and drops off the panel.
const claimKey = (type, mode) => (mode === 'restricted' ? `${type}_restricted` : type);

// `entries.game` stores the display label ("Pokémon Emerald"), not the
// ALLOWED_GAMES slug, so GAME_LABELS[raw] never actually resolves - it just
// falls through to the raw value, which happens to already be the label. The
// client needs the slug to look up game logos, so resolve both directions here
// and emit `game_key` alongside the label. Tolerates either storage form in
// case entries start carrying slugs later.
const GAME_KEY_BY_LABEL = Object.fromEntries(Object.entries(GAME_LABELS).map(([k, v]) => [v, k]));
const resolveGame = (raw) => {
  if (!raw) return { key: null, label: null };
  if (GAME_LABELS[raw]) return { key: raw, label: GAME_LABELS[raw] };
  return { key: GAME_KEY_BY_LABEL[raw] || null, label: raw };
};

// PostgREST caps a single select at 1000 rows. A single month's entries are
// nowhere near that today, but a busy month is the one case that could reach it
// and would silently truncate every panel on the page, so page it explicitly.
const PAGE_SIZE = 1000;
const selectAllRows = async (build) => {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
};

// Least number of submissions any still-eligible player needs to claim each
// achievement type, listing every tied player (Kellen's spec: no arbitrary pick).
// One bulk fetch + JS tally, following buildGameStats in lib/core.js.
const buildWatchOut = (subset, positionByPokemon, claimed) => {
  const filledByUser = new Map();
  subset.forEach(e => {
    let filled = filledByUser.get(e.user_id);
    if (!filled) { filled = new Set([13]); filledByUser.set(e.user_id, filled); }
    const pos = positionByPokemon[e.pokemon_id];
    if (pos) filled.add(pos);
  });

  const out = [];
  WATCH_TYPES.forEach(type => {
    if (claimed.has(type)) return;
    const shapes = WATCH_SHAPES[type];
    let best = Infinity;
    let contenders = [];
    filledByUser.forEach((filled, userId) => {
      let userBest = Infinity;
      let positions = [];
      shapes.forEach((cells, idx) => {
        const remaining = cells.reduce((n, p) => n + (filled.has(p) ? 0 : 1), 0);
        if (remaining < userBest) { userBest = remaining; positions = [idx + 1]; }
        else if (remaining === userBest) positions.push(idx + 1);
      });
      if (userBest < 1 || userBest === Infinity) return; // already complete / unclaimable
      if (userBest < best) { best = userBest; contenders = []; }
      if (userBest === best) contenders.push({ user_id: userId, positions });
    });
    if (!contenders.length) return;
    out.push({
      type,
      remaining: best,
      // row/column carry a 1-based index; x and blackout have no position.
      positioned: type === 'row' || type === 'column',
      contenders,
    });
  });
  // The page renders only out[0]. Array.sort is stable, so equal `remaining`
  // preserves the easiest-first WATCH_TYPES order established above.
  return out.sort((a, b) => a.remaining - b.remaining);
};

// ── Tier upsets ──────────────────────────────────────────────────────────────
// Cross the community tier list against what actually got caught. Each pool mon
// gets its modal (most-voted) tier; the upsets are the "Super Hard" mon that
// everyone caught anyway and the "Easy" mon nobody could land.
// Fallback tiers keep the panel alive on months where no mon lands on the
// headline tier — better a Hard overachiever than an empty card.
const OVERACHIEVER_TIERS = [['super_hard'], ['hard']];
const TRAP_TIERS = [['easy'], ['medium']];

// A tier list only counts once every mon on the board is ranked. A partial list
// is a half-formed opinion — letting one through would skew the modal tier and
// the consensus percentages toward whichever mons happened to get ranked, and
// would let a single placement satisfy the 3-submission gate.
// Needs no extra query or table: `tiers` and the month's pool are both already
// fetched for other panels, so completeness is a set comparison in memory.
const isCompleteTierList = (sub, poolIds) => {
  const ranked = Object.keys(sub.tiers || {});
  if (ranked.length < poolIds.size) return false;
  return [...poolIds].every(id => sub.tiers[String(id)]);
};

const modalTierByMon = (tierSubmissions) => {
  const votes = {}; // pokemon_id -> { tier: count }
  (tierSubmissions || []).forEach(sub => {
    Object.entries(sub.tiers || {}).forEach(([pokemonId, tier]) => {
      const id = parseInt(pokemonId, 10);
      if (!votes[id]) votes[id] = {};
      votes[id][tier] = (votes[id][tier] || 0) + 1;
    });
  });
  const out = {};
  Object.entries(votes).forEach(([id, byTier]) => {
    const total = Object.values(byTier).reduce((n, c) => n + c, 0);
    const [tier, count] = Object.entries(byTier).sort((a, b) => b[1] - a[1])[0];
    out[id] = { tier, votes: count, total_votes: total, pct: Math.round((count / total) * 100) };
  });
  return out;
};

const buildTierUpsets = (modalByMon, catchCountByMon) => {
  // `pick` walks the fallback tiers in order and returns the first non-empty
  // result, so a month with no Super Hard consensus still yields a card.
  const pick = (tierGroups, choose) => {
    for (const tiers of tierGroups) {
      const candidates = Object.entries(modalByMon)
        .filter(([, m]) => tiers.includes(m.tier))
        .map(([id, m]) => ({ id: parseInt(id, 10), ...m, catch_count: catchCountByMon[id] || 0 }));
      const winner = choose(candidates);
      if (winner) return winner;
    }
    return null;
  };

  return {
    // Voted hardest, caught most — requires at least one actual catch, or the
    // "upset" is just a mon nobody touched.
    overachiever: pick(OVERACHIEVER_TIERS, (c) =>
      c.filter(x => x.catch_count > 0).sort((a, b) => b.catch_count - a.catch_count)[0] || null),
    // Voted easiest, caught least — zero catches is the most interesting case,
    // so no minimum here.
    trap: pick(TRAP_TIERS, (c) =>
      c.sort((a, b) => a.catch_count - b.catch_count || a.id - b.id)[0] || null),
  };
};

// Rarity tallies for "Most Unique Catch", scoped to whichever entries subset is
// being summarised. Deliberately NOT month-wide: in Restricted mode every other
// panel answers "among restricted hunting, what happened?", and a month-wide
// baseline made this one panel answer a different question than its neighbours.
// Concretely, the only hunter to land a mon restricted would show up in Rarest
// Catches but be knocked out of Most Unique Catch because someone else caught
// the same mon in the same game the easy way — which is precisely the
// achievement the Restricted view exists to celebrate.
const rarity = (subset) => {
  const out = { pair: {}, game: {}, mon: {} };
  subset.forEach(e => {
    if (!e.game) return;
    const pairKey = `${e.pokemon_id}|${e.game}`;
    out.pair[pairKey] = (out.pair[pairKey] || 0) + 1;
    out.game[e.game] = (out.game[e.game] || 0) + 1;
    out.mon[e.pokemon_id] = (out.mon[e.pokemon_id] || 0) + 1;
  });
  return out;
};

// ── Most unique catch ────────────────────────────────────────────────────────
// The rarest (pokemon, game) pairing logged this month, within the active
// bucket (see `rarity` above). Scored against this month's entries only — an
// all-time baseline made the answer depend on months the page isn't showing.
// Ties break on the rarer game, then the rarer pokemon, which collapses most of
// them; whatever survives goes to the client as a carousel.
// ── Hunter Spotlight ─────────────────────────────────────────────────────────
// Best 7-day catch run anywhere in the month, per user, from raw timestamps.
// Deliberately NOT tied to current standing: a hunter who went off for a week
// then went quiet keeps that week credited, which is the whole point (a
// mid-month hot streak shouldn't disappear just because the hunter cooled off
// before the month closed).
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const bestWeekByUser = (subset) => {
  const timesByUser = new Map();
  subset.forEach(e => {
    if (!e.created_at) return;
    let arr = timesByUser.get(e.user_id);
    if (!arr) { arr = []; timesByUser.set(e.user_id, arr); }
    arr.push(new Date(e.created_at).getTime());
  });
  const best = new Map();
  timesByUser.forEach((times, userId) => {
    times.sort((a, b) => a - b);
    let start = 0;
    let peak = 0;
    for (let end = 0; end < times.length; end += 1) {
      while (times[end] - times[start] >= WEEK_MS) start += 1;
      peak = Math.max(peak, end - start + 1);
    }
    best.set(userId, peak);
  });
  return best;
};

// Most Disputed: the pool mon with the lowest modal-tier percentage. Only
// complete tier lists count toward modalByMon, so every mon there has the same
// total_votes (== submissionCount) — the split itself, not the sample size, is
// what makes one mon more contested than another.
const buildMostDisputed = (modalByMon, catchCountByMon) => {
  const entries = Object.entries(modalByMon);
  if (!entries.length) return null;
  const [id, m] = entries.reduce((best, cur) => (cur[1].pct < best[1].pct ? cur : best));
  return { id: parseInt(id, 10), ...m, catch_count: catchCountByMon[id] || 0 };
};

const buildUniqueCatch = (subset, baseline) => {
  const scored = [];
  const seen = new Set();
  subset.forEach(e => {
    if (!e.game) return; // pre-`game` entries can't be paired
    const dedupe = `${e.user_id}|${e.pokemon_id}|${e.game}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    const pairKey = `${e.pokemon_id}|${e.game}`;
    scored.push({
      user_id: e.user_id,
      pokemon_id: e.pokemon_id,
      game: e.game,
      pair_count: baseline.pair[pairKey] || 0,
      game_count: baseline.game[e.game] || 0,
      mon_count: baseline.mon[e.pokemon_id] || 0,
    });
  });
  if (!scored.length) return { available: false, items: [] };

  // Rarity is `pair_count` and nothing else — game_count/mon_count only *order*
  // the tie (see RARITY_ORDER), they must never narrow it. Filtering on all
  // three was the bug that made a month with four one-of-a-kind pairings
  // surface just one of them: every pairing had pair_count 1, but they were
  // played in different games, so the game_count comparison discarded three
  // genuine ties. Ordering and the display cap are applied by the caller, which
  // has the names needed for the final tiebreak.
  const best = scored.reduce((n, s) => Math.min(n, s.pair_count), Infinity);
  const items = scored.filter(s => s.pair_count === best);
  return { available: true, items, tied_total: items.length };
};

// ── Closed-month stats cache ────────────────────────────────────────────────
// A closed month's entries are immutable (nothing edits/deletes an approved
// entries row besides moderator_note, which no panel here reads), so its
// stats never change once computed. Reused by both the read-path cache-hit
// shortcut below and the period-end cron's precompute step.
const fetchPoolIds = async (monthId) => {
  const { data } = await supabase.from('monthly_pokemon_pool').select('pokemon_id').eq('month_id', monthId);
  return new Set((data || []).map(p => p.pokemon_id));
};

// tier_list.viewer_* fields are per-viewer and must never be cached for
// everyone — a cache hit recomputes just these from one targeted per-user
// query instead of the full month scan.
const buildViewerTierFields = async (monthId, userId, poolIds) => {
  if (!userId) return { viewer_submitted: false, viewer_ranked: 0, restricted_viewer_submitted: false, restricted_viewer_ranked: 0 };
  const [{ rows: ownStandard }, { rows: ownRestricted }] = await Promise.all([
    fetchTierSubmissions(monthId, { mode: 'standard', userId }),
    fetchTierSubmissions(monthId, { mode: 'restricted', userId }),
  ]);
  const own = ownStandard[0];
  const ownR = ownRestricted[0];
  return {
    viewer_submitted: Boolean(own && isCompleteTierList(own, poolIds)),
    viewer_ranked: own ? Object.keys(own.tiers || {}).length : 0,
    restricted_viewer_submitted: Boolean(ownR && isCompleteTierList(ownR, poolIds)),
    restricted_viewer_ranked: ownR ? Object.keys(ownR.tiers || {}).length : 0,
  };
};

// Exported so the period-end cron (internal.js) can precompute a just-closed
// month's stats immediately, off the request path entirely.
const cacheMonthStats = async (monthId, payload) => {
  // Never persist one viewer's personal tier_list fields into the shared
  // cache row — every future reader gets these recomputed fresh instead.
  const cacheable = {
    ...payload,
    tier_list: {
      ...payload.tier_list,
      viewer_submitted: false, viewer_ranked: 0,
      restricted_viewer_submitted: false, restricted_viewer_ranked: 0,
    },
  };
  const { error } = await supabase
    .from('month_stats_cache')
    .upsert({ month_id: monthId, payload: cacheable, computed_at: new Date().toISOString() });
  if (error) console.error('Failed to cache month stats:', error.message);
};

module.exports = function register(app) {

  // GET /api/stats/month - read-only aggregate dashboard for a given month.
  // Aggregations are split into an `all` bucket (every entry) and a
  // `restricted` bucket (restricted_submission only). Note that `all` is a
  // superset, not a sibling: restricted catches also count toward the standard
  // board, so an "all vs restricted" split is the honest framing where the old
  // "standard vs restricted" one double-counted nothing but implied it did.
  app.get('/api/stats/month', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      const monthData = await resolveStatsMonth(req, userId);
      if (!monthData) return res.status(404).json({ error: 'Month not found' });
      const monthId = monthData.id;

      // "Watch out!" is a live race — who is closest to claiming an achievement
      // nobody has taken yet. On a finished month there is nothing left to
      // claim, so the panel is skipped entirely rather than shown as a frozen
      // scoreboard. getActiveMonth is cached, so this costs nothing when the
      // request is already for the active month.
      const activeMonth = req.query.month_id ? await getActiveMonth(userId) : monthData;
      const isCurrentMonth = Boolean(activeMonth && activeMonth.id === monthId);

      // A closed month's entries never change (see cacheMonthStats above), so
      // a cache hit skips the entire computation below — just a PK lookup plus
      // one cheap per-viewer personalization pass for the tier_list fields.
      if (!isCurrentMonth) {
        const { data: cached, error: cacheReadError } = await supabase
          .from('month_stats_cache').select('payload').eq('month_id', monthId).maybeSingle();
        if (cacheReadError) console.error('month_stats_cache read failed, falling back to live compute:', cacheReadError.message);
        if (cached) {
          console.log(`stats/month cache HIT month_id=${monthId} computed_at=${cached.computed_at}`);
          const poolIds = await fetchPoolIds(monthId);
          const viewerFields = await buildViewerTierFields(monthId, userId, poolIds);
          return res.json({
            ...cached.payload,
            tier_list: { ...cached.payload.tier_list, ...viewerFields },
          });
        }
        console.log(`stats/month cache MISS month_id=${monthId} — computing live and populating cache`);
      } else {
        console.log(`stats/month live compute (current month) month_id=${monthId}`);
      }

      const [
        entries,
        { data: historyCounts, error: historyCountsError },
        { data: monthRows, error: monthsError },
        { data: achievements, error: achievementsError },
        { rows: tierSubmissionsStandard },
        { rows: tierSubmissionsRestricted },
        { data: poolRows, error: poolError },
        { data: pointRows, error: pointsError },
        { data: badgeRows, error: badgeError },
      ] = await Promise.all([
        // created_at powers Hunter Spotlight's Hot Streak (a sliding 7-day
        // window needs real timestamps, not just a monthly total).
        selectAllRows(() => supabase.from('entries').select('user_id, pokemon_id, game, restricted_submission, historical, created_at').eq('month_id', monthId)),
        // The denominator behind the Overview bars. A raw count has nothing to
        // be a fraction of, so the bars measure this month against the best
        // month on record. Also the source for Hunter Spotlight's Most
        // Improved and Consistently Elite, which both compare this month's
        // per-user counts against other months.
        //
        // Pre-aggregated server-side (one row per month/user/restricted-flag
        // combo, historical already excluded) instead of pulling every entry
        // ever made — that raw scan grew unboundedly with total catches.
        supabase.rpc('entries_monthly_user_counts'),
        supabase.from('bingo_months').select('id, month_year_display, start_date').order('start_date', { ascending: true }),
        // user_id added alongside bingo_type — the Month Champion hero needs
        // the winner's own achievement count once the month is finished.
        supabase.from('bingo_achievements').select('bingo_type, user_id').eq('month_id', monthId),
        // user_id comes along so `viewer_submitted` needs no second query.
        //
        // MUST stay mode-scoped. Tier lists are ranked per mode (migration
        // 20260802180000), so an unfiltered read returns TWO rows for any
        // dual-mode user — they would be counted as two community members toward
        // the >= 3 gate and their restricted opinions would be mixed into the
        // standard modal tier.
        //
        // Each bucket reads its OWN mode: the All bucket maps to Standard
        // (owner's call — All is the whole board, which is what a Standard list
        // ranks), and the Restricted bucket reads Restricted. Anything else
        // compares restricted catches against standard predictions, which is a
        // different question than the panel claims to answer.
        //
        // Strict, with no fallback: a Restricted bucket with fewer than 3
        // complete restricted lists shows the "not enough hunters ranked" state
        // rather than borrowing standard consensus. Borrowing would silently
        // relabel one mode's opinions as the other's.
        fetchTierSubmissions(monthId, { mode: 'standard' }),
        fetchTierSubmissions(monthId, { mode: 'restricted' }),
        supabase.from('monthly_pokemon_pool').select('position, pokemon_id').eq('month_id', monthId),
        supabase.from('user_monthly_points').select('user_id, points').eq('month_id', monthId),
        // Badges earned this calendar month, regardless of badge type — a
        // monthly-winner badge's own `month_id` can point at a different,
        // earlier month than when it was actually awarded, so `earned_at` is
        // the only honest filter for "who got badged this month". Secret
        // badge identity is scrubbed below the query, not here, since it's a
        // per-row decision.
        supabase
          .from('user_badges')
          .select('user_id, badge_id, earned_at, badges(name, image_url, is_secret), users(display_name, avatar_url)')
          .gte('earned_at', monthData.start_date)
          .lt('earned_at', monthData.end_date)
          .order('earned_at', { ascending: false }),
      ]);
      if (historyCountsError) throw historyCountsError;
      if (monthsError) throw monthsError;
      if (achievementsError) throw achievementsError;
      if (poolError) throw poolError;
      if (badgeError) throw badgeError;
      if (pointsError) throw pointsError;

      // Historical entries are retroactive dex-completion catches: they carry a
      // past month's month_id but were hunted long after that month closed, and
      // they earn no points, no board state, and no achievements. Folding them
      // into this page would (a) credit hunters on leaderboards they never
      // scored on and (b) let a finished month's totals keep growing forever,
      // which would quietly move the "best month on record" the Overview bars
      // are measured against. They are excluded from every panel and surfaced
      // as a standalone count instead of being discarded.
      const monthRowsAll = entries || [];
      const historicalRows = monthRowsAll.filter(e => e.historical);
      const allEntries = monthRowsAll.filter(e => !e.historical);
      const restrictedEntries = allEntries.filter(e => e.restricted_submission);
      const historicalCounts = {
        all: historicalRows.length,
        restricted: historicalRows.filter(e => e.restricted_submission).length,
      };

      // ── Overview trend ──────────────────────────────────────────────────────
      // Per-month totals for both buckets, so each Overview bar can be a real
      // fraction (this month / best month on record) with a delta against the
      // previous month. Built from the pre-aggregated RPC rows (historical
      // already excluded server-side); no per-month queries.
      const tallyByMonth = new Map(); // month_id -> { all:{n,users}, restricted:{n,users} }
      (historyCounts || []).forEach(row => {
        let t = tallyByMonth.get(row.month_id);
        if (!t) { t = { all: { n: 0, users: new Set() }, restricted: { n: 0, users: new Set() } }; tallyByMonth.set(row.month_id, t); }
        t.all.n += row.cnt; t.all.users.add(row.user_id);
        if (row.restricted_submission) { t.restricted.n += row.cnt; t.restricted.users.add(row.user_id); }
      });

      const orderedMonths = monthRows || [];
      const monthIdx = orderedMonths.findIndex(m => m.id === monthId);
      // The previous month with any activity at all — skipping empty months
      // keeps the delta from reading "+∞% vs a month nobody played".
      let prevMonth = null;
      for (let i = monthIdx - 1; i >= 0; i -= 1) {
        if (tallyByMonth.has(orderedMonths[i].id)) { prevMonth = orderedMonths[i]; break; }
      }

      // Per-user-per-month catch counts and each user's first active month —
      // the raw material for Hunter Spotlight's Most Improved, Consistently
      // Elite, and Newcomer categories. One extra pass over the same
      // pre-aggregated RPC rows `tallyByMonth` already reads; no new query.
      const monthIdxById = new Map(orderedMonths.map((m, i) => [m.id, i]));
      const userMonthCounts = new Map(); // month_id -> Map(user_id -> count)
      const firstMonthIdxByUser = new Map(); // user_id -> earliest month index with a catch
      (historyCounts || []).forEach(row => {
        let counts = userMonthCounts.get(row.month_id);
        if (!counts) { counts = new Map(); userMonthCounts.set(row.month_id, counts); }
        counts.set(row.user_id, (counts.get(row.user_id) || 0) + row.cnt);
        const idx = monthIdxById.get(row.month_id);
        if (idx != null) {
          const prevIdx = firstMonthIdxByUser.get(row.user_id);
          if (prevIdx == null || idx < prevIdx) firstMonthIdxByUser.set(row.user_id, idx);
        }
      });

      const buildTrend = (key) => {
        const stat = (id) => {
          const t = tallyByMonth.get(id);
          return t ? { total: t[key].n, participants: t[key].users.size } : { total: 0, participants: 0 };
        };
        let bestTotal = 0;
        let bestParticipants = 0;
        tallyByMonth.forEach(t => {
          bestTotal = Math.max(bestTotal, t[key].n);
          bestParticipants = Math.max(bestParticipants, t[key].users.size);
        });
        const prev = prevMonth ? stat(prevMonth.id) : null;
        return {
          best_total: bestTotal,
          best_participants: bestParticipants,
          prev_label: prevMonth ? prevMonth.month_year_display : null,
          prev_total: prev ? prev.total : null,
          prev_participants: prev ? prev.participants : null,
          // The current month is still accruing, so the client labels its
          // comparisons "so far" rather than implying a finished result.
          in_progress: isCurrentMonth,
        };
      };
      const trendAll = buildTrend('all');
      const trendRestricted = buildTrend('restricted');

      // Pure-JS aggregation of one entries subset (Supabase JS has no group-by).
      // Returns raw tallies/ids only - display data (names, images) is resolved
      // once below from the union of both buckets top ids.
      const summarize = (subset) => {
        const rar = rarity(subset);
        const catchCountByMon = {};
        const usersByMon = {}; // pokemon_id -> Set(user_id), for Rarest Catches
        const firstEntryByMon = {}; // a solo mon has exactly one, so this is it
        subset.forEach(e => {
          catchCountByMon[e.pokemon_id] = (catchCountByMon[e.pokemon_id] || 0) + 1;
          if (!usersByMon[e.pokemon_id]) usersByMon[e.pokemon_id] = new Set();
          usersByMon[e.pokemon_id].add(e.user_id);
          if (!firstEntryByMon[e.pokemon_id]) firstEntryByMon[e.pokemon_id] = e;
        });
        const topMonIds = Object.entries(catchCountByMon).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => parseInt(id, 10));

        const catchCountByUser = {};
        subset.forEach(e => { catchCountByUser[e.user_id] = (catchCountByUser[e.user_id] || 0) + 1; });
        const topUserIds = Object.entries(catchCountByUser).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);

        const catchCountByGame = {};
        subset.forEach(e => { const g = e.game || 'unknown'; catchCountByGame[g] = (catchCountByGame[g] || 0) + 1; });
        const catches_by_game = Object.entries(catchCountByGame)
          .sort((a, b) => b[1] - a[1])
          .map(([game, count]) => {
            const g = resolveGame(game);
            // No `game` field: entries.game already IS the label, so emitting
            // both sent the same long string twice per row.
            return { game_key: g.key || game, label: g.label || game, catch_count: count };
          });

        // Caught by exactly one hunter — the month's "only <name> has one of these".
        // Capped at a board's worth so an empty early month doesn't dump every mon.
        // Carries the same game_count/mon_count rarity signals Most Unique Catch
        // uses, so both panels can share one comparator. NOT capped here — the
        // cap must come after ordering, or it keeps an arbitrary slice (object
        // key order, i.e. lowest pokemon_id) rather than the rarest.
        const solo = Object.entries(usersByMon)
          .filter(([, users]) => users.size === 1)
          .map(([id, users]) => {
            const pokemonId = parseInt(id, 10);
            const entry = firstEntryByMon[pokemonId];
            return {
              pokemon_id: pokemonId,
              user_id: [...users][0],
              game_count: entry?.game ? rar.game[entry.game] : undefined,
              mon_count: catchCountByMon[pokemonId],
            };
          });

        return {
          participantIds: new Set(subset.map(e => e.user_id)),
          catchCountByMon, topMonIds, catchCountByUser, topUserIds, catches_by_game,
          solo,
          unique_catch: buildUniqueCatch(subset, rar),
          total_shinies: subset.length,
        };
      };

      const allSummary = summarize(allEntries);
      const restrictedSummary = summarize(restrictedEntries);

      // ── Hunter Spotlight ────────────────────────────────────────────────────
      // Month-wide (not bucket-scoped) — same treatment as consensus_callout
      // and restricted_rate: it answers "what happened this month", not "what
      // happened in this toggle view". Built from `allEntries`/history rather
      // than the buckets above because it needs raw timestamps and cross-month
      // comparisons neither bucket carries. Deliberately credits MULTIPLE
      // hunters per category (ties are never broken arbitrarily) and skips a
      // category entirely rather than force a winner when nothing clears the
      // bar — an empty slot beats a hollow one.
      const spotlightUserIds = new Set();
      const spotlightEntries = [];
      const pushSpotlight = (category, title, blurb, unit, userStats) => {
        if (!userStats.length) return;
        userStats.forEach(u => spotlightUserIds.add(u.user_id));
        spotlightEntries.push({ category, title, blurb, unit, users: userStats });
      };

      // Hot Streak — best 7-day run anywhere in the month. Survives a cooldown
      // at the end of the month by design (see bestWeekByUser above).
      const weekBest = bestWeekByUser(allEntries);
      let hotStreakPeak = 0;
      weekBest.forEach(v => { hotStreakPeak = Math.max(hotStreakPeak, v); });
      if (hotStreakPeak >= 5) {
        const winners = [...weekBest.entries()].filter(([, v]) => v === hotStreakPeak).slice(0, 3);
        pushSpotlight(
          'hot_streak', 'Hot Streak', `${hotStreakPeak} catches in a single week`, 'catches',
          winners.map(([user_id]) => ({ user_id, stat: hotStreakPeak })),
        );
      }

      // Most Improved — biggest jump in catches vs the previous active month.
      // Only counts hunters who were active last month too, or "improvement"
      // is meaningless.
      if (prevMonth) {
        const prevCounts = userMonthCounts.get(prevMonth.id) || new Map();
        const curCounts = userMonthCounts.get(monthId) || new Map();
        let bestDelta = 0;
        let improved = [];
        curCounts.forEach((count, uid) => {
          const prevCount = prevCounts.get(uid) || 0;
          if (prevCount <= 0) return;
          const delta = count - prevCount;
          if (delta > bestDelta) { bestDelta = delta; improved = [{ user_id: uid, stat: delta, count, prevCount }]; }
          else if (delta === bestDelta && delta > 0) improved.push({ user_id: uid, stat: delta, count, prevCount });
        });
        if (bestDelta >= 3) {
          pushSpotlight(
            'most_improved', 'Most Improved',
            `+${bestDelta} catches vs ${prevMonth.month_year_display}`, 'catches',
            improved.slice(0, 3),
          );
        }
      }

      // Consistently Elite — longest current streak of consecutive months
      // (ending this month) inside the monthly top 3 by catches. Needs 2+
      // months to mean anything, so a first strong month alone doesn't qualify
      // (that's Newcomer's job, or just a good Hunter of the Month).
      const TOP_N = 3;
      let maxStreak = 0;
      let consistentWinners = [];
      if (monthIdx >= 1) {
        const curCounts = userMonthCounts.get(monthId);
        if (curCounts) {
          const curTop = [...curCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_N).map(([uid]) => uid);
          curTop.forEach(uid => {
            let streak = 0;
            for (let i = monthIdx; i >= 0; i -= 1) {
              const counts = userMonthCounts.get(orderedMonths[i].id);
              if (!counts) break;
              const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_N).map(([id]) => id);
              if (top.includes(uid)) streak += 1; else break;
            }
            if (streak > maxStreak) { maxStreak = streak; consistentWinners = [uid]; }
            else if (streak === maxStreak) consistentWinners.push(uid);
          });
        }
      }
      if (maxStreak >= 2) {
        pushSpotlight(
          'consistent', 'Consistently Elite', `Top ${TOP_N} hunters ${maxStreak} months running`, 'months',
          consistentWinners.slice(0, 3).map(user_id => ({ user_id, stat: maxStreak })),
        );
      }

      // Range Rider — breadth over volume: most distinct games hunted this
      // month, not most catches.
      const gamesByUser = new Map();
      allEntries.forEach(e => {
        if (!e.game) return;
        let set = gamesByUser.get(e.user_id);
        if (!set) { set = new Set(); gamesByUser.set(e.user_id, set); }
        set.add(e.game);
      });
      let bestGameSpread = 0;
      gamesByUser.forEach(set => { bestGameSpread = Math.max(bestGameSpread, set.size); });
      if (bestGameSpread >= 3) {
        const winners = [...gamesByUser.entries()].filter(([, set]) => set.size === bestGameSpread).slice(0, 3);
        pushSpotlight(
          'range_rider', 'Range Rider', `Caught across ${bestGameSpread} different games this month`, 'games',
          winners.map(([user_id]) => ({ user_id, stat: bestGameSpread })),
        );
      }

      // Comeback Champion — bottom half of the field last month, this month's
      // hardest-to-reach cutoff (top 10, or top half if the field is small
      // enough that top half is the tighter bar). Needs real standing in both
      // months or "comeback" has no starting point to climb from, and both
      // fields need a minimum size or a 4-person month makes "bottom half"
      // trivial to clear.
      const MIN_SPOTLIGHT_FIELD = 6;
      if (prevMonth) {
        const prevCounts = userMonthCounts.get(prevMonth.id) || new Map();
        const curCounts = userMonthCounts.get(monthId) || new Map();
        const rankOf = (counts) => {
          const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
          const byUser = new Map();
          sorted.forEach(([uid], i) => byUser.set(uid, i + 1));
          return { byUser, n: sorted.length };
        };
        const prevRanked = rankOf(prevCounts);
        const curRanked = rankOf(curCounts);
        if (prevRanked.n >= MIN_SPOTLIGHT_FIELD && curRanked.n >= MIN_SPOTLIGHT_FIELD) {
          const prevBottomStart = Math.floor(prevRanked.n / 2) + 1;
          const eliteCutoff = Math.min(10, Math.ceil(curRanked.n / 2));
          let bestClimb = 0;
          let climbers = [];
          curRanked.byUser.forEach((curRank, uid) => {
            const prevRank = prevRanked.byUser.get(uid);
            if (prevRank == null || prevRank < prevBottomStart || curRank > eliteCutoff) return;
            const climb = prevRank - curRank;
            if (climb > bestClimb) { bestClimb = climb; climbers = [{ user_id: uid, curRank, prevRank }]; }
            else if (climb === bestClimb) climbers.push({ user_id: uid, curRank, prevRank });
          });
          if (climbers.length && bestClimb > 0) {
            pushSpotlight(
              'comeback_champion', 'Comeback Champion',
              `#${climbers[0].prevRank} to #${climbers[0].curRank} this month`, 'places',
              climbers.slice(0, 3).map(c => ({ user_id: c.user_id, stat: bestClimb })),
            );
          }
        }
      }

      // Iron Hunter — longest streak of consecutive calendar days with at
      // least one catch this month. A different axis from Hot Streak (best
      // 7-day volume) — this rewards showing up daily over a single hot burst.
      const daysByUser = new Map();
      allEntries.forEach(e => {
        if (!e.created_at) return;
        const day = e.created_at.slice(0, 10);
        let set = daysByUser.get(e.user_id);
        if (!set) { set = new Set(); daysByUser.set(e.user_id, set); }
        set.add(day);
      });
      const dayStreakByUser = new Map();
      daysByUser.forEach((days, uid) => {
        const sorted = [...days].sort();
        let peak = 1;
        let cur = 1;
        for (let i = 1; i < sorted.length; i += 1) {
          const diffDays = Math.round((new Date(sorted[i]) - new Date(sorted[i - 1])) / (24 * 60 * 60 * 1000));
          cur = diffDays === 1 ? cur + 1 : 1;
          peak = Math.max(peak, cur);
        }
        dayStreakByUser.set(uid, peak);
      });
      let bestDayStreak = 0;
      dayStreakByUser.forEach(v => { bestDayStreak = Math.max(bestDayStreak, v); });
      if (bestDayStreak >= 5) {
        const winners = [...dayStreakByUser.entries()].filter(([, v]) => v === bestDayStreak).slice(0, 3);
        pushSpotlight(
          'iron_hunter', 'Iron Hunter', `${bestDayStreak} days in a row with a catch`, 'days',
          winners.map(([user_id]) => ({ user_id, stat: bestDayStreak })),
        );
      }

      // Newcomer — this is their first month with any catch on record, and it
      // wasn't just a toe in the water. Per-user stat is their own catch count
      // (unlike the other categories, this one genuinely varies per winner).
      const curCounts = userMonthCounts.get(monthId) || new Map();
      const newcomers = [];
      curCounts.forEach((count, uid) => {
        if (firstMonthIdxByUser.get(uid) === monthIdx && count >= 3) newcomers.push({ user_id: uid, stat: count });
      });
      if (newcomers.length) {
        pushSpotlight(
          'newcomer', 'Newcomer Spotlight', 'First month hunting with the community', 'catches',
          newcomers.sort((a, b) => b.stat - a.stat).slice(0, 3),
        );
      }

      // "Watch out!" - who is closest to claiming each unclaimed achievement.
      const positionByPokemon = {};
      (poolRows || []).forEach(p => { positionByPokemon[p.pokemon_id] = p.position; });
      const claimedTypes = new Set((achievements || []).map(a => a.bingo_type));
      const claimedFor = (mode) => new Set(
        WATCH_TYPES.filter(t => claimedTypes.has(claimKey(t, mode)))
      );
      // Restricted catches count toward the standard board too, so the `all`
      // pass uses every entry; the restricted pass uses only restricted ones.
      const watchAll = isCurrentMonth ? buildWatchOut(allEntries, positionByPokemon, claimedFor('all')) : [];
      const watchRestricted = isCurrentMonth ? buildWatchOut(restrictedEntries, positionByPokemon, claimedFor('restricted')) : [];

      // Only fully-ranked tier lists count anywhere: toward the 3-submission
      // gate, toward the modal tiers, and toward consensus_callout. Reuses the
      // pool rows already fetched for Watch Out! — no extra query.
      const poolIds = new Set((poolRows || []).map(p => p.pokemon_id));
      const completeOf = (rows) => (poolIds.size
        ? (rows || []).filter(s => isCompleteTierList(s, poolIds))
        : []);
      const completeSubmissions = completeOf(tierSubmissionsStandard);
      const completeRestricted = completeOf(tierSubmissionsRestricted);

      // Each bucket is scored against its OWN mode's consensus — the All bucket
      // against Standard lists, the Restricted bucket against Restricted ones.
      // They no longer share a modal-tier map: doing so meant Restricted upsets
      // were measuring restricted catches against standard predictions.
      //
      // Each side carries its own gate. 3+ is the threshold at which "the
      // community said" stops being one person's opinion, and it has to be met
      // per mode — 5 standard lists say nothing about how the community ranks a
      // restricted hunt.
      const submissionCount = completeSubmissions.length;
      const restrictedSubmissionCount = completeRestricted.length;
      const modalByMon = submissionCount >= 3 ? modalTierByMon(completeSubmissions) : {};
      const modalByMonRestricted = restrictedSubmissionCount >= 3 ? modalTierByMon(completeRestricted) : {};
      const upsetsAll = submissionCount >= 3 ? buildTierUpsets(modalByMon, allSummary.catchCountByMon) : null;
      const upsetsRestricted = restrictedSubmissionCount >= 3
        ? buildTierUpsets(modalByMonRestricted, restrictedSummary.catchCountByMon)
        : null;
      // Most Disputed reuses the same modal-tier maps as the upsets above —
      // same gate, same per-mode split, just a different question asked of the
      // same data (lowest consensus rather than biggest surprise).
      const disputedAll = submissionCount >= 3 ? buildMostDisputed(modalByMon, allSummary.catchCountByMon) : null;
      const disputedRestricted = restrictedSubmissionCount >= 3
        ? buildMostDisputed(modalByMonRestricted, restrictedSummary.catchCountByMon)
        : null;

      // Restricted rate — what share of catches were attempted the hard way.
      // Only meaningful above a small denominator, hence the >= 3 floor on the
      // per-game and per-mon breakdowns.
      const rateTally = (keyOf) => {
        const acc = {};
        allEntries.forEach(e => {
          const k = keyOf(e);
          if (k === null || k === undefined) return;
          if (!acc[k]) acc[k] = { total: 0, restricted: 0 };
          acc[k].total += 1;
          if (e.restricted_submission) acc[k].restricted += 1;
        });
        return acc;
      };
      const gameRates = rateTally(e => e.game || null);
      const monRates = rateTally(e => e.pokemon_id);
      const byPct = (a, b) => b.pct - a.pct || b.total - a.total;
      const restricted_rate = {
        total: allEntries.length,
        restricted: restrictedEntries.length,
        pct: allEntries.length ? Math.round((restrictedEntries.length / allEntries.length) * 100) : 0,
        by_game: Object.entries(gameRates)
          .filter(([, v]) => v.total >= 3)
          .map(([game, v]) => {
            const g = resolveGame(game);
            return { game_key: g.key || game, label: g.label || game, ...v, pct: Math.round((v.restricted / v.total) * 100) };
          })
          .sort(byPct),
        by_pokemon: Object.entries(monRates)
          .filter(([, v]) => v.total >= 3)
          .map(([id, v]) => ({ pokemon_id: parseInt(id, 10), ...v, pct: Math.round((v.restricted / v.total) * 100) }))
          .sort(byPct)
          .slice(0, 5),
      };

      const pointsByUser = {};
      (pointRows || []).forEach(p => { pointsByUser[p.user_id] = p.points; });
      const watchUserIds = [...watchAll, ...watchRestricted]
        .flatMap(w => w.contenders.map(c => c.user_id));

      // Resolve display data (pokemon fields, user display names) once for the
      // union of every id any panel needs - avoids double-fetching shared
      // mons/users across the two buckets and five panels.
      const upsetMonIds = [upsetsAll, upsetsRestricted]
        .filter(Boolean)
        .flatMap(u => [u.overachiever?.id, u.trap?.id])
        .filter(id => id != null);
      const disputedMonIds = [disputedAll?.id, disputedRestricted?.id].filter(id => id != null);
      const allTopMonIds = [...new Set([
        ...allSummary.topMonIds,
        ...restrictedSummary.topMonIds,
        ...allSummary.solo.map(s => s.pokemon_id),
        ...restrictedSummary.solo.map(s => s.pokemon_id),
        ...allSummary.unique_catch.items.map(i => i.pokemon_id),
        ...restrictedSummary.unique_catch.items.map(i => i.pokemon_id),
        ...restricted_rate.by_pokemon.map(p => p.pokemon_id),
        ...upsetMonIds,
        ...disputedMonIds,
      ])];
      const allTopUserIds = [...new Set([
        ...allSummary.topUserIds,
        ...restrictedSummary.topUserIds,
        ...allSummary.solo.map(s => s.user_id),
        ...restrictedSummary.solo.map(s => s.user_id),
        ...allSummary.unique_catch.items.map(i => i.user_id),
        ...restrictedSummary.unique_catch.items.map(i => i.user_id),
        ...watchUserIds,
        ...spotlightUserIds,
      ])];

      const [
        { data: monRows, error: monError },
        { data: userRows, error: usersError },
      ] = await Promise.all([
        // Full POKEMON_IMAGE_FIELDS (not just id/name/national_dex_id) so the client
        // can render real <PokemonImage> thumbnails for Top Hunted, not a plain <img>.
        allTopMonIds.length
          ? supabase.from('pokemon_master').select(POKEMON_IMAGE_FIELDS).in('id', allTopMonIds)
          : Promise.resolve({ data: [] }),
        allTopUserIds.length
          // avatar_url added for Hunter Spotlight, which embeds it directly on
          // each winner (self-contained, outside the pokemon/users dedupe
          // system below — see spotlight assembly further down).
          ? supabase.from('users').select('id, display_name, avatar_url').in('id', allTopUserIds)
          : Promise.resolve({ data: [] }),
      ]);
      if (monError) throw monError;
      if (usersError) throw usersError;

      const monById = {};
      (monRows || []).forEach(p => { monById[p.id] = p; });
      const userById = {};
      (userRows || []).forEach(u => { userById[u.id] = u; });

      // Hunter Spotlight winners get their display data embedded inline
      // (name + avatar) rather than routed through the pokemon/users dedupe
      // dicts below — at most 15 winners, so the duplication cost is trivial
      // and the client doesn't need a second lookup just for this section.
      spotlightEntries.forEach(entry => {
        entry.users = entry.users.map(u => ({
          ...u,
          name: userById[u.user_id]?.display_name || 'Unknown',
          avatar_url: userById[u.user_id]?.avatar_url || null,
        }));
      });

      // Every panel that shows a mon renders it through <PokemonImage>, which
      // needs the whole gender/form field set - see CLAUDE.md.
      const monDisplay = (id) => {
        const m = monById[id] || {};
        return {
          pokemon_id: id,
          name: m.name || 'Unknown',
          display_name: m.display_name ?? null,
          national_dex_id: m.national_dex_id ?? null,
          form_id: m.form_id ?? null,
          forms_count: m.forms_count,
          genderless: m.genderless,
          has_gender_difference: m.has_gender_difference,
          has_major_gender_difference: m.has_major_gender_difference,
          custom_gender_code: m.custom_gender_code,
        };
      };
      const nameOf = (id) => userById[id]?.display_name || 'Unknown';

      // ── Payload dedupe ──────────────────────────────────────────────────────
      // Panels reference pokemon and users by id; the full records are sent once
      // each in the top-level `pokemon` / `users` dictionaries. The same mon
      // routinely appears in Top Hunted, Rarest Catches, Most Unique Catch and
      // Tier Upsets across two buckets, and the ten-field display record is by
      // far the heaviest thing here — embedding it per reference multiplied the
      // response several times over for no added information.
      const referencedMonIds = new Set();
      const referencedUserIds = new Set();
      const monRef = (id) => { referencedMonIds.add(id); return id; };
      const userRef = (id) => { referencedUserIds.add(id); return id; };

      const buildTopHunted = (summary) => summary.topMonIds.map(id => ({
        pokemon_id: monRef(id),
        catch_count: summary.catchCountByMon[id],
      }));

      const buildMostActive = (summary) => summary.topUserIds
        .map(id => ({ user_id: userRef(id), catch_count: summary.catchCountByUser[id] }))
        .sort((a, b) => b.catch_count - a.catch_count);

      // Shared display ordering for Rarest Catches and Most Unique Catch. Both
      // panels celebrate rarity and both are capped, so the cap has to keep the
      // rarest rather than an arbitrary slice — and both should rank the same
      // way, or two lists of the same catches appear in unrelated orders.
      // Rarer game first, then rarer pokemon, then name for determinism.
      // `undefined` counts (an entry with no recorded game) sort last.
      const RARITY_ORDER = (a, b) =>
        (a.game_count ?? Infinity) - (b.game_count ?? Infinity)
        || (a.mon_count ?? Infinity) - (b.mon_count ?? Infinity)
        || (monById[a.pokemon_id]?.name || '').localeCompare(monById[b.pokemon_id]?.name || '');

      // Sort, then cap, then register refs — so the dictionaries only carry mons
      // that survived the cap.
      const buildRarest = (summary) => [...summary.solo]
        .sort(RARITY_ORDER)
        .slice(0, 24)
        .map(s => ({ pokemon_id: monRef(s.pokemon_id), user_id: userRef(s.user_id) }));

      const hydrateUnique = (unique) => ({
        available: unique.available && unique.items.length > 0,
        // tied_total is the true size of the tie; items is the capped highlight
        // reel, kept to the rarest by the same ordering Rarest Catches uses.
        tied_total: unique.tied_total || 0,
        items: [...unique.items].sort(RARITY_ORDER).slice(0, 12).map(i => {
          const g = resolveGame(i.game);
          return {
            pokemon_id: monRef(i.pokemon_id),
            user_id: userRef(i.user_id),
            // `game` is dropped: entries.game already *is* the label, so sending
            // both duplicated the same long string on every item.
            game_key: g.key,
            game_label: g.label || i.game,
            pair_count: i.pair_count,
          };
        }),
      });

      const hydrateUpsets = (upsets, disputed) => {
        if (!upsets && !disputed) return { available: false };
        const side = (u) => (u ? { pokemon_id: monRef(u.id), tier: u.tier, votes: u.votes, total_votes: u.total_votes, pct: u.pct, catch_count: u.catch_count } : null);
        const overachiever = side(upsets?.overachiever);
        const trap = side(upsets?.trap);
        const mostDisputed = side(disputed);
        return {
          available: Boolean(overachiever || trap || mostDisputed),
          submission_count: submissionCount,
          overachiever,
          trap,
          most_disputed: mostDisputed,
        };
      };

      // Contenders are ordered by points so the biggest threat reads first;
      // the name tiebreak is resolved here since the client only gets an id.
      const hydrateWatch = (list) => list.map(w => ({
        ...w,
        contenders: w.contenders
          .map(c => ({
            user_id: userRef(c.user_id),
            points: pointsByUser[c.user_id] || 0,
            positions: c.positions,
          }))
          .sort((a, b) => b.points - a.points || nameOf(a.user_id).localeCompare(nameOf(b.user_id))),
      }));

      const buildBucket = (summary, watch, upsets, disputed, trend, historicalCount) => ({
        overview: {
          total_shinies: summary.total_shinies,
          participants: summary.participantIds.size,
          // Excluded from every figure above; shown as a footnote so the data
          // is visible without polluting any ranking.
          historical_count: historicalCount,
        },
        trend,
        top_hunted: buildTopHunted(summary),
        most_active: buildMostActive(summary),
        catches_by_game: summary.catches_by_game,
        // watch_out lives inside each bucket so the page's All/Restricted toggle
        // switches it along with everything else. Pre-sorted; the page shows [0].
        watch_out: hydrateWatch(watch),
        rarest_catches: buildRarest(summary),
        unique_catch: hydrateUnique(summary.unique_catch),
        tier_upsets: hydrateUpsets(upsets, disputed),
      });

      // Month Champion — top points scorer, used once a month is finished to
      // swap the Watch Out! hero slot for a congratulations card instead of a
      // frozen race. Month-wide (points aren't bucket-scoped), so this is
      // only ever computed once, not per bucket, and only bothers computing
      // for a finished month — a live month renders Watch Out! in that slot
      // instead and never reads this field.
      let month_winner = null;
      if (!isCurrentMonth) {
        const ranked = Object.entries(pointsByUser).sort((a, b) => b[1] - a[1]);
        if (ranked.length) {
          const [winnerId, winnerPoints] = ranked[0];
          month_winner = {
            user_id: userRef(winnerId),
            points: winnerPoints,
            catches: allSummary.catchCountByUser[winnerId] || 0,
            achievements: (achievements || []).filter(a => a.user_id === winnerId).length,
            margin: ranked.length > 1 ? winnerPoints - ranked[1][1] : winnerPoints,
          };
        }
      }

      // Consensus callout - "Community Fan Favorite": the pool pokemon with the most
      // Super Hard votes (the "hardest hunt" superlative). Hidden entirely
      // (available: false) unless at least 3 tier-list submissions exist this month.
      let consensus_callout = { available: false };
      if (submissionCount >= 3) {
        const topTierCountByMon = {};
        completeSubmissions.forEach(sub => {
          Object.entries(sub.tiers || {}).forEach(([pokemonId, tier]) => {
            if (tier === 'super_hard') topTierCountByMon[pokemonId] = (topTierCountByMon[pokemonId] || 0) + 1;
          });
        });
        const topEntry = Object.entries(topTierCountByMon).sort((a, b) => b[1] - a[1])[0];
        if (topEntry && topEntry[1] > 0) {
          const [topPokemonId, topCount] = topEntry;
          const { data: mon } = await supabase
            .from('pokemon_master')
            .select('id, name, national_dex_id')
            .eq('id', parseInt(topPokemonId, 10))
            .maybeSingle();
          if (mon) {
            consensus_callout = {
              available: true,
              pokemon_id: mon.id,
              name: mon.name,
              tier: 'super_hard',
              percentage: Math.round((topCount / submissionCount) * 100),
              submission_count: submissionCount,
            };
          }
        }
      }

      // Panels must be built before the dictionaries: constructing them is what
      // registers which ids are actually referenced, so only those get sent.
      const allBucket = buildBucket(allSummary, watchAll, upsetsAll, disputedAll, trendAll, historicalCounts.all);
      const restrictedBucket = buildBucket(restrictedSummary, watchRestricted, upsetsRestricted, disputedRestricted, trendRestricted, historicalCounts.restricted);
      const rateByPokemon = restricted_rate.by_pokemon.map(p => ({
        pokemon_id: monRef(p.pokemon_id), total: p.total, restricted: p.restricted, pct: p.pct,
      }));

      const pokemonDict = {};
      referencedMonIds.forEach(id => { pokemonDict[id] = monDisplay(id); });
      const usersDict = {};
      referencedUserIds.forEach(id => { usersDict[id] = nameOf(id); });

      const payload = {
        month: {
          id: monthData.id,
          label: monthData.month_year_display,
          // start_date/end_date are deliberately not sent — neither consumer
          // (MonthStats, HomeHighlights) reads them.
          // Gates the Watch Out! panel client-side; watch_out is [] when false.
          is_current: isCurrentMonth,
        },
        // Combined totals - kept at top level for consumers that do not care
        // about the split, e.g. the HomeHighlights teaser.
        overview: {
          total_shinies: allEntries.length,
          participants: new Set(allEntries.map(e => e.user_id)).size,
        },
        all: allBucket,
        restricted: restrictedBucket,
        // Shared lookup tables — every panel above references these by id.
        // `pokemon[id]` is the full <PokemonImage> record; `users[id]` is just
        // the display name.
        pokemon: pokemonDict,
        users: usersDict,
        // Drives the Community Read section's three states without hardcoding a
        // "tier lists started in month N" cutoff: a month with zero submissions
        // predates the feature (or nobody used it) and the section is dropped.
        // Standard figures, because Community Read sits outside the buckets and
        // the All bucket maps to Standard. The restricted counterparts are
        // reported alongside so the section can speak to whichever bucket the
        // viewer has selected without a second request.
        tier_list: {
          // Complete lists only — a partially-ranked board is not a submission.
          submission_count: submissionCount,
          viewer_submitted: Boolean(userId && completeSubmissions.some(s => s.user_id === userId)),
          // Lets the CTA say "finish your list (1 of 24)" rather than restarting
          // someone who already began. Two ints, no extra query.
          viewer_ranked: userId
            ? Object.keys((tierSubmissionsStandard || []).find(s => s.user_id === userId)?.tiers || {}).length
            : 0,
          pool_size: poolIds.size,
          restricted_submission_count: restrictedSubmissionCount,
          restricted_viewer_submitted: Boolean(userId && completeRestricted.some(s => s.user_id === userId)),
          restricted_viewer_ranked: userId
            ? Object.keys((tierSubmissionsRestricted || []).find(s => s.user_id === userId)?.tiers || {}).length
            : 0,
        },
        // Computed from every entry, not from the active bucket, so the figure
        // reads the same in either mode — it sits outside the buckets for that
        // reason.
        restricted_rate: { ...restricted_rate, by_pokemon: rateByPokemon },
        consensus_callout,
        // Null on a live month (Watch Out! occupies that hero slot instead).
        month_winner,
        // Month-wide, mode-independent — see the assembly block above.
        hunter_spotlight: spotlightEntries,
        // Badges earned this calendar month, secret ones scrubbed to their
        // earner + a placeholder rather than the real name/image.
        badges_this_month: (badgeRows || []).slice(0, 30).map(r => ({
          user_id: r.user_id,
          user_name: r.users?.display_name || 'Unknown',
          avatar_url: r.users?.avatar_url || null,
          badge_id: r.badge_id,
          is_secret: Boolean(r.badges?.is_secret),
          badge_name: r.badges?.is_secret ? null : (r.badges?.name || 'Badge'),
          badge_image: r.badges?.is_secret ? null : (r.badges?.image_url || null),
          earned_at: r.earned_at,
        })),
      };

      // Cache miss on a now-closed month: populate it for every future
      // reader. Fire-and-forget — a slow write must never delay this
      // response, and a rare double-write (concurrent requests both missing
      // the cache) just upserts the same payload twice.
      if (!isCurrentMonth) {
        cacheMonthStats(monthId, payload)
          .then(() => console.log(`stats/month cache POPULATED month_id=${monthId}`))
          .catch(() => {});
      }

      res.json(payload);
    } catch (err) {
      console.error('Error fetching month stats:', err);
      if (err?.transient) return res.status(503).json({ error: 'Database temporarily unavailable', transient: true });
      res.status(500).json({ error: 'Failed to fetch month stats' });
    }
  });

};
