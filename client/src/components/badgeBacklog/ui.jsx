import React from 'react';
import { getAuthHeaders } from '../../services/api';

export const C = {
  card:   '#1a1c23',
  inner:  '#13151a',
  border: 'rgba(255,255,255,0.07)',
  input:  '#0d0f14',
  yes:    '#4ade80',
  no:     '#e2553f',
  amber:  '#f5b942',
};

// JSON (or FormData) call that throws the server's error message.
export async function api(path, { method = 'GET', body } = {}) {
  const headers = await getAuthHeaders();
  const isForm = body instanceof FormData;
  if (isForm) delete headers['Content-Type'];
  const res = await fetch(path, {
    method,
    headers: isForm ? { Authorization: headers.Authorization } : headers,
    body: body == null ? undefined : isForm ? body : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw Object.assign(new Error(data?.error || `Request failed (${res.status})`), { status: res.status, data });
  return data;
}

export function Avatar({ user, size = 20, ring, title, className = '', style }) {
  const s = { width: size, height: size, ...(ring ? { boxShadow: `0 0 0 2px ${ring}` } : {}), ...style };
  const name = user?.name || '?';
  return user?.avatar_url
    ? <img src={user.avatar_url} alt="" title={title ?? name} className={`rounded-full object-cover shrink-0 ${className}`} style={s} />
    : <span title={title ?? name} className={`rounded-full shrink-0 inline-flex items-center justify-center bg-gray-700 text-white font-bold ${className}`}
        style={{ ...s, fontSize: size * 0.45 }}>{name[0]?.toUpperCase()}</span>;
}

// Small stroke icons (24-unit viewBox).
const PATHS = {
  grip:    'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  user:    'M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 19v-1a4 4 0 0 0-3-3.9M15 4.1a3 3 0 0 1 0 5.8',
  chat:    'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  wrench:  'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z',
  check:   'M5 12l5 5L20 7',
  x:       'M6 6l12 12M18 6L6 18',
  plus:    'M12 5v14M5 12h14',
  minus:   'M5 12h14',
  edit:    'M4 20h4L19 9l-4-4L4 16v4z',
  upload:  'M12 16V4M7 9l5-5 5 5M4 20h16',
  trash:   'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  arrow:   'M5 12h14M13 6l6 6-6 6',
  layers:  'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  target:  'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  clock:   'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  send:    'M4 12l16-8-6 16-3-7-7-1z',
  stamp:   'M9 11V6a3 3 0 0 1 6 0v5l3 3H6l3-3zM5 18h14v3H5z',
  calendar:'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  trophy:  'M8 4h8v5a4 4 0 0 1-8 0V4zM6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3M12 13v4M8 21h8M9 17h6v4H9z',
  grid:    'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  inbox:   'M4 13h4l2 3h4l2-3h4M4 13l2-8h12l2 8v6H4z',
  ban:     'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM6 6l12 12',
  star:    'M12 3l2.7 5.6 6.3.9-4.5 4.4 1 6.1L12 17l-5.5 3 1-6.1L3 9.5l6.3-.9L12 3z',
  cake:    'M4 21h16v-8H4zM4 15c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 4 0M12 13V9M12 6V5',
  shield:  'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z',
  eye:     'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff:  'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
};

export function Icon({ name, size = 16, className = '', strokeWidth = 2, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} style={style} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Alert({ type = 'error', children, onClose }) {
  const cls = type === 'error' ? 'text-red-300 bg-red-900/20 border-red-700/50'
    : type === 'success' ? 'text-green-300 bg-green-900/20 border-green-700/50'
    : 'text-blue-300 bg-blue-900/20 border-blue-700/50';
  return (
    <div className={`rounded-lg px-3 py-2 text-sm border flex items-start gap-2 ${cls}`}>
      <span className="flex-1 min-w-0">{children}</span>
      {onClose && <button onClick={onClose} className="opacity-60 hover:opacity-100" aria-label="Dismiss"><Icon name="x" size={14} /></button>}
    </div>
  );
}

export const inputCls = 'w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 border focus:border-lagoon-500 focus:outline-none transition-colors';
export const inputStyle = { background: C.input, borderColor: C.border };

export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
