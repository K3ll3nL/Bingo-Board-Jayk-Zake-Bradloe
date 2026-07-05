import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import restrictedIconSrc from '../Icons/restricted-icon.png';
import { buildPokemonImageUrl } from '../utils/pokemonImageUtils';
import { ALLOWED_GAMES } from '../constants/games';

// entries.game stores the display label (e.g. "Pokémon Sword / Shield"), but
// fall back to key too in case older rows stored the slug.
const GAME_LOOKUP = {};
ALLOWED_GAMES.forEach((g) => {
  GAME_LOOKUP[g.label] = g;
  GAME_LOOKUP[g.key] = g;
});

const PokemonModal = ({ pokemon, onClose, monthId = null }) => {
  const [recentCatches, setRecentCatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (pokemon) {
      loadRecentCatches();
    }
  }, [pokemon]);

  const loadRecentCatches = async () => {
    try {
      const url = monthId
        ? `/api/pokemon/${pokemon.pokemon_id}/recent-catches?monthId=${monthId}`
        : `/api/pokemon/${pokemon.pokemon_id}/recent-catches`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to load recent catches');
      const data = await response.json();
      setRecentCatches(data);
    } catch (err) {
      console.error('Error loading recent catches:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!pokemon) return null;

  const monthCatches = recentCatches.filter((e) => !e.historical);
  const historicalCatches = recentCatches.filter((e) => e.historical);

  // spacer=true reserves a fixed-width slot even when there's no game (keeps
  // desktop point columns aligned); inline mobile variant renders nothing.
  const GameLogos = ({ gameKey, className = '', imgClass, spacer = false }) => {
    const game = GAME_LOOKUP[gameKey];
    if (!game) return spacer ? <span className={className} /> : null;
    return (
      <span className={`flex items-center justify-center gap-1 ${className}`} title={game.label}>
        {game.img_urls.map((src, i) => (
          <img key={i} src={src} alt="" className={`${imgClass} object-contain`} />
        ))}
      </span>
    );
  };

  const CatchRow = ({ entry, index }) => (
    <Link
      to={`/profile/${entry.user_id}`}
      onClick={onClose}
      className="p-2 flex items-center gap-2 transition-colors cursor-pointer hover:bg-white/[0.04]"
    >
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        <div className="flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0">
          <span className="font-semibold text-sm sm:text-xl text-gray-400">#{index + 1}</span>
        </div>

        {entry.avatar_url && (
          <img
            src={entry.avatar_url}
            alt={entry.display_name}
            className="w-7 h-7 sm:w-10 sm:h-10 rounded-full flex-shrink-0"
          />
        )}

        <div className="min-w-0">
          <div className="font-semibold text-xs sm:text-base text-white truncate">
            {entry.display_name}
          </div>
          <div className="flex items-center gap-2 text-[9px] sm:text-xs text-gray-400">
            <span className="truncate">{formatDate(entry.caught_at)}</span>
            {/* Mobile: game logo inline on the date row, no dedicated column */}
            <GameLogos
              gameKey={entry.game}
              className="sm:hidden flex-shrink-0"
              imgClass="h-4 max-w-[20px]"
            />
          </div>
        </div>
      </div>

      {/* Desktop: dedicated game column, larger icons, separated from the points cluster */}
      <GameLogos
        gameKey={entry.game}
        className="hidden sm:flex w-20 flex-shrink-0 mr-3"
        imgClass="h-7 max-w-[36px]"
        spacer
      />

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Fixed-width slot so the logo column aligns whether or not there's a restricted icon */}
        <span className="w-4 sm:w-5 flex-shrink-0 flex justify-center">
          {entry.restricted_submission && (
            <img src={restrictedIconSrc} alt="Restricted" className="w-4 h-4 sm:w-5 sm:h-5 object-contain" />
          )}
        </span>
        <span className="text-sm sm:text-xl font-bold text-purple-400 tabular-nums text-right min-w-[1.75rem] sm:min-w-[2.25rem]">
          {entry.points || 0}
        </span>
        <span className="text-[9px] sm:text-xs text-gray-400">pts</span>
      </div>
    </Link>
  );

  // Derive button state from the 5 possible cell flags
  // Priority: restricted done > restricted pending > standard pending > standard done > nothing
  const isRestrictedDone     = !!pokemon.is_restricted;
  const isRestrictedPending  = !!pokemon.is_pending_restricted;
  const isStandardPending    = !!pokemon.is_pending;
  const isStandardDone       = !!pokemon.is_checked && !isRestrictedDone;

  let submitLabel, submitBtnClass, isDisabled;
  let submitIconContent;

  if (isRestrictedDone) {
    submitLabel = 'Already Caught!';
    isDisabled = true;
    submitBtnClass = 'bg-gray-800 text-gray-500 cursor-not-allowed';
    submitIconContent = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />;
  } else if (isRestrictedPending) {
    submitLabel = 'Restricted Pending';
    isDisabled = true;
    submitBtnClass = 'bg-gray-800 text-gray-500 cursor-not-allowed';
    submitIconContent = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />;
  } else if (isStandardDone) {
    submitLabel = 'Submit Restricted';
    isDisabled = false;
    submitBtnClass = 'bg-gray-700 hover:bg-gray-600 text-white cursor-pointer';
    submitIconContent = null; // will render restricted icon image instead
  } else if (isStandardPending) {
    submitLabel = 'Submission Pending';
    isDisabled = true;
    submitBtnClass = 'bg-gray-800 text-gray-500 cursor-not-allowed';
    submitIconContent = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />;
  } else {
    submitLabel = 'Submit Catch';
    isDisabled = false;
    submitBtnClass = 'bg-purple-600 hover:bg-purple-700 text-white cursor-pointer';
    submitIconContent = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />;
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-xl w-full max-w-2xl flex flex-col"
        style={{ background: 'linear-gradient(160deg, #13151a 0%, #181a21 100%)', border: '1px solid rgba(255,255,255,0.07)', height: '80vh', maxHeight: '640px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — fixed */}
        <div className="flex-shrink-0 p-3 sm:p-6 border-b border-white/[0.07]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img
                src={buildPokemonImageUrl(pokemon.pokemon)}
                alt={pokemon.pokemon_name}
                className="w-20 h-20 object-contain"
              />
              <div>
                <h2 className="text-2xl font-bold text-white">{pokemon.pokemon_name}</h2>
                <p className="text-gray-400">#{String(pokemon.national_dex_id).padStart(4, '0')}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          {loading ? (
            <div className="text-gray-400 text-center py-4">Loading...</div>
          ) : recentCatches.length === 0 ? (
            <>
              <h3 className="text-lg font-bold text-white mb-3">Recent Catches</h3>
              <div className="text-gray-400 text-center py-4">No catches yet</div>
            </>
          ) : (
            <>
              <h3 className="text-lg font-bold text-white mb-3">Recent Catches</h3>
              {monthCatches.length === 0 ? (
                <div className="text-gray-400 text-center py-4">No catches yet</div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {monthCatches.map((entry, index) => (
                    <CatchRow key={entry.id} entry={entry} index={index} />
                  ))}
                </div>
              )}

              {historicalCatches.length > 0 && (
                <>
                  <h3 className="text-lg font-bold text-white mt-6 mb-3">Historical</h3>
                  <div className="divide-y divide-gray-800">
                    {historicalCatches.map((entry, index) => (
                      <CatchRow key={entry.id} entry={entry} index={index} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer buttons — always pinned */}
        <div className="flex-shrink-0 grid grid-cols-2 gap-px border-t border-white/[0.07]">
          <a
            href={`https://bulbapedia.bulbagarden.net/wiki/${pokemon.pokemon_name}_(Pok%C3%A9mon)#Game_locations`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 bg-transparent hover:bg-white/[0.04] text-white text-center font-medium transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Bulbapedia
          </a>
          {isDisabled ? (
            <button
              className={`p-4 text-center font-medium transition-colors flex items-center justify-center gap-2 ${submitBtnClass}`}
              disabled
            >
              {isStandardDone && !isRestrictedDone ? (
                <img src={restrictedIconSrc} alt="" className="w-5 h-5 object-contain" />
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {submitIconContent}
                </svg>
              )}
              {submitLabel}
            </button>
          ) : (
            <Link
              to={monthId ? `/upload?pokemon=${pokemon.pokemon_id}&historical=true` : `/upload?pokemon=${pokemon.pokemon_id}`}
              onClick={onClose}
              className={`p-4 text-center font-medium transition-colors flex items-center justify-center gap-2 ${submitBtnClass}`}
            >
              {isStandardDone && !isRestrictedDone ? (
                <img src={restrictedIconSrc} alt="" className="w-5 h-5 object-contain" />
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {submitIconContent}
                </svg>
              )}
              {submitLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default PokemonModal;
