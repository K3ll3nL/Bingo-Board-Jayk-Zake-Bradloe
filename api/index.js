require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');

const {
  DEV_USER_ID,
  cors,
  multer,
} = require('./_lib/core');

const app = express();

// Middleware and route modules below are emitted in their original source
// order, so both middleware precedence and path-matching precedence
// (e.g. /reorder before /:id) match the pre-split behavior exactly.

const ALLOWED_ORIGINS = [
  'https://www.pokeboard.net',
  'https://pokeboard.net',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
app.use(cors({
  origin: (origin, callback) => {
    // No Origin header (same-origin requests, curl, server-to-server) — allow.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
}));
app.use(express.json({ limit: '50mb' })); // Increase JSON body limit
app.use(express.urlencoded({ limit: '50mb', extended: true })); // Increase URL-encoded body limit
require('./_routes/internal')(app);
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  const isDev = process.env.NODE_ENV !== 'production' && DEV_USER_ID && authHeader === 'Bearer dev_token';
  
  if (isDev) {
    req.devUserId = DEV_USER_ID;
  }
  
  next();
});
require('./_routes/users')(app);
require('./_routes/system')(app);
require('./_routes/bingo')(app);
require('./_routes/leaderboard')(app);
require('./_routes/stats')(app);
require('./_routes/tierList')(app);
require('./_routes/profile')(app);
require('./_routes/pokemon')(app);
require('./_routes/ambassadors')(app);
require('./_routes/upload')(app);
require('./_routes/approvals')(app);
require('./_routes/admin')(app);
require('./_routes/notifications')(app);
require('./_routes/boardBuilder')(app);
require('./_routes/jeopardy')(app);
require('./_routes/keys')(app);
require('./_routes/overlay')(app);
require('./_routes/tools')(app);
require('./_routes/badges')(app);
require('./_routes/feedback')(app);
require('./_routes/banners')(app);
require('./_routes/radar')(app);
// Multer error handling middleware — must be after all routes
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'Image file is too large. Please compress to under 4MB.',
        fileTooBig: true
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Too many files uploaded. Maximum 10 images allowed.',
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: `Unexpected file field: ${err.field}` });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  next(err);
});

// Start server locally (not needed in Vercel)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

// Export for Vercel serverless
module.exports = app;
