import React from 'react';
import restrictedIcon from '../Icons/restricted-icon.png';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isRestrictedEnabled } from '../featureFlags';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';

/* ── Reusable section card ────────────────────────────────────────────── */
const Section = ({ id, title, icon, accentColor = '#9147ff', headerBg = 'rgba(145,71,255,0.08)', children }) => (
  <section
    id={id}
    className="rounded-xl shadow-xl overflow-hidden border border-gray-600"
    style={{ backgroundColor: '#35373b' }}
  >
    <div
      className="px-6 py-4 border-b flex items-center gap-3"
      style={{ borderColor: accentColor + '55', backgroundColor: headerBg }}
    >
      {icon && (
        <span style={{ color: accentColor }}>{icon}</span>
      )}
      <h2 className="text-base font-semibold text-white tracking-wide">{title}</h2>
    </div>
    <div className="px-6 py-5">
      {children}
    </div>
  </section>
);

/* ── Upload icon ── */
const UploadIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
);

/* ── Rules icon ── */
const RulesIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

/* ── Warning triangle icon ── */
const WarningIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
  </svg>
);

/* ── Trophy icon ── */
const TrophyIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
  </svg>
);

/* ── Restricted icon ── */
const LockIcon = () => (
  <img src={restrictedIcon} alt="" className="w-5 h-5 object-contain" />
);

/* ── Collapsible exception card (stateless — parent controls open) ─────── */
const ExceptionCard = ({ game, open, onToggle, divider, children }) => (
  <div>
    {divider && <div className="border-t border-gray-600" />}
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-700/40"
      style={{ backgroundColor: open ? 'rgba(96,165,250,0.08)' : 'transparent' }}
    >
      <span className="text-white font-medium text-sm">{game}</span>
      <svg
        className="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200"
        style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
    {open && (
      <div
        className="px-4 pl-8 py-3 border-t border-gray-600 text-gray-300 text-sm leading-relaxed"
        style={{ backgroundColor: 'rgba(42,44,48,0.4)' }}
      >
        {children}
      </div>
    )}
  </div>
);

/* ── Exceptions subsection for "Rules for Submission" ─────────────────── */
const EXCEPTIONS = [
  {
    key: 'sv',
    game: 'Pokémon Scarlet / Violet',
    content: (openLightbox) => {
      const svImages = [
        'https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev/assets/correct_img1_sv.png',
        'https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev/assets/correct_img2_sv.png',
      ];
      return (
        <>
          <p className="mb-3">
            We require a different first image. Instead of the usual image of the encounter, we need
            the <span className="text-white font-medium">first page of the summary</span> that contains
            the TID/username as well as the shiny indicator and model.
          </p>
          <div className="flex gap-3">
            <figure className="flex-1 rounded-lg overflow-hidden cursor-zoom-in" style={{ backgroundColor: '#2a2c30' }} onClick={() => openLightbox(svImages, 0)}>
              <img src={svImages[0]} alt="Summary screen" className="w-full object-contain" loading="lazy" />
              <figcaption className="text-center text-gray-500 text-[9px] py-2 px-3">Correct image 1 for SV</figcaption>
            </figure>
            <figure className="flex-1 rounded-lg overflow-hidden cursor-zoom-in" style={{ backgroundColor: '#2a2c30' }} onClick={() => openLightbox(svImages, 1)}>
              <img src={svImages[1]} alt="Summary screen" className="w-full object-contain" loading="lazy" />
              <figcaption className="text-center text-gray-500 text-[9px] py-2 px-3">Correct image 2 for SV</figcaption>
            </figure>
          </div>
        </>
      );
    },
  },
  {
    key: 'gen1-3',
    game: 'Generations I–III',
    content: () => <>Because these games do not store a date of capture, a video submission is required instead of screenshots.</>,
  },
];

const ExceptionsBlock = ({ openLightbox, exceptions = EXCEPTIONS, title = 'Exceptions' }) => {
  const [openKey, setOpenKey] = React.useState(null);
  return (
    <div className="mb-5">
      <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
        {title}
      </h3>
      <div
        className="rounded-lg overflow-hidden border border-gray-600"
        style={{ backgroundColor: 'rgba(42,44,48,0.6)' }}
      >
        {exceptions.map((ex, i) => (
          <ExceptionCard
            key={ex.key}
            game={ex.game}
            open={openKey === ex.key}
            onToggle={() => setOpenKey(openKey === ex.key ? null : ex.key)}
            divider={i > 0}
          >
            {ex.content(openLightbox)}
          </ExceptionCard>
        ))}
      </div>
    </div>
  );
};

const RulesBlock = ({ rules, exceptions = [], title, exceptionsTitle = 'Exceptions', openLightbox }) => (
  <div className="mb-5">
    {title && <h3 className="text-white font-semibold text-sm mb-3">{title}</h3>}
    <div className="space-y-0 rounded-lg overflow-hidden border border-gray-600" style={{ backgroundColor: 'rgba(42,44,48,0.6)' }}>
      {rules.map((rule, i) => (
        <div key={rule.key} className={`px-4 py-3 flex gap-4 ${i > 0 ? 'border-t border-gray-700/60' : ''}`}>
          <span className="text-gray-400 text-xs font-semibold uppercase tracking-wide w-36 flex-shrink-0 pt-0.5">{rule.game}</span>
          <div className="flex-1 text-sm">{rule.content(openLightbox)}</div>
        </div>
      ))}
    </div>
    {exceptions.length > 0 && (
      <div className="mt-3">
        <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">{exceptionsTitle}</h4>
        <div className="space-y-0 rounded-lg overflow-hidden border border-gray-600" style={{ backgroundColor: 'rgba(42,44,48,0.6)' }}>
          {exceptions.map((ex, i) => (
            <div key={ex.key} className={`px-4 py-3 flex gap-4 ${i > 0 ? 'border-t border-gray-700/60' : ''}`}>
              <span className="text-gray-400 text-xs font-semibold uppercase tracking-wide w-36 flex-shrink-0 pt-0.5">{ex.game}</span>
              <div className="flex-1 text-sm">{ex.content(openLightbox)}</div>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

/* ── Restricted Challenge rules ───────────────────────────────────────── */
const RESTRICTED_RULES = [
  {
    key: 'all',
    game: 'All Games',
    content: () => (
      <ul className="space-y-1 text-sm text-gray-300 list-disc list-inside">
        <li>All standard board rules apply</li>
        <li>Eggs are not allowed <span className="text-gray-500">(see exceptions)</span></li>
      </ul>
    ),
  },
  {
    key: 'plza',
    game: 'Pokémon Legends: Z-A',
    content: () => (
      <ul className="space-y-1 text-sm text-gray-300 list-disc list-inside">
        <li>No Shiny Charm</li>
        <li>No Hyperspace <span className="text-gray-500">(see exceptions)</span></li>
        <li>No AFK Hunting</li>
      </ul>
    ),
  },
  {
    key: 'sv',
    game: 'Scarlet & Violet',
    content: () => (
      <ul className="space-y-1 text-sm text-gray-300 list-disc list-inside">
        <li>No Shiny Charm</li>
        <li>No Sparkling Power</li>
        <li>No Outbreaks</li>
      </ul>
    ),
  },
  {
    key: 'pla',
    game: 'Legends: Arceus',
    content: () => <p className="text-gray-400 text-sm italic">No additional restrictions at this time.</p>,
  },
  {
    key: 'bdsp',
    game: 'Brilliant Diamond & Shining Pearl',
    content: () => <p className="text-gray-400 text-sm italic">No additional restrictions at this time.</p>,
  },
  {
    key: 'swsh',
    game: 'Sword & Shield',
    content: () => <p className="text-gray-400 text-sm italic">No additional restrictions at this time.</p>,
  },
  {
    key: 'lgpe',
    game: "Let's Go Pikachu & Eevee",
    content: () => <p className="text-gray-300 text-sm">Catch Combos may not exceed 11.</p>,
  },
  {
    key: 'usum',
    game: 'Ultra Sun & Ultra Moon',
    content: () => (
      <p className="text-gray-300 text-sm">
        No Ultra Warp Ride <span className="text-gray-500">(see exceptions)</span>.
      </p>
    ),
  },
  {
    key: 'sm',
    game: 'Sun & Moon',
    content: () => <p className="text-gray-400 text-sm italic">No additional restrictions at this time.</p>,
  },
  {
    key: 'oras',
    game: 'Omega Ruby & Alpha Sapphire',
    content: () => <p className="text-gray-300 text-sm">No Fishing.</p>,
  },
  {
    key: 'xy',
    game: 'X & Y',
    content: () => <p className="text-gray-300 text-sm">No Fishing.</p>,
  },
];

const RESTRICTED_EXCEPTIONS = [
  {
    key: 'hyperspace',
    game: 'Hyperspace',
    content: () => (
      <p className="text-gray-300 text-sm">
        Allowed for <span className="text-white font-medium">Gimmighoul</span> and{' '}
        <span className="text-white font-medium">Gholdengo</span> without Sparkling Power.
      </p>
    ),
  },
  {
    key: 'eggs',
    game: 'Eggs',
    content: () => (
      <ul className="space-y-1 text-sm text-gray-300 list-disc list-inside">
        <li><span className="text-white font-medium">Phione</span> is allowed</li>
        <li><span className="text-white font-medium">Gen 9 Starters</span> are allowed</li>
      </ul>
    ),
  },
  {
    key: 'uwr',
    game: 'Ultra Warp Ride',
    content: () => (
      <p className="text-gray-300 text-sm">
        Allowed when hunting <span className="text-white font-medium">Legendaries</span>.
      </p>
    ),
  },
];

/* ════════════════════════════════════════════════════════════════════════ */
const About = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isModerator } = useAuth();
  const [lightbox, setLightbox] = React.useState(null); // { images: [], index: number }
  const openLightbox = (images, index = 0) => setLightbox({ images, index });
  const closeLightbox = () => setLightbox(null);
  const setLightboxImage = (url) => openLightbox([url], 0); // compat for single-image figures

  React.useEffect(() => {
    if (!lightbox) return;
    const handler = (e) => {
      if (e.key === 'ArrowRight') setLightbox(l => l && l.index < l.images.length - 1 ? { ...l, index: l.index + 1 } : l);
      if (e.key === 'ArrowLeft')  setLightbox(l => l && l.index > 0 ? { ...l, index: l.index - 1 } : l);
      if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightbox]);

  // Scroll to hash anchor after the page has rendered
  React.useEffect(() => {
    const hash = location.hash; // e.g. "#restricted"
    if (!hash) return;
    // Small timeout lets the DOM finish painting before scrolling
    const id = setTimeout(() => {
      const el = document.querySelector(hash);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => clearTimeout(id);
  }, [location.hash]);

  return (
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />

      {/* ── Header ─────────────────────────────── */}
      <PageHeader
        title="How to Play"
        onBack={() => window.history.state?.idx > 0 ? navigate(-1) : navigate('/')}
      />

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-40 space-y-6" style={{ minHeight: 'calc(100vh - 56px)' }}>

        {/* ── How to Submit ─────────────────────────────────────────────── */}
        <Section
          title="How to Submit"
          icon={<UploadIcon />}
          accentColor="#9147ff"
          headerBg="rgba(145,71,255,0.10)"
        >
          <p className="text-gray-300 leading-relaxed mb-6">
            There are two ways to submit a Pokémon. You can click directly on any Pokémon tile on
            the bingo board to open the submission form for that slot, or you can click your profile
            picture in the top-right corner and select{' '}
            <span className="text-white font-medium">Upload</span> from the menu.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <figure className="rounded-lg overflow-hidden" style={{ backgroundColor: '#2a2c30' }}>
              <img
                src="https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev/assets/gif_website_1.gif"
                alt="Clicking a Pokémon tile to submit"
                className="w-full object-cover"
                loading="lazy"
              />
              <figcaption className="text-center text-gray-500 text-xs py-2 px-3">
                Clicking a tile on the board
              </figcaption>
            </figure>

            <figure className="rounded-lg overflow-hidden" style={{ backgroundColor: '#2a2c30' }}>
              <img
                src="https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev/assets/gif_website_2.gif"
                alt="Using the Upload option from the profile menu"
                className="w-full object-cover"
                loading="lazy"
              />
              <figcaption className="text-center text-gray-500 text-xs py-2 px-3">
                Using the Upload option from the menu
              </figcaption>
            </figure>
          </div>
        </Section>

        {/* ── Rules for Submission ──────────────────────────────────────── */}
        <Section
          title="Rules for Submission"
          icon={<WarningIcon />}
          accentColor="#d30808d9"
          headerBg="rgba(211, 8, 8, 0.2)"
        >
          <p className="text-gray-300 leading-relaxed mb-5">
            Breaking these rules may result in your submission being rejected and your account being flagged for review. Repeat or severe offenses can lead to a ban.
          </p>

          <div className="rounded-lg overflow-hidden border mb-5" style={{ borderColor: 'rgba(211,8,8,0.35)' }}>
            {[
              {
                label: 'No Code Editing',
                body: 'No editing the shiny odds of any kind, whether via third-party applications or in-game, non-intentional methods. This includes cloning/glitching, RNG manipulation, save editing, and any other method that alters the game\'s code or memory to increase shiny chances. As a rule of thumb, if it seems like it might be against the spirit of fair play, it probably is.',
              },
              {
                label: 'Some Emulation',
                body: 'We allow virtual consoles, downloads from HShop, and Operator (as long as each instance is represented by a real cartridge owned by the player). All other forms of emulation are not allowed.',
              },
            ].map(({ label, body }, i) => (
              <div
                key={label}
                className="flex gap-3 px-4 py-3.5"
                style={{
                  backgroundColor: 'rgba(211,8,8,0.06)',
                  borderTop: i > 0 ? '1px solid rgba(211,8,8,0.2)' : undefined,
                  borderLeft: '3px solid rgba(211,8,8,0.7)',
                }}
              >
                <div>
                  <p className="text-white font-medium text-sm mb-1">{label}</p>
                  <p className="text-gray-400 text-sm leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Submission Guide ──────────────────────────────────────── */}
        <Section
          title="Submission Guide"
          icon={<RulesIcon />}
          accentColor="#60a5fa"
          headerBg="rgba(96,165,250,0.08)"
        >
          <p className="text-gray-400 text-sm leading-relaxed mb-4">
            Each submission requires a minimum of two screenshots as proof of capture:
          </p>

          {/* Required screenshots */}
          <div className="rounded-lg overflow-hidden border border-gray-600 mb-5">
            <div className="flex gap-4 items-center px-4 py-3.5" style={{ backgroundColor: 'rgba(42,44,48,0.6)' }}>
              <span className="flex-shrink-0 w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center" style={{ backgroundColor: '#3b82f6' }}>1</span>
              <div className="flex flex-col sm:flex-row gap-4 sm:items-center w-full">
                <div className="flex-1">
                <p className="text-white font-medium text-sm mb-1">Encounter screenshot</p>
                <p className="text-gray-400 text-sm leading-relaxed">
                  The first image must be of the initial encounter — the egg hatch screen, in-battle
                  view, Dynamax Adventure results page, etc.
                </p>
                </div>
                <figure className="sm:flex-shrink-0 rounded-lg overflow-hidden cursor-zoom-in" style={{ backgroundColor: '#2a2c30', width: '170px', maxWidth: '100%' }} onClick={() => setLightboxImage('https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev/assets/correct_img1.png')}>
                  <img
                    src="https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev/assets/correct_img1.png"
                    alt="The Pokémon encountered in the wild"
                    className="w-full object-contain"
                    loading="lazy"
                  />
                  <figcaption className="text-center text-gray-500 text-[9px] py-2 px-3">
                    The Pokémon encountered in the wild
                  </figcaption>
                </figure>
              </div>
            </div>
            <div className="border-t border-gray-600 flex gap-4 items-center px-4 py-3.5" style={{ backgroundColor: 'rgba(42,44,48,0.6)' }}>
              <span className="flex-shrink-0 w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center" style={{ backgroundColor: '#3b82f6' }}>2</span>
              <div className="flex flex-col sm:flex-row gap-4 sm:items-center w-full">
                <div className="flex-1">
                <p className="text-white font-medium text-sm mb-1">Date screenshot</p>
                <p className="text-gray-400 text-sm leading-relaxed">
                  A screenshot showing the in-game or system date on which the Pokémon was caught.
                </p>
                </div>
                <figure className="sm:flex-shrink-0 rounded-lg overflow-hidden cursor-zoom-in" style={{ backgroundColor: '#2a2c30', width: '170px', maxWidth: '100%' }} onClick={() => setLightboxImage('https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev/assets/correct_img2.png')}>
                  <img
                    src="https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev/assets/correct_img2.png"
                    alt="Date proof screen"
                    className="w-full object-contain"
                    loading="lazy"
                  />
                  <figcaption className="text-center text-gray-500 text-[9px] py-2 px-3">
                    Date proof screen
                  </figcaption>
                </figure>
              </div>
            </div>
          </div>

          {/* Game-specific exceptions */}
          <ExceptionsBlock openLightbox={openLightbox} />
        </Section>

        {/* ── Bonus Bounties ────────────────────────────────────────────── */}
        <Section
          title="Bonus Bounties"
          icon={<TrophyIcon />}
          accentColor="#f59e0b"
          headerBg="rgba(245,158,11,0.08)"
        >
          <p className="text-gray-300 leading-relaxed mb-5">
            Bonus Bounties are the classic bingo win conditions, rewarding players with additional
            points on top of their standard submission score. There are four types of Bonus Bounties in
            total, each corresponding to a distinct pattern on the board:
          </p>

          {/* Point value table */}
          <div className="rounded-lg overflow-hidden border border-gray-700 mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'rgba(245,158,11,0.12)' }}>
                  <th className="text-left px-4 py-2.5 text-gray-300 font-semibold">Bounty</th>
                  <th className="text-center px-4 py-2.5 text-gray-300 font-semibold">Points</th>
                  {isRestrictedEnabled(isModerator) && (
                    <th className="text-center px-4 py-2.5 text-gray-300 font-semibold">Restricted</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {[
                  { name: 'Horizontal Line', std: 3, res: 3 },
                  { name: 'Vertical Line',   std: 3, res: 3 },
                  { name: 'X',               std: 6, res: 6 },
                  { name: 'Blackout',        std: 12, res: 12 },
                ].map(({ name, std, res }) => (
                  <tr key={name} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-2.5 text-white font-medium">{name}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-yellow-400 font-bold">{std}</span>
                      <span className="text-gray-500 text-xs ml-1">pts</span>
                    </td>
                    {isRestrictedEnabled(isModerator) && (
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-red-400 font-bold">+{res}</span>
                        <span className="text-gray-500 text-xs ml-1">pts</span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 2×2 image grid */}
          <div className="grid grid-cols-2 gap-4 mb-5">
            {[
              { src: 'bingo_board1.png', caption: 'Horizontal Line' },
              { src: 'bingo_board2.png', caption: 'Vertical Line'   },
              { src: 'bingo_board3.png', caption: 'X'               },
              { src: 'bingo_board4.png', caption: 'Blackout'        },
            ].map(({ src, caption }) => (
              <figure key={src} className="rounded-lg overflow-hidden" style={{ backgroundColor: '#2a2c30' }}>
                <img
                  src={`https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev/assets/${src}`}
                  alt={caption}
                  className="w-full object-cover"
                  loading="lazy"
                />
                <figcaption className="text-center text-gray-500 text-xs py-2 px-3">
                  {caption}
                </figcaption>
              </figure>
            ))}
          </div>

          {/* Important note */}
          <div className="rounded-lg border px-4 py-3" style={{ borderColor: '#92400e', backgroundColor: 'rgba(120,53,15,0.20)' }}>
            <p className="text-yellow-300 text-sm leading-relaxed">
              <span className="font-semibold">Important:</span> Each Bonus Bounty may only be
              claimed <span className="text-white font-medium">once per month</span>, regardless
              of how many players complete the bounty. The first eligible player to have their
              submission approved claims it.
            </p>
          </div>
        </Section>

        {/* ── Restricted Challenge ──────────────────────────────────────── */}
        {isRestrictedEnabled(isModerator) && (
          <Section
            id="restricted"
            title="Restricted Challenge"
            icon={<LockIcon />}
            accentColor="#c0392b"
            headerBg="rgba(120,21,10,0.20)"
          >
            <p className="text-gray-300 leading-relaxed mb-5">
              The Restricted Challenge is an optional, higher-difficulty challenge that runs alongside
              the standard board each month. Restricted submissions are held to a higher evidence
              standard and award extra points for bingo achievements and submissions.
            </p>

            {/* Key differences */}
            <div className="space-y-3 mb-5">
              <div className="flex gap-3 items-start">
                <span className="flex-shrink-0 mt-1" style={{ color: '#c0392b' }}>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </span>
                <p className="text-gray-300 text-sm leading-relaxed">
                  <span className="text-white font-medium">Video required -</span> A stored video
                  link (Twitch clip, unlisted YouTube, etc.) must be provided. Screenshots alone are
                  not accepted for restricted submissions.
                </p>
              </div>
              <div className="flex gap-3 items-start">
                <span className="flex-shrink-0 mt-1" style={{ color: '#c0392b' }}>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </span>
                <p className="text-gray-300 text-sm leading-relaxed">
                  <span className="text-white font-medium">Extra bounty points -</span> Bounty 
                  Submissions and Bonus Bounties earned through the restricted challenge give an additional bonus point payout of that achievement.
                </p>
              </div>
              <div className="flex gap-3 items-start">
                <span className="flex-shrink-0 mt-1" style={{ color: '#c0392b' }}>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </span>
                <p className="text-gray-300 text-sm leading-relaxed">
                  <span className="text-white font-medium">Full restricted requirement -</span> A 
                  Bonus Bounty for the restricted challenge only counts if every Pokémon in that line was
                  submitted as a restricted entry.
                </p>
              </div>
            </div>

            {/* How to toggle */}
            <div className="rounded-lg border px-4 py-3 mb-6" style={{ borderColor: '#78150a55', backgroundColor: 'rgba(120,21,10,0.15)' }}>
              <p className="text-gray-300 text-sm leading-relaxed">
                To submit as restricted, toggle the{' '}
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-white"
                  style={{ backgroundColor: '#78150a' }}
                >
                  <img src={restrictedIcon} alt="" className="w-3 h-3 object-contain" />
                  Restricted
                </span>{' '}
                button on the Upload page before submitting. Image uploads are disabled in restricted
                mode, and only a video link will be accepted.
              </p>
            </div>

            {/* Per-game restrictions + exceptions */}
            <RulesBlock
              rules={RESTRICTED_RULES}
              exceptions={RESTRICTED_EXCEPTIONS}
              title="Rules by Game"
              exceptionsTitle="Exceptions"
              openLightbox={openLightbox}
            />
          </Section>
        )}

      </div>

      {lightbox && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4"
          onClick={closeLightbox}
        >
          <div className="relative max-w-5xl max-h-[90vh] flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
            {/* Prev */}
            <button
              onClick={() => setLightbox(l => ({ ...l, index: l.index - 1 }))}
              disabled={lightbox.index === 0}
              className="text-white hover:text-gray-300 disabled:opacity-20 transition-colors flex-shrink-0"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="relative">
              <button
                onClick={closeLightbox}
                className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <img
                src={lightbox.images[lightbox.index]}
                alt="Preview"
                className="max-w-full max-h-[90vh] object-contain rounded-lg"
              />
              {lightbox.images.length > 1 && (
                <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2">
                  {lightbox.images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setLightbox(l => ({ ...l, index: i }))}
                      className={`w-2 h-2 rounded-full transition-colors ${i === lightbox.index ? 'bg-white' : 'bg-gray-500 hover:bg-gray-300'}`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Next */}
            <button
              onClick={() => setLightbox(l => ({ ...l, index: l.index + 1 }))}
              disabled={lightbox.index === lightbox.images.length - 1}
              className="text-white hover:text-gray-300 disabled:opacity-20 transition-colors flex-shrink-0"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default About;
