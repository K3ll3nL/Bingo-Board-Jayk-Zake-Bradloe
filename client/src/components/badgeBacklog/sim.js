// Client copy of countAt() in api/_lib/badgeEval.js — keep the two identical.
// A simulation is { evaluable, direction: 'gte'|'lte'|'fixed', fixed_at?, values }:
// one metric value per hunter, so any threshold's earner count is local and instant.
export function countAt(sim, threshold) {
  if (!sim?.evaluable) return null;
  if (sim.direction === 'fixed') return sim.values.filter(v => v >= sim.fixed_at).length;
  // A blank threshold is unset, not 0 (Number(null) and Number('') are both 0).
  if (threshold == null || threshold === '') return null;
  const t = Number(threshold);
  if (!Number.isFinite(t)) return null;
  return sim.direction === 'lte'
    ? sim.values.filter(v => v <= t).length
    : sim.values.filter(v => v >= t).length;
}

// Histogram buckets for the wiring panel. Integer metrics get one bar per value
// up to ~40 bars, then fixed-width buckets; percentages bucket by 5.
// upTo stretches the axis past the data, so every tier marker lands on it
// (100 for percent checks; the highest threshold for counts).
export function histogram(sim, maxBars = 40, upTo = 0) {
  if (!sim?.evaluable || !sim.values.length) return { bars: [], min: 0, max: 0, width: 1 };
  const vals = sim.values;
  const min = Math.min(0, vals[0]);
  const max = Math.max(vals[vals.length - 1], upTo);
  const span = Math.max(1, max - min);
  const width = Math.max(1, Math.ceil((span + 1) / maxBars));
  const n = Math.floor(span / width) + 1;
  const bars = Array.from({ length: n }, (_, i) => ({ from: min + i * width, to: min + (i + 1) * width - 1, count: 0 }));
  for (const v of vals) bars[Math.min(n - 1, Math.floor((v - min) / width))].count++;
  return { bars, min, max, width };
}

// What publishing does with this check, in a few words.
export const TIMING_LABEL = {
  now: 'Awarded on publish',
  period_end: 'Awarded when the period closes',
  on_date: 'Awarded on the date',
  never: 'Nobody can earn this yet',
};

export const CODE_STATUS = {
  unreviewed:     { color: '#6b7280', label: 'Unreviewed' },
  ready:          { color: '#4ade80', label: 'Ready' },
  needs_code:     { color: '#f5b942', label: 'Needs code' },
  needs_tracking: { color: '#e2553f', label: 'Needs tracking' },
};

// One colour per tier position (markers on the histogram match the tile rings).
export const TIER_COLORS = ['#12bfce', '#f5b942', '#a78bfa', '#4ade80', '#f472b6', '#fb923c', '#60a5fa', '#facc15', '#2dd4bf', '#e879f9'];

// Checks whose threshold is a percentage (0–100).
export const PERCENT_CHECKS = new Set(['type_percentage', 'generation_percentage', 'collection_complete']);

// Checks whose threshold is hours (a low number is harder, but it isn't a rank).
export const HOUR_CHECKS = new Set(['hours_left_in_month']);

// Checks whose threshold does nothing (one fixed rule).
export const FIXED_CHECKS = new Set(['date_award', 'first_approval_month']);

// Who a simulation awards at a threshold (ids), index-aligned with sim.values. null = can't tell.
export function earnersAt(sim, threshold) {
  if (!sim?.evaluable || !sim.user_ids) return null;
  const n = sim.values.length;
  const ids = [];
  for (let i = 0; i < n; i++) {
    const v = sim.values[i];
    const ok = sim.direction === 'fixed' ? v >= sim.fixed_at
      : threshold == null || threshold === '' || !Number.isFinite(Number(threshold)) ? false
      : sim.direction === 'lte' ? v <= Number(threshold) : v >= Number(threshold);
    if (ok) ids.push(sim.user_ids[i]);
  }
  return ids;
}
