import { lazy } from 'react';

// Route-level code splitting. Each page is its own chunk, fetched the first
// time someone opens it, so the home page no longer ships every admin screen,
// overlay and tool.
//
// Stale deploys: chunk names are content-hashed, and Vercel rewrites a missing
// file to index.html, which `nosniff` refuses to run as a script. A tab opened
// before a deploy therefore fails the first time it opens a page it hasn't
// loaded yet. Reloading picks up the new index.html and its new chunk names.
// The timestamp guard stops a genuinely broken chunk from reload-looping; the
// second failure throws to the ErrorBoundary instead.
const RELOAD_KEY = 'chunk-reload-at';
const RELOAD_GUARD_MS = 10_000;

const recoverFromStaleChunk = (err) => {
  let last = 0;
  try { last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0; } catch { /* storage blocked */ }
  if (Date.now() - last < RELOAD_GUARD_MS) throw err;
  try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* storage blocked */ }
  window.location.reload();
  return new Promise(() => {}); // keep Suspense showing until the reload lands
};

export function lazyPage(load) {
  const Page = lazy(() => load().catch(recoverFromStaleChunk));
  // Warm the chunk ahead of a likely visit. A failure here stays silent — only
  // an actual visit may reload the tab. The browser caches the module, so the
  // later real import resolves instantly.
  Page.preload = () => { load().catch(() => {}); };
  return Page;
}
