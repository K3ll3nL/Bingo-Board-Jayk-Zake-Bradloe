require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');

const {
  DEV_USER_ID,
  cors,
  multer,
} = require('./lib/core');

const app = express();

// Middleware and route modules below are emitted in their original source
// order, so both middleware precedence and path-matching precedence
// (e.g. /reorder before /:id) match the pre-split behavior exactly.

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase JSON body limit
app.use(express.urlencoded({ limit: '50mb', extended: true })); // Increase URL-encoded body limit
require('./routes/internal')(app);
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  const isDev = process.env.NODE_ENV !== 'production' && DEV_USER_ID && authHeader === 'Bearer dev_token';
  
  if (isDev) {
    req.devUserId = DEV_USER_ID;
  }
  
  next();
});
require('./routes/users')(app);
require('./routes/system')(app);
require('./routes/bingo')(app);
require('./routes/leaderboard')(app);
require('./routes/stats')(app);
require('./routes/tierList')(app);
require('./routes/profile')(app);
require('./routes/pokemon')(app);
require('./routes/ambassadors')(app);
require('./routes/upload')(app);
require('./routes/approvals')(app);
require('./routes/admin')(app);
require('./routes/notifications')(app);
require('./routes/boardBuilder')(app);
require('./routes/gameBoard')(app);
require('./routes/keys')(app);
require('./routes/overlay')(app);
require('./routes/tools')(app);
require('./routes/badges')(app);
require('./routes/feedback')(app);
require('./routes/banners')(app);
require('./routes/radar')(app);
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
