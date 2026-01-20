# Pokemon Bingo Database Design

## Overview

This database is designed for a **multi-user Pokemon bingo game** where:
- Each user gets their own randomized bingo board each month
- 24 Pokemon are selected each month from a master pool
- Position 13 is always the "FREE SPACE"
- Users compete on a monthly leaderboard
- Points are awarded for completing bingos (rows, columns, diagonals)

## Table Structure

### 1. `pokemon_master` - Pokemon Reference Data
**Purpose**: Master list of all Pokemon with their metadata

| Column | Type | Description |
|--------|------|-------------|
| `national_dex_id` | INTEGER (PK) | National Pokedex number (1-1025+) |
| `name` | TEXT | Pokemon name (e.g., "Pikachu") |
| `gif_url` | TEXT | URL to animated GIF sprite |
| `sprite_url` | TEXT | URL to static sprite image |
| `created_at` | TIMESTAMP | When added to database |

**Why this design?**
- One row per Pokemon, never changes
- Stores GIF URLs from PokeAPI or your CDN
- Can add more fields later (type, generation, etc.)

**Example row:**
```sql
national_dex_id: 25
name: "Pikachu"
gif_url: "https://raw.githubusercontent.com/.../25.gif"
sprite_url: "https://raw.githubusercontent.com/.../25.png"
```

---

### 2. `users` - Player Accounts
**Purpose**: All users who play the bingo game

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Unique user ID |
| `username` | TEXT (UNIQUE) | Login/unique username |
| `display_name` | TEXT | Display name (can be same as username) |
| `created_at` | TIMESTAMP | When user registered |
| `updated_at` | TIMESTAMP | Last profile update |

**Why UUID?**
- Better for distributed systems
- No sequential ID guessing
- Easy to merge databases if needed

---

### 3. `bingo_months` - Monthly Periods
**Purpose**: Defines each monthly bingo competition period

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL (PK) | Auto-increment ID |
| `month_year` | TEXT (UNIQUE) | Format: "2026-01", "2026-02" |
| `start_date` | DATE | First day of month |
| `end_date` | DATE | Last day of month |
| `is_active` | BOOLEAN | Only one should be true at a time |
| `created_at` | TIMESTAMP | When created |

**Why this design?**
- Easy to query current month: `WHERE is_active = true`
- Historical data preserved for past months
- Can have overlapping events if needed later

**Example rows:**
```sql
id: 1, month_year: "2026-01", is_active: true
id: 2, month_year: "2026-02", is_active: false
```

---

### 4. `monthly_pokemon_pool` - Month's Pokemon Selection
**Purpose**: The 24 Pokemon available for a specific month (shared by all users)

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL (PK) | Auto-increment ID |
| `month_id` | INTEGER (FK) | References bingo_months(id) |
| `national_dex_id` | INTEGER (FK) | References pokemon_master(national_dex_id) |
| `position` | INTEGER | Optional display order (1-24) |
| `created_at` | TIMESTAMP | When added |

**Why separate from user boards?**
- All users draw from the same 24 Pokemon each month
- Admin selects 24 Pokemon once per month
- Each user gets a random arrangement of these 24

**Example rows for January 2026:**
```sql
month_id: 1, national_dex_id: 25 (Pikachu), position: 1
month_id: 1, national_dex_id: 1 (Bulbasaur), position: 2
...
month_id: 1, national_dex_id: 150 (Mewtwo), position: 24
```

---

### 5. `user_bingo_boards` - Individual User Boards ⭐ CORE TABLE
**Purpose**: Each user's specific bingo board for a given month

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Unique board cell ID |
| `user_id` | UUID (FK) | References users(id) |
| `month_id` | INTEGER (FK) | References bingo_months(id) |
| `position` | INTEGER | Board position 1-25 |
| `national_dex_id` | INTEGER (FK) | Pokemon at this position (NULL for pos 13) |
| `is_checked` | BOOLEAN | Has user checked this square? |
| `checked_at` | TIMESTAMP | When it was checked |
| `created_at` | TIMESTAMP | When board generated |
| `updated_at` | TIMESTAMP | Last update |

**Key constraints:**
- `UNIQUE(user_id, month_id, position)` - Each user has one board per month
- `CHECK(position >= 1 AND position <= 25)` - Valid positions only
- Position 13 must have `national_dex_id = NULL` (FREE SPACE)
- Position 13 starts as `is_checked = true`

**Why this design?**
- Each user gets unique randomized Pokemon placement
- 25 rows per user per month (one per square)
- Position 13 is always free space
- Fast queries: "Get my January board" = 25 rows

**Example rows for user "ash" in January:**
```sql
user_id: uuid-ash, month_id: 1, position: 1, national_dex_id: 4 (Charmander), is_checked: false
user_id: uuid-ash, month_id: 1, position: 2, national_dex_id: 25 (Pikachu), is_checked: true
...
user_id: uuid-ash, month_id: 1, position: 13, national_dex_id: NULL, is_checked: true (FREE)
...
user_id: uuid-ash, month_id: 1, position: 25, national_dex_id: 150 (Mewtwo), is_checked: false
```

---

### 6. `user_monthly_points` - Precomputed Leaderboard ⭐ PERFORMANCE TABLE
**Purpose**: Fast leaderboard queries with precomputed scores

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Unique entry ID |
| `user_id` | UUID (FK) | References users(id) |
| `month_id` | INTEGER (FK) | References bingo_months(id) |
| `points` | INTEGER | Total points this month |
| `bingos_completed` | INTEGER | How many bingos achieved |
| `last_updated` | TIMESTAMP | Last recalculation |
| `created_at` | TIMESTAMP | When created |

**Why precompute?**
- ❌ Without this: "Calculate bingos for 1000 users" = 1000 complex queries
- ✅ With this: "Get leaderboard" = `SELECT * FROM user_monthly_points ORDER BY points DESC`
- Updated automatically via trigger when squares are checked

**Scoring example:**
- Each bingo = 100 points
- Max possible: 1200 points (12 total bingos: 5 rows + 5 columns + 2 diagonals)

**Example rows:**
```sql
user_id: uuid-ash, month_id: 1, points: 300, bingos_completed: 3
user_id: uuid-misty, month_id: 1, points: 500, bingos_completed: 5
user_id: uuid-brock, month_id: 1, points: 200, bingos_completed: 2
```

**Leaderboard query:**
```sql
SELECT u.display_name, p.points, p.bingos_completed
FROM user_monthly_points p
JOIN users u ON u.id = p.user_id
WHERE p.month_id = (SELECT id FROM bingo_months WHERE is_active = true)
ORDER BY p.points DESC, p.bingos_completed DESC;
```

---

### 7. `bingo_achievements` - Bingo History (Optional)
**Purpose**: Track which specific bingos users have achieved

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Unique achievement ID |
| `user_id` | UUID (FK) | References users(id) |
| `month_id` | INTEGER (FK) | References bingo_months(id) |
| `bingo_type` | TEXT | "row", "column", "diagonal" |
| `bingo_index` | INTEGER | Which row/column (1-5) or diagonal (1-2) |
| `achieved_at` | TIMESTAMP | When they got this bingo |

**Why track achievements?**
- Shows progression timeline
- Can display "You got Row 3!" notification
- Analytics: "Which bingos are completed most?"
- Could award bonus points for first bingo, etc.

**Example rows:**
```sql
user_id: uuid-ash, month_id: 1, bingo_type: "row", bingo_index: 1, achieved_at: 2026-01-05
user_id: uuid-ash, month_id: 1, bingo_type: "column", bingo_index: 3, achieved_at: 2026-01-12
user_id: uuid-ash, month_id: 1, bingo_type: "diagonal", bingo_index: 1, achieved_at: 2026-01-20
```

---

## Key Functions

### `generate_user_board(user_id, month_id)`
**What it does:**
1. Deletes any existing board for this user/month
2. Creates FREE SPACE at position 13
3. Randomly selects 24 Pokemon from `monthly_pokemon_pool`
4. Assigns them to positions 1-25 (skipping 13)

**When to call:**
- When a new user signs up
- At the start of each new month for existing users
- If a user requests a board reset (if you allow that)

**Usage:**
```sql
SELECT generate_user_board('uuid-of-user', 1); -- Generate for month ID 1
```

---

### `check_and_update_bingos(user_id, month_id)`
**What it does:**
1. Checks all possible bingos (5 rows + 5 columns + 2 diagonals = 12 total)
2. Counts how many are complete
3. Records new achievements
4. Updates `user_monthly_points` with new score

**When to call:**
- Automatically via trigger when `is_checked` changes to true
- Can also call manually for recalculation

**Bingo detection logic:**
```
Row 1: positions 1, 2, 3, 4, 5
Row 2: positions 6, 7, 8, 9, 10
Row 3: positions 11, 12, 13, 14, 15
Row 4: positions 16, 17, 18, 19, 20
Row 5: positions 21, 22, 23, 24, 25

Column 1: positions 1, 6, 11, 16, 21
Column 2: positions 2, 7, 12, 17, 22
... etc

Diagonal 1: positions 1, 7, 13, 19, 25
Diagonal 2: positions 5, 9, 13, 17, 21
```

---

## Data Flow Example

### Setup Phase (Done Once Per Month)
```sql
-- 1. Create new month
INSERT INTO bingo_months (month_year, start_date, end_date, is_active)
VALUES ('2026-02', '2026-02-01', '2026-02-28', true);

-- 2. Deactivate previous month
UPDATE bingo_months SET is_active = false WHERE month_year = '2026-01';

-- 3. Select 24 Pokemon for February
INSERT INTO monthly_pokemon_pool (month_id, national_dex_id)
VALUES 
  (2, 1),   -- Bulbasaur
  (2, 4),   -- Charmander
  (2, 7),   -- Squirtle
  ... -- 21 more
```

### User Registration
```sql
-- 1. Create user
INSERT INTO users (username, display_name)
VALUES ('new_trainer', 'New Trainer')
RETURNING id; -- uuid-new-trainer

-- 2. Generate their board for current month
SELECT generate_user_board('uuid-new-trainer', 
  (SELECT id FROM bingo_months WHERE is_active = true)
);
```

### Gameplay
```sql
-- User clicks a square (position 7)
UPDATE user_bingo_boards
SET is_checked = true, checked_at = NOW()
WHERE user_id = 'uuid-ash'
  AND month_id = (SELECT id FROM bingo_months WHERE is_active = true)
  AND position = 7;

-- Trigger automatically runs check_and_update_bingos()
-- If this completes a bingo, points are updated automatically
```

### Viewing Leaderboard
```sql
SELECT 
  u.display_name,
  p.points,
  p.bingos_completed,
  RANK() OVER (ORDER BY p.points DESC) as rank
FROM user_monthly_points p
JOIN users u ON u.id = p.user_id
WHERE p.month_id = (SELECT id FROM bingo_months WHERE is_active = true)
ORDER BY p.points DESC
LIMIT 100;
```

---

## Performance Optimizations

### Indexes Created
```sql
-- Fast user board lookups
CREATE INDEX idx_user_bingo_boards_user_month 
  ON user_bingo_boards(user_id, month_id);

-- Fast monthly queries
CREATE INDEX idx_monthly_pool_month 
  ON monthly_pokemon_pool(month_id);

-- Fast leaderboard queries
CREATE INDEX idx_user_points_month 
  ON user_monthly_points(month_id);

-- Fast active month lookup
CREATE INDEX idx_bingo_months_active 
  ON bingo_months(is_active) WHERE is_active = true;
```

### Why This is Fast
- **User board query**: Single index lookup + 25 rows returned
- **Leaderboard query**: Index scan on month_id + sort (precomputed points)
- **Bingo checking**: Done via trigger, not on every page load
- **No joins needed** for common queries

---

## Comparison to Original Design

### ❌ Original Design (Shared Board)
- One global bingo_board table
- All users see the same board
- Simple but not per-user

### ✅ New Design (Per-User Boards)
- Each user has unique randomized board
- More engaging and competitive
- Scales to unlimited users
- Monthly resets for freshness

---

## Future Enhancements

1. **Weighted Pokemon Selection**
   - Rare Pokemon worth more points
   - Store rarity in `pokemon_master`

2. **Team Bingo**
   - Add `teams` table
   - Team points = sum of member points

3. **Special Events**
   - "Legendary Weekend" with bonus points
   - Double points Fridays

4. **Streaks**
   - Track daily check-ins
   - Bonus points for consecutive days

5. **Social Features**
   - Friend comparisons
   - Share completed boards

---

## Questions & Answers

**Q: How do I add all 1000+ Pokemon?**
A: Use the PokeAPI to bulk insert. See `scripts/populate_pokemon.js` (to be created)

**Q: Can users have multiple boards per month?**
A: Currently no, but you could add a `board_number` column to `user_bingo_boards`

**Q: What if a user wants to reset their board?**
A: Call `generate_user_board()` again - it deletes the old one first

**Q: How do I handle ties in the leaderboard?**
A: Use `bingos_completed` as tiebreaker, then `created_at` (who completed first)

**Q: Can I change the scoring (100 pts per bingo)?**
A: Yes, modify the `check_and_update_bingos()` function's calculation

---

## Summary

This database design optimizes for:
- ✅ **Per-user randomization** - Each player has unique board
- ✅ **Monthly resets** - Fresh competition every month
- ✅ **Fast leaderboards** - Precomputed points, no calculation needed
- ✅ **Scalability** - Handles thousands of users efficiently
- ✅ **Flexibility** - Easy to add Pokemon, modify scoring, etc.
- ✅ **Historical data** - Keep past months for stats/analysis

The key insight is **separating the monthly Pokemon pool** (24 Pokemon everyone shares) from **individual user boards** (random arrangement of those 24 + free space).
