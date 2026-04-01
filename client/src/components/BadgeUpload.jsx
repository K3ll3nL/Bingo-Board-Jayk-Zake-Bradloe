import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAuthHeaders } from '../services/api';
import { ALLOWED_GAMES } from '../constants/games';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';

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

const CHECK_TYPES_BY_TRIGGER = {
  submission:     [{ value: 'submission_count',      label: 'Total submissions' }],
  approved: [
    { value: 'approved_count',        label: 'Total unique Pokémon approved' },
    { value: 'restricted_count',      label: 'Restricted approvals' },
    { value: 'type_percentage',       label: '% of a type caught' },
    { value: 'generation_percentage', label: '% of a generation caught' },
    { value: 'collection_complete',   label: 'Complete a collection (100%)' },
    { value: 'first_approval_month',  label: 'First approval of the month — one winner per month' },
  ],
  rejected:          [{ value: 'rejected_count',          label: 'Total rejections' }],
  monthly_active:    [{ value: 'monthly_active_count',    label: 'Active months' }],
  period_end: [
    { value: 'approved_count_in_month',  label: 'Approved in a month (any or specific)' },
    { value: 'approved_count_in_season', label: 'Approved in a season (any or specific)' },
    { value: 'approved_count_in_year',   label: 'Approved in a year (any or specific)' },
    { value: 'top_placement_month',      label: 'Top X finish — monthly' },
    { value: 'top_placement_season',     label: 'Top X finish — seasonal' },
    { value: 'top_placement_year',       label: 'Top X finish — yearly' },
  ],
  bingo_achievement: [{ value: 'bingo_achievement_count', label: 'Bingo achievement count' }],
  date_award:        [{ value: 'date_award',              label: 'Award all users on a date' }],
  account_age:       [{ value: 'account_age_months',      label: 'Account age in months' }],
};

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

const PLACEHOLDER = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2250%22 height=%2250%22%3E%3Crect width=%2250%22 height=%2250%22 fill=%22%2335373b%22/%3E%3Ctext x=%2250%25%22 y=%2255%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%236b7280%22 font-size=%228%22%3E50x50%3C/text%3E%3C/svg%3E';

const INITIAL_FORM = {
  key: '', name: '', description: '', hint: '',
  is_secret: false,
  family: '', family_order: '0',
  family_display_name: '', family_display_order: '0', family_is_sequential: true,
  trigger: 'approved', check_type: 'approved_count',
  check_value: '1', check_qualifier: '',
};

// ── Main component ────────────────────────────────────────────────────────────

export default function BadgeUpload() {
  const { user, loading: authLoading, isModerator } = useAuth();
  const navigate  = useNavigate();
  const [tab,        setTab]        = useState('create'); // 'create' | 'collections'
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Mod guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || isModerator === null) return;
    if (!user || !isModerator) navigate('/');
  }, [user, authLoading, isModerator, navigate]);

  if (isModerator === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#212326' }}>
        <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />

      {/* Header */}
      <PageHeader title="Badge Admin" badge="mod" maxWidth="4xl" />

      {/* Content */}
      <div className="p-8">
        <div className="max-w-4xl mx-auto">

          {/* Tabs */}
          <div className="flex gap-4 mb-6">
            {[
              { id: 'create',      label: 'Create Badge' },
              { id: 'collections', label: 'Manage Collections' },
              { id: 'visualizer',  label: 'Visualize' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'create'      && <CreateBadgeTab onCreated={() => { setRefreshKey(k => k + 1); setTab('visualizer'); }} />}
          {tab === 'collections' && <ManageCollectionsTab />}
          {tab === 'visualizer'  && <BadgeVisualizerTab refreshKey={refreshKey} />}
        </div>
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

  // Load existing families on mount
  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch('/api/admin/badge-families', { headers: await getAuthHeaders() });
        const data = await res.json();
        setFamilyOptions(data || []);
      } catch { /* silent */ }
    })();
  }, []);

  // Derived
  const checkTypes      = CHECK_TYPES_BY_TRIGGER[form.trigger] ?? [];
  const isPercentage         = form.check_type === 'type_percentage' || form.check_type === 'generation_percentage';
  const isCollection         = form.check_type === 'collection_complete';
  const isPlacement          = ['top_placement_month', 'top_placement_season', 'top_placement_year'].includes(form.check_type);
  const isPeriodId           = ['approved_count_in_month', 'approved_count_in_season', 'approved_count_in_year', 'top_placement_month', 'top_placement_season', 'top_placement_year'].includes(form.check_type);
  const isBingo              = form.check_type === 'bingo_achievement_count';
  const isDateAward          = form.check_type === 'date_award';
  const isFirstApprovalMonth = form.check_type === 'first_approval_month';
  const showQualifier   = isPercentage || isCollection || isPeriodId || isBingo || isDateAward;
  const checkValueLabel = isPlacement ? 'Top X (max rank)' : isPercentage ? 'Percentage (0–100)' : 'Threshold';
  const checkValuePH    = isPlacement ? '3' : isPercentage ? '100' : '1';
  const periodIdLabel   = ['approved_count_in_month', 'top_placement_month'].includes(form.check_type) ? 'Month ID'
    : ['approved_count_in_season', 'top_placement_season'].includes(form.check_type) ? 'Season ID'
    : 'Year ID';

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

  // Bingo type checkbox helpers
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
    if (!imageFile)                        { setError('Please select a badge image.'); return; }
    if (!form.key)                         { setError('Image key is required.'); return; }
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

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-600 p-6 space-y-5" style={{ backgroundColor: '#35373b' }}>

      {/* Image upload */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Badge Image <span className="text-gray-500 font-normal">(PNG, 500 × 500 px)</span>
        </label>
        <div className="flex items-center gap-4">
          <img src={preview || PLACEHOLDER} alt="Preview" className="w-[50px] h-[50px] rounded object-cover border border-gray-500" />
          <label className="cursor-pointer px-3 py-2 rounded-lg text-sm text-gray-200 border border-gray-500 hover:border-purple-400 hover:text-purple-300 transition-colors">
            Choose file
            <input ref={fileInputRef} type="file" accept="image/png" className="hidden" onChange={handleImage} />
          </label>
          {imageFile && <span className="text-xs text-gray-400 truncate max-w-[160px]">{imageFile.name}</span>}
        </div>
      </div>

      {/* Key with live URL preview */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Image Key <span className="text-red-400">*</span>
          <span className="text-gray-500 font-normal ml-1">— filename in R2, never change after seeding</span>
        </label>
        <input type="text" name="key" value={form.key} onChange={handleField} placeholder="e.g. sub_veteran_7" required
          className="w-full rounded-lg px-3 py-2 text-sm text-white border border-gray-500 focus:border-purple-400 focus:outline-none"
          style={{ backgroundColor: '#2a2d31' }} />
        {form.key && (
          <p className="mt-1 text-xs text-gray-500 truncate">
            → {BASE_BADGE_URL}/<span className="text-purple-400">{form.key}</span>.png
          </p>
        )}
      </div>

      <Field label="Name"        name="name"        value={form.name}        onChange={handleField} placeholder="e.g. Century Hunter" required />
      <Field label="Description" name="description" value={form.description} onChange={handleField} placeholder="Shown on the badge card." textarea required />
      <Field label="Hint"        name="hint"        value={form.hint}        onChange={handleField} placeholder="How to earn this badge." note="shown when unlocked by the family chain" textarea />

      {/* Is Secret */}
      <div className="flex items-center gap-3">
        <input type="checkbox" id="is_secret" name="is_secret" checked={form.is_secret} onChange={handleField}
          className="w-4 h-4 rounded border-gray-500 accent-purple-500" />
        <label htmlFor="is_secret" className="text-sm text-gray-300">
          Secret badge <span className="text-gray-500 font-normal">— hides name, image, and hint until earned</span>
        </label>
      </div>

      {/* Family */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4">

          {/* Family selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Family</label>
            <select
              value={isNewFamily ? '__new__' : (form.family || '')}
              onChange={handleFamilySelect}
              className="w-full rounded-lg px-3 py-2 text-sm text-white border border-gray-500 focus:border-purple-400 focus:outline-none"
              style={{ backgroundColor: '#2a2d31' }}
            >
              <option value="">— no family —</option>
              {familyOptions.map(f => (
                <option key={f.id} value={f.id}>{f.display_name} ({f.id})</option>
              ))}
              <option value="__new__">＋ New family…</option>
            </select>
          </div>

          <Field label="Family Order" note="0 = next in family, 1 = first" name="family_order" value={form.family_order} onChange={handleField} type="number" min="0" placeholder="0" />
        </div>

        {/* New family fields */}
        {isNewFamily && (
          <div className="rounded-lg border border-purple-500/30 p-4 space-y-3" style={{ backgroundColor: '#2a2d31' }}>
            <p className="text-xs text-purple-400 font-medium uppercase tracking-wide">New Family</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Slug"          name="family"               value={form.family}               onChange={handleField} placeholder="submission_veteran" required />
              <Field label="Display Name"  name="family_display_name"  value={form.family_display_name}  onChange={handleField} placeholder="Submission Veteran"  required />
              <Field label="Display Order" name="family_display_order"  value={form.family_display_order} onChange={handleField} type="number" min="0" placeholder="0" note="order on the badges page" />
              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="family_is_sequential"
                    checked={form.family_is_sequential}
                    onChange={handleField}
                    className="w-4 h-4 rounded accent-purple-500"
                  />
                  <span className="text-sm text-gray-300">Sequential hints</span>
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  {form.family_is_sequential
                    ? 'Hint hidden until previous badge earned'
                    : 'All hints always visible'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Trigger */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Trigger <span className="text-red-400">*</span></label>
        <select name="trigger" value={form.trigger} onChange={handleTriggerChange} required
          className="w-full rounded-lg px-3 py-2 text-sm text-white border border-gray-500 focus:border-purple-400 focus:outline-none"
          style={{ backgroundColor: '#2a2d31' }}>
          {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Earn condition box */}
      <div className="rounded-lg border border-gray-600 p-4 space-y-4" style={{ backgroundColor: '#2a2d31' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Earn Condition</p>

        {/* Check type */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Check Type <span className="text-red-400">*</span></label>
          <select value={form.check_type} onChange={handleCheckTypeChange} required
            className="w-full rounded-lg px-3 py-2 text-sm text-white border border-gray-500 focus:border-purple-400 focus:outline-none"
            style={{ backgroundColor: '#35373b' }}>
            {checkTypes.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
          </select>
        </div>

        {/* Qualifier — type dropdown */}
        {form.check_type === 'type_percentage' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Pokémon Type <span className="text-red-400">*</span></label>
            <select name="check_qualifier" value={form.check_qualifier} onChange={handleField} required
              className="w-full rounded-lg px-3 py-2 text-sm text-white border border-gray-500 focus:border-purple-400 focus:outline-none capitalize"
              style={{ backgroundColor: '#35373b' }}>
              <option value="">— pick a type —</option>
              {POKEMON_TYPES.map(t => (
                <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
        )}

        {/* Qualifier — generation dropdown */}
        {form.check_type === 'generation_percentage' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Generation <span className="text-red-400">*</span></label>
            <select name="check_qualifier" value={form.check_qualifier} onChange={handleField} required
              className="w-full rounded-lg px-3 py-2 text-sm text-white border border-gray-500 focus:border-purple-400 focus:outline-none"
              style={{ backgroundColor: '#35373b' }}>
              <option value="">— pick a generation —</option>
              {GENERATIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>
        )}

        {/* Qualifier — collection slug */}
        {isCollection && (
          <Field label="Collection Slug" name="check_qualifier" value={form.check_qualifier} onChange={handleField}
            note='must match the slug used in the Collections tab — e.g. "weather_trio"'
            placeholder="weather_trio" required />
        )}

        {/* Qualifier — date picker for date_award */}
        {form.check_type === 'date_award' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Award Date <span className="text-red-400">*</span>
            </label>
            <input type="date" name="check_qualifier" value={form.check_qualifier} onChange={handleField} required
              className="w-full rounded-lg px-3 py-2 text-sm text-white border border-gray-500 focus:border-purple-400 focus:outline-none"
              style={{ backgroundColor: '#35373b', colorScheme: 'dark' }} />
            <p className="mt-1 text-xs text-gray-500">Every registered user will receive this badge. The cron runs at 1am UTC the following day, so anyone who joins on this date is still included.</p>
          </div>
        )}

        {/* Qualifier — period ID (optional for approved_count_in_*, required for top_placement_*) */}
        {isPeriodId && (
          <Field
            label={periodIdLabel}
            name="check_qualifier" value={form.check_qualifier} onChange={handleField}
            type="number" placeholder="blank = any period" required={false}
            note={`Leave blank to fire on any closing ${periodIdLabel.replace(' ID', '').toLowerCase()}, or enter a specific ID to target one.`} />
        )}

        {/* Qualifier — bingo types (checkboxes) */}
        {isBingo && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Count these bingo types <span className="text-gray-500 font-normal text-xs">— each includes its restricted variant</span>
            </label>
            <div className="grid grid-cols-2 gap-1">
              {['row', 'column', 'x', 'blackout'].map(type => (
                <label key={type} className="flex items-center gap-2 cursor-pointer py-1">
                  <input type="checkbox" className="accent-purple-500"
                    checked={getBingoTypes(form.check_qualifier).includes(type)}
                    onChange={e => handleBingoTypeToggle(type, e.target.checked)} />
                  <span className="text-sm text-gray-300 capitalize">{type}</span>
                  <span className="text-xs text-gray-500">+ {type}_restricted</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* First approval of month — no threshold or qualifier needed */}
        {isFirstApprovalMonth && (
          <p className="text-xs text-gray-500">
            Awarded once per month to the first player whose catch is approved. No threshold required.
          </p>
        )}

        {/* Check value */}
        {!isCollection && !isDateAward && !isFirstApprovalMonth && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {checkValueLabel} <span className="text-red-400">*</span>
            </label>
            <input type="number" name="check_value" value={form.check_value} onChange={handleField}
              min={1} max={isPercentage ? 100 : undefined} placeholder={checkValuePH} required
              className="w-full rounded-lg px-3 py-2 text-sm text-white border border-gray-500 focus:border-purple-400 focus:outline-none"
              style={{ backgroundColor: '#35373b' }} />
            {isPercentage  && <p className="mt-1 text-xs text-gray-500">Enter 50 for 50%, 100 for 100%.</p>}
            {isPlacement   && <p className="mt-1 text-xs text-gray-500">e.g. 3 = exactly the top 3 finishers earn this badge. Ties are broken by who reached their score first.</p>}
            {isPeriodId    && <p className="mt-1 text-xs text-gray-500">Minimum number of approved submissions in the period.</p>}
          </div>
        )}

        {isCollection && (
          <p className="text-xs text-gray-500">
            Badge is earned when the user has caught every Pokémon in the collection.
          </p>
        )}
      </div>

      {/* Live preview */}
      {(form.name || preview) && (
        <div className="rounded-lg border border-gray-600 p-4" style={{ backgroundColor: '#2a2d31' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Preview</p>
          <BadgeCard
            badge={{
              id: 'preview',
              name:        form.name        || 'Badge Name',
              description: form.description || 'Description',
              hint:        form.hint,
              image_url:   preview          || PLACEHOLDER,
              is_secret:   form.is_secret,
              check_type:  form.check_type,
              check_value: form.check_value,
              check_qualifier: form.check_qualifier,
              family_order: Number(form.family_order) || 0,
            }}
            silhouette={false}
            publicView={false}
            isSequential={false}
          />
        </div>
      )}

      {error && <div className="rounded-lg px-4 py-3 text-sm text-red-300 bg-red-900/30 border border-red-700">{error}</div>}

      <button type="submit" disabled={submitting}
        className="w-full py-2.5 rounded-lg font-medium text-sm text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        {submitting ? 'Uploading…' : 'Create Badge'}
      </button>
    </form>
  );
}

// ── Manage Collections tab ────────────────────────────────────────────────────

function ManageCollectionsTab() {
  const [slug,         setSlug]         = useState('');
  const [slugOptions,  setSlugOptions]  = useState([]); // [{ slug, required_game }]
  const [isNewSlug,    setIsNewSlug]    = useState(false);
  const [members,      setMembers]      = useState(null);  // null = not loaded yet
  const [requiredGame, setRequiredGame] = useState('');    // '' = any game
  const [savingGame,   setSavingGame]   = useState(false);
  const [loadingCol,   setLoadingCol]   = useState(false);
  const [searchQ,      setSearchQ]      = useState('');
  const [results,      setResults]      = useState([]);
  const [searching,    setSearching]    = useState(false);
  const [feedback,     setFeedback]     = useState(null); // { type: 'ok'|'err', msg }
  const searchTimer = useRef(null);

  // Load all existing slugs on mount
  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch('/api/admin/collections', { headers: await getAuthHeaders() });
        const data = await res.json();
        // Normalize: API may return [{slug, required_game}] or legacy [string]
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
      setIsNewSlug(true);
      setSlug('');
      resetCollection();
    } else {
      setIsNewSlug(false);
      setSlug(val);
      resetCollection();
      if (val) loadCollection(val);
    }
  };

  const loadCollection = async (s = slug) => {
    if (!s.trim()) return;
    setLoadingCol(true);
    setFeedback(null);
    try {
      const res  = await fetch(`/api/admin/collections/${encodeURIComponent(s.trim())}`, { headers: await getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMembers(data.members);
      setRequiredGame(data.required_game ?? '');
    } catch (err) {
      setFeedback({ type: 'err', msg: err.message });
    } finally {
      setLoadingCol(false);
    }
  };

  const saveRequiredGame = async (game) => {
    if (!slug.trim()) return;
    setSavingGame(true);
    setFeedback(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/collections/${encodeURIComponent(slug.trim())}/game`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ required_game: game || null }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setRequiredGame(game);
      // Update slug options cache
      setSlugOptions(prev => prev.map(o => o.slug === slug ? { ...o, required_game: game || null } : o));
      setFeedback({ type: 'ok', msg: game ? `Game requirement set to "${ALLOWED_GAMES.find(g => g.key === game)?.label ?? game}".` : 'Game requirement cleared.' });
    } catch (err) {
      setFeedback({ type: 'err', msg: err.message });
    } finally {
      setSavingGame(false);
    }
  };

  const removeMember = async (pokemon) => {
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/collections/${encodeURIComponent(slug.trim())}/pokemon/${pokemon.id}`, {
        method: 'DELETE', headers: await getAuthHeaders(),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setMembers(m => m.filter(p => p.id !== pokemon.id));
      setFeedback({ type: 'ok', msg: `Removed ${pokemon.name} from '${slug}'.` });
    } catch (err) {
      setFeedback({ type: 'err', msg: err.message });
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
      setFeedback({ type: 'ok', msg: `Added ${pokemon.name} to '${slug}'.` });
    } catch (err) {
      setFeedback({ type: 'err', msg: err.message });
    }
  };

  // Debounced search — no game filter here; game filter is a collection property
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

  return (
    <div className="rounded-xl border border-gray-600 p-6 space-y-5" style={{ backgroundColor: '#35373b' }}>

      {/* Slug selector */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Collection Slug</label>
        <select
          value={isNewSlug ? '__new__' : (slug || '')}
          onChange={handleSlugSelect}
          className="w-full rounded-lg px-3 py-2 text-sm text-white border border-gray-500 focus:border-purple-400 focus:outline-none"
          style={{ backgroundColor: '#2a2d31' }}
        >
          <option value="">— select a collection —</option>
          {slugOptions.map(o => (
            <option key={o.slug} value={o.slug}>
              {o.slug}{o.required_game ? ` [${o.required_game}]` : ''}
            </option>
          ))}
          <option value="__new__">＋ New collection…</option>
        </select>

        {/* New slug text input */}
        {isNewSlug && (
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={slug}
              onChange={e => { setSlug(e.target.value); resetCollection(); }}
              onKeyDown={e => e.key === 'Enter' && loadCollection()}
              placeholder="e.g. legendary_birds"
              className="flex-1 rounded-lg px-3 py-2 text-sm text-white border border-gray-500 focus:border-purple-400 focus:outline-none"
              style={{ backgroundColor: '#2a2d31' }}
            />
            <button
              type="button"
              onClick={() => loadCollection()}
              disabled={!slug.trim() || loadingCol}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 transition-colors"
            >
              {loadingCol ? '…' : 'Create'}
            </button>
          </div>
        )}
      </div>

      {/* Game requirement — only shown once a collection is loaded */}
      {slugLoaded && (
        <div className="rounded-lg border border-gray-600 p-4" style={{ backgroundColor: '#2a2d31' }}>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Required Game
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Only submissions from this game count toward completing this collection. Leave blank to accept any game.
              </p>
              <select
                value={requiredGame}
                onChange={e => setRequiredGame(e.target.value)}
                disabled={savingGame}
                className="w-full rounded-lg px-3 py-2 text-sm text-white border border-gray-500 focus:border-purple-400 focus:outline-none disabled:opacity-50"
                style={{ backgroundColor: '#35373b' }}
              >
                <option value="">Any game</option>
                {ALLOWED_GAMES.map(g => (
                  <option key={g.key} value={g.key}>{g.label}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => saveRequiredGame(requiredGame)}
              disabled={savingGame}
              className="mt-5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 transition-colors self-end"
            >
              {savingGame ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${
          feedback.type === 'ok'
            ? 'text-green-300 bg-green-900/30 border-green-700'
            : 'text-red-300 bg-red-900/30 border-red-700'
        }`}>{feedback.msg}</div>
      )}

      {/* Current members */}
      {slugLoaded && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Members of <span className="text-purple-300">{slug}</span> ({members.length})
          </p>
          {members.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No Pokémon in this collection yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {members.map(p => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ backgroundColor: '#2a2d31' }}>
                  {p.img_url && <img src={p.img_url} alt={p.name} className="w-8 h-8 object-contain" />}
                  <span className="flex-1 text-sm text-white capitalize">{p.name}</span>
                  <span className="text-xs text-gray-500">#{String(p.national_dex_id).padStart(4, '0')}</span>
                  <button
                    type="button"
                    onClick={() => removeMember(p)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors ml-2"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Search to add */}
      {slugLoaded && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Add Pokémon</label>
          <input
            type="text"
            value={searchQ}
            onChange={handleSearchChange}
            placeholder="Search by name…"
            className="w-full rounded-lg px-3 py-2 text-sm text-white border border-gray-500 focus:border-purple-400 focus:outline-none"
            style={{ backgroundColor: '#2a2d31' }}
          />
          {searching && <p className="mt-1 text-xs text-gray-500">Searching…</p>}
          {results.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {results.map(p => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ backgroundColor: '#2a2d31' }}>
                  {p.img_url && <img src={p.img_url} alt={p.name} className="w-8 h-8 object-contain" />}
                  <span className="flex-1 text-sm text-white capitalize">{p.name}</span>
                  <span className="text-xs text-gray-500">#{String(p.national_dex_id).padStart(4, '0')}</span>
                  <button
                    type="button"
                    onClick={() => addMember(p)}
                    className="text-xs text-purple-400 hover:text-purple-300 transition-colors ml-2"
                  >
                    + Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!slug.trim() && (
        <p className="text-sm text-gray-500 text-center py-4">
          Select a collection above, or choose <strong>＋ New collection…</strong> to create one.
        </p>
      )}
    </div>
  );
}

// ── Badge Visualizer tab ──────────────────────────────────────────────────────

function checkDescription(badge) {
  const v = badge.check_value;
  const q = badge.check_qualifier;
  switch (badge.check_type) {
    case 'submission_count':           return `Submit ${v} time${v != 1 ? 's' : ''}`;
    case 'approved_count':             return `Get ${v} approval${v != 1 ? 's' : ''}`;
    case 'rejected_count':             return `Get ${v} rejection${v != 1 ? 's' : ''}`;
    case 'restricted_count':           return `Get ${v} restricted approval${v != 1 ? 's' : ''}`;
    case 'monthly_active_count':       return `Active for ${v} month${v != 1 ? 's' : ''}`;
    case 'type_percentage':            return `Catch ${v}% of ${q} type`;
    case 'generation_percentage':      return `Catch ${v}% of Gen ${q}`;
    case 'collection_complete':        return `Complete '${q}' collection`;
    case 'bingo_achievement_count':    return `Earn ${v} bingo achievement${v != 1 ? 's' : ''}${q && q !== 'any' ? ` (${q})` : ''}`;
    case 'approved_count_in_month':    return `Get ${v} approval${v != 1 ? 's' : ''} in ${q ? `month ${q}` : 'any month'}`;
    case 'approved_count_in_season':   return `Get ${v} approval${v != 1 ? 's' : ''} in ${q ? `season ${q}` : 'any season'}`;
    case 'approved_count_in_year':     return `Get ${v} approval${v != 1 ? 's' : ''} in ${q ? `year ${q}` : 'any year'}`;
    case 'top_placement_month':        return `Finish top ${v} in a monthly leaderboard${q ? ` (month ${q})` : ''}`;
    case 'top_placement_season':       return `Finish top ${v} in a seasonal leaderboard${q ? ` (season ${q})` : ''}`;
    case 'top_placement_year':         return `Finish top ${v} in a yearly leaderboard${q ? ` (year ${q})` : ''}`;
    case 'date_award':                 return `Awarded on ${q || 'a specific date'}`;
    case 'account_age_months':         return `Account at least ${v} month${v != 1 ? 's' : ''} old`;
    default:                           return 'Unknown criteria';
  }
}

function GripIcon() {
  return (
    <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="currentColor" viewBox="0 0 16 16">
      <circle cx="5"  cy="4"  r="1.2" /><circle cx="11" cy="4"  r="1.2" />
      <circle cx="5"  cy="8"  r="1.2" /><circle cx="11" cy="8"  r="1.2" />
      <circle cx="5"  cy="12" r="1.2" /><circle cx="11" cy="12" r="1.2" />
    </svg>
  );
}

function ToggleChip({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
        active
          ? 'bg-purple-600 border-purple-500 text-white'
          : 'bg-transparent border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white'
      }`}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? 'bg-white' : 'bg-gray-600'}`} />
      {label}
    </button>
  );
}

function BadgeCard({ badge, silhouette, publicView, isSequential }) {
  const isHintLocked   = publicView && isSequential && (badge.family_order ?? 1) > 1;
  const isSecretHidden = publicView && badge.is_secret;

  return (
    <div className="group relative flex-shrink-0">
      {/* Image */}
      <div className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-colors ${
        badge.is_secret && !publicView ? 'border-yellow-600/50' : 'border-gray-600'
      }`}>
        {isSecretHidden ? (
          <div className="w-full h-full flex items-center justify-center bg-gray-900 rounded-lg">
            <span className="text-gray-600 text-xl font-bold select-none">?</span>
          </div>
        ) : (
          <img
            src={badge.image_url}
            alt={badge.name}
            className="w-full h-full object-cover"
            style={{ filter: silhouette ? 'brightness(0)' : 'none' }}
            onError={e => { e.target.style.display = 'none'; }}
          />
        )}
      </div>

      {/* Secret lock pip */}
      {badge.is_secret && !publicView && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center text-xs leading-none">
          🔒
        </div>
      )}

      {/* Tooltip */}
      {!isSecretHidden && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg p-3 text-xs
                     opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50
                     shadow-xl border border-gray-700 space-y-1.5"
          style={{ backgroundColor: '#1a1c1e' }}
        >
          <p className="font-bold text-white leading-snug">{badge.name}</p>
          {badge.is_secret && <span className="text-yellow-400">🔒 Secret badge</span>}
          <p className="text-gray-300 leading-snug">{badge.description}</p>
          {badge.hint && !isHintLocked && <p className="text-purple-300">💡 {badge.hint}</p>}
          {isHintLocked         && <p className="text-gray-600 italic">💡 Hint locked until previous earned</p>}
          <p className="text-blue-400 pt-1.5 border-t border-gray-700">✓ {checkDescription(badge)}</p>
          <p className="text-gray-600">Order: {badge.family_order ?? '—'}</p>
        </div>
      )}
    </div>
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
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`rounded-xl border p-4 transition-all select-none ${
        isDragOver && !isDragging
          ? 'border-purple-400 shadow-lg shadow-purple-500/20 scale-[1.01]'
          : 'border-gray-600'
      } ${isDragging ? 'opacity-30 scale-95' : 'opacity-100 cursor-grab active:cursor-grabbing'}`}
      style={{ backgroundColor: '#35373b' }}
    >
      {/* Family header */}
      <div className="flex items-center gap-2 mb-3 min-h-[28px]">
        <GripIcon />

        {isEditing ? (
          <>
            <input
              value={editForm.display_name}
              onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))}
              onClick={e => e.stopPropagation()}
              className="flex-1 rounded px-2 py-1 text-sm text-white border border-gray-500
                         focus:border-purple-400 focus:outline-none"
              style={{ backgroundColor: '#2a2d31' }}
            />
            <label
              className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer flex-shrink-0"
              onClick={e => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={editForm.is_sequential}
                onChange={e => setEditForm(f => ({ ...f, is_sequential: e.target.checked }))}
                className="accent-purple-500"
              />
              Sequential
            </label>
            <button onClick={e => { e.stopPropagation(); onSaveEdit(); }}
              className="text-green-400 hover:text-green-300 font-bold px-1 flex-shrink-0">✓</button>
            <button onClick={e => { e.stopPropagation(); onCancelEdit(); }}
              className="text-red-400 hover:text-red-300 font-bold px-1 flex-shrink-0">✕</button>
          </>
        ) : (
          <>
            <span className="font-semibold text-white">{family.display_name}</span>
            <span className="text-xs text-gray-500">({family.id})</span>
            {family.is_sequential
              ? <span className="text-xs text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded-full">sequential</span>
              : <span className="text-xs text-gray-400 bg-gray-700/60 px-1.5 py-0.5 rounded-full">open</span>
            }
            <span className="text-xs text-gray-500 ml-auto">
              {badges.length} badge{badges.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={e => { e.stopPropagation(); onEdit(); }}
              className="text-gray-500 hover:text-white transition-colors ml-1 text-xs flex-shrink-0"
              title="Edit family"
            >✏</button>
          </>
        )}
      </div>

      {/* Badge row */}
      <div className="flex items-center gap-1.5 flex-wrap overflow-visible">
        {badges.length === 0 && (
          <span className="text-xs text-gray-600 italic">No badges in this family yet</span>
        )}
        {badges.map((badge, idx) => (
          <React.Fragment key={badge.id}>
            <BadgeCard
              badge={badge}
              silhouette={silhouette}
              publicView={publicView}
              isSequential={family.is_sequential}
            />
            {family.is_sequential && idx < badges.length - 1 && (
              <svg className="w-3 h-3 text-gray-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
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
        if (b.family) {
          if (!grouped[b.family]) grouped[b.family] = [];
          grouped[b.family].push(b);
        } else {
          orphans.push(b);
        }
      }
      setBadgesByFamily(grouped);
      setOrphaned(orphans);
    } catch (err) {
      console.error('Visualizer load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Drag handlers ───────────────────────────────────────────────────────────
  const onDragStart = (e, id) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== draggedId) setDragOverId(id);
  };
  const onDrop = (e, dropId) => {
    e.preventDefault();
    if (draggedId && dropId && draggedId !== dropId) reorder(draggedId, dropId);
    setDraggedId(null);
    setDragOverId(null);
  };
  const onDragEnd = () => { setDraggedId(null); setDragOverId(null); };

  const reorder = async (dragId, dropId) => {
    const next  = [...families];
    const from  = next.findIndex(f => f.id === dragId);
    const to    = next.findIndex(f => f.id === dropId);
    next.splice(from, 1);
    next.splice(to, 0, families[from]);
    const updated = next.map((f, i) => ({ ...f, display_order: i + 1 }));
    setFamilies(updated);
    try {
      await fetch('/api/admin/badge-families/reorder', {
        method:  'PATCH',
        headers: { ...(await getAuthHeaders()), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ order: updated.map(f => ({ id: f.id, display_order: f.display_order })) }),
      });
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 1500);
    } catch (err) {
      console.error('Reorder save failed:', err);
    }
  };

  // ── Inline family edit ──────────────────────────────────────────────────────
  const startEdit = (family) => {
    setEditingFamily(family.id);
    setEditForm({ display_name: family.display_name, is_sequential: family.is_sequential });
  };
  const saveEdit = async () => {
    try {
      await fetch(`/api/admin/badge-families/${editingFamily}`, {
        method:  'PATCH',
        headers: { ...(await getAuthHeaders()), 'Content-Type': 'application/json' },
        body:    JSON.stringify(editForm),
      });
      setFamilies(fs => fs.map(f => f.id === editingFamily ? { ...f, ...editForm } : f));
      setEditingFamily(null);
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 1500);
    } catch (err) {
      console.error('Family edit failed:', err);
    }
  };

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap pb-2 border-b border-gray-700">
        <ToggleChip active={silhouette} onClick={() => setSilhouette(s => !s)} label="Silhouette" />
        <ToggleChip active={publicView} onClick={() => setPublicView(p => !p)} label="Public View" />
        <span className="text-xs text-gray-600 ml-auto">Drag cards to reorder families</span>
        {saveFlash && <span className="text-sm text-green-400 font-medium">✓ Saved</span>}
      </div>

      {/* Family cards */}
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

      {/* Orphaned badges */}
      {orphaned.length > 0 && (
        <div className="rounded-xl border border-dashed border-gray-600 p-4" style={{ backgroundColor: '#35373b' }}>
          <p className="text-sm font-medium text-gray-500 mb-3">
            Uncategorized — {orphaned.length} badge{orphaned.length !== 1 ? 's' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {orphaned.map(b => (
              <BadgeCard key={b.id} badge={b} silhouette={silhouette} publicView={publicView} />
            ))}
          </div>
        </div>
      )}

      {families.length === 0 && orphaned.length === 0 && (
        <p className="text-center text-gray-500 py-16 text-sm">
          No badges yet — create some in the Create Badge tab.
        </p>
      )}
    </div>
  );
}

// ── Shared field component ────────────────────────────────────────────────────

function Field({ label, note, name, value, onChange, placeholder, textarea, required, type = 'text', ...rest }) {
  const base  = 'w-full rounded-lg px-3 py-2 text-sm text-white border border-gray-500 focus:border-purple-400 focus:outline-none';
  const style = { backgroundColor: '#2a2d31' };
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
        {note && <span className="text-gray-500 font-normal ml-1">— {note}</span>}
      </label>
      {textarea
        ? <textarea name={name} value={value} onChange={onChange} placeholder={placeholder} required={required} rows={2} className={base} style={style} />
        : <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder} required={required} className={base} style={style} {...rest} />
      }
    </div>
  );
}
