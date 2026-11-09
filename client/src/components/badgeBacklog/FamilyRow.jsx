import React, { useEffect, useRef, useState } from 'react';
import { C, api, Avatar, Icon, Alert, inputCls, inputStyle, timeAgo } from './ui';
import { countAt, CODE_STATUS, TIER_COLORS, FIXED_CHECKS, PERCENT_CHECKS, HOUR_CHECKS } from './sim';
import EarnerHover from './EarnerHover';
import { OwnerChips, Histogram, Publish, RuleLine, StatusPill, useWiring, tierSim, effectiveMode, BONUS_COLOR, SECRET_COLOR, MODE_CHECKS } from './WiringPanel';

export function thresholdLabel(p, value) {
  if (FIXED_CHECKS.has(p.check_type)) return null;
  if (value == null || value === '') return '—';
  const v = Number(value);
  if (HOUR_CHECKS.has(p.check_type)) return `≤ ${v}h`;
  if (p.sim?.direction === 'lte') return `top ${v}`;
  return `≥ ${v}${PERCENT_CHECKS.has(p.check_type) ? '%' : ''}`;
}

// ── Tier tile ─────────────────────────────────────────────────────────────────

export function TierTile({ p, tier, color, selected, onClick, hunters, size = 64 }) {
  const sim = tierSim(p, tier);
  const count = countAt(sim, tier.threshold);
  const total = sim?.total_users || 0;
  const mode = MODE_CHECKS.has(p.check_type) ? effectiveMode(p, tier) : null;
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
        {tier.bonus && <span className="absolute top-0.5 left-0.5 rounded-full p-0.5 text-black" style={{ background: BONUS_COLOR }} title="Bonus tier"><Icon name="star" size={9} /></span>}
        {tier.is_secret && <span className="absolute top-0.5 right-0.5 rounded-full p-0.5 text-black" style={{ background: SECRET_COLOR }} title="Secret"><Icon name="eyeOff" size={9} /></span>}
        {tier.badge_id && (
          <span className="absolute bottom-0.5 right-0.5 rounded-full bg-green-500 text-black p-0.5"><Icon name="check" size={9} strokeWidth={4} /></span>
        )}
      </div>
      <span className={`text-[11px] leading-tight w-full truncate text-center ${tier.name ? 'text-gray-300' : 'text-gray-600 italic'}`}>
        {tier.name || `Tier ${tier.tier_order}`}
      </span>
      {label && <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>{label}{mode && mode !== 'any' ? <span className="ml-1 text-[9px] uppercase" style={{ color: mode === 'standard' ? '#12bfce' : '#e2553f' }}>{mode === 'standard' ? 'Std' : 'Rst'}</span> : null}</span>}
          <EarnerHover sim={sim} threshold={tier.threshold} hunters={hunters}><span className="flex items-center gap-1 text-[11px] tabular-nums" title={count == null ? 'Not wired yet' : `${count} of ${total} hunters`}>
            <Icon name="user" size={11} className="text-gray-500" />
            <span className={count == null ? 'text-gray-600' : 'text-white font-semibold'}>{count ?? '?'}</span>
          </span></EarnerHover>
          <span className="block h-1 rounded-full bg-white/[0.06] overflow-hidden" style={{ width: size }}>
            <span className="block h-full rounded-full" style={{ width: count != null && total ? `${Math.max(count ? 4 : 0, (count / total) * 100)}%` : 0, background: color }} />
          </span>
    </button>
  );
}

// ── Tier editor (copy + art: any mod; threshold: owner) ───────────────────────

function TierEditor({ p, tier, color, isOwner, onPatch, hunters }) {
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
    const old = tier[k];
    const set = (v) => onPatch(q => ({ ...q, tiers: q.tiers.map(x => (x.id === tier.id ? { ...x, [k]: v } : x)) }));
    set(form[k]);
    try { await api(`/api/admin/backlog/${p.id}/tiers/${tier.id}`, { method: 'PATCH', body: { [k]: form[k] } }); }
    catch (e) { set(old); setErr(e.message); }
  };

  const uploadArt = async (file) => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const body = new FormData();
      body.append('image', file);
      const r = await api(`/api/admin/backlog/${p.id}/tiers/${tier.id}/art`, { method: 'PUT', body });
      onPatch(q => ({ ...q, tiers: q.tiers.map(x => (x.id === tier.id ? { ...x, image_url: r?.image_url || x.image_url } : x)) }));
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const saveThreshold = async () => {
    setBusy(true); setErr(null);
    try {
      await api(`/api/admin/backlog/${p.id}/tiers/${tier.id}`, { method: 'PATCH', body: { threshold: Number(threshold) } });
      onPatch(q => ({ ...q, tiers: q.tiers.map(x => (x.id === tier.id ? { ...x, threshold: Number(threshold) } : x)) }));
    }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const from = countAt(tierSim(p, tier), tier.threshold);
  const to = countAt(tierSim(p, tier), threshold);
  const changed = threshold !== '' && Number(threshold) !== Number(tier.threshold ?? NaN);
  const canSetThreshold = editable && isOwner;

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
              <input type="number" min="0" className={`${inputCls} !w-24 tabular-nums`} style={inputStyle} disabled={!canSetThreshold || busy}
                value={threshold} onChange={e => setThreshold(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && changed) saveThreshold(); }} />
              {p.sim?.evaluable && (
                <span className="flex items-center gap-1 text-xs tabular-nums text-gray-400">
                  <Icon name="user" size={12} /><EarnerHover sim={tierSim(p, tier)} threshold={tier.threshold} hunters={hunters}><span>{from ?? '?'}</span></EarnerHover>
                  {changed && <><Icon name="arrow" size={12} className="text-gray-600" /><span className="text-white font-semibold">{to ?? '?'}</span></>}
                </span>
              )}
              {changed && canSetThreshold && (
                <span className="flex items-center gap-1">
                  <button onClick={saveThreshold} disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-lagoon-600 hover:bg-lagoon-500 text-white disabled:opacity-50">Save</button>
                  <button onClick={() => setThreshold(tier.threshold ?? '')} disabled={busy}
                    className="px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white">Cancel</button>
                </span>
              )}
            </div>
          )}
          {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
        </div>
      </div>
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

// ── Tier count stepper (owner) ────────────────────────────────────────────────

function TierCountControl({ p, onSetCount }) {
  const [to, setTo] = useState(null);
  const n = p.tiers.length;
  // Published tiers can't be dropped, so the stepper stops at the last one.
  const floor = Math.max(1, ...p.tiers.filter(t => t.badge_id).map(t => t.tier_order));
  if (p.status !== 'open') return null;
  const dropped = to == null ? [] : p.tiers.filter(t => t.tier_order > to);
  const apply = async () => {
    if (dropped.some(t => t.image_url || t.name || t.description || t.hint)
      && !window.confirm(`Remove ${dropped.length} badge${dropped.length > 1 ? 's' : ''} and their art and text?`)) return;
    if (await onSetCount(to)) setTo(null);
  };
  if (to == null) {
    return (
      <button type="button" onClick={() => setTo(n)} title="Change how many badges"
        className="shrink-0 self-start mt-1 w-16 h-16 rounded-xl border-2 border-dashed border-white/10 text-gray-600 hover:text-gray-300 hover:border-white/25 flex flex-col items-center justify-center gap-0.5">
        <span className="flex"><Icon name="plus" size={14} /><Icon name="minus" size={14} /></span>
      </button>
    );
  }
  return (
    <div className="shrink-0 self-start mt-1 rounded-xl border p-2 flex flex-col items-center gap-1.5" style={{ borderColor: C.border, background: C.inner }}>
      <div className="flex items-center gap-1">
        <button disabled={to <= floor} onClick={() => setTo(t => Math.max(floor, t - 1))} className="w-7 h-7 rounded-lg border border-white/10 text-gray-300 flex items-center justify-center disabled:opacity-30" aria-label="Fewer"><Icon name="minus" size={14} /></button>
        <span className="w-8 text-center text-lg font-bold text-white tabular-nums">{to}</span>
        <button disabled={to >= 10} onClick={() => setTo(t => Math.min(10, t + 1))} className="w-7 h-7 rounded-lg border border-white/10 text-gray-300 flex items-center justify-center disabled:opacity-30" aria-label="More"><Icon name="plus" size={14} /></button>
      </div>
      <TierDots n={to} />
      <div className="flex gap-1">
        <button onClick={() => setTo(null)} className="px-2 py-1 rounded-md text-[11px] text-gray-400 hover:text-white">Cancel</button>
        <button disabled={to === n} onClick={apply}
          className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-lagoon-600 hover:bg-lagoon-500 text-white disabled:opacity-30">Save</button>
      </div>
    </div>
  );
}

// ── Comments ──────────────────────────────────────────────────────────────────

function Comments({ p, viewer, mods, onCount }) {
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
    const me = mods?.find(m => m.id === viewer.id);
    const tmp = { id: `tmp-${Date.now()}`, user_id: viewer.id, body: text, created_at: new Date().toISOString(), name: me?.name || 'You', avatar_url: me?.avatar_url || null };
    setList(l => { const n = [...(l || []), tmp]; onCount?.(n.length); return n; });
    setBody('');
    try {
      const row = await api(`/api/admin/backlog/${p.id}/comments`, { method: 'POST', body: { body: text } });
      setList(l => l.map(c => (c.id === tmp.id ? { ...c, id: row.id } : c)));
    } catch (e2) {
      setList(l => { const n = l.filter(c => c.id !== tmp.id); onCount?.(n.length); return n; });
      setBody(text); setErr(e2.message);
    }
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
                <button onClick={async () => { const keep = list; setList(l => { const n = l.filter(x => x.id !== c.id); onCount?.(n.length); return n; }); try { await api(`/api/admin/backlog/comments/${c.id}`, { method: 'DELETE' }); } catch (e) { setList(keep); onCount?.(keep.length); setErr(e.message); } }}
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

export default function FamilyRow({ p, mods, hunters, viewer, rank, onChanged, onPatch, onPublished }) {
  const [selected, setSelected] = useState(null);
  const [panel, setPanel] = useState(null);     // 'comments' | 'edit'
  const wiring = useWiring(p, onChanged, viewer.is_owner && p.status === 'open', onPatch);
  const [commentCount, setCommentCount] = useState(p.comment_count);
  const [err, setErr] = useState(null);
  useEffect(() => setCommentCount(p.comment_count), [p.comment_count]);

  const selTier = p.tiers.find(t => t.id === selected);
  const placedBy = (p.consensus?.placed_by || []).map(id => mods.find(m => m.id === id)).filter(Boolean);

  const setTierCount = async (to) => {
    setErr(null);
    try {
      await api(`/api/admin/backlog/${p.id}/tier-count`, { method: 'PUT', body: { to } });
      if (selTier && selTier.tier_order > to) setSelected(null);
      onChanged();
      return true;
    } catch (e) { setErr(e.message); return false; }
  };

  const toggle = (k) => setPanel(v => (v === k ? null : k));

  return (
    <div className="rounded-2xl border min-w-0 overflow-hidden" style={{ background: C.card, borderColor: C.border }}>
      <div className="grid grid-cols-1 md:grid-cols-[64px_minmax(0,1fr)] gap-3 p-3 sm:p-4 min-w-0">

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
            <StatusPill p={p} isOwner={viewer.is_owner} save={wiring.save} />
            <h3 className="text-base font-bold text-white truncate min-w-0">{p.name}</h3>
          </div>
          {p.theme_notes && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.theme_notes}</p>}

          <RuleLine p={p} isOwner={viewer.is_owner && p.status === 'open'} wiring={wiring} />

          {/* Tier strip */}
          <div className="flex flex-wrap items-start gap-1 mt-2 pb-1 min-w-0">
            {p.tiers.map(t => (
              <div key={t.id} className="flex flex-col items-center">
                <TierTile p={p} hunters={hunters} tier={t} color={TIER_COLORS[(t.tier_order - 1) % TIER_COLORS.length]}
                  selected={selected === t.id} onClick={() => setSelected(s => (s === t.id ? null : t.id))} />
                {viewer.is_owner && p.status === 'open' && !t.badge_id && <OwnerChips p={p} t={t} collections={wiring.collections} save={wiring.save} />}
              </div>
            ))}
            {viewer.is_owner && <TierCountControl p={p} onSetCount={setTierCount} />}
          </div>

          {p.check_type && <div className="mt-2"><Histogram p={p} /></div>}
          {wiring.err && <div className="mt-2"><Alert onClose={() => wiring.setErr(null)}>{wiring.err}</Alert></div>}

          {selTier && (
            <TierEditor key={selTier.id} p={p} tier={selTier} color={TIER_COLORS[(selTier.tier_order - 1) % TIER_COLORS.length]}
              isOwner={viewer.is_owner} onPatch={onPatch} hunters={hunters} />
          )}

          {/* Actions */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <button onClick={() => toggle('comments')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${panel === 'comments' ? 'border-lagoon-500/40 text-lagoon-300 bg-lagoon-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>
              <Icon name="chat" size={13} /><span className="tabular-nums">{commentCount}</span>
            </button>
            {p.status === 'open' && (
              <button onClick={() => toggle('edit')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${panel === 'edit' ? 'border-lagoon-500/40 text-lagoon-300 bg-lagoon-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>
                <Icon name="edit" size={13} />Edit
              </button>
            )}
          </div>
          {err && <div className="mt-2"><Alert onClose={() => setErr(null)}>{err}</Alert></div>}
          {viewer.is_owner && p.status === 'open' && p.code_status === 'ready' && <div className="mt-3"><Publish p={p} onPublished={onPublished} /></div>}
        </div>
      </div>

      {panel === 'comments' && <Comments p={p} viewer={viewer} mods={mods} onCount={setCommentCount} />}
      {panel === 'edit' && <EditPanel p={p} viewer={viewer} onChanged={onChanged} onClose={() => setPanel(null)} />}
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
          <button onClick={() => window.confirm(`Delete "${p.name}" and its art and comments?`) && run(() => api(`/api/admin/backlog/${p.id}`, { method: 'DELETE' }))}
            className="px-3 py-1.5 rounded-lg text-xs text-red-300 border border-red-500/30 hover:bg-red-500/10">Delete</button>
        )}
      </div>
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
    </div>
  );
}
