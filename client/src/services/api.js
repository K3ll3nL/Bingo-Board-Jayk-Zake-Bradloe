import { supabase } from '../contexts/AuthContext';

// Use relative path for production, localhost for development
const API_BASE_URL = import.meta.env.VITE_API_URL || (
  import.meta.env.DEV ? 'http://localhost:3000/api' : '/api'
);

// Helper to get auth header (if user is logged in)
const getAuthHeaders = async () => {
  const headers = {
    'Content-Type': 'application/json'
  };
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch (err) {
    // No auth token - that's okay, API will show public board
    console.log('No auth session');
  }
  
  return headers;
};

export const api = {
  // Bingo Board endpoints
  getBingoBoard: async () => {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/bingo/board`, { headers });
    if (!response.ok) throw new Error('Failed to fetch bingo board');
    return response.json();
  },

  // Leaderboard endpoints
  getLeaderboard: async () => {
    const response = await fetch(`${API_BASE_URL}/leaderboard`);
    if (!response.ok) throw new Error('Failed to fetch leaderboard');
    return response.json();
  },
};