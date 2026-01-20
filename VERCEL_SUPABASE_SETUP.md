# Vercel + Supabase Deployment Guide

Complete step-by-step guide to deploy your streaming bingo website on Vercel with Supabase.

## Prerequisites

- GitHub account
- Vercel account (sign up at https://vercel.com)
- Supabase account (sign up at https://supabase.com)

## Part 1: Set Up Supabase Database

### Step 1: Create a Supabase Project

1. Go to https://supabase.com and sign in
2. Click "New Project"
3. Fill in the details:
   - **Name**: streaming-bingo (or whatever you prefer)
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose closest to your users
4. Click "Create new project"
5. Wait 2-3 minutes for the project to be created

### Step 2: Run the Database Schema

1. In your Supabase dashboard, click on the **SQL Editor** in the left sidebar
2. Click "New Query"
3. Copy the entire contents of `supabase/schema.sql` from this project
4. Paste it into the SQL editor
5. Click "Run" or press Cmd/Ctrl + Enter
6. You should see "Success. No rows returned" - this is correct!

### Step 3: Get Your Supabase Credentials

1. Go to **Project Settings** (gear icon in sidebar)
2. Click on **API** in the settings menu
3. You'll need two values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon/public key** (long string starting with `eyJ...`)
4. Save these for later!

### Step 4: Verify Database Setup

1. Click on **Table Editor** in the left sidebar
2. You should see two tables:
   - `bingo_board` (with 25 rows)
   - `leaderboard` (with 3 sample users)
3. If you see these, you're all set! 🎉

## Part 2: Prepare Your Code for Deployment

### Step 1: Update Your Repository

1. Make sure all files are committed to your GitHub repository
2. Push your code to GitHub:

```bash
git add .
git commit -m "Configure for Vercel + Supabase deployment"
git push origin main
```

### Step 2: Update Environment Variables Locally (for testing)

Create a `.env` file in the `server` directory:

```bash
cd server
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:

```
PORT=3001
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

### Step 3: Test Locally

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install

# Start the server
cd ../server && npm start

# In a new terminal, start the client
cd client && npm run dev
```

Visit `http://localhost:5173` and verify everything works!

## Part 3: Deploy to Vercel

### Option A: Deploy via Vercel Dashboard (Recommended)

1. Go to https://vercel.com/dashboard
2. Click "Add New..." → "Project"
3. Import your GitHub repository
4. Vercel will auto-detect the configuration
5. Before deploying, add **Environment Variables**:
   - Click "Environment Variables"
   - Add these variables:
     ```
     SUPABASE_URL = https://your-project.supabase.co
     SUPABASE_ANON_KEY = your-anon-key-here
     ```
   - Make sure they're available for Production, Preview, and Development
6. Click "Deploy"
7. Wait 2-3 minutes for deployment to complete
8. Click on your deployment URL to view your site! 🚀

### Option B: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# Follow the prompts:
# - Set up and deploy? Yes
# - Which scope? Your account
# - Link to existing project? No
# - Project name? streaming-bingo
# - Directory? ./
# - Override settings? No

# Add environment variables
vercel env add SUPABASE_URL
# Paste your Supabase URL when prompted

vercel env add SUPABASE_ANON_KEY
# Paste your Supabase anon key when prompted

# Deploy to production
vercel --prod
```

## Part 4: Configure Custom Domain (Optional)

1. In Vercel dashboard, go to your project
2. Click "Settings" → "Domains"
3. Add your custom domain
4. Follow Vercel's instructions to update your DNS records
5. Wait for DNS propagation (can take up to 48 hours)

## Part 5: Configure CORS (if needed)

If you have CORS issues, update your `server/server.js`:

```javascript
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
```

Then add `FRONTEND_URL` environment variable in Vercel:
```
FRONTEND_URL = https://your-vercel-app.vercel.app
```

## Troubleshooting

### Issue: "Cannot find module '@supabase/supabase-js'"

**Solution**: Make sure you've installed dependencies:
```bash
cd server && npm install
```

### Issue: Database connection fails

**Solution**: 
- Verify your `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct
- Check they're added as environment variables in Vercel
- Make sure there are no trailing spaces

### Issue: 404 errors on API routes

**Solution**: 
- Check that `vercel.json` is in the root directory
- Verify the routes configuration is correct
- Redeploy the project

### Issue: Frontend shows "Failed to fetch"

**Solution**:
- Check browser console for specific error
- Verify API is working by visiting `your-app.vercel.app/api/health`
- Check CORS configuration

### Issue: Database tables not found

**Solution**:
- Go to Supabase SQL Editor
- Run the schema.sql file again
- Verify tables exist in Table Editor

## Managing Your Database

### Using Supabase Dashboard

1. Go to your Supabase project
2. Click **Table Editor**
3. Select `bingo_board` or `leaderboard`
4. Click on any row to edit it directly
5. Click "Save" to apply changes

### Using SQL Editor

1. Go to **SQL Editor**
2. Write your queries:

```sql
-- Check a bingo square
UPDATE bingo_board SET checked = 1 WHERE id = 5;

-- Add points to a user
UPDATE leaderboard 
SET points = points + 50 
WHERE username = 'StreamMaster';

-- Reset the board
UPDATE bingo_board SET checked = 0;
```

3. Click "Run"

### Using the API

You can still use curl commands or API clients:

```bash
# Toggle bingo cell
curl -X PUT https://your-app.vercel.app/api/bingo/cell/5

# Add user
curl -X POST https://your-app.vercel.app/api/leaderboard/user \
  -H "Content-Type: application/json" \
  -d '{"username": "NewPlayer", "points": 100}'

# Update points
curl -X PUT https://your-app.vercel.app/api/leaderboard/user/1/points \
  -H "Content-Type: application/json" \
  -d '{"points": 250}'
```

## Updating Your Deployment

Whenever you push to your GitHub repository, Vercel will automatically redeploy:

```bash
git add .
git commit -m "Update bingo squares"
git push origin main
```

Vercel will build and deploy automatically! No manual redeployment needed.

## Database Backups

Supabase automatically backs up your database, but you can also export manually:

1. Go to **Database** → **Backups** in Supabase
2. You can download backups or restore from previous backups
3. For manual exports, use the **SQL Editor** with:

```sql
-- Export leaderboard
SELECT * FROM leaderboard;
```

Then copy the results.

## Monitoring and Analytics

### Vercel Analytics

1. Go to your project in Vercel
2. Click "Analytics" to see page views and performance
3. Consider upgrading for more detailed analytics

### Supabase Monitoring

1. Go to **Database** → **Logs** in Supabase
2. See all database queries and errors
3. Use this for debugging issues

## Cost Considerations

### Supabase Free Tier Limits:
- 500MB database space
- 2GB bandwidth per month
- 50,000 monthly active users
- Unlimited API requests

### Vercel Free Tier Limits:
- 100GB bandwidth per month
- Unlimited deployments
- Automatic HTTPS

Both should be more than enough for a streaming bingo site!

## Security Best Practices

1. **Never commit `.env` files** - use `.gitignore`
2. **Use environment variables** for all sensitive data
3. **Enable Row Level Security** in Supabase (already done in schema.sql)
4. **Use HTTPS only** (Vercel does this automatically)
5. **Regularly update dependencies**: `npm update`

## Need Help?

- Vercel Docs: https://vercel.com/docs
- Supabase Docs: https://supabase.com/docs
- Vercel Discord: https://vercel.com/discord
- Supabase Discord: https://discord.supabase.com/

## Next Steps

Now that your site is deployed:

1. Share the URL with your streamer friend!
2. Customize the bingo squares for their specific stream
3. Set up webhooks or automation for automatic updates
4. Consider adding authentication for admin features
5. Add more features like:
   - Bingo detection (auto-award points)
   - Chat integration
   - Multiple boards for different streams
   - Sound effects when squares are checked

Enjoy your deployed streaming bingo site! 🎮✨
