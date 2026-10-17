import React, { useEffect, useState } from 'react';
import { C, api, Icon, Alert, timeAgo } from './ui';

// What each clock rule decides. Both are "who was first", so the clock picks
// which timestamp "first" is measured on.
const RULES = {
  first_of_month: { title: 'First catch of the month', icon: 'calendar', winner: 'One winner per month' },
  bingo_first:    { title: 'First to each bingo',     icon: 'grid',     winner: 'Bingo order on the board' },
  first_of_species: { title: 'First of each Pokémon', icon: 'target',  winner: 'One holder per Pokémon per month' },
};

const CLOCKS = [
  { value: 'submission', label: 'Submitted', icon: 'send',  detail: 'Earliest upload wins. Settles once earlier pending uploads are approved or rejected.' },
  { value: 'approval',   label: 'Approved',  icon: 'check', detail: 'Earliest approval wins. Mod queue speed decides ties.' },
];

// Trigger → the event that runs it. Mirrors the call sites in api/_routes.
const FIRES = [
  { trigger: 'Submitted',    icon: 'send',     when: 'On upload' },
  { trigger: 'Approved',     icon: 'check',    when: 'On approve (firsts also settle on reject)' },
  { trigger: 'Rejected',     icon: 'ban',      when: 'On reject' },
  { trigger: 'Active month', icon: 'calendar', when: 'First points of a new month' },
  { trigger: 'Account age',  icon: 'cake',     when: 'First points of a new month' },
  { trigger: 'Bingo',        icon: 'grid',     when: 'When a bingo is recorded' },
  { trigger: 'Period end',   icon: 'trophy',   when: 'Daily 04:00 UTC, after the month closes' },
  { trigger: 'On a date',    icon: 'star',     when: 'Daily 04:00 UTC, the day after the date' },
];

export default function TimingTab({ isOwner }) {
  const [rules, setRules] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    try { setRules(await api('/api/admin/award-clocks')); } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const set = async (rule, clock) => {
    setBusy(rule); setErr(null);
    try { await api(`/api/admin/award-clocks/${rule}`, { method: 'PUT', body: { clock } }); await load(); }
    catch (e) { setErr(e.message); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4 min-w-0">
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {(rules || Object.keys(RULES).map(rule => ({ rule }))).map(r => {
          const meta = RULES[r.rule] || { title: r.rule, icon: 'clock' };
          return (
            <div key={r.rule} className="rounded-2xl border p-4 space-y-3 min-w-0 overflow-hidden" style={{ background: C.card, borderColor: C.border }}>
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-lagoon-500/15 text-lagoon-300 flex items-center justify-center"><Icon name={meta.icon} size={17} /></span>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white">{meta.title}</div>
                  <div className="text-[11px] text-gray-500">{meta.winner}</div>
                </div>
              </div>
              {!r.clock ? <div className="h-[74px] rounded-xl bg-white/[0.03] animate-pulse" /> : (
                <div className="grid grid-cols-2 gap-1.5">
                  {CLOCKS.map(c => {
                    const on = r.clock === c.value;
                    return (
                      <button key={c.value} disabled={!isOwner || busy === r.rule || on} onClick={() => set(r.rule, c.value)}
                        className={`text-left rounded-xl border p-2.5 transition-colors min-w-0 ${on ? 'border-lagoon-400 bg-lagoon-500/15' : isOwner ? 'border-white/10 hover:border-white/25' : 'border-white/5 opacity-50'}`}>
                        <span className={`flex items-center gap-1.5 text-sm font-semibold ${on ? 'text-white' : 'text-gray-400'}`}>
                          <Icon name={c.icon} size={14} className={on ? 'text-lagoon-300' : ''} />{c.label}
                        </span>
                        <span className="block text-[11px] text-gray-500 mt-1 leading-snug">{c.detail}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {r.updated_at && (
                <div className="text-[11px] text-gray-600">Set {timeAgo(r.updated_at)} ago{r.updated_by_name ? ` by ${r.updated_by_name}` : ''}</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ background: C.card, borderColor: C.border }}>
        {FIRES.map((f, i) => (
          <div key={f.trigger} className={`flex items-center gap-3 px-4 py-2.5 min-w-0 ${i ? 'border-t' : ''}`} style={{ borderColor: C.border }}>
            <Icon name={f.icon} size={15} className="text-gray-400" />
            <span className="text-sm font-semibold text-white w-28 shrink-0">{f.trigger}</span>
            <Icon name="arrow" size={13} className="text-gray-700 shrink-0" />
            <span className="text-sm text-gray-400 min-w-0">{f.when}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
