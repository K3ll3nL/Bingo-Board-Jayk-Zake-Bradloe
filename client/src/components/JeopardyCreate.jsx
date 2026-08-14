import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAuthHeaders } from '../services/api';
import { ALLOWED_GAMES } from '../constants/games';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';
import alphaIcon from '../Icons/alpha.png';

const SHALPHA_GAMES = new Set(['legends_arceus', 'legends_za']);
const DEFAULT_ROW_POINTS = [1, 1, 3, 3, 5];

const PRESETS = [
  { label: 'Standard', values: [1, 1, 3, 3, 5] },
  { label: 'Classic', values: [1, 2, 3, 4, 5] },
  { label: 'Flat', values: [3, 3, 3, 3, 3] },
  { label: 'High Stakes', values: [1, 2, 4, 8, 16] },
];

// Each logo gets its own width-and-height-bounded slot so `object-contain`
// shrinks it to whichever dimension is actually tighter — a narrow 3-col
// mobile card constrains width, a short card constrains height, and the
// image scales correctly either way instead of just capping one axis.
function GameLogo({ game, height = 'h-8' }) {
  if (!game) return null;
  const urls = (game.img_urls ?? []).slice(0, 2);
  return (
    <div className={`flex items-center justify-center gap-1 w-full ${height}`}>
      {urls.map((url, i) => (
        <div key={i} className="flex-1 h-full min-w-0 flex items-center justify-center">
          <img src={url} alt="" className="w-full h-full object-contain" draggable="false" />
        </div>
      ))}
    </div>
  );
}

function RowPointsEditor({ rowPts, setRowPts }) {
  const maxPt = Math.max(...rowPts, 1);
  return (
    <div className="space-y-2">
      {rowPts.map((val, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-muted w-12 shrink-0">Row {i + 1}</span>
          <div className="flex-1 h-2 rounded-full bg-hairline overflow-hidden">
            <div
              className="h-full rounded-full bg-accent-strong transition-all duration-200"
              style={{ width: `${(val / maxPt) * 100}%` }}
            />
          </div>
          <input
            type="number"
            min="0"
            max="99"
            value={val}
            onChange={e => {
              const n = Math.max(0, Math.min(99, parseInt(e.target.value) || 0));
              setRowPts(prev => prev.map((v, j) => j === i ? n : v));
            }}
            className="w-14 shrink-0 text-center px-1 py-1 rounded-md bg-black/30 border border-hairline text-strong text-sm font-bold outline-none focus:ring-2 focus:ring-accent-strong"
          />
        </div>
      ))}
    </div>
  );
}

export default function JeopardyCreate() {
  const { isModerator } = useAuth();
  const navigate = useNavigate();

  const [selectedGame, setSelectedGame] = useState(ALLOWED_GAMES[0].key);
  const [rowPts, setRowPts] = useState([...DEFAULT_ROW_POINTS]);
  const [shalphaDbl, setShalphaDbl] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [gameSearch, setGameSearch] = useState('');
  const [columns, setColumns] = useState(5);
  const [visibility, setVisibility] = useState('public');
  const [isTimed, setIsTimed] = useState(false);
  const [timedMinutes, setTimedMinutes] = useState(30);

  useEffect(() => {
    if (isModerator === false) navigate('/games');
  }, [isModerator]);

  const selectedGameObj = ALLOWED_GAMES.find(g => g.key === selectedGame);
  const maxPossible = rowPts.reduce((sum, v) => sum + v * columns, 0);

  const filteredGames = useMemo(() => {
    const q = gameSearch.trim().toLowerCase();
    if (!q) return ALLOWED_GAMES;
    return ALLOWED_GAMES.filter(g => g.label.toLowerCase().includes(q));
  }, [gameSearch]);

  const handleCreate = async () => {
    if (!selectedGame || creating) return;
    setCreating(true); setError(null);
    try {
      const res = await fetch('/api/mod/jeopardy', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          game: selectedGame, row_points: rowPts, shalpha_double_points: shalphaDbl, columns, visibility,
          timed_minutes: isTimed ? timedMinutes : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const { board } = await res.json();
      navigate(`/games/jeopardy/${board.code}`);
    } catch (err) { setError(err.message); setCreating(false); }
  };

  return (
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />
      <PageHeader title="Host Shiny Jeopardy" badge="mod" />

      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 flex flex-col items-center">
        <div className="w-full max-w-3xl mb-4">
          <Link
            to="/games/host"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-strong transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Host a Game
          </Link>
        </div>
        <div className="w-full max-w-3xl flex flex-col lg:flex-row gap-6 items-start">
          {/* ── Form ── */}
          <div className="w-full lg:flex-1 rounded-xl p-6 space-y-6 border border-hairline bg-black/30">
            {error && (
              <div className="p-3 bg-red-900/50 border border-red-600 rounded text-red-300 text-sm">{error}</div>
            )}
            <p className="text-sm text-muted">Set up a new lobby — you'll get a code to share once it's created.</p>

            <div>
              <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                  Game {gameSearch && `— ${filteredGames.length}`}
                </div>
                <input
                  type="text"
                  value={gameSearch}
                  onChange={e => setGameSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-28 px-2 py-1 rounded-md text-xs bg-black/30 border border-hairline text-body outline-none focus:ring-2 focus:ring-accent-strong placeholder:text-faint"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
                {filteredGames.map(g => (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setSelectedGame(g.key)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all duration-150 hover:scale-[1.03] active:scale-[0.98] ${
                      selectedGame === g.key
                        ? 'border-accent-strong bg-accent-strong/10'
                        : 'border-hairline bg-black/20 hover:border-edge'
                    }`}
                    style={{ minHeight: '74px' }}
                  >
                    <GameLogo game={g} height="h-8" />
                    <span
                      className="text-[10px] text-center text-muted leading-tight"
                      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >
                      {g.label.replace('Pokémon ', '')}
                    </span>
                  </button>
                ))}
                {filteredGames.length === 0 && (
                  <p className="col-span-full text-xs text-faint py-4 text-center">No games match "{gameSearch}"</p>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Points per Row</div>
                <div className="flex gap-1.5">
                  {PRESETS.map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setRowPts([...p.values])}
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold border border-hairline text-muted hover:border-accent-strong hover:text-accent transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <RowPointsEditor rowPts={rowPts} setRowPts={setRowPts} />
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Board Columns</div>
              <div className="flex gap-1.5">
                {[3, 4, 5, 6, 7, 8].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setColumns(n)}
                    className={`w-9 h-9 rounded-lg text-sm font-bold border transition-colors ${
                      columns === n
                        ? 'border-accent-strong bg-accent-strong/10 text-accent'
                        : 'border-hairline text-muted hover:border-edge'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-faint mt-1.5">{columns * 5} squares total — 5 rows × {columns} columns</p>
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Visibility</div>
              <div className="flex rounded-lg border border-hairline overflow-hidden w-fit">
                <button
                  type="button"
                  onClick={() => setVisibility('public')}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                    visibility === 'public' ? 'bg-accent-strong text-strong' : 'bg-black/20 text-faint hover:text-body'
                  }`}
                >
                  Public
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility('private')}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                    visibility === 'private' ? 'bg-accent-strong text-strong' : 'bg-black/20 text-faint hover:text-body'
                  }`}
                >
                  Private
                </button>
              </div>
              <p className="text-[10px] text-faint mt-1.5">
                {visibility === 'private' ? 'Only visible to people with the code.' : 'Anyone can see and join this lobby from Shiny Games.'}
              </p>
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={isTimed}
                  onChange={e => setIsTimed(e.target.checked)}
                  className="w-4 h-4 accent-yellow-500"
                />
                <span className="text-sm text-body">Timed event — auto-finish when the clock runs out</span>
              </label>
              {isTimed && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="480"
                    value={timedMinutes}
                    onChange={e => setTimedMinutes(Math.max(1, Math.min(480, parseInt(e.target.value) || 1)))}
                    className="w-20 px-2 py-1.5 rounded-md text-center bg-black/30 border border-hairline text-strong text-sm font-bold outline-none focus:ring-2 focus:ring-accent-strong"
                  />
                  <span className="text-xs text-muted">minutes, starting when the host hits Start</span>
                </div>
              )}
            </div>

            {SHALPHA_GAMES.has(selectedGame) && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shalphaDbl}
                  onChange={e => setShalphaDbl(e.target.checked)}
                  className="w-4 h-4 accent-yellow-500"
                />
                <span className="text-sm text-body flex items-center gap-1.5">
                  <img src={alphaIcon} alt="α" className="w-4 h-4 object-contain" draggable="false" />
                  Shalpha (Shiny Alpha) counts for double points
                </span>
              </label>
            )}

            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full px-6 py-2.5 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
            >
              {creating ? 'Creating…' : 'Create Lobby'}
            </button>
          </div>

          {/* ── Preview ── */}
          <div className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-6 rounded-xl p-5 border border-hairline bg-black/30 space-y-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Preview</div>
              <GameLogo game={selectedGameObj} height="h-14" />
              <p className="text-sm font-semibold text-strong text-center leading-snug">{selectedGameObj?.label}</p>
              <p className="text-xs text-muted text-center">5×{columns} board · {columns * 5} Pokémon</p>
              <div className="pt-3 border-t border-hairline space-y-1.5">
                {rowPts.map((val, i) => {
                  const maxPt = Math.max(...rowPts, 1);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-faint w-8 shrink-0">R{i + 1}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-hairline overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent-strong transition-all duration-200"
                          style={{ width: `${(val / maxPt) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted w-6 text-right shrink-0">{val}</span>
                    </div>
                  );
                })}
              </div>
              <div className="pt-3 border-t border-hairline flex items-center justify-between">
                <span className="text-xs text-muted">Max score</span>
                <span className="text-sm font-bold text-strong">{maxPossible}pt{shalphaDbl ? ' · ×2 w/ Shalpha' : ''}</span>
              </div>
              {shalphaDbl && SHALPHA_GAMES.has(selectedGame) && (
                <div className="flex items-center gap-1.5 pt-3 border-t border-hairline text-xs text-warn">
                  <img src={alphaIcon} alt="α" className="w-3.5 h-3.5 object-contain" draggable="false" />
                  Shalpha claims worth ×2
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
