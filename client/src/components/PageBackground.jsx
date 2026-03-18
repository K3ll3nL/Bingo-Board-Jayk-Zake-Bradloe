import { useState, useEffect } from 'react';

// ── Tune these to adjust the background appearance ────────────────────────────
const IMG     = 'https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev/assets/bb-smart.png';
const TILE    = 200;   // px — native image size
const GAP     = 75;    // px — space between tiles (horizontal and vertical)
const BLUR    = 8;     // px — gaussian blur
const OPACITY = 0.2;  // 0–1
// ─────────────────────────────────────────────────────────────────────────────

const CELL = TILE + GAP; // total size of one grid cell including gap

const PageBackground = () => {
  const [size, setSize] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 1920,
    h: typeof window !== 'undefined' ? window.innerHeight : 1080,
  });

  useEffect(() => {
    const update = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Extra cells to cover stagger overflow and blur bleed
  const cols = Math.ceil((size.w + CELL * 3) / CELL);
  const rows = Math.ceil((size.h + CELL * 3) / CELL);

  return (
    <div
      className="pointer-events-none"
      style={{ position: 'fixed', inset: 0, overflow: 'hidden', zIndex: -1 }}
    >
      <div
        style={{
          position: 'absolute',
          top: -CELL,
          left: -CELL,
          display: 'flex',
          flexDirection: 'column',
          gap: GAP,
          filter: `blur(${BLUR}px)`,
          opacity: OPACITY,
        }}
      >
        {Array.from({ length: rows }, (_, row) => (
          <div
            key={row}
            style={{
              display: 'flex',
              gap: GAP,
              // Odd rows shift by half a cell width for brick-wall stagger
              transform: row % 2 === 1 ? `translateX(${CELL / 2}px)` : undefined,
            }}
          >
            {Array.from({ length: cols }, (_, col) => (
              <img
                key={col}
                src={IMG}
                width={TILE}
                height={TILE}
                alt=""
                draggable={false}
                style={{ display: 'block', flexShrink: 0, userSelect: 'none' }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PageBackground;
