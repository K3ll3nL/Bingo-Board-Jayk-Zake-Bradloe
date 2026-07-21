import React, { useState } from 'react';

export default function ConsentModal({ onAccept, isUpdate = false }) {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    if (!checked || loading) return;
    setLoading(true);
    try {
      await onAccept();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}>
      <div className="w-full max-w-md rounded-xl shadow-2xl border border-gray-600 overflow-hidden" style={{ backgroundColor: '#35373b' }}>
        <div className="px-6 py-4 border-b border-purple-500/30" style={{ backgroundColor: 'rgba(145,71,255,0.08)' }}>
          <h2 className="text-lg font-bold text-white">
            {isUpdate ? 'Our Terms have been updated' : 'Before you continue'}
          </h2>
        </div>

        <div className="px-6 py-5 space-y-4 text-sm text-gray-300">
          {isUpdate ? (
            <>
              <p>
                We've updated our Terms of Service and Privacy Policy. Please review the changes before continuing.
              </p>
              <p className="text-xs text-gray-400">
                <span className="text-white font-medium">What changed:</span> we added a
                {' '}Generative AI disclosure covering how code and imagery are produced on the Site.
              </p>
            </>
          ) : (
            <p>
              We've added a Privacy Policy and Terms of Service to Pokeboard.net.
              Please review them before continuing.
            </p>
          )}

          <div className="rounded-lg p-4 space-y-2 border border-gray-600" style={{ backgroundColor: '#2a2c2f' }}>
            <div className="flex items-start gap-3">
              <svg className="w-4 h-4 mt-0.5 text-purple-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div>
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline font-medium">
                  Terms of Service
                </a>
                <p className="text-xs text-gray-400 mt-0.5">Rules for using the site and participating in competitions.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <svg className="w-4 h-4 mt-0.5 text-purple-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <div>
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline font-medium">
                  Privacy Policy
                </a>
                <p className="text-xs text-gray-400 mt-0.5">What data we collect and how we use it.</p>
              </div>
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-purple-500 cursor-pointer shrink-0"
            />
            <span className="text-gray-300 group-hover:text-white transition-colors select-none">
              {isUpdate
                ? 'I have read and agree to the updated Terms of Service and Privacy Policy.'
                : 'I have read and agree to the Terms of Service and Privacy Policy.'}
            </span>
          </label>
        </div>

        <div className="px-6 pb-5">
          <button
            onClick={handleAccept}
            disabled={!checked || loading}
            className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all"
            style={{
              backgroundColor: checked ? '#9147ff' : '#4a4d52',
              color: checked ? '#fff' : '#6b7280',
              cursor: checked && !loading ? 'pointer' : 'not-allowed',
            }}
          >
            {loading ? 'Saving...' : 'I Agree - Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
