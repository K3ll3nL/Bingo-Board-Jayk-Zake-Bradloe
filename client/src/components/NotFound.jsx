import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ACCENT, TEXT } from '../constants/theme';
import PageHeader from './PageHeader';

// Shiny Unown "?" (form 27) — the same R2 sprite set every board tile uses.
const UNOWN_QUESTION = 'https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev/poke_capture_0201_027_uk_n_00000000_f_r.png';

// Shared by the unknown-URL page and Profile's "no such hunter" state.
// `detail` is what the visitor asked for (a path, a name), shown so they can
// spot their own typo. `secondary` is an optional { to, label } outlined link.
export const NotFoundPanel = ({ title, detail, secondary }) => {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · Pokeboard.net`;
    return () => { document.title = prev; };
  }, [title]);

  return (
    <main className="max-w-md mx-auto px-4 pt-10 pb-6 flex flex-col items-center text-center">
      <img src={UNOWN_QUESTION} alt="" width={176} height={176}
           className="w-44 h-44 object-contain select-none"
           style={{ filter: 'drop-shadow(0 12px 24px rgba(18,191,206,0.25))' }} />
      <h1 className="mt-4 text-2xl font-bold" style={{ color: TEXT.strong }}>{title}</h1>
      {detail && <p className="mt-2 text-sm font-mono break-all" style={{ color: TEXT.faint }}>{detail}</p>}
      <div className="mt-6 w-full flex gap-2">
        {secondary && (
          <Link to={secondary.to}
                className="flex-1 flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-white/[0.06]"
                style={{ boxShadow: `inset 0 0 0 1px ${ACCENT.strong}`, color: ACCENT.base }}>
            {secondary.label}
          </Link>
        )}
        <Link to="/"
              className="flex-1 flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors"
              style={{ background: ACCENT.strong, color: TEXT.strong }}
              onMouseEnter={e => { e.currentTarget.style.background = ACCENT.base; }}
              onMouseLeave={e => { e.currentTarget.style.background = ACCENT.strong; }}>
          Back to the board
        </Link>
      </div>
    </main>
  );
};

const NotFound = () => {
  const { pathname } = useLocation();
  return (
    <>
      {/* PageHeader never clears on unmount, so without this the previous page's title would linger in the bar. */}
      <PageHeader title="Not found" />
      <NotFoundPanel title="Page not found" detail={pathname} />
    </>
  );
};

export default NotFound;
