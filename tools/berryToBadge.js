/**
 * berryToBadge.js — turn a berry reference render into a pixel-art badge base.
 *
 * WHAT THIS IS FOR
 * You are drawing the badges, not this script. Auto-downsampling never produces
 * finished pixel art: it cannot decide which details survive at 33px, and the
 * silhouette and outline -- the two things that make a badge readable at the
 * 28px leaderboard size -- always need a human pass. What it DOES solve is the
 * blank canvas, and it guarantees every berry in the set shares one palette,
 * which is the thing that makes thirty separate drawings look like a set.
 *
 * Workflow:
 *   1. Run this on a berry render to get <name>.src.png (33x33) and a 10x preview.
 *   2. Open the .src.png in Aseprite and clean up: fix the silhouette, add a
 *      1px outline, delete stray pixels the averaging invented.
 *   3. Export at an integer multiple (see --scale) and upload.
 *
 * PALETTE CONSISTENCY (the important flag)
 *   node tools/berryToBadge.js cheri.png --colors 10 --savepalette berries.json
 *   node tools/berryToBadge.js chesto.png --palette berries.json
 *   node tools/berryToBadge.js pecha.png  --palette berries.json
 * The first call derives a palette and saves it; every later call REUSES it
 * instead of deriving its own. Without this each berry gets its own optimal
 * palette and the set looks incoherent side by side in the badge case.
 *
 * Usage:
 *   node tools/berryToBadge.js <ref.png> [options]
 *     --grid N          output resolution (default 33, matching the existing set)
 *     --colors N        palette size (default 10; berries want 8-12)
 *     --scale K         integer preview multiple (default 10; 0 = skip preview)
 *     --alpha N         alpha cutoff 0-255 (default 128). Pixel art wants HARD
 *                       edges, so alpha is forced to fully on or fully off.
 *     --bg r,g,b        treat this colour as background and cut it out, for
 *                       references with a flat backdrop instead of transparency
 *     --bgtol N         how close to --bg counts as background (default 40)
 *     --palette FILE    reuse a saved palette (skips derivation)
 *     --savepalette F   write the derived palette for later reuse
 *     --out DIR         output directory (default: alongside the input)
 *
 * PNG input only. If your reference is a JPG, re-save it as PNG first.
 */
const fs = require('fs');
const path = require('path');
const { decode, toRGBA, encodeRGBA, upscale } = require('./_png');

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i !== -1 ? args[i + 1] : d; };
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));

if (!files.length) {
  console.error('usage: node tools/berryToBadge.js <ref.png> [--colors 10] [--palette berries.json]');
  console.error('       see the header of this file for the full option list');
  process.exit(1);
}

const GRID = Number(flag('grid', 33));
const NCOLORS = Number(flag('colors', 10));
const SCALE = Number(flag('scale', 10));
const ALPHA_CUT = Number(flag('alpha', 128));
const BGTOL = Number(flag('bgtol', 40));
const OUT = flag('out', null);
const paletteIn = flag('palette', null);
const paletteOut = flag('savepalette', null);
const bg = flag('bg', null) ? flag('bg', null).split(',').map(Number) : null;

// ── Median-cut quantization ─────────────────────────────────────────────────
// Chosen over k-means deliberately: median cut is deterministic, so re-running
// on the same berry gives the same palette. k-means seeds randomly and would
// produce a slightly different palette every run, which defeats the whole point
// of a consistent set.
function medianCut(pixels, n) {
  let boxes = [pixels];
  while (boxes.length < n) {
    // Split the box with the widest single-channel spread; that is where
    // banding is most visible if left merged.
    let bi = -1, brange = -1, bchan = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255, hi = 0;
        for (const p of box) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; }
        if (hi - lo > brange) { brange = hi - lo; bi = i; bchan = c; }
      }
    });
    if (bi === -1) break; // every box is a single colour; nothing left to split
    const box = boxes[bi].slice().sort((a, b) => a[bchan] - b[bchan]);
    const mid = box.length >> 1;
    boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.filter(b => b.length).map(box => {
    const s = [0, 0, 0];
    for (const p of box) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }
    return s.map(v => Math.round(v / box.length));
  });
}

const dist2 = (a, b) => {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  // Luma-ish weighting: the eye resolves green detail best, blue worst, so an
  // unweighted RGB distance picks visibly wrong matches on saturated berries.
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
};
const nearest = (px, pal) => {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < pal.length; i++) { const d = dist2(px, pal[i]); if (d < bd) { bd = d; bi = i; } }
  return pal[bi];
};

for (const file of files) {
  const im = decode(file);
  const rgba = toRGBA(im);
  const dir = OUT || path.dirname(file);
  const name = path.basename(file, path.extname(file));

  // ── Box-average down to the target grid ───────────────────────────────────
  // Averaging (not point-sampling) because a berry render is smooth: point
  // sampling a 500px render at 33 points throws away 99.6% of the pixels and
  // lands on whatever happened to be under each point, including specular
  // highlights. Averaging keeps the shape.
  const cell = Buffer.alloc(GRID * GRID * 4);
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const x0 = Math.floor(gx * im.w / GRID), x1 = Math.max(x0 + 1, Math.floor((gx + 1) * im.w / GRID));
      const y0 = Math.floor(gy * im.h / GRID), y1 = Math.max(y0 + 1, Math.floor((gy + 1) * im.h / GRID));
      let r = 0, g = 0, b = 0, a = 0, opaque = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * im.w + x) * 4;
          const av = rgba[i + 3];
          let isBg = av === 0;
          if (!isBg && bg) {
            isBg = dist2([rgba[i], rgba[i + 1], rgba[i + 2]], bg) < BGTOL * BGTOL * 9;
          }
          a += isBg ? 0 : 255;
          if (!isBg) { r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; opaque++; }
        }
      }
      const total = (x1 - x0) * (y1 - y0);
      const di = (gy * GRID + gx) * 4;
      // Coverage vote: the cell is solid only if most of it was subject matter.
      // Hard edges are what make pixel art read; a soft alpha ramp does not.
      const on = (a / total) >= ALPHA_CUT;
      if (on && opaque) {
        cell[di] = Math.round(r / opaque);
        cell[di + 1] = Math.round(g / opaque);
        cell[di + 2] = Math.round(b / opaque);
        cell[di + 3] = 255;
      } else {
        cell[di] = cell[di + 1] = cell[di + 2] = cell[di + 3] = 0;
      }
    }
  }

  // ── Palette ───────────────────────────────────────────────────────────────
  const opaquePixels = [];
  for (let i = 0; i < GRID * GRID; i++) {
    if (cell[i * 4 + 3]) opaquePixels.push([cell[i * 4], cell[i * 4 + 1], cell[i * 4 + 2]]);
  }
  if (!opaquePixels.length) {
    console.error(name + ': every pixel read as background. Try --bg r,g,b or a lower --alpha.');
    continue;
  }

  let palette, source;
  if (paletteIn && fs.existsSync(paletteIn)) {
    palette = JSON.parse(fs.readFileSync(paletteIn, 'utf8'));
    source = 'reused from ' + path.basename(paletteIn);
  } else {
    palette = medianCut(opaquePixels, NCOLORS);
    source = 'derived';
    if (paletteOut) {
      fs.writeFileSync(paletteOut, JSON.stringify(palette, null, 1));
      source += ', saved to ' + path.basename(paletteOut);
    }
  }

  for (let i = 0; i < GRID * GRID; i++) {
    if (!cell[i * 4 + 3]) continue;
    const p = nearest([cell[i * 4], cell[i * 4 + 1], cell[i * 4 + 2]], palette);
    cell[i * 4] = p[0]; cell[i * 4 + 1] = p[1]; cell[i * 4 + 2] = p[2];
  }

  const used = new Set();
  let solid = 0;
  for (let i = 0; i < GRID * GRID; i++) {
    if (cell[i * 4 + 3]) { used.add(cell.subarray(i * 4, i * 4 + 3).join(',')); solid++; }
  }

  const srcPath = path.join(dir, name + '.src.png');
  fs.writeFileSync(srcPath, encodeRGBA(GRID, GRID, cell));

  console.log(name);
  console.log('  reference     : ' + im.w + 'x' + im.h);
  console.log('  palette       : ' + palette.length + ' colours (' + source + '), ' + used.size + ' actually used');
  console.log('  coverage      : ' + solid + ' of ' + (GRID * GRID) + ' pixels solid (' +
    (100 * solid / (GRID * GRID)).toFixed(0) + '%)');
  console.log('  sprite        : ' + GRID + 'x' + GRID + ' -> ' + path.basename(srcPath));

  if (SCALE > 0) {
    const big = upscale(GRID, GRID, cell, SCALE);
    const bigPath = path.join(dir, name + '.' + SCALE + 'x.png');
    fs.writeFileSync(bigPath, encodeRGBA(big.w, big.h, big.data));
    console.log('  preview       : ' + big.w + 'x' + big.h + ' at exactly ' + SCALE + 'x -> ' + path.basename(bigPath));
  }
  console.log('  NEXT: open the .src.png in Aseprite -- fix the silhouette and add an outline.');
  console.log('');
}
