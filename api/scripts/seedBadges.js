// Upserts all badge definitions from badgeRegistry.js into the `badges` table.
// Run from the project root: node api/scripts/seedBadges.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');
const { BADGE_REGISTRY } = require('../badgeRegistry');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function seed() {
  // Strip check() — it's runtime-only, not stored in the DB
  const rows = BADGE_REGISTRY.map(({ check: _check, ...badge }) => badge);

  const { data, error } = await supabase
    .from('badges')
    .upsert(rows, { onConflict: 'key' })
    .select('id, key, name');

  if (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }

  console.log(`Seeded ${data.length} badge(s):`);
  data.forEach(b => console.log(`  [${b.id}] ${b.key} — ${b.name}`));
}

seed();
