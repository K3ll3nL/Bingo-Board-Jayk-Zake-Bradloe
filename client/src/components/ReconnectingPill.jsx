import React from 'react';

// Subtle floating status pill shown while a background auto-retry is trying
// to recover from a transient API/Supabase outage. Overlaid on the skeleton
// so the layout stays intact instead of collapsing to a red error message.
const ReconnectingPill = ({ label = 'Reconnecting…' }) => (
  <div
    className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg pointer-events-none"
    style={{
      background: 'rgba(20,22,28,0.85)',
      border: '1px solid rgba(250,204,21,0.35)',
      color: '#fbbf24',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
    }}
  >
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-70 animate-ping" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400" />
    </span>
    {label}
  </div>
);

export default ReconnectingPill;
