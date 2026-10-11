import React, { useEffect, useState } from 'react';
import { getDevView, setDevView } from '../devView';
import { SURFACE, BORDER, TEXT, ACCENT } from '../constants/theme';

// DEV ONLY — see devView.js. Floating, bottom-left, so it never sits over the
// header or the board. Hunter and New are real accounts picked by
// GET /api/dev/personas; their avatars are the buttons.

const Face = ({ src, fallback }) => (
  src
    ? <img src={src} alt="" draggable={false} className="w-6 h-6 rounded-full object-cover" />
    : <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ background: 'rgba(255,255,255,0.08)', color: TEXT.muted }}>{fallback}</span>
);

const Glyph = ({ d }) => (
  <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  </span>
);

const SHIELD = 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z';
const DOOR = 'M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3';

const DevViewSwitcher = () => {
  const view = getDevView();
  const [personas, setPersonas] = useState(null);

  useEffect(() => {
    fetch('/api/dev/personas').then(r => (r.ok ? r.json() : null)).then(setPersonas).catch(() => setPersonas(null));
  }, []);

  const options = [
    { key: 'me', label: 'Mod', icon: <Glyph d={SHIELD} />, view: { mode: 'me' } },
    personas?.hunter && {
      key: personas.hunter.id, label: 'Hunter', title: personas.hunter.name,
      icon: <Face src={personas.hunter.avatar_url} fallback="H" />,
      view: { mode: 'as', userId: personas.hunter.id, name: personas.hunter.name },
    },
    personas?.newcomer && {
      key: personas.newcomer.id, label: 'New', title: personas.newcomer.name,
      icon: <Face src={personas.newcomer.avatar_url} fallback="N" />,
      view: { mode: 'as', userId: personas.newcomer.id, name: personas.newcomer.name },
    },
    { key: 'out', label: 'Signed out', icon: <Glyph d={DOOR} />, view: { mode: 'out' } },
  ].filter(Boolean);

  const activeKey = view.mode === 'as' ? view.userId : view.mode;

  return (
    <div className="fixed bottom-3 left-3 z-[60] flex items-center gap-1 rounded-full border p-1 shadow-xl"
         style={{ background: SURFACE.card, borderColor: BORDER.edge }}
         aria-label="Dev: view as">
      <span className="px-2 text-[10px] font-bold" style={{ color: TEXT.faint }}>DEV</span>
      {options.map(o => {
        const active = o.key === activeKey;
        return (
          <button key={o.key} type="button" title={o.title ? `${o.label}: ${o.title}` : o.label}
                  onClick={() => { if (!active) setDevView(o.view); }}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-full py-0.5 pl-0.5 pr-2.5 text-xs font-semibold transition-colors"
                  style={{
                    background: active ? ACCENT.strong : 'transparent',
                    color: active ? TEXT.strong : TEXT.muted,
                    opacity: active ? 1 : 0.85,
                  }}>
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
};

export default DevViewSwitcher;
