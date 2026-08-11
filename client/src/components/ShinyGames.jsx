import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAuthHeaders } from '../services/api';
import { ALLOWED_GAMES } from '../constants/games';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';
import alphaIcon from '../Icons/alpha.png';

const STATUS_LABEL = { building: 'Building', active: 'Live' };

export default function ShinyGames() {
  const { isModerator } = useAuth();
  const navigate = useNavigate();

  // undefined = loading, array = loaded (possibly empty)
  const [lobbies, setLobbies] = useState(undefined);
  const [joinCode, setJoinCode] = useState('');
  const [gameFilter, setGameFilter] = useState('');
  const [explainerOpen, setExplainerOpen] = useState(false);

  useEffect(() => {
    if (isModerator === false) navigate('/');
  }, [isModerator]);

  useEffect(() => {
    if (!isModerator) return;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const qs = gameFilter ? `?game=${encodeURIComponent(gameFilter)}` : '';
        const res = await fetch(`/api/jeopardy${qs}`, { headers });
        const data = res.ok ? await res.json() : null;
        setLobbies(data?.lobbies || []);
      } catch { setLobbies([]); }
    })();
  }, [isModerator, gameFilter]);

  const handleJoinByCode = (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    navigate(`/games/jeopardy/${joinCode.trim().toUpperCase()}`);
  };

  const myLobbies = (lobbies || []).filter(l => l.viewerIsMember);
  const sortedLobbies = [...(lobbies || [])].sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1));

  return (
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />
      <PageHeader title="Shiny Games" subtitle="Live, collaborative shiny hunting events" badge="mod" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 space-y-8">
        <div className="max-w-2xl space-y-3">
          <p className="text-sm text-muted leading-relaxed">
            A home for competitive, community-run shiny hunting activities — short bursts players join
            together instead of the month-long board. A host starts a lobby, shares its code, and once
            enough people join, everyone plays together in real time.
          </p>

          <ExplainerAccordion open={explainerOpen} setOpen={setExplainerOpen} />
        </div>

        {/* ── Continue Playing ── */}
        {myLobbies.length > 0 && (
          <section>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-3">Continue Playing</div>
            <div
              className="grid gap-3 sm:gap-4 max-w-4xl"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
            >
              {myLobbies.map(lobby => <ContinueCard key={lobby.id} lobby={lobby} />)}
            </div>
          </section>
        )}

        {/* ── Have a code? ── */}
        <section className="max-w-md space-y-1.5">
          <form onSubmit={handleJoinByCode} className="flex items-center gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Have a code? ABC123"
              maxLength={8}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold tracking-widest bg-black/30 border border-hairline text-strong outline-none focus:ring-2 focus:ring-accent-strong"
            />
            <button
              type="submit"
              disabled={!joinCode.trim()}
              className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold bg-accent-strong/20 text-accent border border-accent-strong/40 hover:bg-accent-strong/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Join
            </button>
          </form>
          <p className="text-[10px] text-faint">or browse open lobbies below</p>
        </section>

        {/* ── Open lobbies ── */}
        <section>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
              Open Lobbies {lobbies?.length ? `— ${lobbies.length}` : ''}
            </div>
            {lobbies !== undefined && lobbies.length > 0 && (
              <select
                value={gameFilter}
                onChange={e => setGameFilter(e.target.value)}
                style={{ colorScheme: 'dark' }}
                className="px-2.5 py-1.5 rounded-lg text-xs bg-black/30 border border-hairline text-body outline-none focus:ring-2 focus:ring-accent-strong"
              >
                <option value="">All games</option>
                {ALLOWED_GAMES.map(g => (
                  <option key={g.key} value={g.key}>{g.label}</option>
                ))}
              </select>
            )}
          </div>

          {lobbies === undefined && (
            <p className="text-xs text-faint">Loading…</p>
          )}

          {lobbies?.length === 0 && (
            <p className="text-xs text-faint">
              {gameFilter ? 'No open lobbies for that game right now.' : 'Nothing running right now — host a game below to get one started.'}
            </p>
          )}

          {lobbies && lobbies.length > 0 && (
            <div
              className="grid gap-3 sm:gap-4 max-w-5xl"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
            >
              {sortedLobbies.map(lobby => {
                const gameLabel = ALLOWED_GAMES.find(g => g.key === lobby.game)?.label ?? lobby.game;
                return (
                  <Link
                    key={lobby.id}
                    to={`/games/jeopardy/${lobby.code}`}
                    className="min-w-0 overflow-hidden flex flex-col gap-2 rounded-xl px-4 py-3.5 border border-hairline bg-black/30 text-left transition-all duration-150 hover:brightness-125 hover:scale-[1.02] active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-strong">Shiny Jeopardy</p>
                      <span
                        className={
                          lobby.status === 'active'
                            ? 'shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-success-strong/20 text-success border border-success-strong/40'
                            : 'shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-warn-strong/20 text-warn border border-warn-strong/40'
                        }
                      >
                        {lobby.status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />}
                        {STATUS_LABEL[lobby.status] ?? lobby.status}
                      </span>
                      {lobby.viewerIsMember && (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent-strong/20 text-accent border border-accent-strong/40">
                          Joined
                        </span>
                      )}
                      {lobby.visibility === 'private' && (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-faint">Private</span>
                      )}
                    </div>
                    <p className="text-xs text-muted">
                      {gameLabel}
                      {lobby.host?.display_name ? ` · hosted by ${lobby.host.display_name}` : ''}
                    </p>
                    <p className="text-xs text-faint">
                      {lobby.memberCount} in lobby
                      {lobby.status === 'active' ? ` · ${lobby.claimCount}/${(lobby.columns ?? 5) * 5} claimed` : ''}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Host a game ── */}
        <section>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-3">Host a Game</div>
          <Link
            to="/games/host"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-accent-strong/20 text-accent border border-accent-strong/40 hover:bg-accent-strong/30 transition-colors"
          >
            Host a Game
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </section>
      </div>
    </div>
  );
}

// ── Continue Playing card ───────────────────────────────────────────────────
function ContinueCard({ lobby }) {
  const gameLabel = ALLOWED_GAMES.find(g => g.key === lobby.game)?.label ?? lobby.game;
  const isActive = lobby.status === 'active';
  return (
    <Link
      to={`/games/jeopardy/${lobby.code}`}
      className="min-w-0 overflow-hidden flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 border border-accent-strong bg-accent-strong/10 transition-all duration-150 hover:brightness-110 hover:scale-[1.02] active:scale-[0.99]"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-strong">Shiny Jeopardy · {gameLabel}</p>
        <p className="text-xs text-muted mt-0.5">
          {isActive ? `Active — ${lobby.claimCount}/${(lobby.columns ?? 5) * 5} claimed` : 'Building — waiting to start'}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold text-accent">Continue →</span>
    </Link>
  );
}

// ── Onboarding accordion ─────────────────────────────────────────────────────
function ExplainerAccordion({ open, setOpen }) {
  return (
    <div className="rounded-xl border border-hairline overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left"
      >
        <span className="text-xs font-semibold text-body">New here? What a lobby is, and what the tags mean</span>
        <svg
          className="w-4 h-4 text-faint shrink-0 transition-transform duration-150"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 text-xs text-muted leading-relaxed border-t border-hairline pt-3">
          <p><strong className="text-body">Lobby</strong> — a live instance of a game, hosted by one player and joined by others via a connection code. Once enough people join, the host starts it.</p>
          <p><strong className="text-body">Connection code</strong> — a short code (like <span className="font-mono text-strong">K3PQXT</span>) that gets you straight into a specific lobby, whether you type it in or follow a shared link.</p>
          <p><strong className="text-body">Team / Multiplayer / Solo</strong> — tags on each game describing how many people it needs to play.</p>
        </div>
      )}
    </div>
  );
}
