import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const getAuthHeader = async () => {
  if (import.meta.env.DEV &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'Bearer dev_token';
  }
  const { data: { session } } = await supabase.auth.getSession();
  return `Bearer ${session?.access_token}`;
};

const STATUS_COLORS = {
  open: 'bg-yellow-500 bg-opacity-20 text-yellow-300 border-yellow-500',
  reviewed: 'bg-blue-500 bg-opacity-20 text-blue-300 border-blue-500',
  closed: 'bg-gray-500 bg-opacity-20 text-gray-400 border-gray-500',
};

const TYPE_COLORS = {
  suggestion: 'bg-purple-500 bg-opacity-20 text-purple-300',
  bug: 'bg-red-500 bg-opacity-20 text-red-300',
};

export default function ModFeedback() {
  const { isModerator } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');       // all | suggestion | bug
  const [statusFilter, setStatusFilter] = useState('open'); // open | reviewed | closed | all
  const [expanded, setExpanded] = useState(null);
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    if (isModerator === false) navigate('/');
  }, [isModerator, navigate]);

  useEffect(() => {
    if (isModerator) load();
  }, [isModerator]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/mod/feedback', {
        headers: { Authorization: await getAuthHeader() },
      });
      if (!res.ok) throw new Error('Failed to load');
      setItems(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(id, status) {
    setUpdating(id);
    try {
      const res = await fetch(`/api/mod/feedback/${id}/status`, {
        method: 'PATCH',
        headers: { Authorization: await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i));
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(null);
    }
  }

  const filtered = items.filter(i => {
    if (filter !== 'all' && i.type !== filter) return false;
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    return true;
  });

  const counts = {
    open: items.filter(i => i.status === 'open').length,
    suggestion: items.filter(i => i.type === 'suggestion').length,
    bug: items.filter(i => i.type === 'bug').length,
  };

  if (isModerator === null || isModerator === undefined) return null;

  return (
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />
      <PageHeader title="Feedback" badge="mod" subtitle="Suggestions & bug reports from users" />
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Summary pills */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <span className="px-3 py-1 rounded-full text-sm bg-yellow-500 bg-opacity-20 text-yellow-300">
            {counts.open} open
          </span>
          <span className="px-3 py-1 rounded-full text-sm bg-purple-500 bg-opacity-20 text-purple-300">
            {counts.suggestion} suggestions
          </span>
          <span className="px-3 py-1 rounded-full text-sm bg-red-500 bg-opacity-20 text-red-300">
            {counts.bug} bug reports
          </span>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <div className="flex rounded-lg overflow-hidden border border-gray-600 text-sm">
            {['all', 'suggestion', 'bug'].map(t => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-3 py-1.5 transition-colors ${filter === t ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                style={filter !== t ? { backgroundColor: '#35373b' } : {}}
              >
                {t === 'all' ? 'All types' : t === 'suggestion' ? 'Suggestions' : 'Bugs'}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg overflow-hidden border border-gray-600 text-sm">
            {['open', 'reviewed', 'closed', 'all'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 transition-colors ${statusFilter === s ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                style={statusFilter !== s ? { backgroundColor: '#35373b' } : {}}
              >
                {s === 'all' ? 'All statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <button onClick={load} className="ml-auto px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-gray-600 rounded-lg transition-colors" style={{ backgroundColor: '#35373b' }}>
            Refresh
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="text-center text-gray-400 py-16">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-500 py-16">No items match the current filters.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map(item => {
              const name = item.users?.display_name || item.users?.username || item.user_id;
              const date = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              const isExpanded = expanded === item.id;

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-gray-700 overflow-hidden"
                  style={{ backgroundColor: '#2b2d31' }}
                >
                  {/* Header row */}
                  <button
                    className="w-full px-5 py-4 flex items-start gap-3 text-left hover:bg-gray-700 hover:bg-opacity-30 transition-colors"
                    onClick={() => setExpanded(isExpanded ? null : item.id)}
                  >
                    <span className={`shrink-0 mt-0.5 px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[item.type]}`}>
                      {item.type === 'bug' ? 'Bug' : 'Suggestion'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{item.title}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{name} · {date}</p>
                    </div>
                    <span className={`shrink-0 mt-0.5 px-2 py-0.5 rounded border text-xs ${STATUS_COLORS[item.status]}`}>
                      {item.status}
                    </span>
                    <svg
                      className={`shrink-0 w-4 h-4 text-gray-500 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-gray-700">
                      <p className="text-gray-300 text-sm mt-4 whitespace-pre-wrap">{item.description}</p>
                      <div className="flex gap-2 mt-4">
                        {['open', 'reviewed', 'closed'].map(s => (
                          <button
                            key={s}
                            disabled={item.status === s || updating === item.id}
                            onClick={() => setStatus(item.id, s)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ${
                              item.status === s ? 'ring-1 ring-white text-white' : 'text-gray-300 hover:text-white'
                            }`}
                            style={{ backgroundColor: '#35373b' }}
                          >
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
