# Deployment Guide

This guide covers deploying your streaming bingo website to production.

## Architecture Overview

- **Frontend**: Static React app (can be hosted on Netlify, Vercel, etc.)
- **Backend**: Node.js API server (can be hosted on Railway, Render, Heroku, etc.)
- **Database**: SQLite (should migrate to PostgreSQL for production)

## Option 1: Railway (Recommended for Beginners)

Railway provides easy deployment for both frontend and backend.

### Backend Deployment

1. Create account at https://railway.app/
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway will auto-detect the Node.js app
5. Add environment variables:
   - `PORT` (Railway provides this automatically)
6. Set the root directory to `server` in Railway settings
7. Your API will be deployed with a URL like: `https://your-app.railway.app`

### Frontend Deployment

1. In Railway, add a new service for the frontend
2. Set root directory to `client`
3. Add environment variable:
   - `VITE_API_URL` = Your backend URL from step above
4. Build command: `npm run build`
5. Start command: `npx serve -s dist`

## Option 2: Vercel (Frontend) + Render (Backend)

### Backend on Render

1. Create account at https://render.com/
2. Click "New" → "Web Service"
3. Connect your Git repository
4. Settings:
   - Root Directory: `server`
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Add environment variables if needed
6. Note your service URL (e.g., `https://your-app.onrender.com`)

### Frontend on Vercel

1. Create account at https://vercel.com/
2. Click "New Project"
3. Import your Git repository
4. Settings:
   - Root Directory: `client`
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Environment Variables:
   - `VITE_API_URL` = Your Render backend URL
6. Deploy!

## Option 3: Self-Hosted (VPS)

### Requirements
- Ubuntu 20.04+ server
- Node.js 16+
- Nginx
- PM2 for process management

### Setup Backend

```bash
# SSH into your server
ssh user@your-server-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Clone your repository
git clone your-repo-url
cd streaming-bingo/server

# Install dependencies
npm install

# Start with PM2
pm2 start server.js --name streaming-bingo-api
pm2 save
pm2 startup
```

### Setup Frontend

```bash
cd ../client
npm install
npm run build

# Move build to web directory
sudo mv dist /var/www/streaming-bingo
```

### Configure Nginx

```nginx
# /etc/nginx/sites-available/streaming-bingo
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        root /var/www/streaming-bingo;
        try_files $uri $uri/ /index.html;
    }

    # API Proxy
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/streaming-bingo /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Setup SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Database Migration to PostgreSQL (Production)

For production, migrate from SQLite to PostgreSQL:

### Install PostgreSQL Dependencies

```bash
npm install pg
```

### Update database.js

Replace SQLite code with PostgreSQL connection:

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
```

### Migration Script

Create a migration script to transfer data from SQLite to PostgreSQL.

## Environment Variables for Production

Create these environment variables in your hosting platform:

**Backend:**
- `PORT` - Server port (usually provided by host)
- `NODE_ENV` - Set to `production`
- `DATABASE_URL` - PostgreSQL connection string (if using PostgreSQL)

**Frontend:**
- `VITE_API_URL` - Full URL to your backend API

## Post-Deployment Checklist

- [ ] Backend API is accessible
- [ ] Frontend loads correctly
- [ ] API calls work from frontend to backend
- [ ] Database is initialized with default data
- [ ] CORS is configured correctly
- [ ] SSL/HTTPS is enabled
- [ ] Environment variables are set
- [ ] Error logging is configured
- [ ] Backup strategy is in place
- [ ] Domain name is pointed correctly (if using custom domain)

## Monitoring

Consider adding:
- **Error tracking**: Sentry, LogRocket
- **Analytics**: Google Analytics, Plausible
- **Uptime monitoring**: UptimeRobot, Pingdom
- **Server monitoring**: PM2 Monitor, New Relic

## Scaling Considerations

As your app grows:
1. Move to PostgreSQL instead of SQLite
2. Add Redis for caching
3. Implement WebSockets for real-time updates instead of polling
4. Add a CDN for static assets
5. Consider load balancing for the backend

## Continuous Deployment

Set up automatic deployments:

**GitHub Actions Example** (.github/workflows/deploy.yml):
```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to production
        run: |
          # Add your deployment commands here
```

## Troubleshooting

**CORS Issues:**
Make sure your backend allows requests from your frontend domain:
```javascript
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173'
}));
```

**Database Connection Errors:**
Check environment variables and connection strings.

**Build Failures:**
Ensure all dependencies are in package.json, not just devDependencies.

## Support

For deployment issues:
- Check logs in your hosting platform
- Verify all environment variables are set
- Test API endpoints directly
- Check network/CORS settings
