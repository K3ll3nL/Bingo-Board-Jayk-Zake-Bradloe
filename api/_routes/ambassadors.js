/**
 * ambassadors routes (1).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  getTwitchToken,
  supabase,
} = require('../_lib/core');

module.exports = function register(app) {

  // Get Twitch ambassadors with live status
  app.get('/api/ambassadors', async (req, res) => {
    try {
      // Public + user-invariant (Twitch live status, same for everyone). Cache at
      // the edge so a stream's viewers share one response instead of each firing
      // an invocation. Overridden to no-store on hard error (catch) below.
      res.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      // Get ambassadors from database
      const { data: ambassadors, error } = await supabase
        .from('twitch_ambassadors')
        .select(`
          id,
          twitch_url,
          hex_code,
          users!twitch_ambassadors_id_fkey (
            display_name
          )
        `);
      
      if (error) throw error;
      
      if (!ambassadors || ambassadors.length === 0) {
        return res.json([]);
      }
      
      // Extract Twitch usernames from URLs
      const twitchData = ambassadors.map(amb => {
        const username = amb.twitch_url.split('/').pop().toLowerCase();
        return {
          id: amb.id,
          username,
          display_name: amb.users?.display_name || username,
          twitch_url: amb.twitch_url,
          hex_code: amb.hex_code || '#9147ff' // Default to Twitch purple
        };
      });
      
      try {
        const access_token = await getTwitchToken();
        if (!access_token) {
          console.warn('Twitch API credentials not configured');
          return res.json(twitchData.map(amb => ({
            ...amb,
            profile_image_url: `https://static-cdn.jtvnw.net/user-default-pictures-uv/de130ab0-def7-11e9-b668-784f43822e80-profile_image-300x300.png`,
            is_live: false,
            brand_color: amb.hex_code
          })));
        }

        const headers = {
          'Client-ID': process.env.TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${access_token}`
        };
        
        // Get user info for all ambassadors
        const usernames = twitchData.map(amb => amb.username);
        const usersResponse = await fetch(`https://api.twitch.tv/helix/users?${usernames.map(u => `login=${u}`).join('&')}`, { headers });
        const usersData = await usersResponse.json();
        
        // Get streams for all users
        const userIds = usersData.data.map(u => u.id);
        const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${userIds.map(id => `user_id=${id}`).join('&')}`, { headers });
        const streamsData = await streamsResponse.json();
        
        // Create live status map
        const liveStreams = {};
        streamsData.data?.forEach(stream => {
          liveStreams[stream.user_id] = {
            is_live: true,
            viewer_count: stream.viewer_count
          };
        });
        
        // Create user info map
        const userInfo = {};
        usersData.data?.forEach(user => {
          userInfo[user.login.toLowerCase()] = {
            profile_image_url: user.profile_image_url,
            brand_color: user.broadcaster_type === 'partner' ? '#9147ff' : user.broadcaster_type === 'affiliate' ? '#9147ff' : '#808080'
          };
        });
        
        // Combine all data
        const result = twitchData.map(amb => ({
          ...amb,
          profile_image_url: userInfo[amb.username]?.profile_image_url || `https://static-cdn.jtvnw.net/user-default-pictures-uv/de130ab0-def7-11e9-b668-784f43822e80-profile_image-300x300.png`,
          is_live: usersData.data?.find(u => u.login.toLowerCase() === amb.username) ? 
            liveStreams[usersData.data.find(u => u.login.toLowerCase() === amb.username).id]?.is_live || false : false,
          viewer_count: usersData.data?.find(u => u.login.toLowerCase() === amb.username) ? 
            liveStreams[usersData.data.find(u => u.login.toLowerCase() === amb.username).id]?.viewer_count : undefined,
          brand_color: amb.hex_code // Use custom hex code from database
        }));
        
        result.sort((a, b) => {
          if (b.is_live !== a.is_live) return b.is_live ? 1 : -1;
          return (b.viewer_count || 0) - (a.viewer_count || 0);
        });

        res.json(result);
      } catch (twitchError) {
        console.error('Twitch API error:', twitchError);
        // Return basic data on Twitch API error
        return res.json(twitchData.map(amb => ({
          ...amb,
          profile_image_url: `https://static-cdn.jtvnw.net/user-default-pictures-uv/de130ab0-def7-11e9-b668-784f43822e80-profile_image-300x300.png`,
          is_live: false,
          brand_color: amb.hex_code
        })));
      }
    } catch (error) {
      console.error('Error fetching ambassadors:', error);
      res.set('Cache-Control', 'no-store'); // never edge-cache an error response
      res.status(500).json({ error: 'Failed to fetch ambassadors' });
    }
  });

};
