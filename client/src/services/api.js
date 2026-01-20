const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const api = {
  // Bingo Board endpoints
  getBingoBoard: async () => {
    const response = await fetch(`${API_BASE_URL}/bingo/board`);
    if (!response.ok) throw new Error('Failed to fetch bingo board');
    return response.json();
  },

  toggleCell: async (cellId) => {
    const response = await fetch(`${API_BASE_URL}/bingo/cell/${cellId}`, {
      method: 'PUT',
    });
    if (!response.ok) throw new Error('Failed to toggle cell');
    return response.json();
  },

  resetBoard: async () => {
    const response = await fetch(`${API_BASE_URL}/bingo/reset`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to reset board');
    return response.json();
  },

  // Leaderboard endpoints
  getLeaderboard: async () => {
    const response = await fetch(`${API_BASE_URL}/leaderboard`);
    if (!response.ok) throw new Error('Failed to fetch leaderboard');
    return response.json();
  },

  addUser: async (username, points = 0) => {
    const response = await fetch(`${API_BASE_URL}/leaderboard/user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, points }),
    });
    if (!response.ok) throw new Error('Failed to add user');
    return response.json();
  },

  updateUserPoints: async (userId, points) => {
    const response = await fetch(`${API_BASE_URL}/leaderboard/user/${userId}/points`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ points }),
    });
    if (!response.ok) throw new Error('Failed to update user points');
    return response.json();
  },
};
