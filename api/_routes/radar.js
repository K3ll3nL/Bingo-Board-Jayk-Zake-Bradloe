/**
 * radar routes (3).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  FLABEBE_FORM_INDEX,
  POKEMON_IMAGE_FIELDS,
  getAuthenticatedUserId,
  isModerator,
  supabase,
} = require('../_lib/core');

module.exports = function register(app) {

  // GET /api/radar/pokemon-lookup?names=Pikachu,Flabébé (Blue)
  // Public, read-only — resolves species names (with optional " (Form)" suffix) to
  // pokemon_master rows so the client can render PokemonImage thumbnails.
  app.get('/api/radar/pokemon-lookup', async (req, res) => {
    try {
      const namesParam = (req.query.names || '').trim();
      if (!namesParam) return res.json({});

      const rawNames = [...new Set(namesParam.split(',').map(n => n.trim()).filter(Boolean))];
      const baseNames = [...new Set(rawNames.map(n => n.replace(/\s*\([^)]*\)\s*$/, '').trim()))];

      const { data, error } = await supabase
        .from('pokemon_master')
        .select(POKEMON_IMAGE_FIELDS)
        .in('name', baseNames);
      if (error) throw error;

      const byName = {};
      for (const row of data || []) {
        if (!byName[row.name]) byName[row.name] = row;
      }

      const result = {};
      for (const raw of rawNames) {
        const match = raw.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
        const base = match ? match[1].trim() : raw;
        const form = match ? match[2].trim() : null;
        const row = byName[base];
        if (!row) continue;

        if (base === 'Flabébé' && form in FLABEBE_FORM_INDEX) {
          result[raw] = { ...row, form_id: FLABEBE_FORM_INDEX[form] };
        } else {
          result[raw] = row;
        }
      }
      res.json(result);
    } catch (err) {
      console.error('Error fetching radar pokemon lookup:', err);
      res.status(500).json({ error: 'Failed to fetch pokemon lookup' });
    }
  });

  app.get('/api/radar/routes/:routeId', async (req, res) => {
    try {
      const { routeId } = req.params;
      const { data, error } = await supabase
        .from('radar_route_maps')
        .select('route_id, width, height, tiles, chain_spot, shiny_spot')
        .eq('route_id', routeId)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return res.status(404).json({ error: 'Not found' });
      res.json(data);
    } catch (err) {
      console.error('Error fetching radar route map:', err);
      res.status(500).json({ error: 'Failed to fetch route map' });
    }
  });

  app.put('/api/radar/routes/:routeId', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const mod = await isModerator(userId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });

      const { routeId } = req.params;
      const { width, height, tiles, chain_spot, shiny_spot } = req.body;
      if (!width || !height || !Array.isArray(tiles)) {
        return res.status(400).json({ error: 'width, height, and tiles array required' });
      }
      if (tiles.length !== width * height) {
        return res.status(400).json({ error: 'tiles length must equal width * height' });
      }

      const { error } = await supabase.from('radar_route_maps').upsert({
        route_id: routeId,
        width,
        height,
        tiles,
        chain_spot: chain_spot ?? null,
        shiny_spot: shiny_spot ?? null,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      }, { onConflict: 'route_id' });
      if (error) throw error;
      res.json({ ok: true });
    } catch (err) {
      console.error('Error saving radar route map:', err);
      res.status(500).json({ error: 'Failed to save route map' });
    }
  });

};
