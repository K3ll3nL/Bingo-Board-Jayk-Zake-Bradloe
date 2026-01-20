# Database Management Guide

This guide shows you how to manually update the bingo board and leaderboard using various methods.

## Method 1: Using the API (Recommended)

### Update Bingo Board

**Toggle a cell (check/uncheck):**
```bash
# Cell IDs range from 1 to 25
curl -X PUT http://localhost:3001/api/bingo/cell/13
```

**Update cell text:**
```bash
curl -X PUT http://localhost:3001/api/bingo/cell/5/text \
  -H "Content-Type: application/json" \
  -d '{"text": "New bingo square text"}'
```

**Reset entire board:**
```bash
curl -X POST http://localhost:3001/api/bingo/reset
```

### Update Leaderboard

**Add a new user:**
```bash
curl -X POST http://localhost:3001/api/leaderboard/user \
  -H "Content-Type: application/json" \
  -d '{"username": "NewPlayer", "points": 50}'
```

**Update user's total points:**
```bash
# Replace '1' with the user's ID
curl -X PUT http://localhost:3001/api/leaderboard/user/1/points \
  -H "Content-Type: application/json" \
  -d '{"points": 200}'
```

**Add points to a user (increment):**
```bash
# Add 10 points to user ID 1
curl -X POST http://localhost:3001/api/leaderboard/user/1/add-points \
  -H "Content-Type: application/json" \
  -d '{"points": 10}'
```

**Delete a user:**
```bash
curl -X DELETE http://localhost:3001/api/leaderboard/user/2
```

## Method 2: Direct SQLite Access

### Connect to the Database

```bash
cd server/db
sqlite3 streaming-bingo.db
```

### Useful SQLite Commands

**View all tables:**
```sql
.tables
```

**View table schema:**
```sql
.schema bingo_board
.schema leaderboard
```

**Enable column headers:**
```sql
.headers on
.mode column
```

### Bingo Board Queries

**View all squares:**
```sql
SELECT * FROM bingo_board;
```

**Check a specific square:**
```sql
UPDATE bingo_board SET checked = 1 WHERE id = 7;
```

**Uncheck a square:**
```sql
UPDATE bingo_board SET checked = 0 WHERE id = 7;
```

**Update square text:**
```sql
UPDATE bingo_board SET text = 'New square text' WHERE id = 3;
```

**Reset all squares:**
```sql
UPDATE bingo_board SET checked = 0;
```

### Leaderboard Queries

**View leaderboard:**
```sql
SELECT * FROM leaderboard ORDER BY points DESC;
```

**Add a new user:**
```sql
INSERT INTO leaderboard (username, points) VALUES ('PlayerName', 100);
```

**Update user points:**
```sql
UPDATE leaderboard SET points = 250 WHERE username = 'PlayerName';
```

**Add points to a user:**
```sql
UPDATE leaderboard SET points = points + 50 WHERE username = 'PlayerName';
```

**Delete a user:**
```sql
DELETE FROM leaderboard WHERE username = 'PlayerName';
```

**Find user by ID:**
```sql
SELECT * FROM leaderboard WHERE id = 1;
```

**Exit SQLite:**
```sql
.quit
```

## Method 3: Using a Database GUI Tool

You can use GUI tools for easier database management:

### DB Browser for SQLite (Free, Cross-platform)

1. Download from: https://sqlitebrowser.org/
2. Open the database file: `server/db/streaming-bingo.db`
3. Use the "Browse Data" tab to view and edit records
4. Use the "Execute SQL" tab to run custom queries

### TablePlus (Free tier available)

1. Download from: https://tableplus.com/
2. Create a new SQLite connection
3. Point to: `server/db/streaming-bingo.db`
4. Use the visual interface to manage data

## Common Scenarios

### Scenario 1: Stream Event Occurs
When something happens on stream that matches a bingo square:

```bash
# Toggle the matching square (e.g., square 8)
curl -X PUT http://localhost:3001/api/bingo/cell/8
```

### Scenario 2: Award Points to Winner
When someone gets bingo:

```bash
# Add 100 points to user ID 3
curl -X POST http://localhost:3001/api/leaderboard/user/3/add-points \
  -H "Content-Type: application/json" \
  -d '{"points": 100}'
```

### Scenario 3: New Stream, Reset Board

```bash
# Reset all bingo squares for a new stream
curl -X POST http://localhost:3001/api/bingo/reset
```

### Scenario 4: Update Bingo Squares for New Stream Theme

```sql
-- In SQLite
UPDATE bingo_board SET text = 'Specific event for this stream' WHERE id = 1;
UPDATE bingo_board SET text = 'Another stream-specific event' WHERE id = 2;
-- Continue for all squares you want to customize
```

## Automation Tips

You can create shell scripts to automate common tasks:

**give-points.sh:**
```bash
#!/bin/bash
USER_ID=$1
POINTS=$2
curl -X POST http://localhost:3001/api/leaderboard/user/$USER_ID/add-points \
  -H "Content-Type: application/json" \
  -d "{\"points\": $POINTS}"
```

Usage: `./give-points.sh 1 50` (gives user 1 a total of 50 points)

## Backup Your Database

Always backup before major changes:

```bash
cp server/db/streaming-bingo.db server/db/streaming-bingo-backup-$(date +%Y%m%d).db
```

## Troubleshooting

**Database locked error:**
- Make sure the server isn't running when accessing directly with SQLite
- Or use the API instead

**Can't find database file:**
- Make sure you're in the correct directory
- The database is created automatically when you first start the server

**Changes not showing on website:**
- The website polls every 3 seconds, wait a moment
- Try refreshing the page manually
- Check that the server is running
