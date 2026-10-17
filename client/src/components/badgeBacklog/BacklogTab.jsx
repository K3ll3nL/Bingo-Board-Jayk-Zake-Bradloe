import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DndContext, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { C, api, Avatar, Icon, Alert, inputCls, inputStyle } from './ui';
import { TIER_COLORS, CODE_STATUS } from './sim';
import FamilyRow from './FamilyRow';

const DIVIDER = '__divider__';

// ── Header: every mod's weight, the viewer's progress, view toggle ────────────

function WeightRing({ m, size = 30 }) {
  const deg = Math.round((m.weight || 0) * 360);
  return (
    <span className="relative inline-flex rounded-full p-[2.5px] shrink-0"
      style={{ background: `conic-gradient(#12bfce ${deg}deg, rgba(255,255,255,0.08) ${deg}deg)` }}
      title={`${m.name}: placed ${m.placed}/${m.total} · weight ${(m.weight || 0).toFixed(2)}`}>
      <Avatar user={m} size={size} style={{ boxShadow: `0 0 0 2px ${C.card}` }} title="" />
    </span>
  );
}

function Header({ data, view, setView, onPropose, proposing }) {
  const me = data.mods.find(m => m.id === data.viewer.id);
  return (
    <div className="rounded-2xl border p-3 sm:p-4 flex flex-wrap items-center gap-x-4 gap-y-3 min-w-0" style={{ background: C.card, borderColor: C.border }}>
      <div className="flex items-center gap-1.5 shrink-0">
        {data.mods.map(m => <WeightRing key={m.id} m={m} />)}
      </div>
      {me && (
        <div className="min-w-0 flex-1 basis-48">
          <div className="text-sm text-white">
            You've placed <b className="tabular-nums">{me.placed}/{me.total}</b>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mt-1.5 max-w-xs">
            <div className="h-full rounded-full bg-lagoon-400 transition-all" style={{ width: `${(me.weight || 0) * 100}%` }} />
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 ml-auto">
        <div className="flex rounded-full border border-white/10 p-0.5">
          {[['consensus', 'Consensus', 'layers'], ['mine', 'My order', 'grip']].map(([k, label, icon]) => (
            <button key={k} onClick={() => setView(k)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${view === k ? 'bg-lagoon-600/25 text-lagoon-200' : 'text-gray-400 hover:text-white'}`}>
              <Icon name={icon} size={13} />{label}
            </button>
          ))}
        </div>
        <button onClick={onPropose}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${proposing ? 'bg-white/10 text-white' : 'bg-lagoon-600 hover:bg-lagoon-500 text-white'}`}>
          <Icon name={proposing ? 'x' : 'plus'} size={13} strokeWidth={2.5} />{proposing ? 'Close' : 'Propose'}
        </button>
      </div>
    </div>
  );
}

// ── Propose a family ──────────────────────────────────────────────────────────

// Always a NEW family. The Backlog never adds badges to a live family.
function ProposeForm({ onDone }) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [tiers, setTiers] = useState([{ name: '', threshold: '' }, { name: '', threshold: '' }, { name: '', threshold: '' }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const resize = (n) => setTiers(t => (n > t.length ? [...t, ...Array.from({ length: n - t.length }, () => ({ name: '', threshold: '' }))] : t.slice(0, n)));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api('/api/admin/backlog', { method: 'POST', body: {
        name, theme_notes: notes,
        tiers: tiers.map(t => ({ name: t.name, threshold: t.threshold === '' ? null : t.threshold })),
      } });
      onDone();
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border p-3 sm:p-4 space-y-3 min-w-0" style={{ background: C.card, borderColor: 'rgba(18,191,206,0.35)' }}>
      <input className={`${inputCls} !text-base font-semibold`} style={inputStyle} placeholder="Family name" maxLength={80} required autoFocus
        value={name} onChange={e => setName(e.target.value)} />
      <textarea rows={2} className={`${inputCls} resize-none`} style={inputStyle} maxLength={2000} placeholder="Theme, art direction, what it rewards"
        value={notes} onChange={e => setNotes(e.target.value)} />

      <div className="flex items-start gap-2 overflow-x-auto pb-1 min-w-0">
        {tiers.map((t, i) => {
          const color = TIER_COLORS[i % TIER_COLORS.length];
          return (
            <div key={i} className="flex flex-col items-center gap-1.5 shrink-0 w-24">
              <div className="w-16 h-16 rounded-xl flex items-center justify-center" style={{ background: C.input, border: `2px dashed ${color}66` }}>
                <span className="text-3xl font-black" style={{ color: `${color}aa` }}>?</span>
              </div>
              <input className={`${inputCls} !px-2 !py-1 text-center text-xs`} style={inputStyle} placeholder={`Tier ${i + 1}`} maxLength={80}
                value={t.name} onChange={e => setTiers(ts => ts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input type="number" min="0" className={`${inputCls} !px-2 !py-1 text-center text-xs tabular-nums`} style={{ ...inputStyle, color }} placeholder="≥ ?"
                value={t.threshold} onChange={e => setTiers(ts => ts.map((x, j) => (j === i ? { ...x, threshold: e.target.value } : x)))} />
            </div>
          );
        })}
        <div className="flex flex-col gap-1 shrink-0 self-center ml-1">
          <button type="button" onClick={() => resize(Math.min(10, tiers.length + 1))} disabled={tiers.length >= 10}
            className="w-8 h-8 rounded-lg border border-white/10 text-gray-300 flex items-center justify-center disabled:opacity-30" aria-label="Add tier"><Icon name="plus" size={15} /></button>
          <button type="button" onClick={() => resize(Math.max(1, tiers.length - 1))} disabled={tiers.length <= 1}
            className="w-8 h-8 rounded-lg border border-white/10 text-gray-300 flex items-center justify-center disabled:opacity-30" aria-label="Remove tier"><Icon name="minus" size={15} /></button>
        </div>
      </div>

      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
      <button disabled={busy || !name.trim()} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-lagoon-600 hover:bg-lagoon-500 disabled:opacity-40">
        {busy ? 'Proposing…' : `Propose ${tiers.length} badge${tiers.length === 1 ? '' : 's'}`}
      </button>
    </form>
  );
}

// ── My order (drag) ───────────────────────────────────────────────────────────

function MiniTiers({ p }) {
  return (
    <span className="flex items-center gap-0.5 shrink-0">
      {p.tiers.slice(0, 6).map(t => {
        const color = TIER_COLORS[(t.tier_order - 1) % TIER_COLORS.length];
        return (
          <span key={t.id} className="w-6 h-6 rounded-md overflow-hidden flex items-center justify-center"
            style={{ background: C.input, border: t.image_url ? `1.5px solid ${color}` : `1.5px dashed ${color}66` }}>
            {t.image_url ? <img src={t.image_url} alt="" className="w-full h-full object-contain" /> : <span className="text-[11px] font-black" style={{ color: `${color}aa` }}>?</span>}
          </span>
        );
      })}
      {p.tiers.length > 6 && <span className="text-[10px] text-gray-500 ml-0.5">+{p.tiers.length - 6}</span>}
    </span>
  );
}

function SortRow({ id, p, index, placed, onPlace, onUnplace }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: id === DIVIDER ? { draggable: true, droppable: false } : false });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined };

  if (id === DIVIDER) {
    return (
      <div ref={setNodeRef} style={style} className="flex items-center gap-3 py-2">
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Not placed</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>
    );
  }
  const status = CODE_STATUS[p.code_status] || CODE_STATUS.unreviewed;
  return (
    <div ref={setNodeRef} style={{ ...style, background: C.card, borderColor: isDragging ? '#12bfce' : C.border }}
      className={`flex items-center gap-2 sm:gap-3 rounded-xl border px-2 sm:px-3 py-2 min-w-0 ${isDragging ? 'shadow-2xl' : ''} ${placed ? '' : 'opacity-60'}`}>
      <button {...attributes} {...listeners} className="touch-none cursor-grab active:cursor-grabbing text-gray-500 hover:text-white p-1 -m-1" aria-label={`Drag ${p.name}`}>
        <Icon name="grip" size={18} strokeWidth={3} />
      </button>
      <span className={`w-6 text-right text-lg font-black tabular-nums shrink-0 ${placed ? 'text-white' : 'text-gray-700'}`}>{placed ? index + 1 : '–'}</span>
      <MiniTiers p={p} />
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: status.color }} title={status.label} />
      <span className="text-sm font-semibold text-white truncate min-w-0 flex-1">{p.name}</span>
      {p.consensus?.rank && <span className="hidden sm:inline text-[11px] text-gray-500 tabular-nums shrink-0" title="Consensus rank">#{p.consensus.rank} overall</span>}
      {placed
        ? <button onClick={onUnplace} className="shrink-0 w-7 h-7 rounded-lg text-gray-600 hover:text-white flex items-center justify-center" aria-label="Unplace"><Icon name="x" size={14} /></button>
        : <button onClick={onPlace} className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold border border-lagoon-500/40 text-lagoon-300 hover:bg-lagoon-500/10">Place</button>}
    </div>
  );
}

function MyOrder({ data, onSaved }) {
  const byId = useMemo(() => new Map(data.proposals.filter(p => p.status === 'open').map(p => [p.id, p])), [data]);
  const initial = useMemo(() => {
    const placed = data.viewer.order.filter(id => byId.has(id));
    const rest = [...byId.values()].filter(p => !placed.includes(p.id))
      .sort((a, b) => (a.consensus?.rank ?? 1e9) - (b.consensus?.rank ?? 1e9)).map(p => p.id);
    return [...placed, DIVIDER, ...rest];
  }, [data, byId]);
  const [items, setItems] = useState(initial);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => setItems(initial), [initial]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const save = async (next) => {
    const prev = items;
    setItems(next);
    setSaving(true); setErr(null);
    try {
      await api('/api/admin/backlog/ranking', { method: 'PUT', body: { order: next.slice(0, next.indexOf(DIVIDER)) } });
      onSaved();
    } catch (e) { setErr(e.message); setItems(prev); }
    finally { setSaving(false); }
  };

  const divider = items.indexOf(DIVIDER);
  const move = (id, toPlaced) => {
    const without = items.filter(x => x !== id);
    const d = without.indexOf(DIVIDER);
    save(toPlaced ? [...without.slice(0, d), id, ...without.slice(d)] : [...without.slice(0, d + 1), id, ...without.slice(d + 1)]);
  };

  return (
    <div className="space-y-1.5 min-w-0">
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
      <DndContext sensors={sensors} collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => {
          if (!over || active.id === over.id) return;
          save(arrayMove(items, items.indexOf(active.id), items.indexOf(over.id)));
        }}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {items.map((id, i) => (
            <SortRow key={id} id={id} p={byId.get(id)} index={i} placed={i < divider}
              onPlace={() => move(id, true)} onUnplace={() => move(id, false)} />
          ))}
        </SortableContext>
      </DndContext>
      {divider === 0 && <p className="text-xs text-gray-500 text-center py-1">Drag families above the line, best first</p>}
      <div className="h-4 text-[11px] text-gray-600 text-right">{saving ? 'Saving…' : ''}</div>
    </div>
  );
}

// ── Published (collapsed) ─────────────────────────────────────────────────────

function Published({ list }) {
  const [open, setOpen] = useState(false);
  if (!list.length) return null;
  return (
    <div className="rounded-2xl border min-w-0" style={{ background: C.card, borderColor: C.border }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-400 hover:text-white">
        <Icon name="stamp" size={15} className="text-green-400" />Published <span className="tabular-nums text-gray-600">{list.length}</span>
        <Icon name="arrow" size={14} className={`ml-auto transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-2">
          {list.map(p => (
            <div key={p.id} className="flex items-center gap-3 min-w-0">
              <MiniTiers p={p} />
              <span className="text-sm text-gray-300 truncate">{p.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab ───────────────────────────────────────────────────────────────────────

export default function BacklogTab({ onPublished }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [view, setView] = useState('consensus');
  const [proposing, setProposing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api('/api/admin/backlog')); setErr(null); }
    catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err && !data) return <Alert onClose={load}>{err}</Alert>;
  if (!data) {
    return (
      <div className="space-y-3">
        <div className="h-[66px] rounded-2xl bg-white/[0.03] animate-pulse" />
        {[0, 1, 2].map(i => <div key={i} className="h-40 rounded-2xl bg-white/[0.03] animate-pulse" />)}
      </div>
    );
  }

  const open = data.proposals.filter(p => p.status === 'open')
    .sort((a, b) => (a.consensus?.rank ?? 1e9) - (b.consensus?.rank ?? 1e9) || a.created_at.localeCompare(b.created_at));
  const published = data.proposals.filter(p => p.status === 'published');

  return (
    <div className="space-y-3 min-w-0">
      <Header data={data} view={view} setView={setView} proposing={proposing} onPropose={() => setProposing(v => !v)} />
      {proposing && <ProposeForm onDone={() => { setProposing(false); load(); }} />}
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}

      {open.length === 0 && !proposing && (
        <div className="rounded-2xl border-2 border-dashed border-white/10 py-12 flex flex-col items-center gap-3">
          <span className="flex gap-1.5">
            {TIER_COLORS.slice(0, 3).map(c => (
              <span key={c} className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ border: `2px dashed ${c}66` }}>
                <span className="text-xl font-black" style={{ color: `${c}aa` }}>?</span>
              </span>
            ))}
          </span>
          <button onClick={() => setProposing(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold bg-lagoon-600 hover:bg-lagoon-500 text-white">
            <Icon name="plus" size={14} strokeWidth={2.5} />Propose a family
          </button>
        </div>
      )}

      {view === 'consensus'
        ? open.map(p => (
          <FamilyRow key={p.id} p={p} mods={data.mods} viewer={data.viewer} rank={p.consensus?.rank}
            onChanged={load} onPublished={(r) => { load(); onPublished?.(r); }} />
        ))
        : open.length > 0 && <MyOrder data={data} onSaved={load} />}

      <Published list={published} />
    </div>
  );
}
