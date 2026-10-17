/**
 * Collection bonus games: pokemon_master.collection_bonus, a map of
 * collection slug -> [game keys], e.g. { legendary_birds: ['firered_leafgreen'] }.
 * Shared by the evaluator, the progress ladder and the admin/backlog routes.
 * Lives outside core.js because core.js <-> badgeEval.js is circular.
 *
 * Rows come out flattened as { slug, pokemon_id, games }. A slug only counts
 * while the mon is still in that collection (collection_ids); an empty list
 * means no bonus game.
 */

function bonusRowsFrom(master, slug) {
  const rows = [];
  for (const p of master || []) {
    const members = new Set(p.collection_ids || []);
    for (const [s, games] of Object.entries(p.collection_bonus || {})) {
      if (slug && s !== slug) continue;
      if (!members.has(s) || !Array.isArray(games) || !games.length) continue;
      rows.push({ slug: s, pokemon_id: p.id, games });
    }
  }
  return rows;
}

async function loadBonusRows(supabase, { slug } = {}) {
  let q = supabase.from('pokemon_master').select('id, collection_ids, collection_bonus');
  q = slug ? q.contains('collection_ids', [slug]) : q.neq('collection_bonus', '{}');
  const { data, error } = await q;
  if (error) throw error;
  return bonusRowsFrom(data, slug);
}

module.exports = { loadBonusRows, bonusRowsFrom };
