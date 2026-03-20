import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAuthHeaders } from '../services/api';

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE_BADGE_URL = 'https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev/assets/badges';

const TRIGGERS = [
  { value: 'submission',     label: 'Submission — fires when a user submits' },
  { value: 'approved',       label: 'Approved — fires when a submission is approved' },
  { value: 'rejected',       label: 'Rejected — fires when a submission is rejected' },
  { value: 'monthly_active', label: 'Monthly Active — fires on new active month' },
];

const CHECK_TYPES_BY_TRIGGER = {
  submission:     [{ value: 'submission_count',     label: 'Total submissions' }],
  approved: [
    { value: 'approved_count',        label: 'Total unique Pokémon approved' },
    { value: 'restricted_count',      label: 'Restricted approvals' },
    { value: 'type_percentage',       label: '% of a type caught' },
    { value: 'generation_percentage', label: '% of a generation caught' },
    { value: 'collection_complete',   label: 'Complete a collection (100%)' },
  ],
  rejected:       [{ value: 'rejected_count',       label: 'Total rejections' }],
  monthly_active: [{ value: 'monthly_active_count', label: 'Active months' }],
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
  { value: '9', label: 'Gen IX — Paldea' },
];

const PLACEHOLDER = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2250%22 height=%2250%22%3E%3Crect width=%2250%22 height=%2250%22 fill=%22%2335373b%22/%3E%3Ctext x=%2250%25%22 y=%2255%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%236b7280%22 font-size=%228%22%3E50x50%3C/text%3E%3C/svg%3E';

const INITIAL_FORM = {
  key: '', name: '', description: '', hint: '',
  is_secret: false, family: '', family_order: '',
  trigger: 'approved', check_type: 'approved_count',
  check_value: '1', check_qualifier: '',
};

// ── Main component ────────────────────────────────────────────────────────────

export default function BadgeUpload() {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const [isModerator, setIsModerator] = useState(null);
  const [tab, setTab] = useState('create'); // 'create' | 'collections'

  // ── Mod guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { navigate('/'); return; }
    (async () => {
      try {
        const res  = await fetch('/api/user/is-moderator', { headers: await getAuthHeaders() });
        const data = await res.json();
        if (!data.isModerator) { navigate('/'); return; }
        setIsModerator(true);
      } catch { navigate('/'); }
    })();
  }, [user, navigate]);

  if (isModerator === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#212326' }}>
        <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4" style={{ backgroundColor: '#212326' }}>
      <div className="max-w-xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-white">Badge Admin</h1>
          <span className="text-xs text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full">Moderator</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 rounded-lg p-1" style={{ backgroundColor: '#2a2d31' }}>
          {[
            { id: 'create',      label: 'Create Badge' },
            { id: 'collections', label: 'Manage Collections' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'create'      && <CreateBadgeTab />}
        {tab === 'collections' && <ManageCollectionsTab />}
      </div>
    </div>
  );
}

// ── Create Badge tab ──────────────────────────────────────────────────────────

function CreateBadgeTab() {
  const fileInputRef = useRef(null);
  const [preview,    setPreview]    = useState(null);
  const [imageFile,  setImageFile]  = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [success,    setSuccess]    = useState(null);
  const [error,      setError]      = useState(null);
  const [form,       setForm]       = useState(INITIAL_FORM);

  // Derived
  const checkTypes    = CHECK_TYPES_BY_TRIGGER[form.trigger] ?? [];
  const isPercentage  = form.check_type === 'type_percentage' || form.check_type === 'generation_percentage';
  const isCollection  = form.check_type === 'collection_complete';
  const showQualifier = isPercentage || isCollection;

  const handleField = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleTriggerChange = (e) => {
    const newTrigger = e.target.value;
    const firstType  = CHECK_TYPES_BY_TRIGGER[newTrigger][0].value;
    setForm(f => ({ ...f, trigger: newTrigger, check_type: firstType, check_qualifier: '', check_value: '1' }));
  };

  const handleCheckTypeChange = (e) => {
    const newType = e.target.value;
    setForm(f => ({ ...f, check_type: newType, check_qualifier: '', check_value: newType === 'collection_complete' ? '' : '1' }));
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
    if (showQualifier && !form.check_qualifier) { setError('Please fill in the qualifier.'); return; }

    setSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      delete headers['Content-Type'];

      const body = new FormData();
      body.append('image', imageFile);
      Object.entries(form).forEach(([k, v]) => body.append(k, v));

      const res  = await fetch('/api/badges', { method: 'POST', headers: { Authorization: headers.Authorization }, body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setSuccess(`Badge "${data.name}" created! Key: ${data.key}`);
      setForm(INITIAL_FORM);
      setImageFile(null);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
          Badge Image <span className="text-gray-500 font-normal">(PNG, 50 × 50 px)</span>
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
      <div className="grid grid-cols-2 gap-4">
        <Field label="Family"       note='e.g. "submission_veteran"' name="family"       value={form.family}       onChange={handleField} placeholder="submission_veteran" />
        <Field label="Family Order" note="0 = next in family, 1 = first" name="family_order" value={form.family_order} onChange={handleField} type="number" min="0" placeholder="0" />
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
        {form.check_type === 'collection_complete' && (
          <Field label="Collection Slug" name="check_qualifier" value={form.check_qualifier} onChange={handleField}
            note='must match the slug used in the Collections tab — e.g. "weather_trio"'
            placeholder="weather_trio" required />
        )}

        {/* Check value */}
        {!isCollection && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {isPercentage ? 'Percentage (1–100)' : 'Threshold'} <span className="text-red-400">*</span>
            </label>
            <input type="number" name="check_value" value={form.check_value} onChange={handleField}
              min={1} max={isPercentage ? 100 : undefined} placeholder={isPercentage ? '50' : '1'} required
              className="w-full rounded-lg px-3 py-2 text-sm text-white border border-gray-500 focus:border-purple-400 focus:outline-none"
              style={{ backgroundColor: '#35373b' }} />
            {isPercentage && <p className="mt-1 text-xs text-gray-500">Enter 50 for 50%, 100 for 100%.</p>}
          </div>
        )}

        {isCollection && (
          <p className="text-xs text-gray-500">
            Badge is earned when the user has caught every Pokémon in the collection.
          </p>
        )}
      </div>

      {error   && <div className="rounded-lg px-4 py-3 text-sm text-red-300 bg-red-900/30 border border-red-700">{error}</div>}
      {success && <div className="rounded-lg px-4 py-3 text-sm text-green-300 bg-green-900/30 border border-green-700">{success}</div>}

      <button type="submit" disabled={submitting}
        className="w-full py-2.5 rounded-lg font-medium text-sm text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        {submitting ? 'Uploading…' : 'Create Badge'}
      </button>
    </form>
  );
}

// ── Manage Collections tab ────────────────────────────────────────────────────

function ManageCollectionsTab() {
  const [slug,        setSlug]        = useState('');
  const [slugOptions, setSlugOptions] = useState([]);
  const [isNewSlug,   setIsNewSlug]   = useState(false);
  const [members,     setMembers]     = useState(null);  // null = not loaded yet
  const [loadingCol,  setLoadingCol]  = useState(false);
  const [searchQ,     setSearchQ]     = useState('');
  const [results,     setResults]     = useState([]);
  const [searching,   setSearching]   = useState(false);
  const [feedback,    setFeedback]    = useState(null); // { type: 'ok'|'err', msg }
  const searchTimer = useRef(null);

  // Load all existing slugs on mount
  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch('/api/admin/collections', { headers: await getAuthHeaders() });
        const data = await res.json();
        setSlugOptions(data || []);
      } catch { /* silent — dropdown just stays empty */ }
    })();
  }, []);

  const resetCollection = () => { setMembers(null); setResults([]); setSearchQ(''); setFeedback(null); };

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
      setMembers(data);
    } catch (err) {
      setFeedback({ type: 'err', msg: err.message });
    } finally {
      setLoadingCol(false);
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

  // Debounced search
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
        // Filter out already-added members
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
          {slugOptions.map(s => <option key={s} value={s}>{s}</option>)}
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
