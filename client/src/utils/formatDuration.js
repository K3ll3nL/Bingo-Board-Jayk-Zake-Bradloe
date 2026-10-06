// Minutes → "45m" / "1h" / "1h 30m". Shared by every surface that shows a
// Shiny Jeopardy game length (create page, lobby list, room).
export function formatDuration(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
