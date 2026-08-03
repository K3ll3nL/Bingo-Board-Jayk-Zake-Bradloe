import React from 'react';

// Shared line-icon set for Month Statistics — replaces the emoji this page
// used for Hunter Spotlight categories, the Month Champion trophy, and the
// empty-state calendar. Emoji render as a different glyph (sometimes a
// different *meaning*) per OS/browser/font, so nothing here is emoji; every
// icon is a plain stroke path on the same 24x24 grid, 2px round-capped
// stroke, no fill — the exact convention AchievementIcon.jsx already
// established elsewhere in this app. Add new icons here rather than
// reaching for a glyph inline.
const PATHS = {
  // Hot Streak — flame
  hot_streak: (
    <path d="M12 2c-1 3-4 5-4 9a4 4 0 008 0c0-1-.4-2-1-2.6.1 1.6-.7 2.6-1.5 2.6a1.8 1.8 0 01-1.8-1.8c0-2.2 1.8-3.6 1.8-5.7C13 3.8 12.6 3 12 2z" />
  ),
  // Most Improved — rising trend line with an arrowhead
  most_improved: (
    <>
      <polyline points="3 17 9 11 13 15 21 6" />
      <polyline points="15 6 21 6 21 12" />
    </>
  ),
  // Consistently Elite — crown
  consistent: (
    <polygon points="4 18 4 9 8 14 12 6 16 14 20 9 20 18" />
  ),
  // Range Rider — globe (breadth across games)
  range_rider: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </>
  ),
  // Newcomer — sprout
  newcomer: (
    <>
      <path d="M12 21v-9" />
      <path d="M12 12c0-4 3-6.5 7-6.5-.3 4-3.2 6.5-7 6.5z" />
      <path d="M12 15c0-3-2.2-5-5.5-5C6.8 13 9 15 12 15z" />
    </>
  ),
  // Comeback Champion — a fall then a sharp climb, arrowhead at the peak
  comeback_champion: (
    <>
      <polyline points="3 8 9 16 21 4" />
      <polyline points="15 4 21 4 21 10" />
    </>
  ),
  // Iron Hunter — shield
  iron_hunter: (
    <path d="M12 3l7 3v5c0 5-3.2 8.5-7 10-3.8-1.5-7-5-7-10V6l7-3z" />
  ),
  // Month Champion — trophy
  trophy: (
    <>
      <path d="M8 4h8v4a4 4 0 01-8 0V4z" />
      <path d="M8 5H5.5A2.5 2.5 0 008 7.5" />
      <path d="M16 5h2.5A2.5 2.5 0 0116 7.5" />
      <line x1="12" y1="12" x2="12" y2="17" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="17" x2="12" y2="20" />
    </>
  ),
  // Empty-state calendar
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </>
  ),
};

// Fallback so an unmapped `name` still renders something (a plain circle)
// instead of an empty box.
const FALLBACK = <circle cx="12" cy="12" r="8" />;

const StatIcon = ({ name, className = 'w-5 h-5', style }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
  >
    {PATHS[name] || FALLBACK}
  </svg>
);

export default StatIcon;
