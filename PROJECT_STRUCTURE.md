# Project Structure

Overview of the streaming bingo project files and folders.

```
streaming-bingo/
│
├── 📄 README.md                    # Main project overview and quick start
├── 📄 QUICK_START.md               # Fastest way to deploy (10 min guide)
├── 📄 VERCEL_SUPABASE_SETUP.md     # Complete Vercel + Supabase deployment guide
├── 📄 DATABASE_GUIDE.md            # How to manage the database (kept for reference)
├── 📄 DEPLOYMENT.md                # Alternative deployment options
├── 📄 vercel.json                  # Vercel deployment configuration
├── 🔧 setup.sh                     # Automated setup script for local dev
├── 📄 .gitignore                   # Git ignore rules
│
├── 📁 supabase/                    # Supabase database files
│   └── 📄 schema.sql               # Database schema to run in Supabase
│
├── 📁 server/                      # Backend API (Node.js/Express)
│   ├── 📄 package.json             # Server dependencies
│   ├── 📄 server.js                # Main Express server file
│   ├── 📄 .env.example             # Environment variables template
│   │
│   ├── 📁 models/                  # Database models
│   │   ├── database.js             # SQLite version (legacy, not used)
│   │   └── supabase.js             # Supabase connection & helpers ✨
│   │
│   └── 📁 routes/                  # API route handlers
│       ├── bingo.js                # SQLite version (legacy)
│       ├── bingo-supabase.js       # Supabase bingo routes ✨
│       ├── leaderboard.js          # SQLite version (legacy)
│       └── leaderboard-supabase.js # Supabase leaderboard routes ✨
│
└── 📁 client/                      # Frontend (React + Vite)
    ├── 📄 package.json             # Client dependencies
    ├── 📄 vite.config.js           # Vite configuration
    ├── 📄 tailwind.config.js       # Tailwind CSS configuration
    ├── 📄 postcss.config.js        # PostCSS configuration
    ├── 📄 index.html               # HTML entry point
    │
    └── 📁 src/                     # React source code
        ├── 📄 main.jsx             # React entry point
        ├── 📄 App.jsx              # Main app component with layout
        ├── 📄 index.css            # Global styles with Tailwind
        │
        ├── 📁 components/          # React components
        │   ├── BingoBoard.jsx      # 5x5 interactive bingo grid
        │   └── Leaderboard.jsx     # Ranked player list
        │
        └── 📁 services/            # Frontend services
            └── api.js              # API client for backend calls

```

## Key Files Explained

### Configuration Files

**vercel.json** - Configures how Vercel builds and deploys both frontend and backend
**tailwind.config.js** - Customizes Tailwind CSS colors and theme
**vite.config.js** - Vite dev server and build settings

### Database Files

**supabase/schema.sql** - Complete database schema including:
- `bingo_board` table (25 squares)
- `leaderboard` table (players and points)
- Row Level Security policies
- Sample data

### Backend Files

**server/server.js** - Express server setup with:
- CORS configuration
- Route handlers
- Error handling
- Health check endpoint

**server/models/supabase.js** - Database connection with helper functions:
- `dbAll()` - Query multiple rows
- `dbGet()` - Get single row by ID
- `dbInsert()` - Insert new row
- `dbUpdate()` - Update existing row
- `dbDelete()` - Delete row
- `dbUpsert()` - Insert or update

**server/routes/bingo-supabase.js** - Bingo board API endpoints:
- `GET /api/bingo/board` - Get all 25 squares
- `PUT /api/bingo/cell/:id` - Toggle a square
- `PUT /api/bingo/cell/:id/text` - Update square text
- `POST /api/bingo/reset` - Reset all squares

**server/routes/leaderboard-supabase.js** - Leaderboard API endpoints:
- `GET /api/leaderboard` - Get ranked player list
- `POST /api/leaderboard/user` - Add or update user
- `PUT /api/leaderboard/user/:id/points` - Set points
- `POST /api/leaderboard/user/:id/add-points` - Add points
- `DELETE /api/leaderboard/user/:id` - Remove user

### Frontend Files

**client/src/App.jsx** - Main layout component:
- Header with title
- Responsive grid (side-by-side on desktop, stacked on mobile)
- Two modules: BingoBoard and Leaderboard

**client/src/components/BingoBoard.jsx** - Bingo board features:
- 5x5 grid of clickable squares
- Auto-refresh every 3 seconds
- Visual feedback on checked squares
- Special styling for "FREE SPACE"
- Reset button

**client/src/components/Leaderboard.jsx** - Leaderboard features:
- Ranked list of players
- Medals for top 3 (🥇🥈🥉)
- Points display
- Auto-refresh every 3 seconds
- Responsive card design

**client/src/services/api.js** - API client:
- All backend API calls
- Proper error handling
- Environment-aware URL configuration

## Environment Variables

### Server (.env)
```
PORT=3001
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
```

### Client (handled by Vite)
```
VITE_API_URL=https://your-api-url.vercel.app/api
```

## Data Flow

1. **User clicks bingo square**
   → BingoBoard.jsx calls api.toggleCell()
   → API request to /api/bingo/cell/:id
   → server/routes/bingo-supabase.js handles request
   → Supabase database updated
   → Response sent back to frontend
   → UI updates

2. **Auto-refresh (every 3 seconds)**
   → useEffect hook calls loadBoard() / loadLeaderboard()
   → Fetches latest data from API
   → Updates React state
   → UI re-renders with new data

## Legacy Files (Can be ignored for Vercel + Supabase)

- `server/models/database.js` - SQLite version
- `server/routes/bingo.js` - SQLite version
- `server/routes/leaderboard.js` - SQLite version

These are kept for reference if you want to run locally with SQLite instead of Supabase.

## Documentation Priority

**For deployment:**
1. Start with QUICK_START.md (fastest, 10 minutes)
2. Reference VERCEL_SUPABASE_SETUP.md for details
3. Use README.md for overview

**For customization:**
- VERCEL_SUPABASE_SETUP.md (database management section)
- Supabase dashboard (easiest way)

**For alternative hosting:**
- DEPLOYMENT.md (Railway, Render, VPS options)
