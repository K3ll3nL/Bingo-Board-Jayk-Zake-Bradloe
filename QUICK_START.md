# Quick Start Checklist - Vercel + Supabase

Follow this checklist to deploy your streaming bingo site in under 10 minutes!

## ☐ Step 1: Set Up Supabase (3 minutes)

1. ☐ Go to https://supabase.com and sign up/login
2. ☐ Click "New Project"
3. ☐ Name: `streaming-bingo`
4. ☐ Set database password (save it!)
5. ☐ Choose region closest to users
6. ☐ Click "Create new project"
7. ☐ Wait 2-3 minutes for creation

## ☐ Step 2: Initialize Database (2 minutes)

1. ☐ Click "SQL Editor" in left sidebar
2. ☐ Click "New Query"
3. ☐ Copy all contents from `supabase/schema.sql`
4. ☐ Paste into editor
5. ☐ Click "Run" (Cmd/Ctrl + Enter)
6. ☐ Verify success message

## ☐ Step 3: Get Credentials (1 minute)

1. ☐ Click gear icon (Project Settings)
2. ☐ Click "API" in settings
3. ☐ Copy **Project URL**: `https://xxxxx.supabase.co`
4. ☐ Copy **anon/public key**: `eyJ...`
5. ☐ Save both somewhere safe!

## ☐ Step 4: Verify Database (30 seconds)

1. ☐ Click "Table Editor" in sidebar
2. ☐ See `bingo_board` table with 25 rows ✓
3. ☐ See `leaderboard` table with 3 users ✓

## ☐ Step 5: Push to GitHub (if not done)

```bash
☐ git add .
☐ git commit -m "Ready for deployment"
☐ git push origin main
```

## ☐ Step 6: Deploy to Vercel (3 minutes)

1. ☐ Go to https://vercel.com/dashboard
2. ☐ Click "Add New..." → "Project"
3. ☐ Import your GitHub repository
4. ☐ Add Environment Variables:
   - ☐ Key: `SUPABASE_URL` | Value: [your project URL]
   - ☐ Key: `SUPABASE_ANON_KEY` | Value: [your anon key]
5. ☐ Click "Deploy"
6. ☐ Wait 2-3 minutes
7. ☐ Click on deployment URL

## ☐ Step 7: Test Your Site (1 minute)

1. ☐ Site loads properly ✓
2. ☐ Bingo board shows all 25 squares ✓
3. ☐ Leaderboard shows 3 sample users ✓
4. ☐ Click a bingo square - it toggles ✓
5. ☐ Wait 3 seconds - data persists ✓

## 🎉 You're Done!

Your site URL: `https://your-project.vercel.app`

## Next Steps

- ☐ Share URL with your streamer friend
- ☐ Customize bingo squares via Supabase Table Editor
- ☐ Add more players to leaderboard
- ☐ (Optional) Set up custom domain in Vercel

## Quick Reference

**Supabase Dashboard**: https://app.supabase.com/project/YOUR_PROJECT
**Vercel Dashboard**: https://vercel.com/dashboard
**Your Site**: https://your-project.vercel.app

## Troubleshooting

**Site shows "Failed to fetch"**
→ Check environment variables are set correctly in Vercel
→ Verify Supabase credentials

**Database tables missing**
→ Re-run schema.sql in Supabase SQL Editor
→ Check Table Editor to verify tables exist

**Changes not deploying**
→ Vercel auto-deploys on git push
→ Check deployments tab in Vercel dashboard

## Need Help?

See the full guide: [VERCEL_SUPABASE_SETUP.md](VERCEL_SUPABASE_SETUP.md)
