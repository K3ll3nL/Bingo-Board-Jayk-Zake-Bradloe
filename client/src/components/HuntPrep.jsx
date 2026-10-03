import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';
import ReconnectingPill from './ReconnectingPill';
import { useAuth } from '../contexts/AuthContext';
import { isRestrictedEnabled } from '../featureFlags';
import { ALLOWED_GAMES, proofFieldsFor } from '../constants/games';
import { restrictedRulesFor, ruleApplies, NO_EGGS_RULE, monthWindowLabel } from '../constants/huntPrep';
import { buildPokemonImageUrl } from '../utils/pokemonImageUtils';
import { SURFACE, GRADIENT, BORDER, TEXT, ACCENT, SEMANTIC, BRAND } from '../constants/theme';
import restrictedIcon from '../Icons/restricted-icon.png';

// Hunt Prep (/prep). One hunt = one Pokémon + one game + Standard/Restricted,
// laid out as the hunt actually happens: Before → During → After → Submit.
// Every step is a tile the player can tick; the per-phase bars are the
// progress. Rules and exemptions come from games.js + constants/huntPrep.js.
// Deliberately prose-free — the full rules live on /about.

const NO_PRE_EVOS = [];
const RESTRICTED = BRAND.restricted ?? '#78150a';
const MINT = SEMANTIC.success.base;
const CORAL = SEMANTIC.danger.base;
const AMBER = SEMANTIC.warn.base;
const R2 = 'https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev/assets';
// Example image for one upload slot: assets/proof/<game key>_<proof field id>.png
// (e.g. proof/sword_shield_in_battle.png). Missing file → the sprite + glyph tile.
const proofExamples = (game, field) => (field ? [`${R2}/proof/${game.key}_${field.id}.png`] : []);

const shortGame = (label) => label.replace(/^Pokémon\s+/, '');

// ── Glyphs ──────────────────────────────────────────────────────────────────
const PATHS = {
  video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  hyperspace: <><ellipse cx="12" cy="12" rx="9" ry="4" /><ellipse cx="12" cy="12" rx="5" ry="2" /><circle cx="12" cy="12" r="0.8" fill="currentColor" /></>,
  afk: <><path d="M5 8h6l-6 8h6" /><path d="M14 5h5l-5 6h5" /></>,
  sandwich: <><path d="M3 10c0-3 4-5 9-5s9 2 9 5z" /><path d="M3 13h18" /><path d="M4 16h16v2a1 1 0 01-1 1H5a1 1 0 01-1-1z" /></>,
  outbreak: <><circle cx="8" cy="9" r="3" /><circle cx="16" cy="9" r="3" /><circle cx="12" cy="16" r="3" /></>,
  chain: <><rect x="2.5" y="9" width="10" height="6" rx="3" /><rect x="11.5" y="9" width="10" height="6" rx="3" /></>,
  uwr: <><circle cx="12" cy="12" r="8" /><path d="M8 12a4 4 0 018 0" /><path d="M14 9l2 3-3 1" /></>,
  egg: <path d="M12 3c3.5 0 7 6 7 10.5A7 7 0 015 13.5C5 9 8.5 3 12 3z" />,
  code: <><path d="M8 7l-5 5 5 5" /><path d="M16 7l5 5-5 5" /><path d="M14 4l-4 16" /></>,
  cartridge: <><path d="M5 3h14v14l-2 4H7l-2-4z" /><rect x="8" y="6" width="8" height="6" rx="1" /></>,
  id: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2.2" /><path d="M5.5 16.5c.8-1.6 2-2.3 3.5-2.3s2.7.7 3.5 2.3" /><path d="M15 10h3.5M15 13.5h3.5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  link: <><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></>,
  rule: <path d="M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6z" />,
  zoom: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  reset: <><path d="M4 4v6h6" /><path d="M5.5 15A8 8 0 104 10" /></>,
};

const Glyph = ({ name, className = 'w-5 h-5', strokeWidth = 1.75, style }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
    strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
    {PATHS[name] ?? PATHS.rule}
  </svg>
);

const Sprite = ({ mon, className = 'w-10 h-10' }) => (
  mon ? <img src={buildPokemonImageUrl(mon)} alt={mon.name} draggable={false}
    className={`${className} object-contain select-none`} loading="lazy" /> : null
);

// The "don't" mark: the thing itself, ringed and struck through in coral.
// `small`: the 28px stamp used on the encounter shot.
const Banned = ({ children, small }) => (
  <span className={`relative inline-flex items-center justify-center rounded-full ${small ? 'w-7 h-7' : 'w-11 h-11'}`}
    style={{ boxShadow: `inset 0 0 0 ${small ? 1.5 : 2}px ${CORAL}` }}>
    {children}
    <span className="absolute inset-0 pointer-events-none" aria-hidden="true">
      <span className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full ${small ? 'w-[1.5px] h-[29px]' : 'w-[2px] h-[46px]'}`}
        style={{ background: CORAL }} />
    </span>
  </span>
);

const Tick = ({ on }) => (
  <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-colors"
    style={on
      ? { background: MINT, color: SURFACE.page }
      : { boxShadow: `inset 0 0 0 1.5px ${BORDER.outline}` }}>
    {on && <Glyph name="check" className="w-3.5 h-3.5" strokeWidth={3} />}
  </span>
);

const ruleArt = (rule, small) => (rule.sprite
  ? <img src={rule.sprite} alt="" className={`${small ? 'w-5 h-5' : 'w-8 h-8'} object-contain`} style={{ imageRendering: 'pixelated' }} />
  : <Glyph name={rule.icon} className={small ? 'w-4 h-4' : 'w-6 h-6'} style={{ color: TEXT.body }} />);

// ── Step tiles ──────────────────────────────────────────────────────────────
// ring: always-on 2px ring colour (the irreversible shot). behind: amber ring on
// an unticked tile in a phase the player has already moved past.
const tileStyle = (on, ring, behind) => ({
  background: GRADIENT.inset,
  boxShadow: behind && !on
    ? `inset 0 0 0 2px ${AMBER}`
    : ring
      ? `inset 0 0 0 2px ${on ? MINT : ring}`
      : `inset 0 0 0 1px ${on ? MINT : BORDER.hairline}`,
});

// Submit pressed with this step still open: shake + amber glow (`.prep-nudge`).
// `nudge` is a counter so every press replays the animation.
const useNudge = (nudge) => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!nudge || !el) return;
    el.classList.remove('prep-nudge');
    void el.offsetWidth; // restart the animation
    el.classList.add('prep-nudge');
  }, [nudge]);
  return [ref, (e) => e.currentTarget.classList.remove('prep-nudge')];
};

const RuleTile = ({ step, on, behind, nudge, onToggle }) => {
  const [ref, onAnimationEnd] = useNudge(nudge);
  return (
  <button ref={ref} onAnimationEnd={onAnimationEnd} type="button" onClick={onToggle} aria-pressed={on}
    className="relative min-w-0 flex flex-col items-center gap-2 px-2 pt-4 pb-3 rounded-lg text-center transition-[box-shadow,opacity] hover:brightness-110"
    style={tileStyle(on, null, behind)}>
    <Tick on={on} />
    <span className={on ? 'opacity-50' : ''}>
      {step.art}
    </span>
    <span className="text-xs font-semibold leading-tight text-body">{step.label}</span>
  </button>
  );
};

// First example image in `step.examples` that actually loads; null once all fail.
const useExample = (examples) => {
  const [failed, setFailed] = useState(0);
  const list = examples ?? [];
  useEffect(() => { setFailed(0); }, [list.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  return [list[failed] ?? null, () => setFailed(f => f + 1)];
};

// A screenshot frame: what the shot looks like, which mon is in it, and its
// place in the upload order.
const ShotTile = ({ step, on, behind, nudge, onToggle, onZoom }) => {
  const [example, onMiss] = useExample(step.examples);
  const [ref, onAnimationEnd] = useNudge(nudge);
  const ring = step.irreversible ? CORAL : null;
  return (
    <button ref={ref} onAnimationEnd={onAnimationEnd} type="button" onClick={onToggle} aria-pressed={on}
      className="relative min-w-0 flex flex-col gap-2 p-2 rounded-lg text-left transition-[box-shadow] hover:brightness-110"
      style={{
        ...tileStyle(on, ring, behind),
        ...(step.irreversible && !on && !behind ? { boxShadow: `inset 0 0 0 2px ${CORAL}, 0 0 18px -6px ${CORAL}` } : null),
      }}>
      <div className="relative w-full aspect-[16/10] rounded-md overflow-hidden flex items-center justify-center"
        style={{ background: `radial-gradient(circle at 50% 60%, ${SURFACE.cardAlt}, ${SURFACE.inset})` }}>
        {example ? (
          <img key={example} src={example} alt="" draggable={false} loading="lazy" onError={onMiss}
            className={`absolute inset-0 w-full h-full object-cover ${on ? 'opacity-40' : 'opacity-90'}`} />
        ) : step.evolve ? (
          <div className={`flex items-center gap-1 ${on ? 'opacity-40' : ''}`}>
            <Sprite mon={step.evolve[0]} className="w-12 h-12" />
            <Glyph name="arrow" className="w-4 h-4" style={{ color: ACCENT.base }} />
            <Sprite mon={step.evolve[1]} className="w-12 h-12" />
          </div>
        ) : (
          <div className={`flex items-center gap-2 ${on ? 'opacity-40' : ''}`}>
            <Sprite mon={step.mon} className="w-14 h-14" />
            {step.glyph && <Glyph name={step.glyph} className="w-7 h-7" style={{ color: TEXT.muted }} />}
          </div>
        )}
        {example && step.mon && (
          <span className="absolute bottom-1 left-1 w-9 h-9 rounded-md flex items-center justify-center"
            style={{ background: 'rgba(13,15,20,0.85)' }}>
            <Sprite mon={step.mon} className="w-8 h-8" />
          </span>
        )}
        <span className="absolute top-1 left-1 min-w-[22px] h-[22px] px-1 rounded-md flex items-center justify-center text-xs font-bold text-strong"
          style={{ background: step.irreversible ? CORAL : 'rgba(13,15,20,0.85)', color: step.irreversible ? SURFACE.page : undefined }}>
          {step.n}
        </span>
        {step.video && !example && !step.proves?.length && (
          <span className="absolute bottom-1 right-1 w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: 'rgba(13,15,20,0.85)', color: CORAL }}>
            <Glyph name="video" className="w-4 h-4" />
          </span>
        )}
        {example && (
          <span role="button" tabIndex={0} aria-label="Example"
            onClick={(e) => { e.stopPropagation(); onZoom(example); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onZoom(example); } }}
            className="absolute bottom-1 right-1 w-7 h-7 rounded-md flex items-center justify-center text-strong cursor-zoom-in hover:brightness-125"
            style={{ background: 'rgba(13,15,20,0.85)' }}>
            <Glyph name="zoom" className="w-4 h-4" />
          </span>
        )}
        <Tick on={on} />
      </div>
      {step.proves?.length > 0 && (
        <span className={`flex items-center gap-1.5 flex-wrap px-1.5 py-1 rounded-md ${on ? 'opacity-50' : ''}`}
          style={{ background: SURFACE.inset }}>
          <Glyph name="video" className="w-4 h-4 shrink-0" style={{ color: CORAL }} />
          {step.proves.map(p => <span key={p.id} title={p.label} className="inline-flex">{p.art}</span>)}
        </span>
      )}
      <span className="flex items-center gap-x-1.5 gap-y-1 flex-wrap px-0.5 min-w-0">
        <span className="text-xs font-semibold leading-tight text-body whitespace-nowrap">{step.label}</span>
        {step.chip && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold whitespace-nowrap"
            style={{ background: 'rgba(167,139,250,0.14)', color: ACCENT.base }}>
            <Glyph name="calendar" className="w-3.5 h-3.5" />{step.chip}
          </span>
        )}
      </span>
    </button>
  );
};

const StepTile = (props) => (props.step.kind === 'shot' ? <ShotTile {...props} /> : <RuleTile {...props} />);

// ── Phase column ────────────────────────────────────────────────────────────
// The bar is the progress: it fills as this phase's steps are ticked. Vertical
// rail on mobile, horizontal cap on desktop. `behind`: a later phase has ticks
// while this one is unfinished — the empty track, number and title go amber.
const Phase = ({ index, title, done, total, behind, children, grid }) => {
  const pct = total ? (done / total) * 100 : 0;
  const complete = total > 0 && done === total;
  const track = behind ? 'rgba(251,191,36,0.35)' : BORDER.hairline;
  return (
    <section className="relative min-w-0 pl-5 min-[930px]:pl-0">
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-full overflow-hidden min-[930px]:hidden" style={{ background: track }}>
        <div className="w-full transition-[height] duration-300" style={{ height: `${pct}%`, background: MINT }} />
      </div>
      <div className="hidden min-[930px]:block h-1 rounded-full overflow-hidden mb-3" style={{ background: track }}>
        <div className="h-full transition-[width] duration-300" style={{ width: `${pct}%`, background: MINT }} />
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
          style={complete ? { background: MINT, color: SURFACE.page }
            : behind ? { background: AMBER, color: SURFACE.page }
            : { boxShadow: `inset 0 0 0 1.5px ${BORDER.outline}`, color: TEXT.muted }}>
          {complete ? <Glyph name="check" className="w-3 h-3" strokeWidth={3} /> : index}
        </span>
        <h2 className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${behind ? '' : 'text-muted'}`} style={behind ? { color: AMBER } : undefined}>{title}</h2>
      </div>
      <div className={grid}>{children}</div>
    </section>
  );
};

// ── Board picker ────────────────────────────────────────────────────────────
// This month's board, laid out as the board: 5×5, free space in the middle.
const BoardPicker = ({ pool, selectedId, onPick }) => {
  const byPos = new Map();
  pool.forEach((p, i) => byPos.set(p.position ?? (i < 12 ? i + 1 : i + 2), p));
  return (
    <div className="grid grid-cols-5 gap-1.5 w-full max-w-[340px]">
      {Array.from({ length: 25 }, (_, i) => {
        const pos = i + 1;
        if (pos === 13) {
          return <div key={pos} className="aspect-square rounded-md flex items-center justify-center"
            style={{ background: 'rgba(167,139,250,0.10)', color: ACCENT.base }}>
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true"><path d="M12 2l2.6 6.6L21 9.3l-5 4.4 1.5 6.8L12 17l-5.5 3.5L8 13.7 3 9.3l6.4-.7z" /></svg>
          </div>;
        }
        const mon = byPos.get(pos);
        const on = mon && mon.id === selectedId;
        return (
          <button key={pos} type="button" disabled={!mon} onClick={() => mon && onPick(mon.id)}
            title={mon?.name}
            className="aspect-square rounded-md flex items-center justify-center transition-[box-shadow,transform] hover:scale-105 disabled:opacity-30"
            style={{ background: GRADIENT.inset, boxShadow: `inset 0 0 0 ${on ? 2 : 1}px ${on ? ACCENT.base : BORDER.hairline}` }}>
            <Sprite mon={mon} className="w-[85%] h-[85%]" />
          </button>
        );
      })}
    </div>
  );
};

// ── Game tile ───────────────────────────────────────────────────────────────
const GameTile = ({ game, on, restrictedOk, showRestricted, onPick }) => (
  <button type="button" onClick={onPick} aria-pressed={on} title={game.label}
    className="relative min-w-0 h-14 px-2 rounded-lg flex items-center justify-center gap-1 transition-[box-shadow,background] hover:brightness-110"
    style={{
      background: on ? 'rgba(139,92,246,0.18)' : GRADIENT.inset,
      boxShadow: `inset 0 0 0 ${on ? 2 : 1}px ${on ? ACCENT.base : BORDER.hairline}`,
    }}>
    {game.img_urls.slice(0, 2).map(url => (
      <img key={url} src={url} alt="" draggable={false} loading="lazy"
        className={`min-w-0 object-contain ${game.img_urls.length > 1 ? 'max-w-[46%]' : 'max-w-[80%]'} max-h-8`} />
    ))}
    {game.no_image_proof && (
      <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded flex items-center justify-center" style={{ background: SURFACE.page, color: CORAL }}>
        <Glyph name="video" className="w-3 h-3" strokeWidth={2} />
      </span>
    )}
    {showRestricted && restrictedOk && (
      <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded flex items-center justify-center" style={{ background: RESTRICTED }}>
        <img src={restrictedIcon} alt="" className="w-3 h-3 object-contain" />
      </span>
    )}
  </button>
);

const ModeToggle = ({ restricted, canRestrict, onChange }) => (
  <div className="inline-flex rounded-lg overflow-hidden flex-shrink-0" style={{ boxShadow: `inset 0 0 0 1px ${BORDER.edge}` }}>
    <button type="button" onClick={() => onChange(false)}
      className={`h-8 px-3 text-xs font-semibold transition-colors ${!restricted ? 'text-strong' : 'text-muted hover:text-strong'}`}
      style={{ background: !restricted ? ACCENT.strong : 'transparent' }}>
      Standard
    </button>
    <button type="button" onClick={() => canRestrict && onChange(true)} disabled={!canRestrict}
      className={`h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${restricted ? 'text-strong' : 'text-muted hover:text-strong'}`}
      style={{ background: restricted ? RESTRICTED : 'transparent' }}>
      <img src={restrictedIcon} alt="" className="w-3.5 h-3.5 object-contain" />
      Restricted
    </button>
  </div>
);

// ── Ticks (per viewer, convenience only) ────────────────────────────────────
const readTicks = (key) => {
  try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return {}; }
};
const writeTicks = (key, ticks) => {
  try {
    if (Object.values(ticks).some(Boolean)) localStorage.setItem(key, JSON.stringify(ticks));
    else localStorage.removeItem(key);
  } catch { /* storage unavailable — ticks just won't persist */ }
};

const Shimmer = ({ className }) => <div className={`rounded-lg animate-pulse ${className}`} style={{ background: SURFACE.cardAlt }} />;

// ── Page ────────────────────────────────────────────────────────────────────
const HuntPrep = () => {
  const { isModerator } = useAuth();
  const showRestricted = isRestrictedEnabled(isModerator);
  const [searchParams, setSearchParams] = useSearchParams();
  const pokemonId = Number(searchParams.get('pokemon')) || null;

  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [boardOpen, setBoardOpen] = useState(false);
  const [huntAsId, setHuntAsId] = useState(null);
  const [gameKey, setGameKey] = useState(null);
  const [wantRestricted, setWantRestricted] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let retry;
    const load = async () => {
      try {
        const res = await fetch(`/api/prep${pokemonId ? `?pokemon=${pokemonId}` : ''}`);
        if (res.status === 503) { if (!cancelled) { setStatus('reconnecting'); retry = setTimeout(load, 4000); } return; }
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (cancelled) return;
        setData(json);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    };
    load();
    return () => { cancelled = true; clearTimeout(retry); };
  }, [pokemonId]);

  const board = data?.pokemon && data.pokemon.id === pokemonId ? data.pokemon : null;
  const pool = data?.pool ?? [];

  useEffect(() => { setHuntAsId(null); }, [pokemonId]);

  const preEvos = board?.pre_evos ?? NO_PRE_EVOS;
  const huntAs = (huntAsId && preEvos.find(m => m.id === huntAsId)) || board;
  const evolving = !!(board && huntAs && huntAs.id !== board.id);

  const allGames = useMemo(
    () => (huntAs ? ALLOWED_GAMES.filter(g => (huntAs.game_slugs ?? []).includes(g.key)) : []),
    [huntAs],
  );
  const restrictedGames = allGames.filter(g => (board?.restricted_game_slugs ?? []).includes(g.key));
  const canRestrict = showRestricted && restrictedGames.length > 0;
  const restricted = canRestrict && wantRestricted;
  // Restricted on: only the games it can be done in.
  const games = restricted ? restrictedGames : allGames;
  // Default to the newest game that takes screenshots — a Gen 1–3 (video-only)
  // game is never the first thing a new player should see.
  const game = games.find(g => g.key === gameKey) ?? games.find(g => !g.no_image_proof) ?? games[0] ?? null;
  const video = restricted || !!game?.no_image_proof;
  const inPool = !!(board && pool.some(p => p.id === board.id));
  const window_ = inPool ? monthWindowLabel(data?.month) : null;

  // ── Steps ─────────────────────────────────────────────────────────────────
  const phases = useMemo(() => {
    if (!board || !game) return null;
    const before = [];
    const during = [];
    const after = [];
    const submit = [];
    const proves = [];

    if (video) before.push({ id: 'record', label: 'Start recording', art: <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ boxShadow: `inset 0 0 0 2px ${CORAL}` }}><span className="w-4 h-4 rounded-full" style={{ background: CORAL }} /></span> });
    if (restricted) {
      for (const rule of restrictedRulesFor(game, huntAs)) {
        before.push({ id: rule.id, label: rule.short, art: <Banned>{ruleArt(rule, false)}</Banned> });
        // Decided in Before, proven in the video: same icon, stamped on the encounter.
        if (rule.inVideo) proves.push({ id: rule.id, label: rule.short, art: <Banned small>{ruleArt(rule, true)}</Banned> });
      }
      if (ruleApplies(huntAs, NO_EGGS_RULE)) before.push({ id: NO_EGGS_RULE, label: 'No eggs', art: <Banned><Glyph name="egg" className="w-6 h-6" style={{ color: TEXT.body }} /></Banned> });
    }
    before.push({ id: 'no_mods', label: 'No hacks or RNG', art: <Banned><Glyph name="code" className="w-6 h-6" style={{ color: TEXT.body }} /></Banned> });
    before.push({ id: 'cartridge', label: 'Real cartridge', art: <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ boxShadow: `inset 0 0 0 2px ${MINT}`, color: TEXT.body }}><Glyph name="cartridge" className="w-6 h-6" /></span> });

    const fields = proofFieldsFor(game.key);
    let n = 1;
    const encounterLabel = fields[0]?.label ?? 'Encounter';
    const overworld = /overworld/i.test(encounterLabel);
    during.push({
      id: 'encounter', kind: 'shot', n: n++, irreversible: true, video,
      label: video ? 'Encounter' : encounterLabel,
      mon: huntAs,
      examples: proofExamples(game, fields[0]),
      glyph: video ? 'video' : (overworld ? null : 'camera'),
      proves,
    });

    if (!game.no_image_proof) {
      for (const f of fields.slice(1)) {
        const isDate = f.id === 'date' || f.id === 'tid_date';
        after.push({
          id: f.id, kind: 'shot', n: n++, video: restricted,
          label: f.label,
          mon: huntAs,
          examples: proofExamples(game, f),
          glyph: isDate && f.id === 'date' ? 'calendar' : 'id',
          chip: isDate ? window_ : null,
        });
      }
    }
    if (evolving) {
      // The evolution shot shows the final step only (Kirlia → Gardevoir), even
      // when the hunt started two stages back.
      const lastStage = preEvos[preEvos.length - 1] ?? huntAs;
      after.push({ id: 'evolve', kind: 'shot', n: n++, video: restricted, label: 'Evolution Screenshot', evolve: [lastStage, board] });
      after.push({ id: 'evolved', kind: 'shot', n: n++, video: restricted, label: 'Evolved Summary', mon: board, glyph: 'id' });
    }

    if (video) submit.push({ id: 'link', label: 'Video link', art: <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ boxShadow: `inset 0 0 0 2px ${BRAND.twitch}`, color: TEXT.body }}><Glyph name="link" className="w-6 h-6" /></span> });

    return { before, during, after, submit };
  }, [board, game, huntAs, preEvos, evolving, restricted, video, window_]);

  const tickKey = board && game ? `prep:${board.id}:${game.key}:${restricted ? 'restricted' : 'standard'}${evolving ? `:${huntAs.id}` : ''}` : null;
  const [ticks, setTicks] = useState({});
  useEffect(() => { setTicks(tickKey ? readTicks(tickKey) : {}); }, [tickKey]);
  const toggle = useCallback((id) => {
    setTicks(prev => {
      const next = { ...prev, [id]: !prev[id] };
      if (tickKey) writeTicks(tickKey, next);
      return next;
    });
  }, [tickKey]);
  const resetTicks = () => { setTicks({}); if (tickKey) writeTicks(tickKey, {}); };

  // Submit with steps still open: first press nudges them and arms the button
  // ("Submit anyway"); the second goes through.
  const [nudge, setNudge] = useState(0);
  useEffect(() => { setNudge(0); }, [tickKey]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const pick = (id) => {
    setSearchParams({ pokemon: String(id) }, { replace: true });
    setBoardOpen(false);
  };

  const count = (list) => [list.filter(s => ticks[s.id]).length, list.length];
  const allSteps = phases ? [...phases.before, ...phases.during, ...phases.after, ...phases.submit] : [];
  const anyTicked = allSteps.some(s => ticks[s.id]);
  // Skipped ahead: an unfinished phase that comes before the furthest phase with
  // a tick. Those phases (and their open tiles) go amber.
  const order = phases ? [phases.before, phases.during, phases.after, phases.submit] : [];
  // Pressing Submit counts as reaching it, so the skipped phases stay amber.
  const furthest = order.reduce((m, list, i) => (list.some(s => ticks[s.id]) ? i : m), nudge ? 3 : -1);
  const behind = order.map((list, i) => i < furthest && list.some(s => !ticks[s.id]));
  // Submit-phase steps (Video link) happen on the upload page, so they never block.
  const open = phases ? [...phases.before, ...phases.during, ...phases.after].filter(s => !ticks[s.id]) : [];
  const armed = nudge > 0 && open.length > 0;
  const onSubmit = (e) => {
    if (!open.length || armed) return;
    e.preventDefault();
    setNudge(n => n + 1);
    // On a phone the open tiles can be a screen above Submit (and under the
    // sticky header). Only scroll when the first one is actually out of sight.
    const el = document.querySelector(`[data-step="${open[0].id}"] > *`);
    const r = el?.getBoundingClientRect();
    if (r && (r.top < 72 || r.bottom > window.innerHeight)) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const tile = (s, i) => (
    <div key={s.id} data-step={s.id} className="contents">
      <StepTile step={s} on={!!ticks[s.id]} behind={behind[i]} nudge={!ticks[s.id] ? nudge : 0} onToggle={() => toggle(s.id)} onZoom={setLightbox} />
    </div>
  );
  const allDone = allSteps.length > 0 && allSteps.every(s => ticks[s.id]);

  const uploadHref = board && game
    ? `/upload?pokemon=${board.id}&game=${game.key}${restricted ? '&restricted=1' : ''}${inPool ? '' : '&historical=true'}`
    : '/upload';

  const showPicker = !board || boardOpen;

  return (
    <div className="min-h-screen" style={{ background: SURFACE.page }}>
      <PageBackground />
      <PageHeader title="Prep for this hunt" />

      <main className="relative px-4 sm:px-6 py-5 max-w-[1200px] mx-auto space-y-4 min-w-0">
        {status === 'reconnecting' && <div className="relative h-8"><ReconnectingPill /></div>}

        {status === 'loading' && !data ? (
          <>
            <Shimmer className="h-40" />
            <div className="grid gap-4 min-[930px]:grid-cols-4"><Shimmer className="h-56" /><Shimmer className="h-56" /><Shimmer className="h-56" /><Shimmer className="h-56" /></div>
          </>
        ) : status === 'error' && !data ? (
          <div className="rounded-xl p-8 text-center text-muted" style={{ background: GRADIENT.card, boxShadow: `inset 0 0 0 1px ${BORDER.hairline}` }}>
            Couldn&rsquo;t load. <button type="button" className="font-semibold" style={{ color: ACCENT.base }} onClick={() => window.location.reload()}>Retry</button>
          </div>
        ) : (
          <>
            {/* ── What you're hunting ───────────────────────────────────── */}
            <div className="rounded-xl p-4 min-w-0 overflow-hidden" style={{ background: GRADIENT.card, boxShadow: `inset 0 0 0 1px ${BORDER.hairline}` }}>
              {showPicker && !board ? (
                <div className="flex flex-col items-center gap-3 py-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-strong">
                    {data?.month?.label ?? 'This month'}
                  </div>
                  <BoardPicker pool={pool} selectedId={null} onPick={pick} />
                </div>
              ) : (
                <div className="grid gap-4 min-[930px]:grid-cols-[minmax(0,300px)_minmax(0,1fr)] min-[930px]:gap-6">
                  {/* Pokémon + hunt-as */}
                  <div className="min-w-0 flex flex-col gap-3">
                    <button type="button" onClick={() => setBoardOpen(o => !o)} aria-expanded={boardOpen}
                      className="flex items-center gap-3 p-2 -m-2 rounded-lg text-left hover:bg-white/[0.04] transition-colors min-w-0">
                      <span className="w-20 h-20 rounded-lg flex-shrink-0 flex items-center justify-center"
                        style={{ background: GRADIENT.inset, boxShadow: `inset 0 0 0 1px ${BORDER.hairline}` }}>
                        <Sprite mon={board} className="w-[72px] h-[72px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-lg font-bold text-strong truncate">{board.name}</span>
                        {inPool && <span className="block text-xs font-semibold" style={{ color: ACCENT.base }}>{data.month?.label}</span>}
                      </span>
                      <Glyph name="chevron" className={`w-5 h-5 flex-shrink-0 transition-transform ${boardOpen ? 'rotate-180' : ''}`} style={{ color: TEXT.muted }} />
                    </button>

                    {boardOpen && <BoardPicker pool={pool} selectedId={board.id} onPick={pick} />}

                    {preEvos.length > 0 && (
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted mb-1.5">Hunt as</div>
                        <div className="flex items-center gap-1 flex-wrap">
                          {[...preEvos, board].map((m, i, arr) => {
                            const on = m.id === huntAs.id;
                            return (
                              <React.Fragment key={m.id}>
                                <button type="button" onClick={() => setHuntAsId(m.id === board.id ? null : m.id)} aria-pressed={on} title={m.name}
                                  className="w-12 h-12 rounded-lg flex items-center justify-center transition-[box-shadow] hover:brightness-110"
                                  style={{ background: on ? 'rgba(139,92,246,0.18)' : GRADIENT.inset, boxShadow: `inset 0 0 0 ${on ? 2 : 1}px ${on ? ACCENT.base : BORDER.hairline}` }}>
                                  <Sprite mon={m} className="w-10 h-10" />
                                </button>
                                {i < arr.length - 1 && <Glyph name="arrow" className="w-3.5 h-3.5" style={{ color: TEXT.faint }} />}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Game + mode */}
                  <div className="min-w-0 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="text-sm font-semibold text-strong truncate min-w-0">{game ? shortGame(game.label) : ''}</div>
                      {showRestricted && <ModeToggle restricted={restricted} canRestrict={canRestrict} onChange={setWantRestricted} />}
                    </div>
                    {games.length > 0 ? (
                      <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(96px,1fr))]">
                        {games.map(g => (
                          <GameTile key={g.key} game={g} on={g.key === game?.key}
                            restrictedOk={(board.restricted_game_slugs ?? []).includes(g.key)}
                            showRestricted={showRestricted}
                            onPick={() => setGameKey(g.key)} />
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted">No eligible games</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── The hunt ───────────────────────────────────────────────── */}
            {phases && (
              <div className="rounded-xl p-4 min-w-0 overflow-hidden"
                style={{ background: GRADIENT.card, boxShadow: `inset 0 0 0 1px ${restricted ? 'rgba(120,21,10,0.9)' : BORDER.hairline}` }}>
                <div className="grid gap-6 min-[930px]:gap-4 min-[930px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.8fr)]">
                  <Phase index={1} title="Before" behind={behind[0]} {...toPhase(count(phases.before))} grid="grid grid-cols-3 sm:grid-cols-4 min-[930px]:grid-cols-2 gap-2">
                    {phases.before.map(s => tile(s, 0))}
                  </Phase>
                  <Phase index={2} title="During" behind={behind[1]} {...toPhase(count(phases.during))} grid="grid gap-2 max-w-[320px]">
                    {phases.during.map(s => tile(s, 1))}
                  </Phase>
                  <Phase index={3} title="After" behind={behind[2]} {...toPhase(count(phases.after))} grid="grid grid-cols-2 gap-2">
                    {phases.after.length > 0
                      ? phases.after.map(s => tile(s, 2))
                      : <div className="col-span-2 h-full min-h-[64px] rounded-lg flex items-center justify-center" style={{ boxShadow: `inset 0 0 0 1px ${BORDER.hairline}`, color: CORAL }}><Glyph name="video" className="w-6 h-6" /></div>}
                  </Phase>
                  <Phase index={4} title="Submit" {...toPhase(count(phases.submit))} grid="flex flex-col gap-2">
                    {phases.submit.map(s => tile(s, 3))}
                    <Link to={uploadHref} onClick={onSubmit}
                      className="h-11 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-semibold text-strong transition-[filter,box-shadow] hover:brightness-110"
                      style={{ background: restricted ? RESTRICTED : ACCENT.strong, boxShadow: allDone ? `0 0 0 2px ${MINT}` : armed ? `0 0 0 2px ${AMBER}` : 'none' }}>
                      {restricted && <img src={restrictedIcon} alt="" className="w-4 h-4 object-contain" />}
                      {armed ? 'Submit anyway' : 'Submit'}
                      <Glyph name="arrow" className="w-4 h-4" strokeWidth={2.25} />
                    </Link>
                  </Phase>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 flex-wrap px-1">
              {anyTicked ? (
                <button type="button" onClick={resetTicks} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-strong transition-colors">
                  <Glyph name="reset" className="w-3.5 h-3.5" />Clear ticks
                </button>
              ) : <span />}
              <Link to="/about" className="text-xs font-semibold hover:brightness-125" style={{ color: ACCENT.base }}>How to Play →</Link>
            </div>
          </>
        )}
      </main>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 cursor-zoom-out" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
};

const toPhase = ([done, total]) => ({ done, total });

export default HuntPrep;
