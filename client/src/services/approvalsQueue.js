import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

// One shared subscription to the moderators' approvals-queue broadcast.
//
// Why a module and not a supabase.channel() call per component:
// supabase.channel(topic) returns the EXISTING channel when one with that topic is
// already open, so the header badge (App.jsx) and the Approvals page used to share a
// single channel object. When the Approvals page cleaned up (tab switch, navigating
// away) its removeChannel() tore down the header's subscription too, and the badge
// stopped updating until a full reload. Everything inside AppLayout subscribes here.
//
// Private topic, own socket, public fallback:
// - 'mod-approvals' is PRIVATE. Realtime checks public.moderators at join time
//   (migration 20261004120000), so non-mods cannot listen even with the anon key.
// - It joins on a SEPARATE realtime-only client. Measured: once a private join is
//   refused on a websocket, channels joined after it on that same socket report
//   SUBSCRIBED but never receive anything — board-updates, leaderboard-updates and
//   the notification channels all live on the main client and would go silent.
// - If the join is refused (migration not applied, no Supabase session under the
//   dev bypass, expired token), fall back to the public 'approvals-updates' topic
//   on the main client. That topic is already public for the OBS overlay (see
//   broadcastQueueChanged in api/_lib/core.js), so the fallback leaks nothing new.

let modRealtime = null;
const getModRealtime = () => {
  // accessToken makes this a realtime-only client that borrows the main client's
  // session token instead of running a second auth client.
  modRealtime ??= createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    accessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  });
  return modRealtime;
};

const remoteListeners = new Set();
let active = null; // { client, channel }
let teardownTimer = null;

const listen = (client, topic, config) => client
  .channel(topic, { config })
  .on('broadcast', { event: 'queue-changed' }, (msg) => {
    remoteListeners.forEach(l => l(msg));
  });

const open = () => {
  const client = getModRealtime();
  const privateChannel = listen(client, 'mod-approvals', { private: true });
  active = { client, channel: privateChannel };
  privateChannel.subscribe((status, err) => {
    if (status !== 'CHANNEL_ERROR' || active?.channel !== privateChannel) return;
    console.warn('mod-approvals refused, using public approvals-updates:', err?.message || err);
    client.removeChannel(privateChannel); // stop realtime-js retrying the refused join
    active = { client: supabase, channel: listen(supabase, 'approvals-updates', {}).subscribe() };
  });
};

export function onQueueChanged(cb) {
  remoteListeners.add(cb);
  if (teardownTimer) { clearTimeout(teardownTimer); teardownTimer = null; }
  if (!active) open();
  return () => {
    remoteListeners.delete(cb);
    if (remoteListeners.size || !active) return;
    // removeChannel is async — the channel stays in the client's list until the
    // leave is acked, so an immediate re-subscribe would get the dying channel back.
    // Deferring lets a remount (route change, StrictMode) cancel the teardown.
    teardownTimer = setTimeout(() => {
      teardownTimer = null;
      if (remoteListeners.size || !active) return;
      active.client.removeChannel(active.channel);
      active = null;
    }, 1000);
  };
}

// Local, same-tab count adjustments. The Approvals page removes a row the instant a
// mod clicks approve/reject; this lets the header badge move with it instead of
// waiting for the server to finish and the broadcast to round-trip.
const localListeners = new Set();

export function onLocalQueueDelta(cb) {
  localListeners.add(cb);
  return () => { localListeners.delete(cb); };
}

export function emitLocalQueueDelta(delta) {
  localListeners.forEach(l => l(delta));
}

// Refetch everywhere as if a broadcast had arrived. Used when an optimistic action
// fails: the server is the source of truth, and the failure may be because another
// mod already handled the row.
export function resyncQueue() {
  remoteListeners.forEach(l => l(null));
}
