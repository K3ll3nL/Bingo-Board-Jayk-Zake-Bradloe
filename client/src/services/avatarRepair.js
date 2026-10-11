// Site-wide self-repair for dead Discord avatars.
//
// A Discord avatar URL embeds a content hash, so it 404s as soon as the user changes their
// picture. Avatars are rendered ad hoc in a dozen components, so rather than wire an
// onError into each, one capture-phase listener catches every failed <img> whose src is a
// Discord avatar, asks the API to repair it (POST /api/avatars/discord/:id/repair — which
// also writes the fixed URL to users.avatar_url, so the next page load is clean), and swaps
// the new src into every <img> still showing the dead one.
//
// React only rewrites an attribute when its prop changes, so the swapped src survives
// re-renders until the data itself is refetched — by which point the DB is already fixed.

import { useCallback, useEffect, useRef, useState } from 'react';

const DISCORD_AVATAR_RE = /^https:\/\/cdn\.discordapp\.com\/avatars\/(\d{15,21})\//;

const repairs = new Map(); // discordId -> Promise<string|null>

function repair(discordId) {
  if (!repairs.has(discordId)) {
    repairs.set(discordId, fetch(`/api/avatars/discord/${discordId}/repair`, { method: 'POST' })
      .then(r => (r.ok ? r.json() : null))
      .then(body => body?.avatar_url || null)
      .catch(() => null));
  }
  return repairs.get(discordId);
}

function onImgError(e) {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  const deadSrc = img.currentSrc || img.src;
  const m = DISCORD_AVATAR_RE.exec(deadSrc);
  // Components using useRepairedAvatar repair through React state instead.
  if (!m || img.dataset.avatarRepaired || img.dataset.avatarManaged) return;
  img.dataset.avatarRepaired = '1'; // one attempt per element — never loop on a bad repair

  repair(m[1]).then(next => {
    if (!next || next === deadSrc) return;
    document.querySelectorAll('img').forEach(el => {
      if (el.src === deadSrc) { el.dataset.avatarRepaired = '1'; el.src = next; }
    });
    if (img.src === deadSrc) img.src = next;
  });
}

// For components that render their own fallback (initials, skeleton): the global
// listener can't help them, because their onError unmounts the <img> before the
// repaired URL arrives. Spread `imgProps` onto the <img> and branch on `status`:
//   'loading' — not painted yet (or being repaired): show a skeleton, keep the
//               <img> mounted but invisible so it can finish loading
//   'loaded'  — show it
//   'failed'  — no url, or the repair found nothing usable: show the fallback
export function useRepairedAvatar(url) {
  const [src, setSrc] = useState(url || null);
  const [status, setStatus] = useState(url ? 'loading' : 'failed');
  const tried = useRef(false);
  const imgRef = useRef(null);

  useEffect(() => {
    tried.current = false;
    setSrc(url || null);
    setStatus(url ? 'loading' : 'failed');
  }, [url]);

  // A cached image can finish before React attaches onLoad.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && src) setStatus(img.naturalWidth > 0 ? 'loaded' : status);
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLoad = useCallback(() => setStatus('loaded'), []);
  const onError = useCallback(() => {
    const m = src && DISCORD_AVATAR_RE.exec(src);
    if (!m || tried.current) { setStatus('failed'); return; }
    tried.current = true;
    setStatus('loading');
    repair(m[1]).then(next => {
      if (next && next !== src) setSrc(next);
      else setStatus('failed');
    });
  }, [src]);

  return {
    status,
    imgProps: { ref: imgRef, src: src || undefined, onLoad, onError, 'data-avatar-managed': '1' },
  };
}

let installed = false;
export function installAvatarRepair() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  // 'error' doesn't bubble; capture on document still sees it for every <img>.
  document.addEventListener('error', onImgError, true);
}
