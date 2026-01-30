import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const Approvals = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isModerator, setIsModerator] = useState(false);
  const [activeTab, setActiveTab] = useState('approvals');
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState(null);
  const [rejectionNotes, setRejectionNotes] = useState({});
  const [lightboxImage, setLightboxImage] = useState(null);

  useEffect(() => {
    if (user) {
      checkModeratorStatus();
    }
  }, [user]);

  useEffect(() => {
    if (isModerator && activeTab === 'approvals') {
      loadApprovals();
    }
  }, [isModerator, activeTab]);

  const checkModeratorStatus = async () => {
    try {
      const response = await fetch(`/api/user/is-moderator`, {
        headers: {
          'Authorization': `Bearer ${user?.id}`
        }
      });
      const data = await response.json();
      setIsModerator(data.isModerator);
      
      if (!data.isModerator) {
        navigate('/');
      }
    } catch (err) {
      console.error('Error checking moderator status:', err);
      navigate('/');
    }
  };

  const loadApprovals = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/approvals/pending');
      if (!response.ok) throw new Error('Failed to load approvals');
      const data = await response.json();
      setApprovals(data);
    } catch (err) {
      console.error('Error loading approvals:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (approvalId) => {
    setExpandedRow(expandedRow === approvalId ? null : approvalId);
  };

  const handleNoteChange = (approvalId, note) => {
    setRejectionNotes({
      ...rejectionNotes,
      [approvalId]: note
    });
  };

  const handleApprove = (approvalId) => {
    // TODO: Connect to API
    console.log('Approve:', approvalId);
  };

  const handleReject = (approvalId) => {
    // TODO: Connect to API
    console.log('Reject:', approvalId, 'Notes:', rejectionNotes[approvalId]);
  };

  if (!user || !isModerator) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#212326' }}>
        <div className="text-lg text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#212326' }}>
      {/* Header */}
      <header className="shadow-md" style={{ backgroundColor: '#35373b' }}>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-white">Moderator Approvals</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          {/* Tabs */}
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setActiveTab('approvals')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'approvals'
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Pending Approvals
            </button>
            <button
              onClick={() => setActiveTab('historical')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'historical'
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Historical
            </button>
          </div>

          {/* Approvals List */}
          {activeTab === 'approvals' && (
            <div className="rounded-lg" style={{ backgroundColor: '#35373b' }}>
              {loading ? (
                <div className="text-center text-gray-400 py-8">Loading approvals...</div>
              ) : approvals.length === 0 ? (
                <div className="text-center text-gray-400 py-8">No pending approvals</div>
              ) : (
                <div className="divide-y divide-gray-600">
                  {approvals.map((approval) => (
                    <div key={approval.id}>
                      {/* Main Row */}
                      <div className="p-4 flex items-center gap-4">
                        {/* Pokemon Image */}
                        <img
                          src={approval.pokemon_img}
                          alt={approval.pokemon_name}
                          className="w-16 h-16 object-contain"
                        />

                        {/* Username */}
                        <div className="flex-1">
                          <div className="text-white font-medium">{approval.display_name}</div>
                          <div className="text-sm text-gray-400">
                            #{String(approval.national_dex_id).padStart(4, '0')} - {approval.pokemon_name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(approval.created_at).toLocaleString()}
                          </div>
                        </div>

                        {/* Proof Display */}
                        <div className="flex-1 flex justify-end pr-4">
                          {!approval.proof_url2 ? (
                            // Single URL link
                            <a
                              href={approval.proof_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-purple-400 hover:text-purple-300 underline text-sm"
                            >
                              View Proof Link
                            </a>
                          ) : (
                            // Two images
                            <div className="flex gap-2">
                              <button
                                onClick={() => setLightboxImage(approval.proof_url)}
                                className="block"
                              >
                                <img
                                  src={approval.proof_url}
                                  alt="Proof of Shiny"
                                  className="w-32 h-32 object-cover rounded border border-gray-600 hover:border-purple-500 transition-colors cursor-pointer"
                                />
                                <div className="text-xs text-gray-400 text-center mt-1">Proof of Shiny</div>
                              </button>
                              <button
                                onClick={() => setLightboxImage(approval.proof_url2)}
                                className="block"
                              >
                                <img
                                  src={approval.proof_url2}
                                  alt="Proof of Date"
                                  className="w-32 h-32 object-cover rounded border border-gray-600 hover:border-purple-500 transition-colors cursor-pointer"
                                />
                                <div className="text-xs text-gray-400 text-center mt-1">Proof of Date</div>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(approval.id)}
                            className="w-10 h-10 flex items-center justify-center bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                            title="Approve"
                          >
                            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </button>
                          <button
                            onClick={() => toggleExpand(approval.id)}
                            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
                              expandedRow === approval.id
                                ? 'bg-red-700'
                                : 'bg-red-600 hover:bg-red-700'
                            }`}
                            title="Reject"
                          >
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Expanded Rejection Notes */}
                      {expandedRow === approval.id && (
                        <div className="px-4 pb-4 bg-gray-800">
                          <div className="p-4 rounded-lg border border-gray-600">
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                              Rejection Notes
                            </label>
                            <textarea
                              value={rejectionNotes[approval.id] || ''}
                              onChange={(e) => handleNoteChange(approval.id, e.target.value)}
                              placeholder="Enter reason for rejection..."
                              className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none mb-3"
                              rows={3}
                            />
                            <div className="flex justify-end">
                              <button
                                onClick={() => handleReject(approval.id)}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                              >
                                Submit Rejection
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Historical Tab (Placeholder) */}
          {activeTab === 'historical' && (
            <div className="rounded-lg p-8 text-center text-gray-400" style={{ backgroundColor: '#35373b' }}>
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