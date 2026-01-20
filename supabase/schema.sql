-- Supabase Database Schema for Streaming Bingo
-- Run this in your Supabase SQL Editor

-- Create bingo_board table
CREATE TABLE IF NOT EXISTS bingo_board (
  id INTEGER PRIMARY KEY,
  text TEXT NOT NULL,
  checked INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create leaderboard table
CREATE TABLE IF NOT EXISTS leaderboard (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  points INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default bingo squares
INSERT INTO bingo_board (id, text, checked) VALUES
  (1, 'Streamer dies to fall damage', 0),
  (2, 'Chat spams emotes', 0),
  (3, 'Streamer forgets mic is muted', 0),
  (4, 'Donation alert goes off', 0),
  (5, 'Technical difficulties', 0),
  (6, 'Streamer rage quits', 0),
  (7, 'Pet appears on stream', 0),
  (8, 'Streamer says ''one more game''', 0),
  (9, 'Chat argues in comments', 0),
  (10, 'Streamer gets jump scared', 0),
  (11, 'Phone rings during stream', 0),
  (12, 'Streamer drinks water', 0),
  (13, 'FREE SPACE', 0),
  (14, 'Streamer makes a pun', 0),
  (15, 'Stream hits new follower goal', 0),
  (16, 'Streamer checks chat mid-game', 0),
  (17, 'Background noise interrupts', 0),
  (18, 'Streamer blames lag', 0),
  (19, 'New subscriber alert', 0),
  (20, 'Streamer laughs uncontrollably', 0),
  (21, 'Chat requests song', 0),
  (22, 'Streamer accidentally tabs out', 0),
  (23, 'Epic comeback moment', 0),
  (24, 'Streamer reads donation message', 0),
  (25, 'GG in chat spam', 0)
ON CONFLICT (id) DO NOTHING;

-- Insert sample leaderboard data
INSERT INTO leaderboard (username, points) VALUES
  ('StreamMaster', 250),
  ('BingoKing', 180),
  ('ChatChampion', 150)
ON CONFLICT (username) DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_bingo_board_updated_at
  BEFORE UPDATE ON bingo_board
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leaderboard_updated_at
  BEFORE UPDATE ON leaderboard
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE bingo_board ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;

-- Create policies to allow public read access
CREATE POLICY "Allow public read access on bingo_board"
  ON bingo_board FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public read access on leaderboard"
  ON leaderboard FOR SELECT
  TO public
  USING (true);

-- Create policies to allow authenticated updates (or use service role key)
CREATE POLICY "Allow public updates on bingo_board"
  ON bingo_board FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public updates on leaderboard"
  ON leaderboard FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public inserts on leaderboard"
  ON leaderboard FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public deletes on leaderboard"
  ON leaderboard FOR DELETE
  TO public
  USING (true);
