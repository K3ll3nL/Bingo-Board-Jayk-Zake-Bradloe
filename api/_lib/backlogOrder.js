/**
 * Backlog consensus order — weighted by how much of the list each mod ranked.
 *
 *   N   = open proposals
 *   k_m = how many of them mod m has placed      weight w_m = k_m / N
 *   placed at position p (1-based)  → score (N − p) / (N − 1)   (1 = top, 0 = bottom)
 *   not placed                      → mean of the scores m left unused (neutral)
 *   consensus(f) = Σ w_m · s_m(f) / Σ w_m
 *
 * Unplaced families get a neutral score instead of being skipped: with a plain
 * weighted mean over only the mods who placed f, the weight cancels out and a
 * mod who placed one family at #1 (w = 0.05) would put it at the top alone.
 *
 * Pure; tested by api/scripts/testBacklogOrder.js.
 */
function consensusOrder(proposals, rankingsByMod) {
  const ids = proposals.map(p => p.id);
  const N = ids.length;
  const open = new Set(ids);
  const score = (p) => (N <= 1 ? 1 : (N - p) / (N - 1));

  const mods = [];
  for (const [modId, ordered] of rankingsByMod) {
    // Drop closed proposals and compact what's left, so positions stay 1..k.
    const list = [...new Set(ordered)].filter(id => open.has(id));
    const k = list.length;
    let neutral = 0.5;
    if (k < N) {
      let sum = 0;
      for (let p = k + 1; p <= N; p++) sum += score(p);
      neutral = sum / (N - k);
    }
    mods.push({ modId, k, weight: N ? k / N : 0, pos: new Map(list.map((id, i) => [id, i + 1])), neutral });
  }

  const totalW = mods.reduce((s, m) => s + m.weight, 0);
  const rows = proposals.map(p => {
    let num = 0;
    const placedBy = [];
    for (const m of mods) {
      const pos = m.pos.get(p.id);
      if (pos != null) placedBy.push(m.modId);
      num += m.weight * (pos != null ? score(pos) : m.neutral);
    }
    return { id: p.id, score: totalW > 0 ? num / totalW : null, placedBy, created_at: p.created_at };
  });

  rows.sort((a, b) =>
    ((b.score ?? -1) - (a.score ?? -1))
    || (b.placedBy.length - a.placedBy.length)
    || String(a.created_at).localeCompare(String(b.created_at)));
  rows.forEach((r, i) => { r.rank = i + 1; });

  return {
    order: rows,
    weights: Object.fromEntries(mods.map(m => [m.modId, { placed: m.k, total: N, weight: m.weight }])),
  };
}

module.exports = { consensusOrder };
