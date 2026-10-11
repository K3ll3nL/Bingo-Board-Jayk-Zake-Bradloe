// Backfill for dead Discord avatars — runs repairDiscordAvatar (_lib/core.js) over every
// user whose stored avatar is a Discord CDN URL. The live site repairs these on demand
// when an <img> fails (client/src/services/avatarRepair.js); this fixes them all at once.
//
//   node api/scripts/repairAvatars.js --dry-run   report only
//   node api/scripts/repairAvatars.js             write repaired URLs
//
// Set DISCORD_BOT_TOKEN in api/.env first, or only users with a working Twitch link recover.
const { supabase, repairDiscordAvatar } = require('../_lib/core');

const dryRun = process.argv.includes('--dry-run');

(async () => {
  const { data, error } = await supabase
    .from('users')
    .select('display_name, avatar_url')
    .like('avatar_url', 'https://cdn.discordapp.com/avatars/%');
  if (error) throw error;

  const tally = { stored: 0, discord: 0, twitch: 0, default: 0 };
  for (const u of data) {
    const discordId = u.avatar_url.match(/\/avatars\/(\d+)\//)[1];
    const r = await repairDiscordAvatar(discordId, { write: !dryRun });
    if (!r) continue;
    tally[r.source]++;
    if (r.source !== 'stored') console.log(`${r.source.padEnd(8)} ${u.display_name}`);
  }
  if (!process.env.DISCORD_BOT_TOKEN) console.log('\nDISCORD_BOT_TOKEN not set — Discord lookups skipped.');
  console.log(`${dryRun ? '[dry run] ' : ''}checked ${data.length}:`, tally);
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
