# Git Setup Guide - First Push to GitHub

Complete step-by-step guide for setting up your Pokemon Bingo project in VSCode and pushing to GitHub.

## Prerequisites

- ✅ VSCode installed
- ✅ Git installed (check with `git --version` in terminal)
- ✅ GitHub account
- ✅ Blank folder: `Bingo-Board-Jayk-Zake-Bradloe`
- ✅ Blank `.git` initialized

---

## Step 1: Create GitHub Repository

1. Go to https://github.com
2. Click the **"+"** icon (top right) → **"New repository"**
3. Fill in:
   - **Repository name**: `Bingo-Board-Jayk-Zake-Bradloe`
   - **Description**: "Pokemon Bingo game with monthly rotating boards and leaderboard"
   - **Visibility**: Public or Private (your choice)
   - **DO NOT** check "Add a README file"
   - **DO NOT** add .gitignore or license yet
4. Click **"Create repository"**
5. **Keep this page open** - you'll need the URL

---

## Step 2: Open Project in VSCode

1. Open VSCode
2. File → Open Folder → Select `Bingo-Board-Jayk-Zake-Bradloe`
3. Open the integrated terminal: **Terminal → New Terminal** (or Ctrl+`)

---

## Step 3: Verify Git is Initialized

In the VSCode terminal, run:

```bash
git status
```

You should see:
```
On branch main (or master)
No commits yet
nothing to commit (create/copy files and use "git add" to track)
```

If you see an error, initialize git:
```bash
git init
```

---

## Step 4: Copy All Project Files

You have two options:

### Option A: Download from Claude (Recommended)

1. Download the `streaming-bingo` folder I created
2. Copy **all contents** into your `Bingo-Board-Jayk-Zake-Bradloe` folder
3. Your folder structure should look like:

```
Bingo-Board-Jayk-Zake-Bradloe/
├── .git/
├── .gitignore
├── README.md
├── QUICK_START.md
├── VERCEL_SUPABASE_SETUP.md
├── DATABASE_DESIGN.md
├── DATABASE_DIAGRAMS.md
├── vercel.json
├── setup.sh
├── client/
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       ├── components/
│       │   ├── BingoBoard.jsx
│       │   └── Leaderboard.jsx
│       └── services/
│           └── api.js
├── server/
│   ├── package.json
│   ├── server.js
│   ├── .env.example
│   ├── models/
│   │   └── supabase.js
│   └── routes/
│       ├── bingo-supabase.js
│       └── leaderboard-supabase.js
├── supabase/
│   └── schema-pokemon.sql
└── scripts/
    └── populate_pokemon.js
```

### Option B: Create Files Manually

Copy the contents of each file I created into your folder manually.

---

## Step 5: Configure Git (First Time Only)

If you haven't set up git before, configure your identity:

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

---

## Step 6: Review Files to Commit

In VSCode:
1. Click the **Source Control** icon (left sidebar, looks like a branch)
2. You should see all files listed under "Changes"
3. Review the `.gitignore` file to make sure sensitive files are excluded:

```
# Dependencies
node_modules/
package-lock.json
yarn.lock

# Environment variables
.env
.env.local

# Build outputs
client/dist/
client/build/

# Logs
logs
*.log

# OS files
.DS_Store

# IDE
.vscode/
.idea/
```

---

## Step 7: Stage All Files

In the terminal:

```bash
git add .
```

Or in VSCode:
- Click the **"+"** icon next to "Changes" to stage all files

Verify staged files:
```bash
git status
```

You should see all files in green under "Changes to be committed".

---

## Step 8: Create Your First Commit

```bash
git commit -m "Initial commit: Pokemon Bingo with Vercel + Supabase"
```

Or a more detailed message:
```bash
git commit -m "Initial commit: Pokemon Bingo game

- Multi-user bingo with per-user randomized boards
- Monthly rotating Pokemon pools (24 Pokemon + FREE space)
- Real-time leaderboard with automatic scoring
- React + Vite frontend with Tailwind CSS
- Node.js + Express backend
- Supabase PostgreSQL database
- Vercel deployment ready"
```

---

## Step 9: Add Remote Repository

Replace `YOUR_USERNAME` with your GitHub username:

```bash
git remote add origin https://github.com/YOUR_USERNAME/Bingo-Board-Jayk-Zake-Bradloe.git
```

Verify the remote was added:
```bash
git remote -v
```

You should see:
```
origin  https://github.com/YOUR_USERNAME/Bingo-Board-Jayk-Zake-Bradloe.git (fetch)
origin  https://github.com/YOUR_USERNAME/Bingo-Board-Jayk-Zake-Bradloe.git (push)
```

---

## Step 10: Create and Switch to Main Branch

GitHub now uses `main` instead of `master` by default:

```bash
git branch -M main
```

---

## Step 11: Push to GitHub 🚀

```bash
git push -u origin main
```

**If prompted for credentials:**
- **Username**: Your GitHub username
- **Password**: Use a **Personal Access Token** (not your GitHub password)

### How to Create a Personal Access Token (if needed):

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a name: "Pokemon Bingo Project"
4. Select scopes: Check **"repo"** (full control of private repositories)
5. Click "Generate token"
6. **Copy the token immediately** (you won't see it again!)
7. Use this token as your password when git asks

---

## Step 12: Verify on GitHub

1. Go to your repository: `https://github.com/YOUR_USERNAME/Bingo-Board-Jayk-Zake-Bradloe`
2. You should see all your files!
3. The README.md should display automatically

---

## Step 13: Set Up Git Credentials (Optional but Recommended)

To avoid entering credentials every time:

### Option A: Credential Helper (Mac/Linux)
```bash
git config --global credential.helper cache
```

### Option B: SSH Keys (More Secure)

1. Generate SSH key:
```bash
ssh-keygen -t ed25519 -C "your.email@example.com"
```

2. Add to SSH agent:
```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

3. Copy public key:
```bash
cat ~/.ssh/id_ed25519.pub
```

4. Add to GitHub:
   - GitHub → Settings → SSH and GPG keys → New SSH key
   - Paste the key and save

5. Change remote to SSH:
```bash
git remote set-url origin git@github.com:YOUR_USERNAME/Bingo-Board-Jayk-Zake-Bradloe.git
```

---

## Future Commits (After First Push)

Every time you make changes:

```bash
# 1. Check what changed
git status

# 2. Stage changes
git add .
# Or stage specific files:
git add client/src/App.jsx server/routes/bingo-supabase.js

# 3. Commit with message
git commit -m "Add Pokemon sprite animations"

# 4. Push to GitHub
git push
```

---

## Common Git Commands Reference

```bash
# View status
git status

# View commit history
git log
git log --oneline

# View changes before staging
git diff

# View changes after staging
git diff --staged

# Undo last commit (keeps changes)
git reset --soft HEAD~1

# Discard uncommitted changes (CAREFUL!)
git checkout -- filename.js

# Create a new branch
git checkout -b feature/new-feature

# Switch branches
git checkout main

# Merge branch into main
git checkout main
git merge feature/new-feature

# Pull latest changes from GitHub
git pull origin main
```

---

## VSCode Git Tips

### Source Control View
- **U** (Untracked) - New files
- **M** (Modified) - Changed files
- **D** (Deleted) - Deleted files
- **A** (Added) - Staged files

### Quick Actions
- **Stage changes**: Click "+" icon
- **Unstage changes**: Click "−" icon
- **Commit**: Type message in box → Click ✓
- **Push**: Click "..." menu → Push
- **Pull**: Click "..." menu → Pull

### GitLens Extension (Optional)
Install "GitLens" extension for advanced Git features:
- Blame annotations (who changed what)
- File history
- Line history
- Compare branches

---

## Troubleshooting

### "Permission denied (publickey)"
→ You need to set up SSH keys (see Step 13, Option B)

### "Support for password authentication was removed"
→ Use a Personal Access Token instead of password (see Step 11)

### "fatal: not a git repository"
→ Run `git init` in your project folder

### "Your branch is ahead of 'origin/main'"
→ You have local commits not pushed yet. Run `git push`

### Accidentally committed sensitive files
```bash
# Remove from git but keep file locally
git rm --cached .env

# Add to .gitignore
echo ".env" >> .gitignore

# Commit the removal
git add .gitignore
git commit -m "Remove .env from tracking"
git push
```

### Want to start over (CAREFUL!)
```bash
# Delete all commits but keep files
rm -rf .git
git init
git add .
git commit -m "Fresh start"
```

---

## Next Steps After First Push

1. **Set up Supabase** (see VERCEL_SUPABASE_SETUP.md)
2. **Deploy to Vercel** (see QUICK_START.md)
3. **Protect main branch** on GitHub:
   - Settings → Branches → Add rule for `main`
   - Require pull request reviews before merging

4. **Collaborate with team**:
   - Invite collaborators: Settings → Collaborators
   - Have them clone: `git clone https://github.com/YOUR_USERNAME/Bingo-Board-Jayk-Zake-Bradloe.git`

---

## Summary Checklist

- ✅ Created GitHub repository
- ✅ Opened folder in VSCode
- ✅ Copied all project files
- ✅ Configured git identity
- ✅ Staged all files (`git add .`)
- ✅ Created first commit
- ✅ Added remote origin
- ✅ Pushed to GitHub (`git push -u origin main`)
- ✅ Verified files on GitHub
- ✅ (Optional) Set up credential helper or SSH keys

**You're ready to code!** 🎉

Your project is now on GitHub and ready for Vercel deployment.
