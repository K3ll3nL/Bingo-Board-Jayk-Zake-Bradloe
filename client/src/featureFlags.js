// ─── Feature flags ────────────────────────────────────────────────────────────
// To test before launch: change a date to any date in the past.
// To remove a gate after rollout: delete its constant and every reference to it.

// Restricted challenge (VOD upload, new awards, #78150a icons with lock badge)
// Shows the restricted achievement section on BingoBoard and Leaderboard.
export const RESTRICTED_LAUNCH_DATE = new Date('2026-03-28T00:00:00');
export const restrictedEnabled = new Date() >= RESTRICTED_LAUNCH_DATE;
