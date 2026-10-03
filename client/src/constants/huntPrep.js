// Hunt Prep page (/prep) — visuals for the rules in games.js. games.js stays
// the source of WHICH rules exist; this file only says how each one is drawn.
// WHO a rule does not apply to is data: pokemon_master.rule_exemptions, edited
// in the Game Manager's Properties card.

import { ALLOWED_GAMES } from './games';
//
// When a `restricted_checklist` item is added to games.js, add it to
// RESTRICTED_RULE_ART too. Until then the page falls back to the games.js label
// with a generic icon, so a new rule is never silently dropped.

// Self-hosted (client/public/items) — never hotlink GitHub from production.
const ITEM_SPRITES = '/items';

// icon:   key into the page's glyph set (HuntPrep.jsx), used when there is no sprite
// sprite: real item art, preferred over the glyph
// short:  2–4 word tile label
// inVideo: true when the catch video must show the rule being kept. The rule is
//         still ticked once, in Before (where it's decided); its icon is also
//         stamped on the encounter shot (where it's proven).
export const RESTRICTED_RULE_ART = {
  lza_no_shiny_charm: { sprite: `${ITEM_SPRITES}/shiny-charm.png`, short: 'No Shiny Charm' },
  lza_no_hyperspace:  { icon: 'hyperspace', short: 'No Hyperspace', inVideo: true },
  lza_no_afk:         { icon: 'afk', short: 'No AFK hunting' },
  sv_no_shiny_charm:  { sprite: `${ITEM_SPRITES}/shiny-charm.png`, short: 'No Shiny Charm' },
  sv_no_sandwich:     { icon: 'sandwich', short: 'No Sparkling Power', inVideo: true },
  sv_no_outbreak:     { icon: 'outbreak', short: 'No Outbreak', inVideo: true },
  lgpe_chain_limit:   { icon: 'chain', short: 'Catch Combo ≤ 11', inVideo: true },
  usum_no_uwr:        { icon: 'uwr', short: 'No Ultra Warp Ride' },
  oras_no_fishing:    { sprite: `${ITEM_SPRITES}/super-rod.png`, short: 'No fishing' },
  xy_no_fishing:      { sprite: `${ITEM_SPRITES}/super-rod.png`, short: 'No fishing' },
};

// Restricted, every game: no eggs. Not a games.js checklist item, so it gets
// its own id for rule_exemptions.
export const NO_EGGS_RULE = 'no_eggs';

// False when the Game Manager has exempted this mon from the rule.
export const ruleApplies = (mon, ruleId) => !(mon?.rule_exemptions ?? []).includes(ruleId);

// The rules in force for one hunt, already filtered by exemption.
export const restrictedRulesFor = (game, mon) =>
  (game?.restricted_checklist ?? [])
    .map(item => ({ id: item.id, label: item.label, ...(RESTRICTED_RULE_ART[item.id] ?? { icon: 'rule', short: item.label }) }))
    .filter(rule => ruleApplies(mon, rule.id));

// Every rule a mon can be exempted from, for the Game Manager: the egg rule,
// then each game's checklist in ALLOWED_GAMES order. A new games.js rule shows
// up here automatically.
export const EXEMPTIBLE_RULES = [
  { id: NO_EGGS_RULE, short: 'No eggs', game: null },
  ...ALLOWED_GAMES.flatMap(g => (g.restricted_checklist ?? []).map(item => ({
    id: item.id,
    short: RESTRICTED_RULE_ART[item.id]?.short ?? item.label,
    game: g,
  }))),
];

// "2026-10-01" + "2026-11-01T00:00:00+00:00" → "Oct 1–31" (short enough to sit on
// the Date Proof label's line); a window spanning months reads "Oct 15 – Nov 14". The stored end
// is the first instant of the next month (plus the rollover window), so the
// last catchable day is the day before it.
export const monthWindowLabel = (month) => {
  if (!month?.start_date || !month?.end_date) return null;
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const start = new Date(`${month.start_date.slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${month.end_date.slice(0, 10)}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  if (start.getUTCMonth() === end.getUTCMonth()) return `${fmt(start)}–${end.getUTCDate()}`;
  return `${fmt(start)} – ${fmt(end)}`;
};
