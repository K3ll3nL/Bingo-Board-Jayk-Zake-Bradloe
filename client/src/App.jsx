import React from 'react';
import BingoBoard from './components/BingoBoard';
import Leaderboard from './components/Leaderboard';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      {/* Header */}
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl md:text-4xl font-bold text-center bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            🎮 Stream Bingo 🎮
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* 
          Responsive Grid Layout:
          - Mobile: Stacked vertically (grid-cols-1)
          - Desktop: Side by side (lg:grid-cols-2)
        */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Bingo Board Module */}
          <div className="bg-white rounded-xl shadow-xl p-6">
            <BingoBoard />
          </div>

          {/* Leaderboard Module */}
          <div className="bg-white rounded-xl shadow-xl p-6">
            <Leaderboard />
          </div>
        </div>
      </main>

      {/* Footer */}
      {/* <footer className="mt-12 pb-8 text-center text-gray-600 text-sm">
        <p>Made with 💜 for streamers and their communities</p>
      </footer> */}
    </div>
  );
}

export default App;
