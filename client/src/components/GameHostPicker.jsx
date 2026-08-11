import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';
import alphaIcon from '../Icons/alpha.png';

// Step 1 of the hosting flow: pick which game to host. Only Shiny Jeopardy
// exists today, but this stays the single entry point so a second game type
// never needs a new "how do I host" surface built from scratch.
const GAME_TYPES = [
  {
    id: 'jeopardy',
    name: 'Shiny Jeopardy',
    tags: 'Team · Multiplayer',
    description: 'Race to claim the square matching a shiny you caught. Points by row, with a steal mechanic on PLA/PLZA boards.',
    createPath: '/games/jeopardy',
  },
];

export default function GameHostPicker() {
  const { isModerator } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isModerator === false) navigate('/');
  }, [isModerator]);

  return (
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />
      <PageHeader title="Host a Game" subtitle="Pick what you want to run" badge="mod" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6">
        <Link
          to="/games"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-strong transition-colors mb-4"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Shiny Games
        </Link>

        <div
          className="grid gap-3 sm:gap-4 max-w-4xl"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
        >
          {GAME_TYPES.map(type => (
            <Link
              key={type.id}
              to={type.createPath}
              className="min-w-0 overflow-hidden flex items-start gap-3 rounded-xl px-4 py-4 sm:px-5 sm:py-5 border border-accent-strong bg-accent-strong/10 text-left transition-all duration-150 hover:brightness-110 hover:scale-[1.02] active:scale-[0.99]"
            >
              <img src={alphaIcon} alt="" className="w-6 h-6 object-contain shrink-0 mt-0.5" draggable="false" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-strong">{type.name}</p>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-faint">{type.tags}</span>
                </div>
                <p className="text-xs text-muted leading-snug mt-0.5">{type.description}</p>
              </div>
            </Link>
          ))}

          <div className="min-w-0 overflow-hidden flex items-center justify-center rounded-xl px-4 py-4 sm:px-5 sm:py-5 border border-dashed border-hairline">
            <p className="text-xs text-faint text-center">More games coming soon</p>
          </div>
        </div>
      </div>
    </div>
  );
}
