import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAuthHeaders } from '../services/api';
import { ALLOWED_GAMES } from '../constants/games';
import { CHECK_TYPES_BY_TRIGGER, describeBadgeCheck } from '../constants/badgeCheckTypes';
import { buildPokemonImageUrl } from '../utils/pokemonImageUtils';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';

// ── Theme ─────────────────────────────────────────────────────────────────────
const C = {
  card:   'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)',
  inner:  'linear-gradient(160deg, #13151a 0%, #181a21 100%)',
  border: 'rgba(255,255,255,0.07)',
  input:  '#0d0f14',
};

// ── Constants ─────────────────────────────────────────────────────────────────
const BASE_BADGE_URL = 'https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev/assets/badges';

const TRIGGERS = [
  { value: 'submission',        label: 'Submission — fires when a user submits' },
  { value: 'approved',          label: 'Approved — fires when a submission is approved' },
  { value: 'rejected',          label: 'Rejected — fires when a submission is rejected' },
  { value: 'monthly_active',    label: 'Monthly Active — fires on new active month' },
  { value: 'period_end',        label: 'Period End — fires when a month / season / year closes' },
  { value: 'bingo_achievement', label: 'Bingo Achievement — fires when a bingo is recorded' },
  { value: 'date_award',        label: 'Date Award — award all users on a specific date' },
  { value: 'account_age',       label: 'Account Age — fires when a user gains a new active month' },
];

const POKEMON_TYPES = [
  'normal','fire','water','electric','grass','ice',
  'fighting','poison','ground','flying','psychic','bug',
  'rock','ghost','dragon','dark','steel','fairy',
];

const GENERATIONS = [
  { value: '1', label: 'Gen I — Kanto' },
  { value: '2', label: 'Gen II — Johto' },
  { value: '3', label: 'Gen III — Hoenn' },
  { value: '4', label: 'Gen IV — Sinnoh' },
  { value: '5', label: 'Gen V — Unova' },
  { value: '6', label: 'Gen VI — Kalos' },
  { value: '7', label: 'Gen VII — Alola' },
  { value: '8', label: 'Gen VIII — Galar' },
  { value: '8.5', label: 'Gen VIII.5 — Hisui' },
  { value: '9', label: 'Gen IX — Paldea' },
];

const INITIAL_FORM = {
  key: '', name: '', description: '', hint: '',
  is_secret: false,
  family: '', family_order: '0',
  family_display_name: '', family_display_order: '0', family_is_sequential: true,
  trigger: 'approved', check_type: 'approved_count',
  check_value: '1', check_qualifier: '',
};

// ── Shared primitives ─────────────────────────────────────────────────────────

function Field({ label, note, name, value, onChange, placeholder, textarea, required, type = 'text', ...rest }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
        {note && <span className="text-gray-600 font-normal normal-case tracking-normal ml-1">— {note}</span>}
      </label>
      {textarea
        ? <textarea name={name} value={value} onChange={onChange} placeholder={placeholder}
            required={required} rows={2}
            className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 border focus:border-purple-500 focus:outline-none resize-none transition-colors"
            style={{ background: C.input, borderColor: C.border }} />
        : <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder}
            required={required}
            className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 border focus:border-purple-500 focus:outline-none transition-colors"
            style={{ background: C.input, borderColor: C.border }} {...rest} />
      }
    </div>
  );
}

function SectionBox({ title, children }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
      {title && (
        <div className="px-4 py-2.5 border-b" style={{ background: 'rgba(255,255,255,0.03)', borderColor: C.border }}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{title}</p>
        </div>
      )}
      <div className="p-4 space-y-4" style={{ background: C.inner }}>
        {children}
      </div>
    </div>
  );
}

function Alert({ type, children }) {
  const styles = {
    error:   'text-red-300 bg-red-900/20 border-red-700/50',
    success: 'text-green-300 bg-green-900/20 border-green-700/50',
    info:    'text-blue-300 bg-blue-900/20 border-blue-700/50',
  };
  return (
    <div className={`rounded-lg px-4 py-3 text-sm border ${styles[type] || styles.info}`}>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BadgeUpload() {
  const { user, loading: authLoading, isModerator } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('create');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (authLoading || isModerator === null) return;
    if (!user || !isModerator) navigate('/');
  }, [user, authLoading, isModerator, navigate]);

  if (isModerator === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d0f14' }}>
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const TABS = [
    { id: 'create',      label: 'Create Badge',     icon: '✦' },
    { id: 'grant',       label: 'Grant / Revoke',    icon: '✚' },
    { id: 'replace',     label: 'Replace Image',     icon: '⟳' },
    { id: 'collections', label: 'Collections',       icon: '◈' },
    { id: 'visualizer',  label: 'Visualize',         icon: '◉' },
  ];

  return (
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />
      <PageHeader title="Badge Admin" badge="mod" maxWidth="5xl" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">

        {/* Tab bar */}
        <div className="flex gap-1 my-6 flex-wrap">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                  : 'text-gray-500 hover:text-gray-200'
              }`}
            >
              <span className="text-xs leading-none opacity-70">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'create'      && <CreateBadgeTab onCreated={() => { setRefreshKey(k => k + 1); setTab('visualizer'); }} />}
        {tab === 'grant'       && <GrantBadgeTab />}
        {tab === 'replace'     && <ReplaceImageTab />}
        {tab === 'collections' && <ManageCollectionsTab />}
        {tab === 'visualizer'  && <BadgeVisualizerTab refreshKey={refreshKey} />}
      </div>
    </div>
  );
}

// ── Create Badge tab ──────────────────────────────────────────────────────────

function CreateBadgeTab({ onCreated }) {
  const fileInputRef = useRef(null);
  const [preview,       setPreview]       = useState(null);
  const [imageFile,     setImageFile]     = useState(null);
  const [submitting,    setSubmitting]    = useState(false);
  const [success,       setSuccess]       = useState(null);
  const [error,         setError]         = useState(null);
  const [form,          setForm]          = useState(INITIAL_FORM);
  const [familyOptions, setFamilyOptions] = useState([]);
  const [isNewFamily,   setIsNewFamily]   = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch('/api/admin/badge-families', { headers: await getAuthHeaders() });
        const data = await res.json();
        setFamilyOptions(data || []);
      } catch { /* silent */ }
    })();
  }, []);

  const checkTypes           = CHECK_TYPES_BY_TRIGGER[form.trigger] ?? [];
  const isPercentage         = form.check_type === 'type_percentage' || form.check_type === 'generation_percentage';
  const isCollection         = form.check_type === 'collection_complete';
  const isPlacement          = ['top_placement_month', 'top_placement_season', 'top_placement_year'].includes(form.check_type);
  const isPeriodId           = ['approved_count_in_month', 'approved_count_in_season', 'approved_count_in_year', 'top_placement_month', 'top_placement_season', 'top_placement_year'].includes(form.check_type);
  const isBingo              = form.check_type === 'bingo_achievement_count';
  const isDateAward          = form.check_type === 'date_award';
  const isFirstApprovalMonth = form.check_type === 'first_approval_month';
  const showQualifier        = isPercentage || isCollection || isPeriodId || isBingo || isDateAward;
  const checkValueLabel      = isPlacement ? 'Top X (max rank)' : isPercentage ? 'Percentage (0–100)' : 'Threshold';
  const checkValuePH         = isPlacement ? '3' : isPercentage ? '100' : '1';
  const periodIdLabel        = ['approved_count_in_month', 'top_placement_month'].includes(form.check_type) ? 'Month ID'
    : ['approved_count_in_season', 'top_placement_season'].includes(form.check_type) ? 'Season ID' : 'Year ID';

  const defaultCheckValue = (type) => {
    if (type === 'type_percentage' || type === 'generation_percentage') return '100';
    if (['top_placement_month', 'top_placement_season', 'top_placement_year'].includes(type)) return '3';
    return '1';
  };

  const handleField = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleTriggerChange = (e) => {
    const newTrigger = e.target.value;
    const firstType  = CHECK_TYPES_BY_TRIGGER[newTrigger][0].value;
    setForm(f => ({ ...f, trigger: newTrigger, check_type: firstType, check_qualifier: firstType === 'bingo_achievement_count' ? 'any' : '', check_value: defaultCheckValue(firstType) }));
  };

  const handleCheckTypeChange = (e) => {
    const newType = e.target.value;
    setForm(f => ({ ...f, check_type: newType, check_qualifier: newType === 'bingo_achievement_count' ? 'any' : '', check_value: defaultCheckValue(newType) }));
  };

  const getBingoTypes = (qualifier) =>
    qualifier === 'any' ? ['row', 'column', 'x', 'blackout'] : (qualifier || '').split(',').filter(Boolean);

  const handleBingoTypeToggle = (type, checked) => {
    setForm(f => {
      const current = getBingoTypes(f.check_qualifier);
      const updated  = checked ? [...new Set([...current, type])] : current.filter(t => t !== type);
      return { ...f, check_qualifier: updated.length === 4 ? 'any' : updated.join(',') };
    });
  };

  const handleFamilySelect = (e) => {
    const val = e.target.value;
    if (val === '__new__') {
      setIsNewFamily(true);
      setForm(f => ({ ...f, family: '', family_display_name: '', family_display_order: '0', family_is_sequential: true }));
    } else {
      setIsNewFamily(false);
      setForm(f => ({ ...f, family: val }));
    }
  };

  const handleImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (!imageFile) { setError('Please select a badge image.'); return; }
    if (!form.key)  { setError('Image key is required.'); return; }
    if (showQualifier && !form.check_qualifier && !isPeriodId) { setError('Please fill in the qualifier.'); return; }

    setSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      delete headers['Content-Type'];
      const body = new FormData();
      body.append('image', imageFile);
      body.append('family_is_new', isNewFamily ? 'true' : 'false');
      Object.entries(form).forEach(([k, v]) => body.append(k, v));
      const res  = await fetch('/api/badges', { method: 'POST', headers: { Authorization: headers.Authorization }, body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setForm(INITIAL_FORM);
      setImageFile(null);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onCreated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const selectStyle = { background: C.input, borderColor: C.border };
  const selectCls = 'w-full rounded-lg px-3 py-2 text-sm text-white border focus:border-purple-500 focus:outline-none transition-colors';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">

      {/* Left — main form */}
      <form onSubmit={handleSubmit} className="space-y-4">

        <SectionBox title="Badge Image">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl border flex items-center justify-center overflow-hidden shrink-0"
              style={{ borderColor: C.border, background: C.input }}>
              {preview
                ? <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                : <span className="text-gray-700 text-xs text-center leading-tight px-1">PNG<br/>500×500</span>}
            </div>
            <div className="flex-1 min-w-0">
              <label className="inline-flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg text-sm font-medium text-purple-300 border border-purple-500/40 hover:border-purple-400 hover:bg-purple-500/10 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Choose PNG
                <input ref={fileInputRef} type="file" accept="image/png" className="hidden" onChange={handleImage} />
              </label>
              {imageFile && <p className="mt-1.5 text-xs text-gray-500 truncate">{imageFile.name}</p>}
            </div>
          </div>
        </SectionBox>

        <SectionBox title="Identity">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Image Key <span className="text-red-400">*</span>
              <span className="text-gray-600 font-normal normal-case tracking-normal ml-1">— R2 filename, never change after seeding</span>
            </label>
            <input type="text" name="key" value={form.key} onChange={handleField} placeholder="e.g. sub_veteran_7"
              required className={selectCls} style={selectStyle} />
            {form.key && (
              <p className="mt-1.5 text-[11px] text-gray-600 truncate">
                {BASE_BADGE_URL}/<span className="text-purple-400">{form.key}</span>.png
              </p>
            )}
          </div>
          <Field label="Name" name="name" value={form.name} onChange={handleField} placeholder="e.g. Century Hunter" required />
          <Field label="Description" name="description" value={form.description} onChange={handleField} placeholder="Shown on the badge card." textarea required />
          <Field label="Hint" name="hint" value={form.hint} onChange={handleField} placeholder="How to earn this badge." note="shown when hint chain unlocked" textarea />
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input type="checkbox" id="is_secret" name="is_secret" checked={form.is_secret} onChange={handleField}
              className="w-4 h-4 rounded accent-purple-500" />
            <span className="text-sm text-gray-300">
              Secret badge
              <span className="text-gray-600 font-normal ml-1">— hides name, image, and hint until earned</span>
            </span>
          </label>
        </SectionBox>

        <SectionBox title="Family">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Family</label>
              <select value={isNewFamily ? '__new__' : (form.family || '')} onChange={handleFamilySelect} className={selectCls} style={selectStyle}>
                <option value="">— no family —</option>
                {familyOptions.map(f => (
                  <option key={f.id} value={f.id}>{f.display_name} ({f.id})</option>
                ))}
                <option value="__new__">＋ New family…</option>
              </select>
            </div>
            <Field label="Family Order" note="0 = next" name="family_order" value={form.family_order} onChange={handleField} type="number" min="0" placeholder="0" />
          </div>

          {isNewFamily && (
            <div className="rounded-lg border p-3 space-y-3 mt-1" style={{ borderColor: 'rgba(147,51,234,0.3)', background: 'rgba(147,51,234,0.05)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-purple-400">New Family</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Slug" name="family" value={form.family} onChange={handleField} placeholder="submission_veteran" required />
                <Field label="Display Name" name="family_display_name" value={form.family_display_name} onChange={handleField} placeholder="Submission Veteran" required />
                <Field label="Display Order" name="family_display_order" value={form.family_display_order} onChange={handleField} type="number" min="0" placeholder="0" />
                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="family_is_sequential" checked={form.family_is_sequential} onChange={handleField} className="w-4 h-4 rounded accent-purple-500" />
                    <span className="text-sm text-gray-300">Sequential hints</span>
                  </label>
                  <p className="text-[11px] text-gray-600 mt-1">
                    {form.family_is_sequential ? 'Hint locked until previous earned' : 'All hints always visible'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </SectionBox>

        <SectionBox title="Earn Condition">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Trigger <span className="text-red-400">*</span></label>
            <select name="trigger" value={form.trigger} onChange={handleTriggerChange} required className={selectCls} style={selectStyle}>
              {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Check Type <span className="text-red-400">*</span></label>
            <select value={form.check_type} onChange={handleCheckTypeChange} required className={selectCls} style={selectStyle}>
              {checkTypes.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
            </select>
          </div>

          {form.check_type === 'type_percentage' && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Pokémon Type <span className="text-red-400">*</span></label>
              <select name="check_qualifier" value={form.check_qualifier} onChange={handleField} required className={`${selectCls} capitalize`} style={selectStyle}>
                <option value="">— pick a type —</option>
                {POKEMON_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
          )}

          {form.check_type === 'generation_percentage' && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Generation <span className="text-red-400">*</span></label>
              <select name="check_qualifier" value={form.check_qualifier} onChange={handleField} required className={selectCls} style={selectStyle}>
                <option value="">— pick a generation —</option>
                {GENERATIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
          )}

          {isCollection && (
            <Field label="Collection Slug" name="check_qualifier" value={form.check_qualifier} onChange={handleField}
              note='must match slug in Collections tab' placeholder="weather_trio" required />
          )}

          {form.check_type === 'date_award' && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Award Date <span className="text-red-400">*</span></label>
              <input type="date" name="check_qualifier" value={form.check_qualifier} onChange={handleField} required
                className={selectCls} style={{ ...selectStyle, colorScheme: 'dark' }} />
              <p className="mt-1.5 text-[11px] text-gray-600">Every registered user receives this badge. Cron runs at midnight UTC; anyone who joins on this date is still included.</p>
            </div>
          )}

          {isPeriodId && (
            <Field label={periodIdLabel} name="check_qualifier" value={form.check_qualifier} onChange={handleField}
              type="number" placeholder="blank = any period"
              note={`Leave blank for any ${periodIdLabel.replace(' ID', '').toLowerCase()}, or enter a specific ID.`} />
          )}

          {isBingo && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Count these bingo types <span className="text-gray-600 font-normal normal-case tracking-normal ml-1">— each includes its restricted variant</span>
              </label>
              <div className="grid grid-cols-2 gap-1">
                {['row', 'column', 'x', 'blackout'].map(type => (
                  <label key={type} className="flex items-center gap-2 cursor-pointer py-1">
                    <input type="checkbox" className="accent-purple-500"
                      checked={getBingoTypes(form.check_qualifier).includes(type)}
                      onChange={e => handleBingoTypeToggle(type, e.target.checked)} />
                    <span className="text-sm text-gray-300 capitalize">{type}</span>
                    <span className="text-xs text-gray-600">+ {type}_restricted</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {isFirstApprovalMonth && (
            <p className="text-xs text-gray-500">Awarded once per month to the first player whose catch is approved. No threshold required.</p>
          )}

          {!isCollection && !isDateAward && !isFirstApprovalMonth && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                {checkValueLabel} <span className="text-red-400">*</span>
              </label>
              <input type="number" name="check_value" value={form.check_value} onChange={handleField}
                min={1} max={isPercentage ? 100 : undefined} placeholder={checkValuePH} required
                className={selectCls} style={selectStyle} />
              {isPercentage && <p className="mt-1.5 text-[11px] text-gray-600">Enter 50 for 50%, 100 for 100%.</p>}
              {isPlacement  && <p className="mt-1.5 text-[11px] text-gray-600">e.g. 3 = top 3 finishers earn this badge. Ties broken by who scored first.</p>}
              {isPeriodId   && <p className="mt-1.5 text-[11px] text-gray-600">Minimum approvals in the period.</p>}
            </div>
          )}

          {isCollection && <p className="text-[11px] text-gray-600">Earned when the user has caught every Pokémon in the collection.</p>}
        </SectionBox>

        {error   && <Alert type="error">{error}</Alert>}
        {success && <Alert type="success">{success}</Alert>}

        <button type="submit" disabled={submitting}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          {submitting ? 'Creating badge…' : 'Create Badge'}
        </button>
      </form>

      {/* Right — live preview */}
      <div className="lg:sticky lg:top-4 self-start space-y-4">
        <SectionBox title="Live Preview">
          {form.name || preview ? (
            <div className="flex flex-col items-center gap-3">
              <BadgeCard
                badge={{
                  id: 'preview', name: form.name || 'Badge Name',
                  description: form.description || 'Description goes here.',
                  hint: form.hint, image_url: preview,
                  is_secret: form.is_secret, check_type: form.check_type,
                  check_value: form.check_value, check_qualifier: form.check_qualifier,
                  family_order: Number(form.family_order) || 0,
                }}
                silhouette={false} publicView={false} isSequential={false} large
              />
              {form.name && <p className="text-sm font-semibold text-white text-center">{form.name}</p>}
              {form.description && <p className="text-xs text-gray-400 text-center leading-snug">{form.description}</p>}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-700 flex items-center justify-center">
                <span className="text-gray-700 text-2xl">◈</span>
              </div>
              <p className="text-xs text-gray-600">Fill in a name or upload an image</p>
            </div>
          )}
        </SectionBox>
      </div>
    </div>
  );
}

// ── Replace Image tab ─────────────────────────────────────────────────────────

function ReplaceImageTab() {
  const fileInputRef = useRef(null);
  const [allBadges,    setAllBadges]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [selected,     setSelected]     = useState(null); // badge object
  const [newFile,      setNewFile]      = useState(null);
  const [newPreview,   setNewPreview]   = useState(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [feedback,     setFeedback]     = useState(null); // { type, msg }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res  = await fetch('/api/admin/badges', { headers: await getAuthHeaders() });
        const data = await res.json();
        setAllBadges(data || []);
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, []);

  const filtered = allBadges
    .filter(b =>
      !search.trim() ||
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.key.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const oa = a.badge_families?.display_order ?? Infinity;
      const ob = b.badge_families?.display_order ?? Infinity;
      if (oa !== ob) return oa - ob;
      const fa = a.badge_families?.display_name ?? '';
      const fb = b.badge_families?.display_name ?? '';
      if (fa !== fb) return fa.localeCompare(fb);
      return (a.family_order ?? 0) - (b.family_order ?? 0);
    });

  const handleSelect = (badge) => {
    setSelected(badge);
    setNewFile(null);
    setNewPreview(null);
    setFeedback(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewFile(file);
    setNewPreview(URL.createObjectURL(file));
    setFeedback(null);
  };

  const handleReplace = async () => {
    if (!selected || !newFile) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const headers = await getAuthHeaders();
      delete headers['Content-Type'];
      const body = new FormData();
      body.append('image', newFile);
      const res  = await fetch(`/api/admin/badges/${selected.id}/image`, {
        method: 'PATCH',
        headers: { Authorization: headers.Authorization },
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Replace failed');
      // Update local cache
      const updated = { ...selected, image_url: data.image_url };
      setAllBadges(prev => prev.map(b => b.id === selected.id ? updated : b));
      setSelected(updated);
      setNewFile(null);
      setNewPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setFeedback({ type: 'success', msg: `Image replaced for "${selected.name}".` });
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message });
    }
    setSubmitting(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">

      {/* Left — badge picker */}
      <div className="space-y-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search badges by name or key…"
            className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-600 border focus:border-purple-500 focus:outline-none transition-colors"
            style={{ background: C.input, borderColor: C.border }}
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-2 border-gray-700 border-t-purple-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border, background: C.inner }}>
            <div className="px-4 py-2.5 border-b" style={{ borderColor: C.border, background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                {filtered.length} badge{filtered.length !== 1 ? 's' : ''}
                {search ? ` matching "${search}"` : ''}
              </p>
            </div>
            <div className="divide-y max-h-[520px] overflow-y-auto" style={{ borderColor: C.border }}>
              {filtered.length === 0 && (
                <p className="text-sm text-gray-600 text-center py-8">No badges found.</p>
              )}
              {filtered.map(badge => (
                <button
                  key={badge.id}
                  onClick={() => handleSelect(badge)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all"
                  style={{
                    background: selected?.id === badge.id ? 'rgba(147,51,234,0.12)' : 'transparent',
                    borderLeft: selected?.id === badge.id ? '3px solid #a855f7' : '3px solid transparent',
                  }}
                >
                  <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border" style={{ borderColor: C.border }}>
                    {badge.image_url
                      ? <img src={badge.image_url} alt={badge.name} className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                      : <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-700 text-xs">?</div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{badge.name}</p>
                    <p className="text-[11px] text-gray-600 truncate">{badge.key}</p>
                  </div>
                  {badge.is_secret && (
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full text-yellow-400 bg-yellow-400/10 border border-yellow-400/20">
                      secret
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right — replace panel */}
      <div className="lg:sticky lg:top-4 self-start">
        {!selected ? (
          <div className="rounded-xl border flex flex-col items-center justify-center py-16 gap-3" style={{ borderColor: C.border, background: C.inner }}>
            <div className="w-14 h-14 rounded-xl border-2 border-dashed border-gray-700 flex items-center justify-center">
              <span className="text-gray-700 text-2xl">⟳</span>
            </div>
            <p className="text-sm text-gray-600 text-center px-6">Select a badge from the list to replace its image</p>
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
            <div className="px-4 py-3 border-b" style={{ background: 'rgba(255,255,255,0.03)', borderColor: C.border }}>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Replace Image</p>
            </div>
            <div className="p-4 space-y-4" style={{ background: C.inner }}>

              {/* Current vs new */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center gap-2">
                  <p className="text-[10px] uppercase tracking-widest text-gray-600">Current</p>
                  <div className="w-20 h-20 rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
                    {selected.image_url
                      ? <img src={selected.image_url} alt={selected.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-gray-900 flex items-center justify-center text-gray-700 text-xs">none</div>
                    }
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <p className="text-[10px] uppercase tracking-widest text-gray-600">New</p>
                  <div className="w-20 h-20 rounded-xl border-2 border-dashed overflow-hidden flex items-center justify-center"
                    style={{ borderColor: newPreview ? '#a855f7' : C.border, background: C.input }}>
                    {newPreview
                      ? <img src={newPreview} alt="New" className="w-full h-full object-cover" />
                      : <span className="text-gray-700 text-xs text-center px-2">upload PNG</span>
                    }
                  </div>
                </div>
              </div>

              <div className="text-center">
                <p className="text-sm font-semibold text-white">{selected.name}</p>
                <p className="text-[11px] text-gray-600 mt-0.5">{selected.key}.png</p>
              </div>

              <label className="flex items-center justify-center gap-2 cursor-pointer px-4 py-2.5 rounded-lg text-sm font-medium text-purple-300 border border-purple-500/40 hover:border-purple-400 hover:bg-purple-500/10 transition-all w-full">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Choose new PNG
                <input ref={fileInputRef} type="file" accept="image/png" className="hidden" onChange={handleFile} />
              </label>

              {newFile && <p className="text-[11px] text-gray-600 text-center truncate">{newFile.name}</p>}

              {feedback && <Alert type={feedback.type}>{feedback.msg}</Alert>}

              <button
                onClick={handleReplace}
                disabled={!newFile || submitting}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? 'Replacing…' : 'Replace Image'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Manage Collections tab ────────────────────────────────────────────────────

function ManageCollectionsTab() {
  const [slug,         setSlug]         = useState('');
  const [slugOptions,  setSlugOptions]  = useState([]);
  const [isNewSlug,    setIsNewSlug]    = useState(false);
  const [members,      setMembers]      = useState(null);
  const [requiredGame, setRequiredGame] = useState('');
  const [savingGame,   setSavingGame]   = useState(false);
  const [loadingCol,   setLoadingCol]   = useState(false);
  const [searchQ,      setSearchQ]      = useState('');
  const [results,      setResults]      = useState([]);
  const [searching,    setSearching]    = useState(false);
  const [feedback,     setFeedback]     = useState(null);
  const searchTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch('/api/admin/collections', { headers: await getAuthHeaders() });
        const data = await res.json();
        const normalized = (data || []).map(item =>
          typeof item === 'string' ? { slug: item, required_game: null } : item
        );
        setSlugOptions(normalized);
      } catch { /* silent */ }
    })();
  }, []);

  const resetCollection = () => {
    setMembers(null); setResults([]); setSearchQ(''); setFeedback(null); setRequiredGame('');
  };

  const handleSlugSelect = (e) => {
    const val = e.target.value;
    if (val === '__new__') {
      setIsNewSlug(true); setSlug(''); resetCollection();
    } else {
      setIsNewSlug(false); setSlug(val); resetCollection();
      if (val) loadCollection(val);
    }
  };

  const loadCollection = async (s = slug) => {
    if (!s.trim()) return;
    setLoadingCol(true); setFeedback(null);
    try {
      const res  = await fetch(`/api/admin/collections/${encodeURIComponent(s.trim())}`, { headers: await getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMembers(data.members);
      setRequiredGame(data.required_game ?? '');
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message });
    } finally { setLoadingCol(false); }
  };

  const saveRequiredGame = async (game) => {
    if (!slug.trim()) return;
    setSavingGame(true); setFeedback(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/collections/${encodeURIComponent(slug.trim())}/game`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ required_game: game || null }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setRequiredGame(game);
      setSlugOptions(prev => prev.map(o => o.slug === slug ? { ...o, required_game: game || null } : o));
      setFeedback({ type: 'success', msg: game ? `Game set to "${ALLOWED_GAMES.find(g => g.key === game)?.label ?? game}".` : 'Game requirement cleared.' });
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message });
    } finally { setSavingGame(false); }
  };

  const removeMember = async (pokemon) => {
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/collections/${encodeURIComponent(slug.trim())}/pokemon/${pokemon.id}`, {
        method: 'DELETE', headers: await getAuthHeaders(),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setMembers(m => m.filter(p => p.id !== pokemon.id));
      setFeedback({ type: 'success', msg: `Removed ${pokemon.name}.` });
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message });
    }
  };

  const addMember = async (pokemon) => {
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/collections/${encodeURIComponent(slug.trim())}/pokemon/${pokemon.id}`, {
        method: 'POST', headers: await getAuthHeaders(),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setMembers(m => m ? [...m, pokemon] : [pokemon]);
      setResults(r => r.filter(p => p.id !== pokemon.id));
      setFeedback({ type: 'success', msg: `Added ${pokemon.name}.` });
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message });
    }
  };

  const handleSearchChange = (e) => {
    const q = e.target.value;
    setSearchQ(q);
    clearTimeout(searchTimer.current);
    if (!q.trim()) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res  = await fetch(`/api/pokemon/search?q=${encodeURIComponent(q)}`, { headers: await getAuthHeaders() });
        const data = await res.json();
        const memberIds = new Set((members || []).map(p => p.id));
        setResults((data || []).filter(p => !memberIds.has(p.id)));
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
  };

  const slugLoaded = slug.trim() && members !== null;
  const selectStyle = { background: C.input, borderColor: C.border };
  const selectCls = 'w-full rounded-lg px-3 py-2 text-sm text-white border focus:border-purple-500 focus:outline-none transition-colors';

  return (
    <div className="space-y-4">
      <SectionBox title="Collection">
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Collection Slug</label>
          <select value={isNewSlug ? '__new__' : (slug || '')} onChange={handleSlugSelect} className={selectCls} style={selectStyle}>
            <option value="">— select a collection —</option>
            {slugOptions.map(o => (
              <option key={o.slug} value={o.slug}>
                {o.slug}{o.required_game ? ` [${o.required_game}]` : ''}
              </option>
            ))}
            <option value="__new__">＋ New collection…</option>
          </select>

          {isNewSlug && (
            <div className="flex gap-2 mt-2">
              <input type="text" value={slug} onChange={e => { setSlug(e.target.value); resetCollection(); }}
                onKeyDown={e => e.key === 'Enter' && loadCollection()}
                placeholder="e.g. legendary_birds"
                className={`flex-1 ${selectCls}`} style={selectStyle} />
              <button type="button" onClick={() => loadCollection()} disabled={!slug.trim() || loadingCol}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 transition-colors">
                {loadingCol ? '…' : 'Create'}
              </button>
            </div>
          )}
        </div>
      </SectionBox>

      {slugLoaded && (
        <SectionBox title="Required Game">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <p className="text-[11px] text-gray-600 mb-2">Only entries from this game count toward completing this collection. Leave blank to accept any game.</p>
              <select value={requiredGame} onChange={e => setRequiredGame(e.target.value)} disabled={savingGame} className={selectCls} style={selectStyle}>
                <option value="">Any game</option>
                {ALLOWED_GAMES.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => saveRequiredGame(requiredGame)} disabled={savingGame}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 transition-colors shrink-0">
              {savingGame ? 'Saving…' : 'Save'}
            </button>
          </div>
        </SectionBox>
      )}

      {feedback && <Alert type={feedback.type}>{feedback.msg}</Alert>}

      {slugLoaded && (
        <SectionBox title={`Members of ${slug} (${members.length})`}>
          {members.length === 0 ? (
            <p className="text-sm text-gray-600 italic text-center py-4">No Pokémon in this collection yet.</p>
          ) : (
            <div className="divide-y -mx-4 -mt-4" style={{ borderColor: C.border }}>
              {members.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  {p.national_dex_id && <img src={buildPokemonImageUrl(p)} alt={p.name} className="w-8 h-8 object-contain shrink-0" />}
                  <span className="flex-1 text-sm text-white capitalize">{p.name}</span>
                  <span className="text-xs text-gray-600">#{String(p.national_dex_id).padStart(4, '0')}</span>
                  <button type="button" onClick={() => removeMember(p)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors ml-2">Remove</button>
                </div>
              ))}
            </div>
          )}
        </SectionBox>
      )}

      {slugLoaded && (
        <SectionBox title="Add Pokémon">
          <input type="text" value={searchQ} onChange={handleSearchChange} placeholder="Search by name…"
            className={selectCls} style={selectStyle} />
          {searching && <p className="text-xs text-gray-600">Searching…</p>}
          {results.length > 0 && (
            <div className="divide-y -mx-4 -mt-2" style={{ borderColor: C.border }}>
              {results.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  {p.national_dex_id && <img src={buildPokemonImageUrl(p)} alt={p.name} className="w-8 h-8 object-contain shrink-0" />}
                  <span className="flex-1 text-sm text-white capitalize">{p.name}</span>
                  <span className="text-xs text-gray-600">#{String(p.national_dex_id).padStart(4, '0')}</span>
                  <button type="button" onClick={() => addMember(p)}
                    className="text-xs text-purple-400 hover:text-purple-300 transition-colors ml-2">+ Add</button>
                </div>
              ))}
            </div>
          )}
        </SectionBox>
      )}

      {!slug.trim() && (
        <div className="text-center py-12 text-gray-600 text-sm">
          Select a collection above, or choose <strong className="text-gray-400">＋ New collection…</strong> to create one.
        </div>
      )}
    </div>
  );
}

// ── Badge Visualizer tab ──────────────────────────────────────────────────────

const checkDescription = describeBadgeCheck;

function GripIcon() {
  return (
    <svg className="w-4 h-4 text-gray-600 flex-shrink-0" fill="currentColor" viewBox="0 0 16 16">
      <circle cx="5" cy="4" r="1.2" /><circle cx="11" cy="4" r="1.2" />
      <circle cx="5" cy="8" r="1.2" /><circle cx="11" cy="8" r="1.2" />
      <circle cx="5" cy="12" r="1.2" /><circle cx="11" cy="12" r="1.2" />
    </svg>
  );
}

function ToggleChip({ active, onClick, label }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
        active
          ? 'bg-purple-600/20 border-purple-500/40 text-purple-300'
          : 'bg-transparent border-white/[0.07] text-gray-500 hover:text-gray-300 hover:border-gray-500'
      }`}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? 'bg-purple-400' : 'bg-gray-700'}`} />
      {label}
    </button>
  );
}

function BadgeCard({ badge, silhouette, publicView, isSequential, large }) {
  const isHintLocked   = publicView && isSequential && (badge.family_order ?? 1) > 1;
  const isSecretHidden = publicView && badge.is_secret;
  const size = large ? 'w-20 h-20' : 'w-12 h-12';

  return (
    <div className="group relative flex-shrink-0">
      <div className={`${size} rounded-xl overflow-hidden border-2 transition-colors ${
        badge.is_secret && !publicView ? 'border-yellow-500/40' : 'border-white/[0.07]'
      }`}>
        {isSecretHidden ? (
          <div className="w-full h-full flex items-center justify-center bg-gray-900">
            <span className="text-gray-600 text-xl font-bold select-none">?</span>
          </div>
        ) : (
          <img src={badge.image_url} alt={badge.name} className="w-full h-full object-cover"
            style={{ filter: silhouette ? 'brightness(0)' : 'none' }}
            onError={e => { e.target.style.display = 'none'; }} />
        )}
      </div>

      {badge.is_secret && !publicView && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center text-[10px] leading-none">
          ★
        </div>
      )}

      {!isSecretHidden && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-xl p-3 text-xs
                       opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50
                       shadow-2xl space-y-1.5 border"
          style={{ background: '#0d0f14', borderColor: C.border }}>
          <p className="font-bold text-white leading-snug">{badge.name}</p>
          {badge.is_secret && <span className="text-yellow-400 text-[10px]">★ Secret badge</span>}
          <p className="text-gray-400 leading-snug">{badge.description}</p>
          {badge.hint && !isHintLocked && <p className="text-purple-300">💡 {badge.hint}</p>}
          {isHintLocked && <p className="text-gray-600 italic">💡 Hint locked until previous earned</p>}
          <p className="text-blue-400 pt-1.5 border-t border-white/[0.06]">✓ {checkDescription(badge)}</p>
          <p className="text-gray-700">Order: {badge.family_order ?? '—'}</p>
        </div>
      )}
    </div>
  );
}

// ── Grant / Revoke tab ────────────────────────────────────────────────────────

function GrantBadgeTab() {
  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected,  setSelected]  = useState(null);   // { id, display_name, username, avatar_url }
  const [badges,    setBadges]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [busyId,    setBusyId]    = useState(null);    // badge id currently granting/revoking
  const [message,   setMessage]   = useState(null);    // { type, text }
  const [filter,    setFilter]    = useState('');
  const [monthlyBadge, setMonthlyBadge] = useState(null); // badge object when managing months
  const searchSeq = useRef(0);

  // Debounced user search
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    const seq = ++searchSeq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`, { headers: await getAuthHeaders() });
        const data = await res.json();
        if (seq === searchSeq.current) setResults(Array.isArray(data) ? data : []);
      } catch { if (seq === searchSeq.current) setResults([]); }
      finally { if (seq === searchSeq.current) setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const loadBadges = async (userId) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/users/${userId}/badges`, { headers: await getAuthHeaders() });
      const data = await res.json();
      setBadges(Array.isArray(data) ? data : []);
    } catch { setBadges([]); }
    finally { setLoading(false); }
  };

  const selectUser = (u) => {
    setSelected(u);
    setResults([]);
    setQuery('');
    setMessage(null);
    setFilter('');
    loadBadges(u.id);
  };

  const toggleBadge = async (badge) => {
    if (busyId) return;
    if (badge.is_monthly) { setMonthlyBadge(badge); return; }
    const granting = !badge.is_earned;
    if (!granting && !confirm(`Revoke "${badge.name}" from ${selected.display_name}?`)) return;
    setBusyId(badge.id);
    setMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/users/${selected.id}/badges/${badge.id}`, {
        method: granting ? 'POST' : 'DELETE',
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setBadges(bs => bs.map(b => b.id === badge.id
        ? { ...b, is_earned: granting, earned_at: granting ? new Date().toISOString() : null }
        : b));
      setMessage({ type: 'success', text: `${granting ? 'Granted' : 'Revoked'} "${badge.name}" ${granting ? 'to' : 'from'} ${selected.display_name}.` });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusyId(null);
    }
  };

  const earnedCount = badges.filter(b => b.is_earned).length;
  const filtered = badges.filter(b => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (b.name || '').toLowerCase().includes(q) || (b.key || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* User search */}
      <div className="rounded-xl border" style={{ borderColor: C.border, background: C.card }}>
        <div className="px-4 py-2.5 border-b" style={{ background: 'rgba(255,255,255,0.03)', borderColor: C.border }}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Find Player</p>
        </div>
        <div className="p-4">
          <div className="relative">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by display name or username…"
              className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 border focus:border-purple-500 focus:outline-none transition-colors"
              style={{ background: C.input, borderColor: C.border }}
            />
            {(results.length > 0 || (query.trim() && !searching)) && (
            <div className="absolute z-40 mt-1 w-full rounded-lg border overflow-hidden shadow-2xl"
              style={{ background: '#0d0f14', borderColor: C.border }}>
              {results.length === 0
                ? <div className="px-3 py-2.5 text-sm text-gray-600">No players found</div>
                : results.map(u => (
                    <button key={u.id} onClick={() => selectUser(u)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.04] transition-colors">
                      {u.avatar_url
                        ? <img src={u.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                        : <div className="w-7 h-7 rounded-full bg-gray-800 flex-shrink-0" />}
                      <span className="text-sm text-white truncate">{u.display_name || u.username}</span>
                      {u.username && u.display_name !== u.username && (
                        <span className="text-xs text-gray-600 truncate">@{u.username}</span>
                      )}
                    </button>
                  ))}
            </div>
            )}
          </div>
        </div>
      </div>

      {message && <Alert type={message.type}>{message.text}</Alert>}

      {/* Selected player badge grid */}
      {selected && (
        <div className="rounded-xl border p-4" style={{ background: C.card, borderColor: C.border }}>
          <div className="flex items-center gap-3 mb-4">
            {selected.avatar_url
              ? <img src={selected.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
              : <div className="w-10 h-10 rounded-full bg-gray-800" />}
            <div className="min-w-0">
              <p className="text-white font-semibold truncate">{selected.display_name || selected.username}</p>
              <p className="text-xs text-gray-500">{earnedCount} of {badges.length} badges earned</p>
            </div>
            <button onClick={() => { setSelected(null); setBadges([]); }}
              className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition-colors">Change player</button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-7 h-7 border-2 border-gray-700 border-t-purple-500 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter badges…"
                className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 border focus:border-purple-500 focus:outline-none transition-colors mb-4"
                style={{ background: C.input, borderColor: C.border }}
              />
              {filtered.length === 0
                ? <p className="text-center text-gray-600 py-8 text-sm">No badges match.</p>
                : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
                    {filtered.map(badge => (
                      <GrantBadgeRow key={badge.id} badge={badge}
                        busy={busyId === badge.id} disabled={busyId && busyId !== badge.id}
                        onToggle={() => toggleBadge(badge)} />
                    ))}
                  </div>
                )}
            </>
          )}
        </div>
      )}

      {!selected && (
        <p className="text-center text-gray-600 py-12 text-sm">Search for a player to grant or revoke badges.</p>
      )}

      {monthlyBadge && selected && (
        <MonthlyBadgeModal
          badge={monthlyBadge}
          user={selected}
          onClose={() => setMonthlyBadge(null)}
          onChanged={() => loadBadges(selected.id)}
        />
      )}
    </div>
  );
}

// Modal for managing a monthly-winner badge across months for one player.
function MonthlyBadgeModal({ badge, user, onClose, onChanged }) {
  const [months,  setMonths]  = useState([]);
  const [holders, setHolders] = useState({});   // { monthId: { user_id, name } }
  const [loading, setLoading] = useState(true);
  const [busyMonth, setBusyMonth] = useState(null);
  const [error,   setError]   = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/badges/${badge.id}/monthly-holders`, { headers: await getAuthHeaders() });
      const data = await res.json();
      setMonths(data.months || []);
      setHolders(data.holders || {});
    } catch { setError('Failed to load months.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const grant = async (monthId, reassign) => {
    setBusyMonth(monthId); setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/badges/${badge.id}`, {
        method: 'POST',
        headers: { ...(await getAuthHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ month_id: monthId, reassign }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === 'month_taken' && !reassign) {
          if (confirm(`${data.holder_name} currently holds this month. Reassign it to ${user.display_name || user.username}?`)) {
            return grant(monthId, true);
          }
          return;
        }
        throw new Error(data.error || 'Request failed');
      }
      await load();
      onChanged?.();
    } catch (err) { setError(err.message); }
    finally { setBusyMonth(null); }
  };

  const revoke = async (monthId) => {
    if (!confirm(`Revoke this month's win from ${user.display_name || user.username}?`)) return;
    setBusyMonth(monthId); setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/badges/${badge.id}?month_id=${monthId}`, {
        method: 'DELETE', headers: await getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      await load();
      onChanged?.();
    } catch (err) { setError(err.message); }
    finally { setBusyMonth(null); }
  };

  const uid  = user.id;
  const uname = user.display_name || user.username;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border max-h-[85vh] flex flex-col"
        style={{ background: C.card, borderColor: C.border }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: C.border }}>
          <img src={badge.image_url} alt="" className="w-10 h-10 rounded-lg object-cover border" style={{ borderColor: C.border }}
            onError={e => { e.target.style.display = 'none'; }} />
          <div className="min-w-0">
            <p className="text-white font-semibold truncate">{badge.name}</p>
            <p className="text-xs text-gray-500">Monthly winner — assign per month to {uname}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-gray-500 hover:text-white text-lg leading-none">✕</button>
        </div>

        {error && <div className="px-4 pt-3"><Alert type="error">{error}</Alert></div>}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-gray-700 border-t-purple-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-y-auto p-3 space-y-1.5">
            {months.length === 0 && <p className="text-center text-gray-600 py-8 text-sm">No months found.</p>}
            {months.map(m => {
              const holder    = holders[m.id];
              const heldBySelf = holder?.user_id === uid;
              const busy      = busyMonth === m.id;
              return (
                <div key={m.id} className="flex items-center gap-3 rounded-lg border px-3 py-2"
                  style={{ borderColor: C.border, background: C.inner }}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white leading-tight">{m.label}</p>
                    <p className={`text-[11px] leading-tight ${heldBySelf ? 'text-green-400' : holder ? 'text-gray-500' : 'text-gray-600'}`}>
                      {holder ? (heldBySelf ? '✓ Held by this player' : `Held by ${holder.name}`) : 'No winner'}
                    </p>
                  </div>
                  {busy
                    ? <span className="text-xs text-gray-500">…</span>
                    : heldBySelf
                      ? <button onClick={() => revoke(m.id)}
                          className="text-xs font-medium px-2.5 py-1 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 transition-colors">Revoke</button>
                      : <button onClick={() => grant(m.id, false)}
                          className="text-xs font-medium px-2.5 py-1 rounded-lg border border-purple-500/40 text-purple-300 hover:bg-purple-500/10 transition-colors">
                          {holder ? 'Reassign' : 'Grant'}
                        </button>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function GrantBadgeRow({ badge, busy, disabled, onToggle }) {
  const earned  = badge.is_earned;
  const monthly = badge.is_monthly;
  const monthCount = (badge.earned_month_ids || []).length;
  const status = monthly
    ? (monthCount > 0 ? `Winner of ${monthCount} month${monthCount !== 1 ? 's' : ''} — manage` : 'Monthly winner — assign months')
    : (earned ? '✓ Earned — click to revoke' : 'Click to grant');
  return (
    <button
      onClick={onToggle}
      disabled={busy || disabled}
      className={`flex items-center gap-2.5 rounded-lg border p-2 text-left transition-all disabled:opacity-40 ${
        monthly
          ? 'border-amber-500/30 bg-amber-500/[0.04] hover:border-amber-500/50 hover:bg-amber-500/[0.08]'
          : earned
            ? 'border-green-500/40 bg-green-500/[0.06] hover:border-red-500/50 hover:bg-red-500/[0.06]'
            : 'border-white/[0.07] hover:border-purple-500/50 hover:bg-purple-500/[0.06]'
      } group`}
    >
      <div className="w-10 h-10 rounded-lg overflow-hidden border border-white/[0.07] flex-shrink-0 bg-gray-900">
        <img src={badge.image_url} alt={badge.name} className="w-full h-full object-cover"
          style={{ filter: (earned || monthly) ? 'none' : 'brightness(0.55)' }}
          onError={e => { e.target.style.display = 'none'; }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white truncate leading-tight">{badge.name}</p>
        <p className={`text-[11px] leading-tight ${monthly ? 'text-amber-400/90' : earned ? 'text-green-400' : 'text-gray-600'}`}>
          {busy ? '…' : status}
          {badge.is_secret && <span className="text-yellow-500 ml-1">★</span>}
        </p>
      </div>
    </button>
  );
}

function FamilyCard({
  family, badges, silhouette, publicView,
  isDragging, isDragOver,
  isEditing, editForm, setEditForm,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onEdit, onSaveEdit, onCancelEdit,
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
      className={`rounded-xl border p-4 transition-all select-none ${
        isDragOver && !isDragging
          ? 'border-purple-500/60 shadow-lg shadow-purple-500/10 scale-[1.01]'
          : ''
      } ${isDragging ? 'opacity-30 scale-95' : 'cursor-grab active:cursor-grabbing'}`}
      style={{
        background: C.card,
        borderColor: isDragOver && !isDragging ? 'rgba(168,85,247,0.6)' : C.border,
      }}
    >
      <div className="flex items-center gap-2 mb-3 min-h-[28px]">
        <GripIcon />
        {isEditing ? (
          <>
            <input value={editForm.display_name}
              onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))}
              onClick={e => e.stopPropagation()}
              className="flex-1 rounded-lg px-2 py-1 text-sm text-white border focus:border-purple-500 focus:outline-none"
              style={{ background: C.input, borderColor: C.border }} />
            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer shrink-0" onClick={e => e.stopPropagation()}>
              <input type="checkbox" checked={editForm.is_sequential}
                onChange={e => setEditForm(f => ({ ...f, is_sequential: e.target.checked }))}
                className="accent-purple-500" />
              Sequential
            </label>
            <button onClick={e => { e.stopPropagation(); onSaveEdit(); }} className="text-green-400 hover:text-green-300 font-bold px-1 shrink-0">✓</button>
            <button onClick={e => { e.stopPropagation(); onCancelEdit(); }} className="text-red-400 hover:text-red-300 font-bold px-1 shrink-0">✕</button>
          </>
        ) : (
          <>
            <span className="font-semibold text-white">{family.display_name}</span>
            <span className="text-xs text-gray-600">({family.id})</span>
            {family.is_sequential
              ? <span className="text-[10px] text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded-full border border-purple-400/20">sequential</span>
              : <span className="text-[10px] text-gray-500 bg-white/[0.04] px-1.5 py-0.5 rounded-full border border-white/[0.07]">open</span>
            }
            <span className="text-xs text-gray-600 ml-auto">{badges.length} badge{badges.length !== 1 ? 's' : ''}</span>
            <button onClick={e => { e.stopPropagation(); onEdit(); }}
              className="text-gray-600 hover:text-white transition-colors ml-1 text-xs shrink-0">✏</button>
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap overflow-visible">
        {badges.length === 0 && <span className="text-xs text-gray-700 italic">No badges yet</span>}
        {badges.map((badge, idx) => (
          <React.Fragment key={badge.id}>
            <BadgeCard badge={badge} silhouette={silhouette} publicView={publicView} isSequential={family.is_sequential} />
            {family.is_sequential && idx < badges.length - 1 && (
              <svg className="w-3 h-3 text-gray-700 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function BadgeVisualizerTab({ refreshKey }) {
  const [families,       setFamilies]       = useState([]);
  const [badgesByFamily, setBadgesByFamily] = useState({});
  const [orphaned,       setOrphaned]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [silhouette,     setSilhouette]     = useState(false);
  const [publicView,     setPublicView]     = useState(false);
  const [saveFlash,      setSaveFlash]      = useState(false);
  const [editingFamily,  setEditingFamily]  = useState(null);
  const [editForm,       setEditForm]       = useState({ display_name: '', is_sequential: true });
  const [draggedId,      setDraggedId]      = useState(null);
  const [dragOverId,     setDragOverId]     = useState(null);

  useEffect(() => { loadAll(); }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAll = async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [famRes, badgeRes] = await Promise.all([
        fetch('/api/admin/badge-families', { headers }),
        fetch('/api/admin/badges',         { headers }),
      ]);
      const [famData, badgeData] = await Promise.all([famRes.json(), badgeRes.json()]);
      setFamilies(famData || []);
      const grouped = {};
      const orphans = [];
      for (const b of (badgeData || [])) {
        if (b.family) { if (!grouped[b.family]) grouped[b.family] = []; grouped[b.family].push(b); }
        else orphans.push(b);
      }
      setBadgesByFamily(grouped);
      setOrphaned(orphans);
    } catch (err) { console.error('Visualizer load failed:', err); }
    finally { setLoading(false); }
  };

  const onDragStart = (e, id) => { setDraggedId(id); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOver  = (e, id) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (id !== draggedId) setDragOverId(id); };
  const onDrop      = (e, dropId) => { e.preventDefault(); if (draggedId && dropId && draggedId !== dropId) reorder(draggedId, dropId); setDraggedId(null); setDragOverId(null); };
  const onDragEnd   = () => { setDraggedId(null); setDragOverId(null); };

  const reorder = async (dragId, dropId) => {
    const next    = [...families];
    const from    = next.findIndex(f => f.id === dragId);
    const to      = next.findIndex(f => f.id === dropId);
    next.splice(from, 1);
    next.splice(to, 0, families[from]);
    const updated = next.map((f, i) => ({ ...f, display_order: i + 1 }));
    setFamilies(updated);
    try {
      await fetch('/api/admin/badge-families/reorder', {
        method: 'PATCH',
        headers: { ...(await getAuthHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: updated.map(f => ({ id: f.id, display_order: f.display_order })) }),
      });
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 1500);
    } catch (err) { console.error('Reorder save failed:', err); }
  };

  const startEdit = (family) => { setEditingFamily(family.id); setEditForm({ display_name: family.display_name, is_sequential: family.is_sequential }); };
  const saveEdit  = async () => {
    try {
      await fetch(`/api/admin/badge-families/${editingFamily}`, {
        method: 'PATCH',
        headers: { ...(await getAuthHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      setFamilies(fs => fs.map(f => f.id === editingFamily ? { ...f, ...editForm } : f));
      setEditingFamily(null);
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 1500);
    } catch (err) { console.error('Family edit failed:', err); }
  };

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-7 h-7 border-2 border-gray-700 border-t-purple-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap pb-3 border-b" style={{ borderColor: C.border }}>
        <ToggleChip active={silhouette} onClick={() => setSilhouette(s => !s)} label="Silhouette" />
        <ToggleChip active={publicView} onClick={() => setPublicView(p => !p)} label="Public View" />
        <span className="text-xs text-gray-700 ml-auto">Drag to reorder families</span>
        {saveFlash && <span className="text-sm text-green-400 font-medium">✓ Saved</span>}
      </div>

      {families.map(family => (
        <FamilyCard
          key={family.id}
          family={family}
          badges={(badgesByFamily[family.id] || []).sort((a, b) => (a.family_order ?? 0) - (b.family_order ?? 0))}
          silhouette={silhouette}
          publicView={publicView}
          isDragging={draggedId === family.id}
          isDragOver={dragOverId === family.id && draggedId !== family.id}
          isEditing={editingFamily === family.id}
          editForm={editForm}
          setEditForm={setEditForm}
          onDragStart={e => onDragStart(e, family.id)}
          onDragOver={e => onDragOver(e, family.id)}
          onDrop={e => onDrop(e, family.id)}
          onDragEnd={onDragEnd}
          onEdit={() => startEdit(family)}
          onSaveEdit={saveEdit}
          onCancelEdit={() => setEditingFamily(null)}
        />
      ))}

      {orphaned.length > 0 && (
        <div className="rounded-xl border border-dashed p-4" style={{ borderColor: C.border, background: C.inner }}>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-3">
            Uncategorized — {orphaned.length} badge{orphaned.length !== 1 ? 's' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {orphaned.map(b => <BadgeCard key={b.id} badge={b} silhouette={silhouette} publicView={publicView} />)}
          </div>
        </div>
      )}

      {families.length === 0 && orphaned.length === 0 && (
        <p className="text-center text-gray-600 py-16 text-sm">No badges yet — create some in the Create Badge tab.</p>
      )}
    </div>
  );
}
