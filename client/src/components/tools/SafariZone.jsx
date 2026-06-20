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
  { id: 'gen3-frlg', label: 'FireRed / LeafGreen',        subtitle: 'Kanto Safari Zone', rockLabel: 'Rock', ballCount: 30, mechanic: 'gen1', img_urls: [`${R2G}/firered.png`,  `${R2G}/leafgreen.png`]  },
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
    { name: 'Nidoran♀',   dex: 29,  catchRate: 235, baseSpeed: 41,  levels: [22, 25]     },
    { name: 'Nidoran♂',   dex: 32,  catchRate: 235, baseSpeed: 50,  levels: [22, 25]     },
    { name: 'Nidorina',   dex: 30,  catchRate: 120, baseSpeed: 56,  levels: [30]         },
    { name: 'Nidorino',   dex: 33,  catchRate: 120, baseSpeed: 65,  levels: [30]         },
    { name: 'Paras',      dex: 46,  catchRate: 190, baseSpeed: 25,  levels: [22, 24]     },
    { name: 'Parasect',   dex: 47,  catchRate: 75,  baseSpeed: 30,  levels: [30]         },
    { name: 'Venonat',    dex: 48,  catchRate: 190, baseSpeed: 45,  levels: [22, 24]     },
    { name: 'Venomoth',   dex: 49,  catchRate: 75,  baseSpeed: 70,  levels: [35]         },
    { name: 'Exeggcute',  dex: 102, catchRate: 90,  baseSpeed: 40,  levels: [24, 26]     },
    { name: 'Cubone',     dex: 104, catchRate: 190, baseSpeed: 35,  levels: [19, 22]     },
    { name: 'Marowak',    dex: 105, catchRate: 75,  baseSpeed: 45,  levels: [28]         },
    { name: 'Rhyhorn',    dex: 111, catchRate: 120, baseSpeed: 25,  levels: [20, 25, 30] },
    { name: 'Chansey',    dex: 113, catchRate: 30,  baseSpeed: 50,  levels: [30]         },
    { name: 'Tangela',    dex: 114, catchRate: 45,  baseSpeed: 60,  levels: [22, 24]     },
    { name: 'Kangaskhan', dex: 115, catchRate: 45,  baseSpeed: 90,  levels: [25, 28]     },
    { name: 'Scyther',    dex: 123, catchRate: 45,  baseSpeed: 105, levels: [25, 28]     },
    { name: 'Pinsir',     dex: 127, catchRate: 45,  baseSpeed: 85,  levels: [25, 28]     },
    { name: 'Tauros',     dex: 128, catchRate: 45,  baseSpeed: 110, levels: [25, 28]     },
    { name: 'Dratini',    dex: 147, catchRate: 45,  baseSpeed: 50,  levels: [15, 20]     },
    { name: 'Dragonair',  dex: 148, catchRate: 45,  baseSpeed: 70,  levels: [20]         },
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

function cumCatch(catchP, fleeP, balls) {
  let total = 0, here = 1;
  for (let i = 0; i < balls; i++) {
    const s = here * (1 - fleeP);
    total += s * catchP;
    here = s * (1 - catchP);
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

// ─── Pokémon dropdown ─────────────────────────────────────────────────────────

function PokemonDropdown({ options, value, onChange, mechanic }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);
  useOutsideClick(ref, () => setOpen(false));

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  const filtered = useMemo(() =>
    q ? options.filter(p => p.name.toLowerCase().includes(q.toLowerCase())) : options,
    [options, q]);

  function pick(p) { onChange(p); setOpen(false); setQ(''); }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => { setOpen(o => !o); setQ(''); }}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, background: '#1f2937', border: '1px solid #374151', borderRadius: 12,
          padding: '10px 14px', cursor: 'pointer', transition: 'border-color 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.borderColor = '#4b5563'}
        onMouseLeave={e => e.currentTarget.style.borderColor = open ? '#10b981' : '#374151'}>
        {value ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0, background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
              <SpriteImg key={value.dex} dex={value.dex} style={{ width: 36, height: 36, objectFit: 'contain' }} />
            </div>
            <div>
              <p style={{ color: '#fff', fontWeight: 700, fontSize: 14, margin: 0, lineHeight: 1.2 }}>{value.name}</p>
              <p style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>
                {mechanic === 'gen1'
                  ? `Lv ${value.levels?.join(', ') ?? '?'} · Speed ${value.baseSpeed}`
                  : `Lv ${value.levels?.join(', ') ?? '?'} · Escape ${value.escapeRate}`}
              </p>
            </div>
          </div>
        ) : (
          <span style={{ color: '#6b7280', fontSize: 14 }}>Choose a Pokémon...</span>
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
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: 8, borderBottom: '1px solid rgba(55,65,81,0.6)' }}>
            <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search..."
              style={{ width: '100%', background: '#111827', border: '1px solid #374151', borderRadius: 8,
                padding: '8px 12px', fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }}
              onKeyDown={e => {
                if (e.key === 'Enter' && filtered[0]) pick(filtered[0]);
                if (e.key === 'Escape') setOpen(false);
              }} />
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 220 }}>
            {filtered.map(p => (
              <button key={p.dex} type="button" onClick={() => pick(p)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 14px', background: value?.dex === p.dex ? '#374151' : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}
                onMouseEnter={e => { if (value?.dex !== p.dex) e.currentTarget.style.background = 'rgba(55,65,81,0.6)'; }}
                onMouseLeave={e => { if (value?.dex !== p.dex) e.currentTarget.style.background = 'transparent'; }}>
                <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0 }}>
                  <SpriteImg dex={p.dex} style={{ width: 32, height: 32, objectFit: 'contain' }} />
                </div>
                <span style={{ color: '#e5e7eb', fontSize: 13, flex: 1 }}>{p.name}</span>
                <span style={{ color: '#6b7280', fontSize: 12 }}>
                  {p.levels ? `Lv ${p.levels.join('/')}` : ''}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-gray-500 text-sm py-4">No results</p>
            )}
          </div>
        </div>
      )}
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

  const [modRate,    setModRate]    = useState(45);
  const [encState,   setEncState]   = useState('neutral'); // 'neutral' | 'angry' | 'eating'
  const [catchStage, setCatchStage] = useState(0);
  const [fleeStage,  setFleeStage]  = useState(0);
  const [ballsLeft,  setBallsLeft]  = useState(30);
  const [active,     setActive]     = useState(false);
  const [log,        setLog]        = useState([]);
  const [prompt,     setPrompt]     = useState(null); // null | 'ball' | 'still-active'

  // RSE interactive state
  const [rseEscapeFactor, setRseEscapeFactor] = useState(3);
  const [rseBalls,        setRseBalls]        = useState(30);

  // Friend Safari interactive state
  const [shinyCount, setShinyCount] = useState(0);

  const game     = SAFARI_GAMES.find(g => g.id === gameId);
  const mechanic = game?.mechanic;

  // ── Probabilities ──────────────────────────────────────────────────────────

  const catchP = useMemo(() => {
    if (!active || !pokemon) return 0;
    if (mechanic === 'gen1') return gen1Catch(modRate);
    if (mechanic === 'gen4') return gen4Catch(pokemon.catchRate ?? 45, catchStage);
    return 0;
  }, [mechanic, active, modRate, pokemon, catchStage]);

  const fleeP = useMemo(() => {
    if (!active || !pokemon) return 0;
    if (mechanic === 'gen1') return gen1Flee(pokemon.baseSpeed ?? 60, level, encState);
    if (mechanic === 'gen4') return gen4Flee(pokemon.escapeRate ?? 90, fleeStage);
    return 0;
  }, [mechanic, active, pokemon, level, encState, fleeStage]);

  const totalP = useMemo(() =>
    active ? cumCatch(catchP, fleeP, ballsLeft) : 0,
    [catchP, fleeP, ballsLeft, active]);

  const baitProj = useMemo(() => {
    if (!active || !pokemon) return null;
    if (mechanic === 'gen1') return {
      c: gen1Catch(Math.max(1, Math.floor(modRate / 2))),
      f: gen1Flee(pokemon.baseSpeed, level, 'eating'),
    };
    // Bait: flee certain −1 stage, catch −1 stage (90% chance) — shows expected outcome
    if (mechanic === 'gen4') return {
      c: gen4Catch(pokemon.catchRate, catchStage - 1),
      f: gen4Flee(pokemon.escapeRate, fleeStage - 1),
    };
    return null;
  }, [mechanic, active, modRate, pokemon, level, catchStage, fleeStage]);

  const rockProj = useMemo(() => {
    if (!active || !pokemon) return null;
    if (mechanic === 'gen1') return {
      c: gen1Catch(Math.min(255, modRate * 2)),
      f: gen1Flee(pokemon.baseSpeed, level, 'angry'),
    };
    // Mud/Rock: catch certain +1 stage, flee +1 stage (90% chance) — shows expected outcome
    if (mechanic === 'gen4') return {
      c: gen4Catch(pokemon.catchRate, catchStage + 1),
      f: gen4Flee(pokemon.escapeRate, fleeStage + 1),
    };
    return null;
  }, [mechanic, active, modRate, pokemon, level, catchStage, fleeStage]);

  const rec = useMemo(() => {
    if (!active) return 'ball';
    if (mechanic === 'gen1') {
      // Rock only when speed is low AND catch rate is poor AND still neutral
      const spd = actualSpeed(pokemon?.baseSpeed ?? 60, level);
      if (spd <= 25 && modRate < 128 && encState === 'neutral') return 'rock';
    }
    if (mechanic === 'gen4') {
      // Mud raises catch (certain) — worthwhile for very low catch rate, first 1-2 throws
      if (catchP < 0.12 && catchStage < 2) return 'rock';
    }
    return 'ball';
  }, [active, mechanic, pokemon, level, modRate, encState, catchP, catchStage]);

  // ── Auto-start ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!game || mechanic === 'rse' || mechanic === 'friend') { setActive(false); return; }
    if (!pokemon) { setActive(false); return; }
    setModRate(pokemon.catchRate ?? 45);
    setEncState('neutral');
    setCatchStage(0); setFleeStage(0);
    setBallsLeft(game.ballCount ?? 30);
    setLevel(pokemon.levels?.[0] ?? 25);
    setLog([]); setPrompt(null);
    setActive(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pokemon?.dex, gameId]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function addLog(msg) { setLog(p => [msg, ...p].slice(0, 10)); }

  function handleBall() {
    if (ballsLeft <= 0) return;
    setBallsLeft(p => p - 1);
    setPrompt('ball');
    addLog(`Ball thrown — ${pct(catchP)} catch · ${pct(fleeP)} flee`);
  }

  function handleCaught() {
    addLog('Caught!');
    setActive(false);
    setPrompt(null);
  }

  function handleMissed() {
    setPrompt(null);
    // Gen 1: after a miss, check if the effect is still active
    if (mechanic === 'gen1' && encState !== 'neutral') {
      setPrompt('still-active');
    }
  }

  function handleStillActive(still) {
    if (!still) {
      if (encState === 'angry') {
        // Rock wears off — catch rate resets to base
        setModRate(pokemon.catchRate);
        addLog('Anger wore off — catch rate reset');
      } else {
        // Bait wears off — catch rate stays halved permanently
        addLog('Eating wore off — catch rate stays halved');
      }
      setEncState('neutral');
    }
    setPrompt(null);
  }

  function handleBait() {
    if (mechanic === 'gen1') {
      const r = Math.max(1, Math.floor(modRate / 2));
      setModRate(r);
      setEncState('eating');
      addLog(`Bait → catch rate ${r} (${pct(gen1Catch(r))})`);
    } else if (mechanic === 'gen4') {
      // Bait: flee certain −1 stage, catch −1 stage (90% chance)
      setCatchStage(p => Math.max(-6, p - 1));
      setFleeStage(p => Math.max(-6, p - 1));
      addLog('Bait → flee −1 stage · catch −1 stage (90% chance)');
    }
  }

  function handleRock() {
    const label = game?.rockLabel ?? 'Rock';
    if (mechanic === 'gen1') {
      const r = Math.min(255, modRate * 2);
      setModRate(r);
      setEncState('angry');
      addLog(`${label} → catch rate ${r} (${pct(gen1Catch(r))})`);
    } else if (mechanic === 'gen4') {
      // Mud/Rock: catch certain +1 stage, flee +1 stage (90% chance)
      setCatchStage(p => Math.min(6, p + 1));
      setFleeStage(p => Math.min(6, p + 1));
      addLog(`${label} → catch +1 stage · flee +1 stage (90% chance)`);
    }
  }

  function handleFled() { addLog('Pokémon fled'); setActive(false); setPokemon(null); }

  function handleGameChange(id) {
    setGameId(id); setPokemon(null); setActive(false); setEncState('neutral');
    setRseEscapeFactor(3); setRseBalls(30); setShinyCount(0);
  }

  const rockLabel = game?.rockLabel ?? 'Rock';
  const hasRock   = game && mechanic !== 'rse' && mechanic !== 'friend' && game.rockLabel;
  const pokeList  = gameId ? (SAFARI_POKEMON[gameId] ?? []) : [];
  const spd       = mechanic === 'gen1' && pokemon ? actualSpeed(pokemon.baseSpeed, level) : null;

  // State pill colors
  const statePill = encState === 'angry'
    ? { bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.4)', color: '#fb923c', label: 'Angry' }
    : encState === 'eating'
    ? { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.4)', color: '#60a5fa', label: 'Eating' }
    : { bg: 'rgba(107,114,128,0.15)', border: 'rgba(107,114,128,0.3)', color: '#9ca3af', label: 'Neutral' };

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
          <PokemonDropdown options={pokeList} value={pokemon} onChange={setPokemon} mechanic={mechanic} />
          {(mechanic === 'gen1' || mechanic === 'gen4') && pokemon?.levels && (
            <div className="flex items-center gap-2.5 mt-2.5 px-0.5 flex-wrap">
              <span className="text-xs text-gray-500 shrink-0">Encounter level</span>
              <div className="flex gap-1.5 flex-wrap">
                {pokemon.levels.map(lv => (
                  <button key={lv} type="button"
                    onClick={mechanic === 'gen1' ? () => setLevel(lv) : undefined}
                    style={{ padding: '4px 14px', borderRadius: 99, fontSize: 13, fontWeight: 700,
                      cursor: mechanic === 'gen1' ? 'pointer' : 'default',
                      border: '1px solid', transition: 'all 0.1s',
                      background: mechanic === 'gen1' && level === lv ? '#059669' : 'transparent',
                      borderColor: mechanic === 'gen1' && level === lv ? '#059669' : '#374151',
                      color: mechanic === 'gen1' && level === lv ? '#fff' : '#9ca3af' }}>
                    {lv}
                  </button>
                ))}
              </div>
              {mechanic === 'gen1' && spd != null && (
                <span className="text-xs text-gray-600 shrink-0">~{spd} spd</span>
              )}
              {mechanic === 'gen4' && (
                <span className="text-xs text-gray-600 shrink-0">level doesn't affect odds</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Encounter card ────────────────────────────────────────────────── */}
      {active && (
        <div className="mt-5 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">

          {/* Identity */}
          <div className="flex items-center gap-4 p-5 pb-4 bg-gray-800/60 border-b border-gray-800">
            <div className="w-[72px] h-[72px] flex items-center justify-center bg-black/30 rounded-[14px] shrink-0">
              {pokemon?.dex && <SpriteImg key={pokemon.dex} dex={pokemon.dex} style={{ width: 64, height: 64, objectFit: 'contain', imageRendering: 'pixelated' }} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xl font-extrabold text-white mb-1.5 leading-none">
                {pokemon?.name}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                  style={{ background: statePill.bg, border: `1px solid ${statePill.border}`, color: statePill.color }}>
                  {statePill.label}
                </span>
                {mechanic === 'gen4' && catchStage !== 0 && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                    style={{
                      background: catchStage > 0 ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                      border: `1px solid ${catchStage > 0 ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`,
                      color: catchStage > 0 ? '#34d399' : '#f87171',
                    }}>
                    Catch {catchStage > 0 ? '+' : ''}{catchStage}
                  </span>
                )}
                {mechanic === 'gen4' && fleeStage !== 0 && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                    style={{
                      background: fleeStage < 0 ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                      border: `1px solid ${fleeStage < 0 ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`,
                      color: fleeStage < 0 ? '#34d399' : '#f87171',
                    }}>
                    Flee {fleeStage > 0 ? '+' : ''}{fleeStage}
                  </span>
                )}
              </div>
            </div>
            <div className="text-center shrink-0">
              <p className="text-[34px] font-black leading-none tabular-nums text-white">
                {ballsLeft}
              </p>
              <p className="text-[11px] text-gray-600 mt-0.5 uppercase tracking-[0.08em]">balls</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 border-b border-gray-800">
            {[
              { label: 'Catch / ball', v: catchP, color: catchColor(catchP) },
              { label: 'Flee / turn',  v: fleeP,  color: fleeColor(fleeP)   },
            ].map(({ label, v, color }, i) => (
              <div key={i} className={`text-center py-5 px-4${i === 0 ? ' border-r border-gray-800' : ''}`}>
                <p className="text-[11px] uppercase tracking-widest text-gray-600 mb-1.5">{label}</p>
                <p className="text-[38px] font-black leading-none tabular-nums" style={{ color }}>{pct(v)}</p>
              </div>
            ))}
          </div>

          {/* Est. total strip */}
          <div className="text-center py-2 px-4 border-b border-gray-800 bg-black/20">
            <span className="text-xs text-gray-600">
              Est. catch with {ballsLeft} ball{ballsLeft !== 1 ? 's' : ''}:{' '}
              <span className="font-bold" style={{ color: catchColor(totalP) }}>{pct(totalP)}</span>
            </span>
          </div>

          {/* Actions / prompts */}
          <div className="p-4">

            {prompt === 'ball' ? (
              <div>
                <p className="text-gray-400 text-sm text-center mb-3">
                  Did the ball catch it?
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <button onClick={handleCaught}
                    style={{ padding: '16px 0', borderRadius: 12, background: '#059669',
                      border: 'none', color: '#fff', fontSize: 16, fontWeight: 700,
                      cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#10b981'}
                    onMouseLeave={e => e.currentTarget.style.background = '#059669'}>
                    Caught! ✓
                  </button>
                  <button onClick={handleMissed}
                    style={{ padding: '16px 0', borderRadius: 12, background: '#374151',
                      border: 'none', color: '#fff', fontSize: 16, fontWeight: 700,
                      cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#4b5563'}
                    onMouseLeave={e => e.currentTarget.style.background = '#374151'}>
                    Broke free
                  </button>
                </div>
              </div>
            ) : prompt === 'still-active' ? (
              <div>
                <p className="text-gray-400 text-sm text-center mb-3">
                  Is the Pokémon still{' '}
                  <span className="font-bold" style={{ color: encState === 'angry' ? '#fb923c' : '#60a5fa' }}>
                    {encState}
                  </span>?
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <button onClick={() => handleStillActive(true)}
                    style={{ padding: '16px 0', borderRadius: 12, background: '#374151',
                      border: 'none', color: '#fff', fontSize: 15, fontWeight: 700,
                      cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#4b5563'}
                    onMouseLeave={e => e.currentTarget.style.background = '#374151'}>
                    Still {encState}
                  </button>
                  <button onClick={() => handleStillActive(false)}
                    style={{ padding: '16px 0', borderRadius: 12, background: '#1f2937',
                      border: '1px solid #374151', color: '#9ca3af', fontSize: 15, fontWeight: 700,
                      cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#374151'}
                    onMouseLeave={e => e.currentTarget.style.background = '#1f2937'}>
                    Wore off
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">

                {/* Primary action — Ball (or rock if rec) */}
                {rec === 'ball' ? (
                  <button onClick={handleBall} disabled={ballsLeft <= 0}
                    style={{ width: '100%', padding: '16px 20px', borderRadius: 14,
                      background: ballsLeft <= 0 ? '#374151' : '#059669',
                      border: 'none', cursor: ballsLeft <= 0 ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      transition: 'background 0.15s', opacity: ballsLeft <= 0 ? 0.5 : 1 }}
                    onMouseEnter={e => { if (ballsLeft > 0) e.currentTarget.style.background = '#10b981'; }}
                    onMouseLeave={e => { if (ballsLeft > 0) e.currentTarget.style.background = '#059669'; }}>
                    <div style={{ textAlign: 'left' }}>
                      <p style={{ color: '#fff', fontSize: 16, fontWeight: 800, margin: 0 }}>Throw Ball</p>
                      <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: '2px 0 0' }}>
                        {pct(catchP)} catch · {pct(fleeP)} flee
                      </p>
                    </div>
                    <span style={{ color: '#6ee7b7', fontSize: 11, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.1em',
                      background: 'rgba(0,0,0,0.2)', padding: '4px 10px', borderRadius: 99 }}>
                      ✓ Best
                    </span>
                  </button>
                ) : (
                  <button onClick={handleBall} disabled={ballsLeft <= 0}
                    style={{ width: '100%', padding: '14px 20px', borderRadius: 14,
                      background: '#1f2937', border: '1px solid #374151', cursor: ballsLeft <= 0 ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      transition: 'background 0.15s', opacity: ballsLeft <= 0 ? 0.5 : 1 }}
                    onMouseEnter={e => { if (ballsLeft > 0) e.currentTarget.style.background = '#374151'; }}
                    onMouseLeave={e => { if (ballsLeft > 0) e.currentTarget.style.background = '#1f2937'; }}>
                    <span style={{ color: '#e5e7eb', fontSize: 15, fontWeight: 700 }}>Throw Ball</span>
                    <span style={{ color: '#9ca3af', fontSize: 13 }}>{pct(catchP)} catch · {pct(fleeP)} flee</span>
                  </button>
                )}

                {/* Secondary actions — Bait + Rock/Mud */}
                <div style={{ display: 'grid', gridTemplateColumns: hasRock ? '1fr 1fr' : '1fr', gap: 10 }}>
                  {/* Bait */}
                  {(() => {
                    const isRec = rec === 'bait';
                    const proj  = baitProj;
                    const catchBetter = proj ? proj.c > catchP : false;
                    const fleeBetter  = proj ? proj.f < fleeP  : false;
                    return (
                      <button onClick={handleBait}
                        style={{ padding: '14px 14px', borderRadius: 14, textAlign: 'left', cursor: 'pointer',
                          background: isRec ? 'rgba(5,150,105,0.12)' : '#1f2937',
                          border: `1px solid ${isRec ? 'rgba(16,185,129,0.4)' : '#374151'}`,
                          transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = isRec ? 'rgba(5,150,105,0.2)' : '#374151'}
                        onMouseLeave={e => e.currentTarget.style.background = isRec ? 'rgba(5,150,105,0.12)' : '#1f2937'}>
                        <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700,
                          color: isRec ? '#34d399' : '#e5e7eb' }}>
                          {isRec && '✓ '}Bait
                        </p>
                        {proj && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={{ fontSize: 12, color: catchBetter ? '#34d399' : '#f87171' }}>
                              Catch {pct(proj.c)} {catchBetter ? '↑' : '↓'}
                            </span>
                            <span style={{ fontSize: 12, color: fleeBetter ? '#34d399' : '#f87171' }}>
                              Flee {pct(proj.f)} {fleeBetter ? '↓' : '↑'}
                            </span>
                          </div>
                        )}
                        {mechanic === 'gen4' && (
                          <p style={{ color: '#4b5563', fontSize: 11, margin: '6px 0 0' }}>
                            Flee −1 (certain) · Catch −1 (90%)
                          </p>
                        )}
                      </button>
                    );
                  })()}

                  {/* Rock / Mud */}
                  {hasRock && (() => {
                    const isRec = rec === 'rock';
                    const proj  = rockProj;
                    const catchBetter = proj ? proj.c > catchP : false;
                    const fleeBetter  = proj ? proj.f < fleeP  : false;
                    return (
                      <button onClick={handleRock}
                        style={{ padding: isRec ? '14px 20px' : '14px 14px', borderRadius: 14, textAlign: 'left',
                          cursor: 'pointer',
                          background: isRec ? '#059669' : '#1f2937',
                          border: `1px solid ${isRec ? '#059669' : '#374151'}`,
                          transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = isRec ? '#10b981' : '#374151'}
                        onMouseLeave={e => e.currentTarget.style.background = isRec ? '#059669' : '#1f2937'}>
                        <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700,
                          color: isRec ? '#fff' : '#e5e7eb' }}>
                          {isRec && '✓ '}{rockLabel}
                        </p>
                        {proj && !isRec && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={{ fontSize: 12, color: catchBetter ? '#34d399' : '#f87171' }}>
                              Catch {pct(proj.c)} {catchBetter ? '↑' : '↓'}
                            </span>
                            <span style={{ fontSize: 12, color: fleeBetter ? '#34d399' : '#f87171' }}>
                              Flee {pct(proj.f)} {fleeBetter ? '↓' : '↑'}
                            </span>
                          </div>
                        )}
                        {isRec && proj && (
                          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0 }}>
                            {pct(proj.c)} catch · {pct(proj.f)} flee
                          </p>
                        )}
                        {mechanic === 'gen4' && (
                          <p style={{ color: isRec ? 'rgba(255,255,255,0.5)' : '#4b5563', fontSize: 11, margin: '6px 0 0' }}>
                            Catch +1 (certain) · Flee +1 (90%)
                          </p>
                        )}
                      </button>
                    );
                  })()}
                </div>

                {/* Fled */}
                <button onClick={handleFled}
                  className="w-full py-2.5 rounded-xl border border-gray-700 text-gray-500 text-sm transition-all hover:border-red-400/40 hover:text-red-400 hover:bg-red-400/5">
                  Pokémon fled
                </button>

                {/* Gen 1 bait warning */}
                {mechanic === 'gen1' && encState === 'eating' && (
                  <p className="text-xs text-center text-yellow-600 mt-1">
                    Note: Catch rate stays halved even after bait wears off.
                  </p>
                )}
              </div>
            )}

            {/* Log */}
            {log.length > 0 && (
              <div className="mt-3.5 pt-3 border-t border-gray-800">
                {log.map((msg, i) => (
                  <p key={i} className="text-xs leading-tight mb-0.5"
                    style={{ color: i === 0 ? '#6b7280' : '#374151' }}>{msg}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
