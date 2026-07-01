import React, { useState, useMemo, useRef, useEffect } from 'react';

const R2 = 'https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev';
const R2G = `${R2}/assets/games`;

// Gender overrides for pokemon that aren't stored as 'mf'
const SPRITE_GENDER = {
  29: 'fo',  // Nidoran♀
  32: 'mo',  // Nidoran♂
  113: 'fo', // Chansey
  115: 'fo', // Kangaskhan
  128: 'mo', // Tauros
  202: 'mf', // Wobbuffet (has_gender_difference → 'md', but try mf first)
  241: 'fo', // Miltank
};

// Try alternate gender codes on 404 by cycling through candidates
const GENDER_FALLBACKS = ['mf', 'fo', 'mo', 'uk', 'md'];

function SpriteImg({ dex, style }) {
  const [idx, setIdx] = React.useState(0);
  const base = SPRITE_GENDER[dex] ?? 'mf';
  const codes = [base, ...GENDER_FALLBACKS.filter(c => c !== base)];
  const url = `${R2}/poke_capture_${String(dex).padStart(4, '0')}_000_${codes[idx]}_n_00000000_f_r.png`;
  return (
    <img src={url} alt=""
      style={style}
      onError={() => setIdx(i => Math.min(i + 1, codes.length - 1))} />
  );
}

// ─── Game data ────────────────────────────────────────────────────────────────

const SAFARI_GAMES = [
  { id: 'gen1-rby',  label: 'Red / Blue / Yellow',       subtitle: 'Kanto Safari Zone', rockLabel: 'Rock', ballCount: 30, mechanic: 'gen1', img_urls: [`${R2G}/red.png`,      `${R2G}/blue.png`]       },
  { id: 'gen3-frlg', label: 'FireRed / LeafGreen',        subtitle: 'Kanto Safari Zone', rockLabel: 'Rock', ballCount: 30, mechanic: 'frlg', img_urls: [`${R2G}/firered.png`,  `${R2G}/leafgreen.png`]  },
  { id: 'gen3-rse',  label: 'Ruby / Sapphire / Emerald',  subtitle: 'Hoenn Safari Zone', rockLabel: null,   ballCount: 30, mechanic: 'rse',  img_urls: [`${R2G}/ruby.png`,     `${R2G}/sapphire.png`]   },
  { id: 'gen4-dppt', label: 'Diamond / Pearl / Platinum', subtitle: 'Great Marsh',       rockLabel: 'Mud',  ballCount: 30, mechanic: 'gen4', img_urls: [`${R2G}/diamond.png`,  `${R2G}/pearl.png`]      },
  { id: 'gen4-hgss', label: 'HeartGold / SoulSilver',     subtitle: 'Johto Safari Zone', rockLabel: 'Rock', ballCount: 30, mechanic: 'gen4', img_urls: [`${R2G}/heartgold.png`,`${R2G}/soulsilver.png`] },
  { id: 'gen6-xy',   label: 'X / Y',                      subtitle: 'Friend Safari',     rockLabel: null,   ballCount: null, mechanic: 'friend', img_urls: [`${R2G}/x.png`, `${R2G}/y.png`] },
];

// ─── Pokémon lists ────────────────────────────────────────────────────────────

// levels = all encounter levels for that Pokémon across all areas of the safari zone.
// Gen 1/3 levels affect the flee calculation directly (speed scales with level).
// Gen 4 levels are informational only (flee uses escapeRate, not speed).
const SAFARI_POKEMON = {
  'gen1-rby': [
    { name: 'Nidoran♀',   dex: 29,  catchRate: 235, baseSpeed: 41,  levels: [22, 25]     },
    { name: 'Nidoran♂',   dex: 32,  catchRate: 235, baseSpeed: 50,  levels: [22, 25]     },
    { name: 'Nidorina',   dex: 30,  catchRate: 120, baseSpeed: 56,  levels: [31]         },
    { name: 'Nidorino',   dex: 33,  catchRate: 120, baseSpeed: 65,  levels: [31]         },
    { name: 'Paras',      dex: 46,  catchRate: 190, baseSpeed: 25,  levels: [22, 25]     },
    { name: 'Parasect',   dex: 47,  catchRate: 75,  baseSpeed: 30,  levels: [34]         },
    { name: 'Venonat',    dex: 48,  catchRate: 190, baseSpeed: 45,  levels: [22, 25]     },
    { name: 'Venomoth',   dex: 49,  catchRate: 75,  baseSpeed: 70,  levels: [34]         },
    { name: 'Exeggcute',  dex: 102, catchRate: 90,  baseSpeed: 40,  levels: [22, 24]     },
    { name: 'Cubone',     dex: 104, catchRate: 190, baseSpeed: 35,  levels: [19, 21]     },
    { name: 'Marowak',    dex: 105, catchRate: 75,  baseSpeed: 45,  levels: [28]         },
    { name: 'Rhyhorn',    dex: 111, catchRate: 120, baseSpeed: 25,  levels: [20, 25, 30] },
    { name: 'Chansey',    dex: 113, catchRate: 30,  baseSpeed: 50,  levels: [23]         },
    { name: 'Tangela',    dex: 114, catchRate: 45,  baseSpeed: 60,  levels: [22, 25]     },
    { name: 'Kangaskhan', dex: 115, catchRate: 45,  baseSpeed: 90,  levels: [25, 28]     },
    { name: 'Scyther',    dex: 123, catchRate: 45,  baseSpeed: 105, levels: [23, 25]     },
    { name: 'Pinsir',     dex: 127, catchRate: 45,  baseSpeed: 85,  levels: [23, 25]     },
    { name: 'Tauros',     dex: 128, catchRate: 45,  baseSpeed: 110, levels: [25, 28]     },
    { name: 'Dratini',    dex: 147, catchRate: 45,  baseSpeed: 50,  levels: [15]         },
    { name: 'Dragonair',  dex: 148, catchRate: 45,  baseSpeed: 70,  levels: [15]         },
  ],
  'gen3-frlg': [
    // fleeRate = flee factor (1–20); flee prob = 5 * fleeRate %
    { name: 'Nidoran♀',   dex: 29,  catchRate: 235, fleeRate: 3, levels: [22, 25]     },
    { name: 'Nidoran♂',   dex: 32,  catchRate: 235, fleeRate: 3, levels: [22, 25]     },
    { name: 'Nidorina',   dex: 30,  catchRate: 120, fleeRate: 5, levels: [30]         },
    { name: 'Nidorino',   dex: 33,  catchRate: 120, fleeRate: 5, levels: [30]         },
    { name: 'Paras',      dex: 46,  catchRate: 190, fleeRate: 3, levels: [22, 24]     },
    { name: 'Parasect',   dex: 47,  catchRate: 75,  fleeRate: 5, levels: [30]         },
    { name: 'Venonat',    dex: 48,  catchRate: 190, fleeRate: 3, levels: [22, 24]     },
    { name: 'Venomoth',   dex: 49,  catchRate: 75,  fleeRate: 5, levels: [35]         },
    { name: 'Exeggcute',  dex: 102, catchRate: 90,  fleeRate: 5, levels: [24, 26]     },
    { name: 'Cubone',     dex: 104, catchRate: 190, fleeRate: 3, levels: [19, 22]     },
    { name: 'Marowak',    dex: 105, catchRate: 75,  fleeRate: 5, levels: [28]         },
    { name: 'Rhyhorn',    dex: 111, catchRate: 120, fleeRate: 5, levels: [20, 25, 30] },
    { name: 'Chansey',    dex: 113, catchRate: 30,  fleeRate: 9, levels: [30]         },
    { name: 'Tangela',    dex: 114, catchRate: 45,  fleeRate: 9, levels: [22, 24]     },
    { name: 'Kangaskhan', dex: 115, catchRate: 45,  fleeRate: 9, levels: [25, 28]     },
    { name: 'Scyther',    dex: 123, catchRate: 45,  fleeRate: 9, levels: [25, 28]     },
    { name: 'Pinsir',     dex: 127, catchRate: 45,  fleeRate: 9, levels: [25, 28]     },
    { name: 'Tauros',     dex: 128, catchRate: 45,  fleeRate: 9, levels: [25, 28]     },
    { name: 'Dratini',    dex: 147, catchRate: 45,  fleeRate: 7, levels: [15, 20]     },
    { name: 'Dragonair',  dex: 148, catchRate: 45,  fleeRate: 9, levels: [20]         },
  ],
  'gen3-rse': [
    { name: 'Nidoran♀',  dex: 29  }, { name: 'Nidoran♂',   dex: 32  },
    { name: 'Oddish',    dex: 43  }, { name: 'Exeggcute',  dex: 102 },
    { name: 'Rhyhorn',   dex: 111 }, { name: 'Kangaskhan', dex: 115 },
    { name: 'Pinsir',    dex: 127 }, { name: 'Pikachu',    dex: 25  },
    { name: 'Heracross', dex: 214 }, { name: 'Girafarig',  dex: 203 },
    { name: 'Wobbuffet', dex: 202 },
  ],
  'gen4-dppt': [
    { name: 'Psyduck',   dex: 54,  catchRate: 190, escapeRate: 90,  levels: [20, 25]     },
    { name: 'Golduck',   dex: 55,  catchRate: 75,  escapeRate: 60,  levels: [30]         },
    { name: 'Paras',     dex: 46,  catchRate: 190, escapeRate: 120, levels: [20, 22]     },
    { name: 'Parasect',  dex: 47,  catchRate: 75,  escapeRate: 90,  levels: [30]         },
    { name: 'Tangela',   dex: 114, catchRate: 45,  escapeRate: 90,  levels: [20, 22]     },
    { name: 'Marill',    dex: 183, catchRate: 190, escapeRate: 90,  levels: [15, 20]     },
    { name: 'Yanma',     dex: 193, catchRate: 75,  escapeRate: 120, levels: [20, 22]     },
    { name: 'Wooper',    dex: 194, catchRate: 255, escapeRate: 120, levels: [15, 20]     },
    { name: 'Quagsire',  dex: 195, catchRate: 90,  escapeRate: 60,  levels: [25]         },
    { name: 'Azurill',   dex: 298, catchRate: 150, escapeRate: 90,  levels: [15]         },
    { name: 'Budew',     dex: 406, catchRate: 255, escapeRate: 90,  levels: [15, 20]     },
    { name: 'Starly',    dex: 396, catchRate: 255, escapeRate: 90,  levels: [15, 20]     },
    { name: 'Bidoof',    dex: 399, catchRate: 255, escapeRate: 90,  levels: [15, 20]     },
    { name: 'Carnivine', dex: 455, catchRate: 200, escapeRate: 90,  levels: [20, 22]     },
    { name: 'Skorupi',   dex: 451, catchRate: 120, escapeRate: 90,  levels: [20, 22]     },
    { name: 'Barboach',  dex: 339, catchRate: 190, escapeRate: 120, levels: [20]         },
    { name: 'Magikarp',  dex: 129, catchRate: 255, escapeRate: 90,  levels: [10, 15]     },
    { name: 'Gyarados',  dex: 130, catchRate: 45,  escapeRate: 60,  levels: [20, 30]     },
    { name: 'Croagunk',  dex: 453, catchRate: 140, escapeRate: 150, levels: [22, 24]     },
  ],
  'gen4-hgss': [
    { name: 'Kangaskhan', dex: 115, catchRate: 45,  escapeRate: 120, levels: [17, 20]    },
    { name: 'Dratini',    dex: 147, catchRate: 45,  escapeRate: 90,  levels: [15, 20]    },
    { name: 'Dragonair',  dex: 148, catchRate: 45,  escapeRate: 60,  levels: [25]        },
    { name: 'Tauros',     dex: 128, catchRate: 45,  escapeRate: 90,  levels: [17, 20]    },
    { name: 'Chansey',    dex: 113, catchRate: 30,  escapeRate: 90,  levels: [17, 20]    },
    { name: 'Pinsir',     dex: 127, catchRate: 45,  escapeRate: 90,  levels: [22, 25]    },
    { name: 'Scyther',    dex: 123, catchRate: 45,  escapeRate: 120, levels: [22, 25]    },
    { name: 'Rhyhorn',    dex: 111, catchRate: 120, escapeRate: 90,  levels: [15, 17]    },
    { name: 'Girafarig',  dex: 203, catchRate: 60,  escapeRate: 90,  levels: [22, 25]    },
    { name: 'Miltank',    dex: 241, catchRate: 45,  escapeRate: 90,  levels: [22, 25]    },
    { name: 'Doduo',      dex: 84,  catchRate: 190, escapeRate: 90,  levels: [15, 17]    },
    { name: 'Paras',      dex: 46,  catchRate: 190, escapeRate: 120, levels: [15, 17]    },
    { name: 'Exeggcute',  dex: 102, catchRate: 90,  escapeRate: 90,  levels: [17, 20]    },
    { name: 'Phanpy',     dex: 231, catchRate: 120, escapeRate: 90,  levels: [15, 17]    },
    { name: 'Slowpoke',   dex: 79,  catchRate: 190, escapeRate: 60,  levels: [15, 17]    },
    { name: 'Vulpix',     dex: 37,  catchRate: 190, escapeRate: 90,  levels: [17, 20]    },
    { name: 'Wobbuffet',  dex: 202, catchRate: 45,  escapeRate: 60,  levels: [22, 25]    },
    { name: 'Sneasel',    dex: 215, catchRate: 60,  escapeRate: 120, levels: [22, 25]    },
    { name: 'Teddiursa',  dex: 216, catchRate: 120, escapeRate: 90,  levels: [15, 17]    },
    { name: 'Ursaring',   dex: 217, catchRate: 60,  escapeRate: 60,  levels: [30]        },
  ],
};

// ─── Math ─────────────────────────────────────────────────────────────────────

function actualSpeed(base, level) { return Math.floor((2 * base * level) / 100) + 5; }

function gen1Flee(base, level, state) {
  const s = actualSpeed(base, level);
  const x = state === 'angry' ? Math.min(255, s * 4) : state === 'eating' ? Math.floor(s / 2) : s * 2;
  return Math.min(1, x / 256);
}

function gen1Catch(rate) { return Math.min(255, Math.max(1, rate)) / 256; }

function stageMult(s) {
  const n = Math.max(-6, Math.min(6, s));
  return n >= 0 ? (2 + n) / 2 : 2 / (2 - n);
}

function gen4Flee(escapeRate, fleeStage) {
  return Math.min(1, Math.round(escapeRate * stageMult(fleeStage)) / 255);
}

function gen4Catch(catchRate, catchStage) {
  // Safari Ball (1.5×) at full HP: a = floor(catchRate * stageMult * 1.5 / 3)
  const a = Math.floor(Math.min(255, Math.round(catchRate * stageMult(catchStage))) * 1.5 / 3);
  if (a >= 255) return 1;
  // Standard Gen 4 four-shake formula (Bulbapedia)
  const b = Math.round(1048560 / Math.sqrt(Math.sqrt(16711680 / Math.max(1, a))));
  return Math.pow(Math.min(b, 65535) / 65536, 4);
}

// FRLG uses a catch-factor system (not raw catchRate/256).
// catchFactor = floor(catchRate / 12.75); bait: max(3, floor/2); rock: min(20, *2)
// a = floor(catchFactor * 51 / 4), then standard Gen 3 shake formula.
function frlgCatch(catchFactor) {
  const a = Math.floor(catchFactor * 51 / 4);
  if (a <= 0) return 0;
  if (a >= 255) return 1;
  const b = Math.floor(1048560 / Math.floor(Math.sqrt(Math.floor(Math.sqrt(Math.floor(16711680 / a))))));
  return Math.pow(Math.min(b, 65535) / 65536, 4);
}

// FRLG flee: each species has a flee factor (1–20); prob = 5 * factor %.
// Bait: max(1, floor(factor/4)); rock: min(20, factor*2).
function frlgFlee(fleeFactor) {
  return Math.min(1, (fleeFactor * 5) / 100);
}

function initCatchFactor(catchRate) {
  return Math.max(1, Math.floor(catchRate / 12.75));
}

// Cumulative catch probability over N balls.
// Order: throw ball (catch check) → flee check on miss. Both Gen 1 and FRLG work this way.
function cumCatch(catchP, fleeP, balls) {
  let total = 0, here = 1;
  for (let i = 0; i < balls; i++) {
    total += here * catchP;
    here = here * (1 - catchP) * (1 - fleeP);
    if (here < 0.0001) break;
  }
  return Math.min(1, total);
}

// ─── Format ───────────────────────────────────────────────────────────────────

function pct(p) {
  if (p == null || isNaN(p)) return '—';
  const v = p * 100;
  if (v >= 99.95) return '>99.9%';
  if (v < 0.05)   return '<0.1%';
  return v.toFixed(1) + '%';
}

const catchColor = p => p >= 0.12 ? '#34d399' : p >= 0.04 ? '#fbbf24' : '#f87171';
const fleeColor  = p => p >= 0.6  ? '#f87171' : p >= 0.25 ? '#fbbf24' : '#34d399';

// ─── Dropdown hook ────────────────────────────────────────────────────────────

function useOutsideClick(ref, fn) {
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) fn(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, fn]);
}

// ─── Game logos (matches Upload.jsx pattern exactly) ─────────────────────────

function GameLogos({ urls, h = 28 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
      width: 88, justifyContent: urls.length === 1 ? 'center' : 'flex-start' }}>
      {urls.slice(0, 2).map((url, i) => (
        <div key={i} style={{ width: 42, height: h, display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0 }}>
          <img src={url} alt="" style={{ height: `${h}px`, width: 'auto', maxWidth: '42px', objectFit: 'contain' }} />
        </div>
      ))}
    </div>
  );
}

// ─── Game dropdown ────────────────────────────────────────────────────────────

function GameDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClick(ref, () => setOpen(false));
  const sel = SAFARI_GAMES.find(g => g.id === value);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, background: '#1f2937', border: '1px solid #374151', borderRadius: 12,
          padding: '10px 14px', cursor: 'pointer', transition: 'border-color 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.borderColor = '#4b5563'}
        onMouseLeave={e => e.currentTarget.style.borderColor = open ? '#10b981' : '#374151'}>
        {sel ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <GameLogos urls={sel.img_urls} h={24} />
            <div style={{ minWidth: 0 }}>
              <p style={{ color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1.2, margin: 0 }}>{sel.label}</p>
              <p style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>{sel.subtitle}</p>
            </div>
          </div>
        ) : (
          <span style={{ color: '#6b7280', fontSize: 14 }}>Select a game...</span>
        )}
        <svg style={{ width: 16, height: 16, color: '#6b7280', flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4,
          background: '#1f2937', border: '1px solid #374151', borderRadius: 12,
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)', zIndex: 50, overflow: 'hidden' }}>
          {SAFARI_GAMES.map(g => (
            <button key={g.id} type="button"
              onClick={() => { onChange(g.id); setOpen(false); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', background: value === g.id ? '#374151' : 'transparent',
                border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}
              onMouseEnter={e => { if (value !== g.id) e.currentTarget.style.background = 'rgba(55,65,81,0.6)'; }}
              onMouseLeave={e => { if (value !== g.id) e.currentTarget.style.background = 'transparent'; }}>
              <GameLogos urls={g.img_urls} h={28} />
              <div>
                <p style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: 0, lineHeight: 1.3 }}>{g.label}</p>
                <p style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>{g.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Pokémon grid ─────────────────────────────────────────────────────────────

function PokemonGrid({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
      {options.map(p => {
        const sel = value?.dex === p.dex;
        return (
          <button key={p.dex} type="button" title={p.name} onClick={() => onChange(p)}
            style={{ width: 54, height: 54, display: 'flex', alignItems: 'center',
              justifyContent: 'center', padding: 0, cursor: 'pointer',
              background: sel ? 'rgba(5,150,105,0.2)' : '#1f2937',
              border: `2px solid ${sel ? '#10b981' : '#374151'}`,
              borderRadius: 10, transition: 'all 0.1s' }}
            onMouseEnter={e => { if (!sel) e.currentTarget.style.borderColor = '#4b5563'; }}
            onMouseLeave={e => { if (!sel) e.currentTarget.style.borderColor = sel ? '#10b981' : '#374151'; }}>
            <SpriteImg dex={p.dex} style={{ width: 46, height: 46, objectFit: 'contain' }} />
          </button>
        );
      })}
    </div>
  );
}

// ─── CounterBox ───────────────────────────────────────────────────────────────

function CounterBox({ label, sublabel, value, onChange }) {
  const [raw, setRaw] = React.useState(String(value));
  React.useEffect(() => {
    const n = parseInt(raw, 10);
    if (isNaN(n) || n !== value) setRaw(String(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-gray-900/60 rounded-xl p-3 flex flex-col gap-1.5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-0">{label}</p>
        {sublabel && <p className="text-[10px] text-gray-600 leading-tight mt-0.5">{sublabel}</p>}
      </div>
      <div className="flex items-center gap-1.5">
        <button onClick={() => onChange(Math.max(0, value - 1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-lg font-bold shrink-0 transition-colors">
          −
        </button>
        <input type="text" inputMode="numeric" value={raw}
          onChange={e => {
            const s = e.target.value.replace(/[^0-9]/g, '');
            setRaw(s);
            if (s !== '') onChange(parseInt(s, 10));
          }}
          onBlur={() => { const n = parseInt(raw, 10); if (isNaN(n)) setRaw(String(value)); }}
          className="flex-1 bg-gray-950 border border-gray-700 rounded-lg py-1.5 px-2 text-center text-white text-lg font-bold outline-none min-w-0" />
        <button onClick={() => onChange(value + 1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-lg font-bold shrink-0 transition-colors">
          +
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SafariZone() {
  const [gameId,  setGameId]  = useState(null);
  const [pokemon, setPokemon] = useState(null);
  const [level,   setLevel]   = useState(25);

  // RSE interactive state
  const [rseEscapeFactor, setRseEscapeFactor] = useState(3);
  const [rseBalls,        setRseBalls]        = useState(30);

  // Friend Safari interactive state
  const [shinyCount, setShinyCount] = useState(0);

  const game     = SAFARI_GAMES.find(g => g.id === gameId);
  const mechanic = game?.mechanic;
  const balls    = game?.ballCount ?? 30;

  // ── Probabilities (always from neutral/base state) ─────────────────────────

  const catchP = useMemo(() => {
    if (!pokemon) return 0;
    if (mechanic === 'gen1') return gen1Catch(pokemon.catchRate);
    if (mechanic === 'frlg') return frlgCatch(initCatchFactor(pokemon.catchRate ?? 45));
    if (mechanic === 'gen4') return gen4Catch(pokemon.catchRate ?? 45, 0);
    return 0;
  }, [mechanic, pokemon]);

  const fleeP = useMemo(() => {
    if (!pokemon) return 0;
    if (mechanic === 'gen1') return gen1Flee(pokemon.baseSpeed ?? 60, level, 'neutral');
    if (mechanic === 'frlg') return frlgFlee(pokemon.fleeRate ?? 3);
    if (mechanic === 'gen4') return gen4Flee(pokemon.escapeRate ?? 90, 0);
    return 0;
  }, [mechanic, pokemon, level]);

  const totalP = useMemo(() =>
    pokemon ? cumCatch(catchP, fleeP, balls) : 0,
    [catchP, fleeP, balls, pokemon]);

  const baitProj = useMemo(() => {
    if (!pokemon) return null;
    if (mechanic === 'gen1') return {
      c: gen1Catch(Math.max(1, Math.floor(pokemon.catchRate / 2))),
      f: gen1Flee(pokemon.baseSpeed, level, 'eating'),
    };
    if (mechanic === 'frlg') {
      const cf = initCatchFactor(pokemon.catchRate ?? 45);
      return {
        c: frlgCatch(Math.max(3, Math.floor(cf / 2))),
        f: frlgFlee(Math.max(1, Math.floor((pokemon.fleeRate ?? 3) / 4))),
      };
    }
    if (mechanic === 'gen4') return {
      c: gen4Catch(pokemon.catchRate, -1),
      f: gen4Flee(pokemon.escapeRate, -1),
    };
    return null;
  }, [mechanic, pokemon, level]);

  const rockProj = useMemo(() => {
    if (!pokemon) return null;
    if (mechanic === 'gen1') return {
      c: gen1Catch(Math.min(255, pokemon.catchRate * 2)),
      f: gen1Flee(pokemon.baseSpeed, level, 'angry'),
    };
    if (mechanic === 'frlg') {
      const cf = initCatchFactor(pokemon.catchRate ?? 45);
      return {
        c: frlgCatch(Math.min(20, cf * 2)),
        f: frlgFlee(Math.min(20, (pokemon.fleeRate ?? 3) * 2)),
      };
    }
    if (mechanic === 'gen4') return {
      c: gen4Catch(pokemon.catchRate, 1),
      f: gen4Flee(pokemon.escapeRate, 1),
    };
    return null;
  }, [mechanic, pokemon, level]);

  const rec = useMemo(() => {
    if (!pokemon) return null;
    if (mechanic === 'gen1') {
      const spd = actualSpeed(pokemon.baseSpeed ?? 60, level);
      if (spd <= 25 && pokemon.catchRate < 128) return 'rock';
    }
    if (mechanic === 'frlg') {
      const cf = initCatchFactor(pokemon.catchRate ?? 45);
      if (cf < 3) return 'bait';
      if (catchP < 0.12 && cf < 10) return 'rock';
    }
    if (mechanic === 'gen4') {
      if (catchP < 0.12) return 'rock';
    }
    return 'ball';
  }, [mechanic, pokemon, level, catchP]);

  // ── Reset level on pokemon change ──────────────────────────────────────────

  useEffect(() => {
    if (pokemon) setLevel(pokemon.levels?.[0] ?? 25);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pokemon?.dex, gameId]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleGameChange(id) {
    setGameId(id); setPokemon(null);
    setRseEscapeFactor(3); setRseBalls(30); setShinyCount(0);
  }

  const rockLabel = game?.rockLabel ?? 'Rock';
  const hasRock   = game && mechanic !== 'rse' && mechanic !== 'friend' && game.rockLabel;
  const pokeList  = gameId ? (SAFARI_POKEMON[gameId] ?? []) : [];
  const spd       = mechanic === 'gen1' && pokemon ? actualSpeed(pokemon.baseSpeed, level) : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 pb-12 text-white">

      {/* Header */}
      <h1 className="text-2xl font-bold text-white mb-1">Safari Zone Advisor</h1>
      <p className="text-gray-400 text-sm mb-4">
        Pick a game and Pokémon to see catch and flee odds.
      </p>

      {/* Game selector */}
      <GameDropdown value={gameId} onChange={handleGameChange} />

      {/* ── RSE interactive ───────────────────────────────────────────────── */}
      {game && mechanic === 'rse' && (
        <div className="mt-4">
          <p className="text-gray-400 text-sm mb-2.5 leading-relaxed">
            Hoenn uses Pokéblock feeders placed <em>before</em> entering — no bait/rock in battle.
            Set your escape factor below to track your flee rate.
          </p>

          {/* Escape factor chips — colors are data-driven, keep inline */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[[3,'15%','#f87171'],[2,'10%','#fbbf24'],[1,'5%','#34d399'],[0,'0%','#6ee7b7']].map(([f,v,c]) => {
              const sel = rseEscapeFactor === f;
              return (
                <button key={f} type="button" onClick={() => setRseEscapeFactor(f)}
                  style={{ background: sel ? 'rgba(0,0,0,0.3)' : '#1f2937',
                    border: `2px solid ${sel ? c : '#374151'}`,
                    borderRadius: 10, padding: '10px 8px', textAlign: 'center',
                    cursor: 'pointer', transition: 'all 0.15s' }}>
                  <p style={{ color: '#6b7280', fontSize: 11, margin: '0 0 4px' }}>Factor {f}</p>
                  <p style={{ color: sel ? c : '#4b5563', fontSize: 22, fontWeight: 900, margin: 0 }}>{v}</p>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-900/60 rounded-xl p-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Flee / turn</p>
              <p className="text-[32px] font-black leading-none tabular-nums"
                style={{ color: ['#6ee7b7','#34d399','#fbbf24','#f87171'][rseEscapeFactor] }}>
                {['0%','5%','10%','15%'][rseEscapeFactor]}
              </p>
              {rseEscapeFactor === 0 && (
                <p className="text-[11px] font-semibold text-emerald-400 mt-1.5">
                  Can't flee — just throw balls
                </p>
              )}
            </div>
            <CounterBox
              label="Safari Balls"
              sublabel="30 per safari entry"
              value={rseBalls}
              onChange={v => setRseBalls(Math.min(30, Math.max(0, v)))}
            />
          </div>
        </div>
      )}

      {/* ── Friend Safari interactive ──────────────────────────────────────── */}
      {game && mechanic === 'friend' && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-2 mb-3">
            {[['Shiny rate','1 / 512','#fde68a'],['Level','30','#fff'],['2× 31 IVs','guaranteed','#34d399'],['Hidden Ability','possible','#93c5fd']].map(([l,v,c]) => (
              <div key={l} className="bg-gray-800 border border-gray-700 rounded-xl p-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">{l}</p>
                <p className="text-lg font-extrabold" style={{ color: c }}>{v}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <CounterBox
              label="Encounters"
              sublabel="1/512 chance per encounter"
              value={shinyCount}
              onChange={v => setShinyCount(Math.max(0, v))}
            />
            <div className="bg-gray-900/60 rounded-xl p-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Seen shiny</p>
              <p className="text-[32px] font-black leading-none tabular-nums text-yellow-200">
                {shinyCount === 0 ? '0%' : pct(1 - Math.pow(511 / 512, shinyCount))}
              </p>
              {shinyCount >= 512 && (
                <p className="text-[11px] font-semibold text-yellow-200 mt-1.5">
                  Past average — every encounter is still 1/512
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Pokemon + level ───────────────────────────────────────────────── */}
      {game && mechanic !== 'rse' && mechanic !== 'friend' && (
        <div className="mt-3">
          <PokemonGrid options={pokeList} value={pokemon} onChange={setPokemon} />
          {mechanic === 'gen1' && pokemon?.levels && (
            <div className="flex items-center gap-2.5 mt-2.5 px-0.5 flex-wrap">
              <span className="text-xs text-gray-500 shrink-0">Encounter level</span>
              <div className="flex gap-1.5 flex-wrap">
                {pokemon.levels.map(lv => (
                  <button key={lv} type="button" onClick={() => setLevel(lv)}
                    style={{ padding: '4px 14px', borderRadius: 99, fontSize: 13, fontWeight: 700,
                      cursor: 'pointer', border: '1px solid', transition: 'all 0.1s',
                      background: level === lv ? '#059669' : 'transparent',
                      borderColor: level === lv ? '#059669' : '#374151',
                      color: level === lv ? '#fff' : '#9ca3af' }}>
                    {lv}
                  </button>
                ))}
              </div>
              {spd != null && <span className="text-xs text-gray-600 shrink-0">~{spd} spd</span>}
            </div>
          )}
        </div>
      )}

      {/* ── Encounter card ────────────────────────────────────────────────── */}
      {pokemon && mechanic !== 'rse' && mechanic !== 'friend' && (() => {
        const rows = [
          { key: 'ball', label: 'Neutral', c: catchP, f: fleeP, total: totalP },
          ...(baitProj ? [{ key: 'bait', label: 'After bait', c: baitProj.c, f: baitProj.f, total: cumCatch(baitProj.c, baitProj.f, balls) }] : []),
          ...(hasRock && rockProj ? [{ key: 'rock', label: `After ${rockLabel.toLowerCase()}`, c: rockProj.c, f: rockProj.f, total: cumCatch(rockProj.c, rockProj.f, balls) }] : []),
        ];
        const bestTotal = Math.max(...rows.map(r => r.total));
        return (
          <div className="mt-5 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">

            {/* Identity */}
            <div className="flex items-center gap-4 p-4 bg-gray-800/60 border-b border-gray-800">
              <div className="w-14 h-14 flex items-center justify-center bg-black/30 rounded-xl shrink-0">
                <SpriteImg key={pokemon.dex} dex={pokemon.dex} style={{ width: 52, height: 52, objectFit: 'contain', imageRendering: 'pixelated' }} />
              </div>
              <div>
                <p className="text-lg font-extrabold text-white leading-none mb-0.5">{pokemon.name}</p>
                <p className="text-xs text-gray-500">
                  {mechanic === 'gen1' && `Base speed ${pokemon.baseSpeed}`}
                  {mechanic === 'frlg' && `Catch factor ${initCatchFactor(pokemon.catchRate)} · Flee factor ${pokemon.fleeRate}`}
                  {mechanic === 'gen4' && `Catch rate ${pokemon.catchRate} · Escape rate ${pokemon.escapeRate}`}
                </p>
              </div>
            </div>

            {/* Comparison table */}
            <div className="grid px-4 py-1.5 border-b border-gray-800/60 bg-gray-950/40"
              style={{ gridTemplateColumns: '100px 1fr 1fr 1fr' }}>
              <span />
              <span className="text-[10px] uppercase tracking-widest text-gray-600 text-center">Catch/ball</span>
              <span className="text-[10px] uppercase tracking-widest text-gray-600 text-center">Flee/turn</span>
              <span className="text-[10px] uppercase tracking-widest text-gray-600 text-center">Est. {balls} balls</span>
            </div>
            {rows.map(row => {
              const isBest = row.total >= bestTotal - 0.0001;
              const isBaseline = row.key === 'ball';
              return (
                <div key={row.key} className="grid items-center px-4 py-3 border-b border-gray-800/50 last:border-b-0"
                  style={{ gridTemplateColumns: '100px 1fr 1fr 1fr', background: isBest ? 'rgba(5,150,105,0.08)' : 'transparent' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isBest ? '#34d399' : '#6b7280' }}>
                    {isBest ? '✓ ' : ''}{row.label}
                  </span>
                  <span style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: catchColor(row.c) }}>
                    {pct(row.c)}
                    {!isBaseline && Math.abs(row.c - catchP) > 0.0001 && (
                      <span style={{ fontSize: 10, color: row.c > catchP ? '#34d399' : '#f87171', marginLeft: 2 }}>
                        {row.c > catchP ? '↑' : '↓'}
                      </span>
                    )}
                  </span>
                  <span style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: fleeColor(row.f) }}>
                    {pct(row.f)}
                    {!isBaseline && Math.abs(row.f - fleeP) > 0.0001 && (
                      <span style={{ fontSize: 10, color: row.f < fleeP ? '#34d399' : '#f87171', marginLeft: 2 }}>
                        {row.f < fleeP ? '↓' : '↑'}
                      </span>
                    )}
                  </span>
                  <span style={{ textAlign: 'center', fontSize: 14, fontWeight: 800, color: catchColor(row.total) }}>
                    {pct(row.total)}
                  </span>
                </div>
              );
            })}

            {/* Throw sequence */}
            {(() => {
              const CHIP = {
                ball: { label: 'Ball', bg: '#1f2937', border: '#374151', color: '#6b7280' },
                bait: { label: 'Bait', bg: 'rgba(5,150,105,0.18)', border: 'rgba(52,211,153,0.3)', color: '#34d399' },
                rock: { label: rockLabel, bg: 'rgba(249,115,22,0.12)', border: 'rgba(251,146,60,0.28)', color: '#fb923c' },
              };
              const seq = [];
              if (rec === 'ball') {
                for (let i = 0; i < balls; i++) seq.push('ball');
              } else if (rec === 'bait') {
                let rem = balls;
                while (rem > 0) {
                  seq.push('bait');
                  for (let i = 0; i < 3 && rem > 0; i++) { seq.push('ball'); rem--; }
                }
              } else if (rec === 'rock') {
                const n = mechanic === 'gen4' ? 2 : 1;
                for (let i = 0; i < n; i++) seq.push('rock');
                for (let i = 0; i < balls; i++) seq.push('ball');
              }
              return (
                <div className="px-4 py-3 border-t border-gray-800">
                  <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">
                    Throw sequence · {balls} balls
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {seq.map((type, i) => {
                      const c = CHIP[type];
                      return (
                        <span key={i} style={{ fontSize: 10, fontWeight: 700,
                          padding: '3px 7px', borderRadius: 5,
                          background: c.bg, border: `1px solid ${c.border}`, color: c.color }}>
                          {c.label}
                        </span>
                      );
                    })}
                  </div>
                  {rec === 'bait' && (
                    <p className="text-[10px] text-gray-600 mt-2">Re-throw bait whenever eating wears off</p>
                  )}
                  {rec === 'rock' && mechanic === 'gen1' && (
                    <p className="text-[10px] text-gray-600 mt-2">Anger also raises flee — throw balls each turn after</p>
                  )}
                  {rec === 'rock' && mechanic === 'gen4' && (
                    <p className="text-[10px] text-gray-600 mt-2">Two {rockLabel.toLowerCase()}s to stack catch rate before throwing balls</p>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })()}
    </div>
  );
}
