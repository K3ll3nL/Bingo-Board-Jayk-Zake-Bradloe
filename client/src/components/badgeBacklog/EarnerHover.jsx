import React, { useState } from 'react';
import { C, Avatar } from './ui';
import { earnersAt } from './sim';

// Wraps a count: hover, focus or tap lists the hunters who would earn the badge.
export default function EarnerHover({ sim, threshold, hunters, children }) {
  const [open, setOpen] = useState(false);
  const ids = earnersAt(sim, threshold);
  if (!ids) return children;
  const byId = new Map((hunters || []).map(h => [h.id, h]));
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }} onBlur={() => setOpen(false)}>
      {children}
      {open && (
        <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-40 w-52 max-h-64 overflow-y-auto rounded-xl border p-2 text-left shadow-2xl cursor-default"
          style={{ background: C.card, borderColor: C.border }}>
          {ids.length === 0
            ? <span className="block text-xs text-gray-500 px-1 py-0.5">Nobody yet</span>
            : ids.map(id => {
              const h = byId.get(id) || { id, name: 'Hunter' };
              return (
                <span key={id} className="flex items-center gap-2 px-1 py-0.5 min-w-0">
                  <Avatar user={h} size={18} /><span className="text-xs text-gray-200 truncate">{h.name}</span>
                </span>
              );
            })}
        </span>
      )}
    </span>
  );
}
