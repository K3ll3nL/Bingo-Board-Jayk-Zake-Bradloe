import React, { useEffect, useRef, useState } from 'react';
import { C, api, Avatar, Icon, Alert, inputCls, inputStyle, timeAgo } from './ui';
import { countAt, CODE_STATUS, TIER_COLORS, FIXED_CHECKS, PERCENT_CHECKS } from './sim';
import WiringPanel from './WiringPanel';

export function thresholdLabel(p, value) {
  if (FIXED_CHECKS.has(p.check_type)) return null;
  if (value == null || value === '') return '—';
  const v = Number(value);
  if (p.sim?.direction === 'lte') return `top ${v}`;
  return `≥ ${v}${PERCENT_CHECKS.has(p.check_type) ? '%' : ''}`;
}

// ── Tier tile ─────────────────────────────────────────────────────────────────

export function TierTile({ p, tier, color, selected, onClick, size = 64 }) {
  const count = countAt(p.sim, tier.threshold);
  const total = p.sim?.total_users || 0;
  const label = thresholdLabel(p, tier.threshold);
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={`group flex flex-col items-center gap-1 shrink-0 rounded-xl p-1 transition-colors ${selected ? 'bg-white/[0.06]' : onClick ? 'hover:bg-white/[0.03]' : ''}`}
      style={{ width: size + 16 }}>
      <div className="relative rounded-xl flex items-center justify-center overflow-hidden"
        style={{
          width: size, height: size,
          background: C.input,
          border: tier.image_url ? `2px solid ${color}` : `2px dashed ${color}66`,
        }}>
        {tier.image_url
          ? <img src={tier.image_url} alt={tier.name} className="w-full h-full object-contain" />
          : <span className="font-black" style={{ color: `${color}aa`, fontSize: size * 0.42 }}>?</span>}
        {tier.badge_id && (
          <span className="absolute bottom-0.5 right-0.5 rounded-full bg-green-500 text-black p-0.5"><Icon name="check" size={9} strokeWidth={4} /></span>
        )}
      </div>
      <span className={`text-[11px] leading-tight w-full truncate text-center ${tier.name ? 'text-gray-300' : 'text-gray-600 italic'}`}>
        {tier.name || `Tier ${tier.tier_order}`}
      </span>
      {label && <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>{label}</span>}
          <span className="flex items-center gap-1 text-[11px] tabular-nums" title={count == null ? 'Not wired yet' : `${count} of ${total} hunters`}>
            <Icon name="user" size={11} className="text-gray-500" />
            <span className={count == null ? 'text-gray-600' : 'text-white font-semibold'}>{count ?? '?'}</span>
          </span>
          <span className="block h-1 rounded-full bg-white/[0.06] overflow-hidden" style={{ width: size }}>
            <span className="block h-full rounded-full" style={{ width: count != null && total ? `${Math.max(count ? 4 : 0, (count / total) * 100)}%` : 0, background: color }} />
          </span>
    </button>
  );
}

// ── Tier editor (copy + art: any mod; threshold: by vote) ─────────────────────

function TierEditor({ p, tier, color, onChanged, onOpenChange, openVote }) {
  const [form, setForm] = useState({ name: tier.name || '', description: tier.description || '', hint: tier.hint || '' });
  const [threshold, setThreshold] = useState(tier.threshold ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);
  const editable = p.status === 'open' && !tier.badge_id;
  const fixed = FIXED_CHECKS.has(p.check_type);

  useEffect(() => {
    setForm({ name: tier.name || '', description: tier.description || '', hint: tier.hint || '' });
    setThreshold(tier.threshold ?? '');
  }, [tier.id, tier.name, tier.description, tier.hint, tier.threshold]);

  const saveField = async (k) => {
    if ((tier[k] || '') === form[k]) return;
    try { await api(`/api/admin/backlog/${p.id}/tiers/${tier.id}`, { method: 'PATCH', body: { [k]: form[k] } }); onChanged(); }
    catch (e) { setErr(e.message); }
  };

  const uploadArt = async (file) => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const body = new FormData();
      body.append('image', file);
      await api(`/api/admin/backlog/${p.id}/tiers/${tier.id}/art`, { method: 'PUT', body });
      onChanged();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const from = countAt(p.sim, tier.threshold);
  const to = countAt(p.sim, threshold);
  const changed = threshold !== '' && Number(threshold) !== Number(tier.threshold ?? NaN);

  return (
    <div className="rounded-xl border p-3 mt-2 min-w-0" style={{ borderColor: `${color}55`, background: C.inner }}>
      <div className="flex flex-col sm:flex-row gap-3 min-w-0">
        <div className="flex sm:flex-col items-center gap-2 shrink-0">
          <div className="w-24 h-24 rounded-xl flex items-center justify-center overflow-hidden"
            style={{ background: C.input, border: tier.image_url ? `2px solid ${color}` : `2px dashed ${color}66` }}>
            {tier.image_url
              ? <img src={tier.image_url} alt="" className="w-full h-full object-contain" />
              : <span className="text-4xl font-black" style={{ color: `${color}aa` }}>?</span>}
          </div>
          {editable && (
            <label className={`inline-flex items-center gap-1.5 cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${busy ? 'opacity-50' : 'text-lagoon-300 border-lagoon-500/40 hover:bg-lagoon-500/10'}`}>
              <Icon name="upload" size={13} />{busy ? 'Uploading…' : tier.image_url ? 'Replace' : 'Upload PNG'}
              <input ref={fileRef} type="file" accept="image/png" className="hidden" disabled={busy} onChange={e => uploadArt(e.target.files?.[0])} />
            </label>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <input className={inputCls} style={inputStyle} placeholder="Badge name" maxLength={80} disabled={!editable}
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} onBlur={() => saveField('name')} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block min-w-0">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 mb-1"><Icon name="eye" size={12} /> Earned</span>
              <textarea rows={2} className={`${inputCls} resize-none`} style={inputStyle} maxLength={300} disabled={!editable}
                placeholder="Card text once earned" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} onBlur={() => saveField('description')} />
            </label>
            <label className="block min-w-0">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 mb-1"><Icon name="star" size={12} /> Not yet earned</span>
              <textarea rows={2} className={`${inputCls} resize-none`} style={inputStyle} maxLength={300} disabled={!editable}
                placeholder="Hint" value={form.hint}
                onChange={e => setForm(f => ({ ...f, hint: e.target.value }))} onBlur={() => saveField('hint')} />
            </label>
          </div>

          {!fixed && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-gray-400">Threshold</span>
              <input type="number" min="0" className={`${inputCls} !w-24 tabular-nums`} style={inputStyle} disabled={!editable || !!openVote}
                value={threshold} onChange={e => setThreshold(e.target.value)} />
              {p.sim?.evaluable && (
                <span className="flex items-center gap-1 text-xs tabular-nums text-gray-400">
                  <Icon name="user" size={12} />{from ?? '?'}
                  {changed && <><Icon name="arrow" size={12} className="text-gray-600" /><span className="text-white font-semibold">{to ?? '?'}</span></>}
                </span>
              )}
              {openVote
                ? <span className="text-xs text-amber-300">Vote open</span>
                : changed && editable && (
                  <button onClick={() => onOpenChange({ kind: 'threshold', tier_id: tier.id, to: Number(threshold) })}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25">
                    Put to vote
                  </button>
                )}
            </div>
          )}
          {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
        </div>
      </div>
    </div>
  );
}

// ── Change card (right edge) ──────────────────────────────────────────────────

function ChangeCard({ p, change, mods, viewer, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const modIds = new Set(mods.map(m => m.id));
  const votes = new Map(change.votes.filter(v => modIds.has(v.mod_id)).map(v => [v.mod_id, v.approve]));
  const yes = [...votes.values()].filter(Boolean).length;
  const no = votes.size - yes;
  const need = Math.floor(mods.length / 2) + 1 - yes;
  const mine = votes.get(viewer.id);
  const open = change.status === 'open';
  const pl = change.payload || {};
  const tier = change.kind === 'threshold' ? p.tiers.find(t => t.id === pl.tier_id) : null;
  const color = TIER_COLORS[((tier?.tier_order ?? pl.tier_order ?? 1) - 1) % TIER_COLORS.length];

  const act = async (fn) => {
    setBusy(true); setErr(null);
    try { await fn(); onChanged(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className={`rounded-xl border p-2.5 min-w-0 ${open ? '' : 'opacity-60'}`}
      style={{ borderColor: open ? 'rgba(245,185,66,0.35)' : C.border, background: open ? 'rgba(245,185,66,0.05)' : C.inner }}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
        {change.kind === 'tier_count' ? (
          <span className="flex items-center gap-1 text-sm font-semibold text-white tabular-nums min-w-0">
            <Icon name="layers" size={14} className="text-amber-300" />
            <TierDots n={pl.from} /> <Icon name="arrow" size={12} className="text-gray-500" /> <TierDots n={pl.to} />
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-white tabular-nums min-w-0">
            <span className="w-3 h-3 rounded shrink-0" style={{ background: color }} />
            <span className="truncate text-gray-300 font-normal">{tier?.name || `Tier ${pl.tier_order}`}</span>
            <span className="shrink-0">{thresholdLabel(p, pl.from)}</span>
            <Icon name="arrow" size={12} className="text-gray-500" />
            <span className="shrink-0">{thresholdLabel(p, pl.to)}</span>
          </span>
        )}
        {!open && (
          <span className={`ml-auto shrink-0 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${change.status === 'passed' ? 'text-green-300 border-green-500/40' : 'text-red-300 border-red-500/40'}`}>
            {change.status}
          </span>
        )}
      </div>

      {change.kind === 'threshold' && p.sim?.evaluable && (
        <div className="flex items-center gap-1 mt-1 text-[11px] text-gray-400 tabular-nums">
          <Icon name="user" size={11} />{countAt(p.sim, pl.from) ?? '?'}
          <Icon name="arrow" size={10} className="text-gray-600" />
          <span className="text-white font-semibold">{countAt(p.sim, pl.to) ?? '?'}</span>
        </div>
      )}

      <div className="flex items-center gap-1 mt-2 flex-wrap">
        {mods.map(m => {
          const v = votes.get(m.id);
          return <Avatar key={m.id} user={m} size={18} ring={v === true ? C.yes : v === false ? C.no : undefined}
            title={`${m.name}: ${v === true ? 'yes' : v === false ? 'no' : 'not voted'}`}
            style={{ opacity: v == null ? 0.3 : 1 }} />;
        })}
      </div>

      {open && (
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-[11px] text-gray-500 tabular-nums mr-auto">{need > 0 ? `${need} more yes` : ''}</span>
          <button disabled={busy} onClick={() => act(() => api(`/api/admin/backlog/changes/${change.id}/vote`, { method: 'POST', body: { approve: true } }))}
            className={`w-8 h-7 rounded-lg flex items-center justify-center border transition-colors ${mine === true ? 'bg-green-500/25 border-green-400 text-green-200' : 'border-white/10 text-gray-400 hover:text-green-300 hover:border-green-500/40'}`}
            aria-label="Vote yes" title="Yes"><Icon name="check" size={14} strokeWidth={3} /></button>
          <button disabled={busy} onClick={() => act(() => api(`/api/admin/backlog/changes/${change.id}/vote`, { method: 'POST', body: { approve: false } }))}
            className={`w-8 h-7 rounded-lg flex items-center justify-center border transition-colors ${mine === false ? 'bg-red-500/25 border-red-400 text-red-200' : 'border-white/10 text-gray-400 hover:text-red-300 hover:border-red-500/40'}`}
            aria-label="Vote no" title="No"><Icon name="x" size={14} strokeWidth={3} /></button>
          {(change.opened_by === viewer.id || viewer.is_owner) && (
            <button disabled={busy} onClick={() => act(() => api(`/api/admin/backlog/changes/${change.id}`, { method: 'DELETE' }))}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 hover:text-gray-300" title="Withdraw" aria-label="Withdraw">
              <Icon name="trash" size={13} />
            </button>
          )}
        </div>
      )}
      {open && no > 0 && <div className="sr-only">{no} no</div>}
      {err && <div className="mt-2"><Alert onClose={() => setErr(null)}>{err}</Alert></div>}
    </div>
  );
}

function TierDots({ n }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`${n} badges`}>
      {Array.from({ length: n }, (_, i) => <span key={i} className="w-2 h-2.5 rounded-sm" style={{ background: TIER_COLORS[i % TIER_COLORS.length] }} />)}
      <span className="ml-1 text-xs">{n}</span>
    </span>
  );
}

// ── Tier count stepper (opens a vote) ─────────────────────────────────────────

function TierCountControl({ p, openVote, onOpenChange }) {
  const [to, setTo] = useState(null);
  const n = p.tiers.length;
  if (p.status !== 'open') return null;
  if (openVote) return null;
  if (to == null) {
    return (
      <button type="button" onClick={() => setTo(n)} title="Change how many badges"
        className="shrink-0 self-start mt-1 w-16 h-16 rounded-xl border-2 border-dashed border-white/10 text-gray-600 hover:text-gray-300 hover:border-white/25 flex flex-col items-center justify-center gap-0.5">
        <span className="flex"><Icon name="plus" size={14} /><Icon name="minus" size={14} /></span>
      </button>
    );
  }
  return (
    <div className="shrink-0 self-start mt-1 rounded-xl border p-2 flex flex-col items-center gap-1.5" style={{ borderColor: 'rgba(245,185,66,0.35)', background: 'rgba(245,185,66,0.05)' }}>
      <div className="flex items-center gap-1">
        <button onClick={() => setTo(t => Math.max(1, t - 1))} className="w-7 h-7 rounded-lg border border-white/10 text-gray-300 flex items-center justify-center" aria-label="Fewer"><Icon name="minus" size={14} /></button>
        <span className="w-8 text-center text-lg font-bold text-white tabular-nums">{to}</span>
        <button onClick={() => setTo(t => Math.min(10, t + 1))} className="w-7 h-7 rounded-lg border border-white/10 text-gray-300 flex items-center justify-center" aria-label="More"><Icon name="plus" size={14} /></button>
      </div>
      <TierDots n={to} />
      <div className="flex gap-1">
        <button onClick={() => setTo(null)} className="px-2 py-1 rounded-md text-[11px] text-gray-400 hover:text-white">Cancel</button>
        <button disabled={to === n} onClick={async () => { await onOpenChange({ kind: 'tier_count', to }); setTo(null); }}
          className="px-2 py-1 rounded-md text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 disabled:opacity-40">Put to vote</button>
      </div>
    </div>
  );
}

// ── Comments ──────────────────────────────────────────────────────────────────

function Comments({ p, viewer, onCount }) {
  const [list, setList] = useState(null);
  const [body, setBody] = useState('');
  const [err, setErr] = useState(null);
  const load = async () => {
    try { const d = await api(`/api/admin/backlog/${p.id}/comments`); setList(d); onCount?.(d.length); }
    catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const post = async (e) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    try { await api(`/api/admin/backlog/${p.id}/comments`, { method: 'POST', body: { body: text } }); setBody(''); load(); }
    catch (e2) { setErr(e2.message); }
  };

  return (
    <div className="border-t px-3 sm:px-4 py-3 space-y-2.5" style={{ borderColor: C.border, background: C.inner }}>
      {list == null && !err && <div className="h-8 rounded-lg bg-white/[0.03] animate-pulse" />}
      {list?.map(c => (
        <div key={c.id} className="flex gap-2 min-w-0 group">
          <Avatar user={c} size={24} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-gray-200 truncate">{c.name}</span>
              <span className="text-[10px] text-gray-600">{timeAgo(c.created_at)}</span>
              {(c.user_id === viewer.id || viewer.is_owner) && (
                <button onClick={async () => { try { await api(`/api/admin/backlog/comments/${c.id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); } }}
                  className="ml-auto text-gray-700 hover:text-gray-300 opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label="Delete comment"><Icon name="trash" size={12} /></button>
              )}
            </div>
            <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{c.body}</p>
          </div>
        </div>
      ))}
      <form onSubmit={post} className="flex gap-2">
        <input className={inputCls} style={inputStyle} placeholder="Say something about the art…" maxLength={2000}
          value={body} onChange={e => setBody(e.target.value)} />
        <button disabled={!body.trim()} className="shrink-0 w-10 rounded-lg bg-lagoon-600 hover:bg-lagoon-500 text-white flex items-center justify-center disabled:opacity-30" aria-label="Post">
          <Icon name="send" size={15} />
        </button>
      </form>
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

export default function FamilyRow({ p, mods, viewer, rank, onChanged, onPublished }) {
  const [selected, setSelected] = useState(null);
  const [panel, setPanel] = useState(null);     // 'comments' | 'wiring' | 'edit'
  const [commentCount, setCommentCount] = useState(p.comment_count);
  const [err, setErr] = useState(null);
  useEffect(() => setCommentCount(p.comment_count), [p.comment_count]);

  const status = CODE_STATUS[p.code_status] || CODE_STATUS.unreviewed;
  const openChanges = p.changes.filter(c => c.status === 'open');
  const shownChanges = [...openChanges, ...p.changes.filter(c => c.status !== 'open').reverse()].slice(0, 3);
  const selTier = p.tiers.find(t => t.id === selected);
  const placedBy = (p.consensus?.placed_by || []).map(id => mods.find(m => m.id === id)).filter(Boolean);

  const openChange = async (body) => {
    setErr(null);
    try { await api(`/api/admin/backlog/${p.id}/changes`, { method: 'POST', body }); onChanged(); }
    catch (e) { setErr(e.message); }
  };

  const toggle = (k) => setPanel(v => (v === k ? null : k));

  return (
    <div className="rounded-2xl border min-w-0 overflow-hidden" style={{ background: C.card, borderColor: C.border }}>
      <div className="grid grid-cols-1 md:grid-cols-[64px_minmax(0,1fr)_220px] gap-3 p-3 sm:p-4 min-w-0">

        {/* Rank + consensus */}
        <div className="flex md:flex-col items-center md:items-start gap-2 md:gap-1.5 min-w-0">
          <span className="text-3xl font-black text-white tabular-nums leading-none">{rank ?? '–'}</span>
          <span className="block w-16 h-1.5 rounded-full bg-white/[0.06] overflow-hidden" title={p.consensus?.score != null ? `Consensus ${Math.round(p.consensus.score * 100)}` : 'Nobody has ranked yet'}>
            <span className="block h-full rounded-full bg-lagoon-400" style={{ width: `${(p.consensus?.score ?? 0) * 100}%` }} />
          </span>
          <span className="flex -space-x-1.5" title={placedBy.length ? `Ranked by ${placedBy.map(m => m.name).join(', ')}` : 'Nobody has ranked this yet'}>
            {placedBy.map(m => <Avatar key={m.id} user={m} size={18} style={{ boxShadow: `0 0 0 2px ${C.card}` }} />)}
          </span>
        </div>

        {/* Family */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0"
              style={{ color: status.color, borderColor: `${status.color}55`, background: `${status.color}14` }}
              title="Code status (owner sets it)">
              <span className="w-2 h-2 rounded-full" style={{ background: status.color }} />{status.label}
            </span>
            <h3 className="text-base font-bold text-white truncate min-w-0">{p.name}</h3>
          </div>
          {p.theme_notes && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.theme_notes}</p>}

          {/* Tier strip */}
          <div className="flex flex-wrap items-start gap-1 mt-2 pb-1 min-w-0">
            {p.tiers.map(t => (
              <TierTile key={t.id} p={p} tier={t} color={TIER_COLORS[(t.tier_order - 1) % TIER_COLORS.length]}
                selected={selected === t.id} onClick={() => setSelected(s => (s === t.id ? null : t.id))} />
            ))}
            <TierCountControl p={p} openVote={openChanges.find(c => c.kind === 'tier_count')} onOpenChange={openChange} />
          </div>

          {selTier && (
            <TierEditor key={selTier.id} p={p} tier={selTier} color={TIER_COLORS[(selTier.tier_order - 1) % TIER_COLORS.length]}
              onChanged={onChanged} onOpenChange={openChange}
              openVote={openChanges.find(c => c.kind === 'threshold' && c.payload?.tier_id === selTier.id)} />
          )}

          {/* Actions */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <button onClick={() => toggle('comments')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${panel === 'comments' ? 'border-lagoon-500/40 text-lagoon-300 bg-lagoon-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>
              <Icon name="chat" size={13} /><span className="tabular-nums">{commentCount}</span>
            </button>
            {viewer.is_owner && p.status === 'open' && (
              <button onClick={() => toggle('wiring')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${panel === 'wiring' ? 'border-lagoon-500/40 text-lagoon-300 bg-lagoon-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>
                <Icon name="wrench" size={13} />Wire
              </button>
            )}
            {p.status === 'open' && (
              <button onClick={() => toggle('edit')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${panel === 'edit' ? 'border-lagoon-500/40 text-lagoon-300 bg-lagoon-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>
                <Icon name="edit" size={13} />Edit
              </button>
            )}
          </div>
          {err && <div className="mt-2"><Alert onClose={() => setErr(null)}>{err}</Alert></div>}
        </div>

        {/* Votes */}
        <div className="space-y-2 min-w-0">
          {shownChanges.map(c => <ChangeCard key={c.id} p={p} change={c} mods={mods} viewer={viewer} onChanged={onChanged} />)}
        </div>
      </div>

      {panel === 'comments' && <Comments p={p} viewer={viewer} onCount={setCommentCount} />}
      {panel === 'edit' && <EditPanel p={p} viewer={viewer} onChanged={onChanged} onClose={() => setPanel(null)} />}
      {panel === 'wiring' && viewer.is_owner && <WiringPanel p={p} onChanged={onChanged} onPublished={onPublished} />}
    </div>
  );
}

function EditPanel({ p, viewer, onChanged, onClose }) {
  const [name, setName] = useState(p.name);
  const [notes, setNotes] = useState(p.theme_notes || '');
  const [err, setErr] = useState(null);
  const canArchive = viewer.is_owner || p.proposed_by === viewer.id;
  const run = async (fn) => { setErr(null); try { await fn(); onChanged(); onClose(); } catch (e) { setErr(e.message); } };
  return (
    <div className="border-t px-3 sm:px-4 py-3 space-y-2" style={{ borderColor: C.border, background: C.inner }}>
      <input className={inputCls} style={inputStyle} value={name} maxLength={80} onChange={e => setName(e.target.value)} />
      <textarea rows={2} className={`${inputCls} resize-none`} style={inputStyle} value={notes} maxLength={2000}
        placeholder="Theme, art direction" onChange={e => setNotes(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <button onClick={() => run(() => api(`/api/admin/backlog/${p.id}`, { method: 'PATCH', body: { name, theme_notes: notes } }))}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-lagoon-600 hover:bg-lagoon-500 text-white">Save</button>
        <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white">Cancel</button>
        <span className="flex-1" />
        {canArchive && (
          <button onClick={() => run(() => api(`/api/admin/backlog/${p.id}`, { method: 'PATCH', body: { status: 'archived' } }))}
            className="px-3 py-1.5 rounded-lg text-xs text-gray-400 border border-white/10 hover:text-white">Archive</button>
        )}
        {viewer.is_owner && (
          <button onClick={() => window.confirm(`Delete "${p.name}" and its art, votes and comments?`) && run(() => api(`/api/admin/backlog/${p.id}`, { method: 'DELETE' }))}
            className="px-3 py-1.5 rounded-lg text-xs text-red-300 border border-red-500/30 hover:bg-red-500/10">Delete</button>
        )}
      </div>
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
    </div>
  );
}
