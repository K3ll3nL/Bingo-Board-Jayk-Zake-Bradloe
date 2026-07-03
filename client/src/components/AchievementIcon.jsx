import React from 'react';
import restrictedIcon from '../Icons/restricted-icon.png';

const RESTRICTED_BG = '#78150a';
const RESTRICTED_BADGE_BG = '#1a0302';

// Restricted badge pinned to the top-right corner of restricted icons
// responsive: true = small on mobile, larger on sm+; otherwise uses large/xl props for fixed size
const RestrictedBadge = ({ large, xl, responsive }) => (
  <div
    className={`absolute rounded-full flex items-center justify-center ${
      responsive ? 'w-4 h-4 -top-1.5 -right-1.5 sm:w-6 sm:h-6 sm:-top-2 sm:-right-2' :
      xl         ? 'w-6 h-6 -top-2 -right-2' :
      large      ? 'w-4 h-4 -top-1.5 -right-1.5' :
                   'w-3 h-3 -top-1 -right-1'
    }`}
    style={{ backgroundColor: RESTRICTED_BADGE_BG, border: '1.5px solid rgba(255,255,255,0.2)' }}
  >
    <img src={restrictedIcon} alt=""
      className={`object-contain ${
        responsive ? 'w-2.5 h-2.5 sm:w-5 sm:h-5' :
        xl         ? 'w-5 h-5' :
        large      ? 'w-2.5 h-2.5' : 'w-2 h-2'
      }`} />
  </div>
);

// The achievement-type SVG
const AchievementSvg = ({ type, className }) => {
  if (type === 'row') return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16" />
    </svg>
  );
  if (type === 'column') return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16" />
    </svg>
  );
  if (type === 'x') return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
  if (type === 'blackout') return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M3 7.2h18M3 10.2h18M3 13.8h18M3 16.8h18" />
      <path d="M7.2 3v18M10.2 3v18M13.8 3v18M16.8 3v18" />
    </svg>
  );
  if (type === 'personal_blackout') return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <text x="12" y="13" textAnchor="middle" dominantBaseline="central"
        fontSize="11" fontWeight="700" fill="currentColor" stroke="none"
        fontFamily="ui-sans-serif, system-ui, sans-serif">PB</text>
    </svg>
  );
  // Fallback: star
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
};

/**
 * AchievementIcon — shared component for all bingo achievement icons.
 *
 * Props:
 *   type              'row' | 'column' | 'x' | 'blackout'
 *   restricted        boolean — renders #78150a bg, dashed stroke, restricted badge
 *   claimed           boolean — false renders gray/unclaimed style (BingoBoard use)
 *   color             hex bg color for claimed non-restricted icons (default #9147ff)
 *   containerClassName  Tailwind size + any extra classes for the outer div
 *   svgClassName        Tailwind size classes for the inner SVG
 */
const AchievementIcon = ({
  type,
  restricted = false,
  claimed = true,
  color = '#9147ff',
  containerClassName = 'w-5 h-5',
  svgClassName = 'w-3 h-3',
}) => {
  // Detect responsive containers (e.g. "w-8 sm:w-14") — use CSS-based responsive badge sizing
  const isResponsive = /\bsm:w-\d+\b/.test(containerClassName);
  const isXL    = !isResponsive && /\bw-(12|14|16|20|24)\b/.test(containerClassName);
  const isLarge = !isResponsive && !isXL && /\bw-9\b/.test(containerClassName);
  const bgColor = !claimed ? undefined : restricted ? RESTRICTED_BG : color;
  const containerBgClass = !claimed ? 'bg-gray-700' : '';

  return (
    <div
      className={`relative rounded flex items-center justify-center flex-shrink-0 ${containerClassName} ${containerBgClass}`}
      style={bgColor ? { backgroundColor: bgColor } : undefined}
    >
      <AchievementSvg
        type={type}
        className={`${svgClassName} ${claimed ? 'text-white' : 'text-gray-500'}`}
      />
      {restricted && <RestrictedBadge large={isLarge} xl={isXL} responsive={isResponsive} />}
    </div>
  );
};

export default AchievementIcon;
