/**
 * system routes (3).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  getAuthenticatedUserId,
  sseAnonymousClients,
  sseClients,
  supabase,
} = require('../lib/core');

module.exports = function register(app) {

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Streaming Bingo API is running' });
  });

  // SSE endpoint for real-time notifications
  app.get('/api/events', async (req, res) => {
    const userId = await getAuthenticatedUserId(req);

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    
    // Add this client to the connections map
    if (userId) {
      // Authenticated user
      if (!sseClients.has(userId)) {
        sseClients.set(userId, new Set());
      }
      sseClients.get(userId).add(res);
    } else {
      // Anonymous user
      sseAnonymousClients.add(res);
    }
    
    const totalClients = Array.from(sseClients.values()).reduce((sum, set) => sum + set.size, 0) + sseAnonymousClients.size;
    console.log(`SSE client connected: ${userId || 'anonymous'}. Total clients: ${totalClients}`);
    
    // Send initial connection message
    res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Connected to notification stream', authenticated: !!userId })}\n\n`);
    
    // Send keepalive every 30 seconds to prevent timeout
    const keepaliveInterval = setInterval(() => {
      try {
        res.write(`:keepalive ${Date.now()}\n\n`);
      } catch (err) {
        clearInterval(keepaliveInterval);
      }
    }, 30000);
    
    // Clean up on disconnect
    req.on('close', () => {
      clearInterval(keepaliveInterval);
      
      if (userId) {
        const userClients = sseClients.get(userId);
        if (userClients) {
          userClients.delete(res);
          if (userClients.size === 0) {
            sseClients.delete(userId);
          }
        }
      } else {
        sseAnonymousClients.delete(res);
      }
      
      const totalClients = Array.from(sseClients.values()).reduce((sum, set) => sum + set.size, 0) + sseAnonymousClients.size;
      console.log(`SSE client disconnected: ${userId || 'anonymous'}. Total clients: ${totalClients}`);
    });
  });

  // Debug endpoint to check database state (dev only)
  app.get('/api/debug/data', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Not found' });
    }
    try {
      const { data: points, error: pointsError } = await supabase
        .from('user_monthly_points')
        .select('*')
        .limit(10);
      
      const { data: achievements, error: achievementsError } = await supabase
        .from('bingo_achievements')
        .select('*')
        .limit(10);
      
      res.json({
        user_monthly_points: {
          count: points?.length || 0,
          data: points || [],
          error: pointsError
        },
        bingo_achievements: {
          count: achievements?.length || 0,
          data: achievements || [],
          error: achievementsError
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

};
