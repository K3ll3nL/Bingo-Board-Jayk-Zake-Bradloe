// Single source of truth for badge check_type metadata on the client side.
// Mirrored by:
//   • the DB CHECK constraint on badges.check_type (public.badges_check_type_check)
//   • the case switch in api/badgeRegistry.js buildCheckFromDB (server-side eval)
//
import { ALLOWED_GAMES } from './games';

// When adding a new check_type, update ALL THREE plus this file. See CLAUDE.md
// "Adding a new check_type — required checklist".

export const CHECK_TYPES_BY_TRIGGER = {
  submission:     [{ value: 'submission_count',      label: 'Total submissions' }],
  approved: [
    // approved_count's qualifier filters by mode and games: "<any|standard|restricted>[:<game key>,...]"
    // (several games = distinct species caught in any of them).
    // restricted_count is retired from the picker (it's approved_count 'restricted') but live
    // badges still use it, so the server and describeBadgeCheck keep it.
    { value: 'approved_count',        label: 'Approvals' },
    { value: 'games_count',           label: 'Different games caught in' },
    { value: 'type_percentage',       label: '% of a type caught' },
    { value: 'generation_percentage', label: '% of a generation caught' },
    { value: 'collection_complete',   label: '% of a collection caught' },
    { value: 'first_approval_month',  label: 'First approval of the month, with one winner per month' },
    { value: 'first_of_species_count', label: 'First catch of a Pokémon in a month (count)' },
    { value: 'hours_left_in_month',   label: 'Uploaded with hours left in the month' },
  ],
  rejected:          [{ value: 'rejected_count',          label: 'Total rejections' }],
  monthly_active: [
    { value: 'monthly_active_count', label: 'Active months' },
    { value: 'month_streak',         label: 'Active months in a row' },
  ],
  period_end: [
    { value: 'approved_count_in_month',  label: 'Approved in a month (any or specific)' },
    { value: 'approved_count_in_season', label: 'Approved in a season (any or specific)' },
    { value: 'approved_count_in_year',   label: 'Approved in a year (any or specific)' },
    { value: 'top_placement_month',      label: 'Top X finish: monthly' },
    { value: 'top_placement_season',     label: 'Top X finish: seasonal' },
    { value: 'top_placement_year',       label: 'Top X finish: yearly' },
  ],
  bingo_achievement: [{ value: 'bingo_achievement_count', label: 'Bingo achievement count' }],
  date_award:        [{ value: 'date_award',              label: 'Award all users on a date' }],
  account_age:       [{ value: 'account_age_months',      label: 'Account age in months' }],
};

// Flat list of every valid check_type value.
export const ALL_CHECK_TYPES = Object.values(CHECK_TYPES_BY_TRIGGER)
  .flat()
  .map(c => c.value);

// Human-readable description of a badge's check.
// Consumes { check_type, check_value, check_qualifier }, returns a string.
export function describeBadgeCheck(badge) {
  const v = badge.check_value;
  const q = badge.check_qualifier;
  switch (badge.check_type) {
    case 'submission_count':           return `Submit ${v} time${v != 1 ? 's' : ''}`;
    case 'approved_count': {
      const [mode, list] = String(q || '').split(':');
      const kind = mode === 'restricted' ? 'restricted ' : mode === 'standard' ? 'standard ' : '';
      const games = (list || '').split(',').filter(Boolean)
        .map(key => (ALLOWED_GAMES.find(g => g.key === key)?.label || key).replace(/^Pokémon /, ''));
      const where = games.length > 3 ? ` across ${games.length} games` : games.length ? ` in ${games.join(' / ')}` : '';
      return `Get ${v} ${kind}approval${v != 1 ? 's' : ''}${where}`;
    }
    case 'games_count': {
      const kind = q === 'restricted' ? 'Restricted ' : q === 'standard' ? 'Standard ' : '';
      return `${kind ? `${kind}c` : 'C'}atch shinies in ${v} different game${v != 1 ? 's' : ''}`;
    }
    case 'month_streak':               return `Active ${v} month${v != 1 ? 's' : ''} in a row`;
    case 'rejected_count':             return `Get ${v} rejection${v != 1 ? 's' : ''}`;
    case 'restricted_count':           return `Get ${v} restricted approval${v != 1 ? 's' : ''}`;
    case 'monthly_active_count':       return `Active for ${v} month${v != 1 ? 's' : ''}`;
    case 'type_percentage':            return `Catch ${v}% of ${q} type`;
    case 'generation_percentage':      return `Catch ${v}% of Gen ${q}`;
    case 'collection_complete': {
      // '<slug>:bonus' counts members caught in their own bonus game.
      const bonus = String(q ?? '').endsWith(':bonus');
      const slug = bonus ? String(q).slice(0, -6) : q;
      const tail = bonus ? ' in their bonus games' : '';
      return v == null || Number(v) >= 100 ? `Complete '${slug}' collection${tail}` : `Catch ${v}% of '${slug}' collection${tail}`;
    }
    case 'bingo_achievement_count':    return `Earn ${v} bingo achievement${v != 1 ? 's' : ''}${q && q !== 'any' ? ` (${q})` : ''}`;
    case 'approved_count_in_month':    return `Get ${v} approval${v != 1 ? 's' : ''} in ${q ? `month ${q}` : 'any month'}`;
    case 'approved_count_in_season':   return `Get ${v} approval${v != 1 ? 's' : ''} in ${q ? `season ${q}` : 'any season'}`;
    case 'approved_count_in_year':     return `Get ${v} approval${v != 1 ? 's' : ''} in ${q ? `year ${q}` : 'any year'}`;
    case 'top_placement_month':        return `Finish top ${v} monthly${q ? ` (month ${q})` : ''}`;
    case 'top_placement_season':       return `Finish top ${v} seasonal${q ? ` (season ${q})` : ''}`;
    case 'top_placement_year':         return `Finish top ${v} yearly${q ? ` (year ${q})` : ''}`;
    case 'date_award':                 return `Awarded on ${q || 'a specific date'}`;
    case 'account_age_months':         return `Account at least ${v} month${v != 1 ? 's' : ''} old`;
    case 'first_approval_month':       return 'First player approved in a month';
    case 'first_of_species_count': {
      const kind = q === 'restricted' ? 'restricted ' : q === 'standard' ? 'normal ' : '';
      return `First ${kind}catch of a Pokémon that month, ${v} time${v != 1 ? 's' : ''}`;
    }
    case 'hours_left_in_month': {
      const kind = q === 'restricted' ? 'restricted ' : q === 'standard' ? 'standard ' : '';
      return `Upload an approved ${kind}catch with ${v} hour${v != 1 ? 's' : ''} or less left in the month`;
    }
    default:                           return 'Unknown criteria';
  }
}
