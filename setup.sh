#!/bin/bash

echo "🎮 Streaming Bingo - Quick Setup Script 🎮"
echo "=========================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v16+ first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"
echo ""

# Install server dependencies
echo "📦 Installing server dependencies..."
cd server
npm install
if [ $? -ne 0 ]; then
    echo "❌ Failed to install server dependencies"
    exit 1
fi
echo "✅ Server dependencies installed"
echo ""

# Install client dependencies
echo "📦 Installing client dependencies..."
cd ../client
npm install
if [ $? -ne 0 ]; then
    echo "❌ Failed to install client dependencies"
    exit 1
fi
echo "✅ Client dependencies installed"
echo ""

# Create .env file if it doesn't exist
cd ../server
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "✅ .env file created"
    echo ""
    echo "⚠️  IMPORTANT: Edit server/.env and add your Supabase credentials:"
    echo "   SUPABASE_URL=https://your-project.supabase.co"
    echo "   SUPABASE_ANON_KEY=your-anon-key-here"
    echo ""
else
    echo "ℹ️  .env file already exists"
fi
echo ""

echo "=========================================="
echo "🎉 Setup Complete! 🎉"
echo "=========================================="
echo ""
echo "⚠️  Before running locally, you need to:"
echo ""
echo "1️⃣  Set up Supabase:"
echo "   - Create a project at https://supabase.com"
echo "   - Run the schema from supabase/schema.sql"
echo "   - Get your credentials from Project Settings → API"
echo ""
echo "2️⃣  Update server/.env with your Supabase credentials"
echo ""
echo "3️⃣  Then start the application:"
echo "   Backend:  cd server && npm start"
echo "   Frontend: cd client && npm run dev"
echo ""
echo "📚 For deployment to Vercel + Supabase:"
echo "   See VERCEL_SUPABASE_SETUP.md or QUICK_START.md"
echo ""
