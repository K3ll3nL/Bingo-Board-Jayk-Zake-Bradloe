-- Pokemon Bingo Database Schema for Supabase
-- Run this in your Supabase SQL Editor

-- ============================================================================
-- TABLE 1: pokemon_master
-- Master list of all Pokemon with their metadata
-- ============================================================================
CREATE TABLE IF NOT EXISTS pokemon_master (
  national_dex_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  gif_url TEXT,
  sprite_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- TABLE 2: users
-- All users participating in bingo
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- TABLE 3: bingo_months
-- Defines each monthly bingo period
-- ============================================================================
CREATE TABLE IF NOT EXISTS bingo_months (
  id SERIAL PRIMARY KEY,
  month_year TEXT UNIQUE NOT NULL, -- Format: "2025-01", "2025-02", etc.
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- TABLE 4: monthly_pokemon_pool
-- The 24 Pokemon available for a specific month (shared by all users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS monthly_pokemon_pool (
  id SERIAL PRIMARY KEY,
  month_id INTEGER NOT NULL REFERENCES bingo_months(id) ON DELETE CASCADE,
  national_dex_id INTEGER NOT NULL REFERENCES pokemon_master(national_dex_id),
  position INTEGER, -- Optional: for ordering/display
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(month_id, national_dex_id),
  UNIQUE(month_id, position)
);

-- ============================================================================
-- TABLE 5: user_bingo_boards
-- Each user's specific bingo board for a month
-- Stores which Pokemon are on their board and in which positions (1-25)
-- Position 13 is always the free space
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_bingo_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_id INTEGER NOT NULL REFERENCES bingo_months(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 1 AND position <= 25),
  national_dex_id INTEGER REFERENCES pokemon_master(national_dex_id), -- NULL for free space
  is_checked BOOLEAN DEFAULT false,
  checked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, month_id, position),
  CONSTRAINT free_space_check CHECK (
    (position = 13 AND national_dex_id IS NULL) OR 
    (position != 13 AND national_dex_id IS NOT NULL)
  )
);

-- ============================================================================
-- TABLE 6: user_monthly_points
-- Precomputed points per user per month for fast leaderboard queries
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_monthly_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_id INTEGER NOT NULL REFERENCES bingo_months(id) ON DELETE CASCADE,
  points INTEGER DEFAULT 0,
  bingos_completed INTEGER DEFAULT 0, -- How many bingos they've achieved
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, month_id)
);

-- ============================================================================
-- TABLE 7: bingo_achievements (optional - tracks when users get bingo)
-- ============================================================================
CREATE TABLE IF NOT EXISTS bingo_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_id INTEGER NOT NULL REFERENCES bingo_months(id) ON DELETE CASCADE,
  bingo_type TEXT NOT NULL, -- 'row', 'column', 'diagonal'
  bingo_index INTEGER, -- Which row/column (1-5), or NULL for diagonal
  achieved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES for performance
-- ============================================================================
CREATE INDEX idx_user_bingo_boards_user_month ON user_bingo_boards(user_id, month_id);
CREATE INDEX idx_user_bingo_boards_month ON user_bingo_boards(month_id);
CREATE INDEX idx_monthly_pool_month ON monthly_pokemon_pool(month_id);
CREATE INDEX idx_user_points_month ON user_monthly_points(month_id);
CREATE INDEX idx_bingo_months_active ON bingo_months(is_active) WHERE is_active = true;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically generate a user's bingo board for a month
-- Randomly assigns 24 Pokemon from the monthly pool to positions 1-25 (skipping 13)
CREATE OR REPLACE FUNCTION generate_user_board(p_user_id UUID, p_month_id INTEGER)
RETURNS VOID AS $$
DECLARE
  v_pokemon RECORD;
  v_position INTEGER := 1;
BEGIN
  -- Delete existing board if any
  DELETE FROM user_bingo_boards WHERE user_id = p_user_id AND month_id = p_month_id;
  
  -- Insert free space at position 13
  INSERT INTO user_bingo_boards (user_id, month_id, position, national_dex_id)
  VALUES (p_user_id, p_month_id, 13, NULL);
  
  -- Get 24 random Pokemon from the monthly pool and assign to positions
  FOR v_pokemon IN (
    SELECT national_dex_id 
    FROM monthly_pokemon_pool 
    WHERE month_id = p_month_id 
    ORDER BY RANDOM()
    LIMIT 24
  ) LOOP
    -- Skip position 13 (free space)
    IF v_position = 13 THEN
      v_position := v_position + 1;
    END IF;
    
    INSERT INTO user_bingo_boards (user_id, month_id, position, national_dex_id)
    VALUES (p_user_id, p_month_id, v_position, v_pokemon.national_dex_id);
    
    v_position := v_position + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to check for bingos and update points
CREATE OR REPLACE FUNCTION check_and_update_bingos(p_user_id UUID, p_month_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_bingo_count INTEGER := 0;
  v_row INTEGER;
  v_col INTEGER;
  v_all_checked BOOLEAN;
BEGIN
  -- Check rows (5 rows, positions 1-5, 6-10, 11-15, 16-20, 21-25)
  FOR v_row IN 1..5 LOOP
    SELECT BOOL_AND(is_checked) INTO v_all_checked
    FROM user_bingo_boards
    WHERE user_id = p_user_id 
      AND month_id = p_month_id 
      AND position BETWEEN (v_row - 1) * 5 + 1 AND v_row * 5;
    
    IF v_all_checked THEN
      v_bingo_count := v_bingo_count + 1;
      
      -- Record achievement if not already recorded
      INSERT INTO bingo_achievements (user_id, month_id, bingo_type, bingo_index)
      VALUES (p_user_id, p_month_id, 'row', v_row)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  
  -- Check columns (5 columns)
  FOR v_col IN 1..5 LOOP
    SELECT BOOL_AND(is_checked) INTO v_all_checked
    FROM user_bingo_boards
    WHERE user_id = p_user_id 
      AND month_id = p_month_id 
      AND position IN (v_col, v_col + 5, v_col + 10, v_col + 15, v_col + 20);
    
    IF v_all_checked THEN
      v_bingo_count := v_bingo_count + 1;
      
      INSERT INTO bingo_achievements (user_id, month_id, bingo_type, bingo_index)
      VALUES (p_user_id, p_month_id, 'column', v_col)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  
  -- Check diagonal (top-left to bottom-right: 1, 7, 13, 19, 25)
  SELECT BOOL_AND(is_checked) INTO v_all_checked
  FROM user_bingo_boards
  WHERE user_id = p_user_id 
    AND month_id = p_month_id 
    AND position IN (1, 7, 13, 19, 25);
  
  IF v_all_checked THEN
    v_bingo_count := v_bingo_count + 1;
    
    INSERT INTO bingo_achievements (user_id, month_id, bingo_type, bingo_index)
    VALUES (p_user_id, p_month_id, 'diagonal', 1)
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Check diagonal (top-right to bottom-left: 5, 9, 13, 17, 21)
  SELECT BOOL_AND(is_checked) INTO v_all_checked
  FROM user_bingo_boards
  WHERE user_id = p_user_id 
    AND month_id = p_month_id 
    AND position IN (5, 9, 13, 17, 21);
  
  IF v_all_checked THEN
    v_bingo_count := v_bingo_count + 1;
    
    INSERT INTO bingo_achievements (user_id, month_id, bingo_type, bingo_index)
    VALUES (p_user_id, p_month_id, 'diagonal', 2)
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Update points (e.g., 100 points per bingo)
  INSERT INTO user_monthly_points (user_id, month_id, points, bingos_completed)
  VALUES (p_user_id, p_month_id, v_bingo_count * 100, v_bingo_count)
  ON CONFLICT (user_id, month_id) 
  DO UPDATE SET 
    points = v_bingo_count * 100,
    bingos_completed = v_bingo_count,
    last_updated = NOW();
  
  RETURN v_bingo_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamps
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_bingo_boards_updated_at
  BEFORE UPDATE ON user_bingo_boards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Automatically check for bingos when a square is checked
CREATE OR REPLACE FUNCTION trigger_check_bingos()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_checked = true AND (OLD.is_checked IS NULL OR OLD.is_checked = false) THEN
    PERFORM check_and_update_bingos(NEW.user_id, NEW.month_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_check_bingos
  AFTER UPDATE ON user_bingo_boards
  FOR EACH ROW
  EXECUTE FUNCTION trigger_check_bingos();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE pokemon_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bingo_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_pokemon_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_bingo_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_monthly_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE bingo_achievements ENABLE ROW LEVEL SECURITY;

-- Public read access to all tables
CREATE POLICY "Public read pokemon_master" ON pokemon_master FOR SELECT TO public USING (true);
CREATE POLICY "Public read users" ON users FOR SELECT TO public USING (true);
CREATE POLICY "Public read bingo_months" ON bingo_months FOR SELECT TO public USING (true);
CREATE POLICY "Public read monthly_pokemon_pool" ON monthly_pokemon_pool FOR SELECT TO public USING (true);
CREATE POLICY "Public read user_bingo_boards" ON user_bingo_boards FOR SELECT TO public USING (true);
CREATE POLICY "Public read user_monthly_points" ON user_monthly_points FOR SELECT TO public USING (true);
CREATE POLICY "Public read bingo_achievements" ON bingo_achievements FOR SELECT TO public USING (true);

-- Public write access (you may want to restrict this later)
CREATE POLICY "Public insert users" ON users FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public update users" ON users FOR UPDATE TO public USING (true);
CREATE POLICY "Public update user_bingo_boards" ON user_bingo_boards FOR UPDATE TO public USING (true);

-- Admin-only write access for setup tables (you'll need to adjust these for production)
CREATE POLICY "Public insert pokemon_master" ON pokemon_master FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public insert bingo_months" ON bingo_months FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public update bingo_months" ON bingo_months FOR UPDATE TO public USING (true);
CREATE POLICY "Public insert monthly_pokemon_pool" ON monthly_pokemon_pool FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public insert user_bingo_boards" ON user_bingo_boards FOR INSERT TO public WITH CHECK (true);

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

-- Insert some sample Pokemon (you'll want to add all 1000+)
INSERT INTO pokemon_master (national_dex_id, name, gif_url, sprite_url) VALUES
  (1, 'Bulbasaur', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/1.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png'),
  (4, 'Charmander', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/4.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/4.png'),
  (7, 'Squirtle', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/7.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/7.png'),
  (25, 'Pikachu', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/25.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png'),
  (133, 'Eevee', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/133.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/133.png'),
  (150, 'Mewtwo', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/150.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/150.png'),
  (151, 'Mew', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/151.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/151.png'),
  (94, 'Gengar', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/94.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/94.png'),
  (130, 'Gyarados', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/130.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/130.png'),
  (6, 'Charizard', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/6.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/6.png'),
  (143, 'Snorlax', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/143.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/143.png'),
  (54, 'Psyduck', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/54.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/54.png'),
  (39, 'Jigglypuff', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/39.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/39.png'),
  (131, 'Lapras', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/131.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/131.png'),
  (149, 'Dragonite', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/149.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/149.png'),
  (50, 'Diglett', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/50.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/50.png'),
  (132, 'Ditto', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/132.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/132.png'),
  (144, 'Articuno', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/144.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/144.png'),
  (145, 'Zapdos', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/145.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/145.png'),
  (146, 'Moltres', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/146.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/146.png'),
  (52, 'Meowth', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/52.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/52.png'),
  (68, 'Machamp', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/68.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/68.png'),
  (137, 'Porygon', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/137.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/137.png'),
  (59, 'Arcanine', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/59.gif', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/59.png')
ON CONFLICT (national_dex_id) DO NOTHING;

-- Create current month
INSERT INTO bingo_months (month_year, start_date, end_date, is_active) VALUES
  ('2026-01', '2026-01-01', '2026-01-31', true)
ON CONFLICT (month_year) DO NOTHING;

-- Add Pokemon to current month's pool (24 Pokemon)
INSERT INTO monthly_pokemon_pool (month_id, national_dex_id, position)
SELECT 
  (SELECT id FROM bingo_months WHERE month_year = '2026-01'),
  national_dex_id,
  ROW_NUMBER() OVER (ORDER BY national_dex_id)
FROM pokemon_master
LIMIT 24
ON CONFLICT DO NOTHING;

-- Create a sample user
INSERT INTO users (username, display_name) VALUES
  ('pokemon_trainer_ash', 'Ash Ketchum'),
  ('misty_waterflower', 'Misty'),
  ('brock_harrison', 'Brock')
ON CONFLICT (username) DO NOTHING;

-- Generate boards for sample users
DO $$
DECLARE
  v_user RECORD;
  v_month_id INTEGER;
BEGIN
  SELECT id INTO v_month_id FROM bingo_months WHERE month_year = '2026-01';
  
  FOR v_user IN SELECT id FROM users LOOP
    PERFORM generate_user_board(v_user.id, v_month_id);
  END LOOP;
END $$;
