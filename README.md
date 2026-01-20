# Streaming Bingo Website

A real-time bingo board and leaderboard system for streamers, built with React and deployed on Vercel + Supabase.

## 🚀 Quick Deploy to Vercel + Supabase

**This is the recommended deployment method!**

See the complete step-by-step guide: **[VERCEL_SUPABASE_SETUP.md](VERCEL_SUPABASE_SETUP.md)**

Quick overview:
1. Create a Supabase project and run the schema
2. Connect your GitHub repo to Vercel
3. Add Supabase credentials as environment variables
4. Deploy! 🎉

## Features

- 5x5 interactive bingo board
- Real-time leaderboard tracking
- Responsive design (side-by-side on desktop, stacked on mobile)
- SQLite database for easy setup
- RESTful API for manual database updates

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js + Express
- **Database**: Supabase (PostgreSQL)
- **Hosting**: Vercel

## Project Structure

```
streaming-bingo/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   └── services/      # API services
│   └── package.json
├── server/                # Express backend
│   ├── routes/           # API routes
│   ├── models/           # Database models
│   ├── db/              # Database files
│   └── server.js
└── README.md
```

## Setup Instructions

### For Vercel + Supabase Deployment (Recommended)

See **[VERCEL_SUPABASE_SETUP.md](VERCEL_SUPABASE_SETUP.md)** for complete instructions.

### For Local Development

#### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Supabase account and project

#### Installation

1. **Clone the repository**
```bash
git clone your-repo-url
cd streaming-bingo
```

2. **Install Backend Dependencies**
```bash
cd server
npm install
```

3. **Install Frontend Dependencies**
```bash
cd ../client
npm install
```

4. **Configure Environment Variables**

Create a `.env` file in the `server` directory:
```bash
cd server
cp .env.example .env
```

Add your Supabase credentials:
```
PORT=3001
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

5. **Set up Supabase Database**

Run the SQL schema in your Supabase project:
- Go to Supabase SQL Editor
- Copy contents from `supabase/schema.sql`
- Run the query

### Running the Application

1. **Start the Backend Server** (from the `server` directory)
```bash
npm start
```
The API will run on `http://localhost:3001`

2. **Start the Frontend** (from the `client` directory, in a new terminal)
```bash
npm run dev
```
The website will open at `http://localhost:5173`

## Database Management

### Using Supabase Dashboard (Easiest)

1. Go to your Supabase project dashboard
2. Click "Table Editor" in the sidebar
3. Select `bingo_board` or `leaderboard` table
4. Edit rows directly in the UI
5. Changes are instant!

### Using SQL Editor

1. Go to "SQL Editor" in Supabase
2. Run queries:
```sql
-- Toggle a bingo cell
UPDATE bingo_board SET checked = 1 WHERE id = 5;

-- Add points to a user
UPDATE leaderboard SET points = points + 50 WHERE username = 'Player1';
```

### Using API Endpoints

**Example API Calls:**

```bash
# Toggle a bingo cell (IDs are 1-25)
curl -X PUT https://your-app.vercel.app/api/bingo/cell/5

# Add a new user
curl -X POST https://your-app.vercel.app/api/leaderboard/user \
  -H "Content-Type: application/json" \
  -d '{"username": "Player1", "points": 100}'

# Update user points
curl -X PUT https://your-app.vercel.app/api/leaderboard/user/1/points \
  -H "Content-Type: application/json" \
  -d '{"points": 150}'
```

For more details, see **[VERCEL_SUPABASE_SETUP.md](VERCEL_SUPABASE_SETUP.md)**

## Customization

### Updating Bingo Squares

**Option 1: Via Supabase Dashboard**
- Go to Table Editor → bingo_board
- Click on any text cell and edit directly

**Option 2: Via SQL**
```sql
UPDATE bingo_board SET text = 'New square text' WHERE id = 1;
```

### Styling

Modify Tailwind classes in the React components or update `client/tailwind.config.js`.

## Deployment

**Recommended: Vercel + Supabase**

See complete guide: **[VERCEL_SUPABASE_SETUP.md](VERCEL_SUPABASE_SETUP.md)**

This provides:
- ✅ Free hosting (within generous limits)
- ✅ Automatic deployments on git push
- ✅ Free PostgreSQL database
- ✅ Automatic HTTPS
- ✅ Global CDN
- ✅ Easy database management UI

**Alternative Deployments:**

See [DEPLOYMENT.md](DEPLOYMENT.md) for other hosting options like Railway, Render, or self-hosted VPS.

## License

MIT
