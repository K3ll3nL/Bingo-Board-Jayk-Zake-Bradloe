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

const Approvals = () => {
  const { user, isModerator } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('approvals');
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedPanel, setExpandedPanel] = useState(null); // { id, action }
  const [actionNotes, setActionNotes] = useState({});
  const [lightboxImage, setLightboxImage] = useState(null);
  const [approvalsLoaded, setApprovalsLoaded] = useState(false);

  // Redirect non-mods once the check resolves
  useEffect(() => {
    if (isModerator === false) navigate('/');
  }, [isModerator, navigate]);

  useEffect(() => {
    if (isModerator && !approvalsLoaded) {
      loadApprovals();
    } else if (isModerator && approvalsLoaded) {
      setLoading(false);
    }
  }, [isModerator, approvalsLoaded]);

  // Live queue updates — reload whenever any submission, approval, or rejection fires
  useEffect(() => {
    if (!isModerator) return;
    const channel = supabase
      .channel('approvals-updates')
      .on('broadcast', { event: 'queue-changed' }, () => loadApprovals())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [isModerator]);


  const loadApprovals = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/approvals/pending', {
        headers: { 'Authorization': await getAuthHeader() }
      });
      if (!response.ok) throw new Error('Failed to load approvals');
      const data = await response.json();
      console.log('[Approvals] first row sample:', data[0]);
      setApprovals(data);
      setApprovalsLoaded(true);
    } catch (err) {
      console.error('Error loading approvals:', err);
    } finally {
      setLoading(false);
    }
  };

  const togglePanel = (approvalId, action) => {
    if (expandedPanel?.id === approvalId && expandedPanel?.action === action) {
      setExpandedPanel(null);
    } else {
      setExpandedPanel({ id: approvalId, action });
    }
  };

  const handleNoteChange = (approvalId, note) => {
    setActionNotes({ ...actionNotes, [approvalId]: note });
  };

  const removeApproval = (approvalId) => {
    setApprovals(prev => prev.filter(a => a.id !== approvalId));
    setExpandedPanel(null);
    setActionNotes(prev => { const n = { ...prev }; delete n[approvalId]; return n; });
  };

  const handleApprove = async (approvalId) => {
    const approval = approvals.find(a => a.id === approvalId);
    const status = approval?.restricted_submission ? 'accepted_restricted' : 'accepted';
    try {
      const response = await fetch(`/api/approvals/${approvalId}/approve`, {
        method: 'POST',
        headers: { 'Authorization': await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Approval failed');
      }
      removeApproval(approvalId);
    } catch (error) {
      console.error('Error approving:', error);
      alert('Failed to approve submission: ' + error.message);
    }
  };

  const handleReject = async (approvalId) => {
    try {
      const response = await fetch(`/api/approvals/${approvalId}/reject`, {
        method: 'POST',
        headers: { 'Authorization': await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: actionNotes[approvalId] || '', status: 'rejected' })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Rejection failed');
      }
      removeApproval(approvalId);
    } catch (error) {
      console.error('Error rejecting:', error);
      alert('Failed to reject submission: ' + error.message);
    }
  };

  const handleRestrictedAction = async (approvalId, action) => {
    const message = actionNotes[approvalId] || '';
    try {
      let response;
      if (action === 'downgrade') {
        response = await fetch(`/api/approvals/${approvalId}/approve`, {
          method: 'POST',
          headers: { 'Authorization': await getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'accepted_downgraded', message })
        });
      } else {
        // warn or ban
        response = await fetch(`/api/approvals/${approvalId}/reject`, {
          method: 'POST',
          headers: { 'Authorization': await getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, status: action })
        });
      }
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Action failed');
      }
      removeApproval(approvalId);
    } catch (error) {
      console.error(`Error on ${action}:`, error);
      alert(`Failed to ${action}: ` + error.message);
    }
  };

  if (!user || isModerator !== true) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#212326' }}>
        <div className="text-lg text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />
      {/* Header */}
      <PageHeader title="Moderator Approvals" badge="mod" />

      {/* Content */}
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          {/* Tabs */}
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setActiveTab('approvals')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'approvals' ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Pending Approvals
            </button>
            <button
              onClick={() => setActiveTab('historical')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'historical' ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Historical
            </button>
          </div>

          {/* Approvals List */}
          {activeTab === 'approvals' && (
            <div className="rounded-lg border border-gray-600" style={{ backgroundColor: '#35373b' }}>
              {loading && !approvalsLoaded ? (
                <div className="text-center text-gray-400 py-8">Loading approvals...</div>
              ) : approvals.length === 0 ? (
                <div className="text-center text-gray-400 py-8">No pending approvals</div>
              ) : (
                <div className="divide-y divide-gray-600">
                  {approvals.map((approval) => {
                    const isBan = (approval.restricted_strikes || 0) >= 2;
                    const panelOpen = expandedPanel?.id === approval.id;
                    const panelAction = expandedPanel?.action;

                    return (
                      <div key={approval.id}>
                        {/* Main Row */}
                        <div className="p-4 flex items-center gap-4">
                          {/* Pokemon Image */}
                          <img
                            src={approval.pokemon_img}
                            alt={approval.pokemon_name}
                            className="w-16 h-16 object-contain flex-shrink-0"
                          />

                          {/* Submission Info */}
                          <div className="w-52 flex-shrink-0">
                            <div className="text-white font-medium">{approval.display_name}</div>
                            <div className="text-sm text-gray-400">
                              #{String(approval.national_dex_id).padStart(4, '0')} — {approval.pokemon_name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(approval.created_at).toLocaleString()}
                            </div>

                            {/* Restricted badge + strikes */}
                            {approval.restricted_submission && (
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-[#78150a]/25 text-[#e07060] border border-[#78150a]/50">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                  </svg>
                                  Restricted
                                </span>
                                {approval.restricted_strikes > 0 && (
                                  <span className="text-xs text-orange-400 font-medium">
                                    {approval.restricted_strikes} strike{approval.restricted_strikes !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Proof — directly right of info */}
                          <div className="flex-shrink-0">
                            {!approval.proof_url2 ? (
                              <a
                                href={approval.proof_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-400 hover:text-purple-300 underline text-sm"
                              >
                                View Proof Link ↗
                              </a>
                            ) : (
                              <div className="flex gap-2">
                                <button onClick={() => setLightboxImage(approval.proof_url)} className="block">
                                  <img
                                    src={approval.proof_url}
                                    alt="Proof of Shiny"
                                    className="w-28 h-28 object-cover rounded border border-gray-600 hover:border-purple-500 transition-colors cursor-pointer"
                                  />
                                  <div className="text-xs text-gray-400 text-center mt-1">Proof of Shiny</div>
                                </button>
                                <button onClick={() => setLightboxImage(approval.proof_url2)} className="block">
                                  <img
                                    src={approval.proof_url2}
                                    alt="Proof of Date"
                                    className="w-28 h-28 object-cover rounded border border-gray-600 hover:border-purple-500 transition-colors cursor-pointer"
                                  />
                                  <div className="text-xs text-gray-400 text-center mt-1">Proof of Date</div>
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Spacer */}
                          <div className="flex-1" />

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {/* Restricted-only buttons */}
                            {approval.restricted_submission && (
                              <>
                                {/* Warn / Ban (merged) */}
                                <button
                                  onClick={() => togglePanel(approval.id, isBan ? 'ban' : 'warn')}
                                  className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
                                    panelOpen && panelAction === (isBan ? 'ban' : 'warn')
                                      ? (isBan ? 'bg-red-800' : 'bg-orange-600')
                                      : (isBan ? 'bg-red-700 hover:bg-red-800' : 'bg-orange-500 hover:bg-orange-600')
                                  }`}
                                  title={isBan ? 'Ban user' : 'Warn user'}
                                >
                                  {isBan ? (
                                    /* Circle with line through */
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                    </svg>
                                  ) : (
                                    /* Exclamation mark */
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                  )}
                                </button>

                                {/* Downgrade */}
                                <button
                                  onClick={() => togglePanel(approval.id, 'downgrade')}
                                  className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-colors ${
                                    panelOpen && panelAction === 'downgrade'
                                      ? 'bg-blue-700 border-blue-600'
                                      : 'bg-gray-700 border-gray-600 hover:bg-gray-600 hover:border-gray-500'
                                  }`}
                                  title="Downgrade to normal submission"
                                >
                                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                  </svg>
                                </button>

                                {/* Separator */}
                                <div className="w-px h-8 bg-gray-600 mx-1" />
                              </>
                            )}

                            {/* Approve */}
                            <button
                              onClick={() => handleApprove(approval.id)}
                              className="w-10 h-10 flex items-center justify-center bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                              title="Approve"
                            >
                              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </button>

                            {/* Reject */}
                            <button
                              onClick={() => togglePanel(approval.id, 'reject')}
                              className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
                                panelOpen && panelAction === 'reject' ? 'bg-red-700' : 'bg-red-600 hover:bg-red-700'
                              }`}
                              title="Reject"
                            >
                              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* Expanded Action Panel */}
                        {panelOpen && (
                          <div className="px-4 pb-4 bg-gray-800">
                            <div className="p-4 rounded-lg border border-gray-600">
                              <label className="block text-sm font-medium text-gray-300 mb-2">
                                {panelAction === 'reject' && 'Rejection Notes'}
                                {panelAction === 'downgrade' && 'Downgrade Notes - accept submission, but as non-restricted'}
                                {panelAction === 'warn' && 'Warning Message - give a strike to a user, reject submission'}
                                {panelAction === 'ban' && 'Ban Reason - this will revoke the user\'s ability to submit to the restricted challenge, reject submission'}
                              </label>
                              <textarea
                                value={actionNotes[approval.id] || ''}
                                onChange={(e) => handleNoteChange(approval.id, e.target.value)}
                                placeholder={
                                  panelAction === 'reject' ? 'Enter reason for rejection...' :
                                  panelAction === 'downgrade' ? 'Explain why this is being downgraded to a normal submission...' :
                                  panelAction === 'warn' ? 'Enter warning message for the user...' :
                                  'Enter reason for ban...'
                                }
                                className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none mb-3"
                                rows={3}
                              />
                              <div className="flex justify-end">
                                <button
                                  onClick={() => {
                                    if (panelAction === 'reject') handleReject(approval.id);
                                    else handleRestrictedAction(approval.id, panelAction);
                                  }}
                                  disabled={!actionNotes[approval.id]?.trim()}
                                  className={`px-4 py-2 text-white rounded-lg font-medium transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed ${
                                    panelAction === 'reject' ? 'bg-red-600 hover:bg-red-700' :
                                    panelAction === 'downgrade' ? 'bg-blue-600 hover:bg-blue-700' :
                                    panelAction === 'warn' ? 'bg-orange-500 hover:bg-orange-600' :
                                    'bg-red-700 hover:bg-red-800'
                                  }`}
                                >
                                  {panelAction === 'reject' && 'Submit Rejection'}
                                  {panelAction === 'downgrade' && 'Downgrade Submission'}
                                  {panelAction === 'warn' && 'Issue Warning'}
                                  {panelAction === 'ban' && 'Ban User'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Historical Tab */}
          {activeTab === 'historical' && (
            <div className="rounded-lg p-8 text-center text-gray-400 border border-gray-600" style={{ backgroundColor: '#35373b' }}>
              Historical approvals coming soon...
            </div>
          )}
        </div>
      </div>

      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh]">
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img
              src={lightboxImage}
              alt="Proof"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Approvals;
