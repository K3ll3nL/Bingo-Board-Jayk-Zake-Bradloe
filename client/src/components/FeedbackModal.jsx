import { useState } from 'react';
import { getAuthHeaders } from '../services/api';

export default function FeedbackModal({ isOpen, onClose }) {
  const [type, setType] = useState('suggestion');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, title: title.trim(), description: description.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Submission failed');
      }
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setType('suggestion');
    setTitle('');
    setDescription('');
    setError('');
    setSuccess(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={handleClose}>
      <div
        className="rounded-xl shadow-2xl w-full max-w-md mx-4"
        style={{ backgroundColor: '#2b2d31' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-white font-semibold text-lg">Suggestions & Bug Reports</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {success ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-green-500 bg-opacity-20 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-white font-medium">Submitted!</p>
              <p className="text-gray-400 text-sm mt-1">Thanks for the feedback.</p>
              <button
                onClick={handleClose}
                className="mt-4 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: '#5865f2' }}
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type toggle */}
              <div className="flex rounded-lg overflow-hidden border border-gray-600">
                <button
                  type="button"
                  onClick={() => setType('suggestion')}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    type === 'suggestion'
                      ? 'bg-purple-600 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                  style={type !== 'suggestion' ? { backgroundColor: '#35373b' } : {}}
                >
                  Suggestion
                </button>
                <button
                  type="button"
                  onClick={() => setType('bug')}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    type === 'bug'
                      ? 'bg-red-600 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                  style={type !== 'bug' ? { backgroundColor: '#35373b' } : {}}
                >
                  Bug Report
                </button>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm text-gray-300 mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={120}
                  placeholder={type === 'bug' ? 'Brief description of the bug' : 'What would you like to see?'}
                  className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-gray-500 border border-gray-600 focus:border-purple-500 focus:outline-none transition-colors"
                  style={{ backgroundColor: '#1e1f22' }}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  {type === 'bug' ? 'Steps to reproduce / details' : 'Details'}
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  maxLength={2000}
                  rows={5}
                  placeholder={
                    type === 'bug'
                      ? 'What happened? What did you expect to happen?'
                      : 'Describe your suggestion in more detail...'
                  }
                  className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-gray-500 border border-gray-600 focus:border-purple-500 focus:outline-none transition-colors resize-none"
                  style={{ backgroundColor: '#1e1f22' }}
                />
                <p className="text-xs text-gray-500 mt-1 text-right">{description.length}/2000</p>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: type === 'bug' ? '#dc2626' : '#5865f2' }}
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
