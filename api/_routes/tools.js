/**
 * tools routes (2).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  supabase,
} = require('../_lib/core');

module.exports = function register(app) {

  // GET /api/tools/sandwiches?targets=... (kept for compatibility / admin use)
  app.get('/api/tools/sandwiches', async (req, res) => {
    const rawTargets = (req.query.targets || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!rawTargets.length) return res.status(400).json({ error: 'targets query param required' });
    const { data, error } = await supabase
      .from('sandwich_cache')
      .select('target, results, cooccurrences, result_count')
      .in('target', rawTargets);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ rows: data || [], allCached: (data||[]).length === rawTargets.length });
  });

  // POST /api/tools/sandwiches — write from precompute script
  app.post('/api/tools/sandwiches', async (req, res) => {
    const { target, results, cooccurrences } = req.body || {};
    if (!target || !Array.isArray(results)) return res.status(400).json({ error: 'target and results required' });
    const { error } = await supabase.from('sandwich_cache').upsert(
      { target, results, cooccurrences: cooccurrences ?? {}, result_count: results.length, computed_at: new Date().toISOString() },
      { onConflict: 'target' }
    );
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  });

};
