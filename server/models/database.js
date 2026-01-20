const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../db/streaming-bingo.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    // Create bingo board table
    db.run(`
      CREATE TABLE IF NOT EXISTS bingo_board (
        id INTEGER PRIMARY KEY,
        text TEXT NOT NULL,
        checked INTEGER DEFAULT 0
      )
    `);

    // Create leaderboard table
    db.run(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        points INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check if bingo board is empty and populate it
    db.get('SELECT COUNT(*) as count FROM bingo_board', (err, row) => {
      if (err) {
        console.error('Error checking bingo board:', err);
        return;
      }
      
      if (row.count === 0) {
        console.log('Initializing bingo board with default squares...');
        const bingoSquares = [
          "Streamer dies to fall damage",
          "Chat spams emotes",
          "Streamer forgets mic is muted",
          "Donation alert goes off",
          "Technical difficulties",
          "Streamer rage quits",
          "Pet appears on stream",
          "Streamer says 'one more game'",
          "Chat argues in comments",
          "Streamer gets jump scared",
          "Phone rings during stream",
          "Streamer drinks water",
          "FREE SPACE",
          "Streamer makes a pun",
          "Stream hits new follower goal",
          "Streamer checks chat mid-game",
          "Background noise interrupts",
          "Streamer blames lag",
          "New subscriber alert",
          "Streamer laughs uncontrollably",
          "Chat requests song",
          "Streamer accidentally tabs out",
          "Epic comeback moment",
          "Streamer reads donation message",
          "GG in chat spam"
        ];

        const stmt = db.prepare('INSERT INTO bingo_board (id, text, checked) VALUES (?, ?, 0)');
        bingoSquares.forEach((text, index) => {
          stmt.run(index + 1, text);
        });
        stmt.finalize();
        console.log('Bingo board initialized with 25 squares');
      }
    });

    // Check if leaderboard is empty and add some sample data
    db.get('SELECT COUNT(*) as count FROM leaderboard', (err, row) => {
      if (err) {
        console.error('Error checking leaderboard:', err);
        return;
      }
      
      if (row.count === 0) {
        console.log('Adding sample leaderboard data...');
        const sampleUsers = [
          { username: 'StreamMaster', points: 250 },
          { username: 'BingoKing', points: 180 },
          { username: 'ChatChampion', points: 150 }
        ];

        const stmt = db.prepare('INSERT INTO leaderboard (username, points) VALUES (?, ?)');
        sampleUsers.forEach(user => {
          stmt.run(user.username, user.points);
        });
        stmt.finalize();
        console.log('Sample leaderboard data added');
      }
    });
  });
}

// Promisify database operations for cleaner async/await syntax
const dbAll = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbRun = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const dbGet = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

module.exports = {
  db,
  dbAll,
  dbRun,
  dbGet
};
