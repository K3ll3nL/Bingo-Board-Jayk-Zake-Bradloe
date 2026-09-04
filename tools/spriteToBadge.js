/**
 * spriteToBadge.js — place an existing pixel-art sprite onto the badge canvas.
 *
 * USE THIS, NOT berryToBadge.js, when the source is ALREADY pixel art.
 * The in-game bag sprites (Bulbapedia berry rips) are 24x24 pixel art with a
 * hand-drawn outline. berryToBadge.js is for smooth high-resolution renders that
 * need reducing; running it on a sprite that is already at target resolution
 * would re-quantize art that is already quantized and throw away the artist's
 * pixel placement for nothing.
 *
 * WHY PLACING, NOT SCALING
 * 24 -> 33 is 1.375x. There is no way to rescale pixel art by a fractional factor
 * without either duplicating some rows and not others (visibly uneven blocks --
 * exactly the defect measured in the current badge set) or interpolating (which
 * destroys the hard edges that make it pixel art). Compositing at 1:1 keeps every
 * source pixel exactly as drawn and spends the size difference as margin, which
 * a badge wants anyway for an outline or frame.
 *
 * Usage:
 *   node tools/spriteToBadge.js <sprite.png> [options]
 *     --canvas N     badge canvas size (default 33, matching the existing set)
 *     --scale K      integer export multiple (default 10 -> 330x330; 0 = skip)
 *     --anchor A     center | top | bottom (default center)
 *     --outline r,g,b   add a 1px outline around the silhouette, in the gaps only
 *     --trim         crop transparent margin off the source before placing, so
 *                    sprites with different padding end up optically consistent
 *     --out DIR      output directory (default: alongside the input)
 *
 * Writes <name>.badge.png (canvas-sized, the file to edit) and, unless
 * --scale 0, <name>.<K>x.png (a clean nearest-neighbour export to upload).
 */
const fs = require('fs');
const path = require('path');
const { decode, toRGBA, encodeRGBA, upscale } = require('./_png');

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i !== -1 ? args[i + 1] : d; };
const has = (n) => args.includes('--' + n);
const files = args.filter((a, i) =>
  !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['trim'].includes(args[i - 1].slice(2))));

if (!files.length) {
  console.error('usage: node tools/spriteToBadge.js <sprite.png> [--canvas 33] [--scale 10] [--trim]');
  process.exit(1);
}

const CANVAS = Number(flag('canvas', 33));
const SCALE = Number(flag('scale', 10));
const ANCHOR = flag('anchor', 'center');
const OUT = flag('out', null);
const TRIM = has('trim');
const outline = flag('outline', null) ? flag('outline', null).split(',').map(Number) : null;

for (const file of files) {
  const im = decode(file);
  let rgba = toRGBA(im);
  let sw = im.w, sh = im.h;

  // Optional trim: find the tight bounding box of non-transparent pixels.
  // Sprite rips pad inconsistently, so two berries can sit at different optical
  // sizes on the same canvas unless trimmed first.
  let ox = 0, oy = 0;
  if (TRIM) {
    let minX = sw, minY = sh, maxX = -1, maxY = -1;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        if (rgba[(y * sw + x) * 4 + 3] > 0) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= 0) {
      const tw = maxX - minX + 1, th = maxY - minY + 1;
      const trimmed = Buffer.alloc(tw * th * 4);
      for (let y = 0; y < th; y++) {
        rgba.copy(trimmed, y * tw * 4, ((y + minY) * sw + minX) * 4, ((y + minY) * sw + minX + tw) * 4);
      }
      rgba = trimmed; sw = tw; sh = th;
    }
  }

  if (sw > CANVAS || sh > CANVAS) {
    console.error(`${path.basename(file)}: sprite is ${sw}x${sh}, larger than the ${CANVAS}px canvas.`);
    console.error('  Raise --canvas, or use berryToBadge.js if this is a high-res render, not a sprite.');
    continue;
  }

  ox = Math.floor((CANVAS - sw) / 2);
  oy = ANCHOR === 'top' ? 0
     : ANCHOR === 'bottom' ? CANVAS - sh
     : Math.floor((CANVAS - sh) / 2);

  const canvas = Buffer.alloc(CANVAS * CANVAS * 4); // transparent
  for (let y = 0; y < sh; y++) {
    rgba.copy(canvas, ((y + oy) * CANVAS + ox) * 4, y * sw * 4, (y + 1) * sw * 4);
  }

  // Outline pass: paint only into fully transparent cells that touch a solid
  // one, so an outline the sprite already has is never overwritten.
  let added = 0;
  if (outline) {
    const solid = (x, y) => x >= 0 && y >= 0 && x < CANVAS && y < CANVAS && canvas[(y * CANVAS + x) * 4 + 3] > 0;
    const marks = [];
    for (let y = 0; y < CANVAS; y++) {
      for (let x = 0; x < CANVAS; x++) {
        if (solid(x, y)) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) marks.push([x, y]);
      }
    }
    for (const [x, y] of marks) {
      const d = (y * CANVAS + x) * 4;
      canvas[d] = outline[0]; canvas[d + 1] = outline[1]; canvas[d + 2] = outline[2]; canvas[d + 3] = 255;
      added++;
    }
  }

  const colors = new Set();
  let solidCount = 0;
  for (let i = 0; i < CANVAS * CANVAS; i++) {
    if (canvas[i * 4 + 3] > 0) { solidCount++; colors.add(canvas.subarray(i * 4, i * 4 + 3).join(',')); }
  }

  const dir = OUT || path.dirname(file);
  const name = path.basename(file, path.extname(file));
  const badgePath = path.join(dir, name + '.badge.png');
  fs.writeFileSync(badgePath, encodeRGBA(CANVAS, CANVAS, canvas));

  console.log(name);
  console.log('  source        : ' + im.w + 'x' + im.h + (TRIM ? '  -> trimmed to ' + sw + 'x' + sh : ''));
  console.log('  placed at     : x=' + ox + ' y=' + oy + ' on a ' + CANVAS + 'x' + CANVAS + ' canvas' +
    '  (margin ' + ox + '/' + (CANVAS - sw - ox) + ' horiz, ' + oy + '/' + (CANVAS - sh - oy) + ' vert)');
  console.log('  pixels        : ' + solidCount + ' solid, ' + colors.size + ' colours' +
    (outline ? '  (+' + added + ' outline)' : ''));
  console.log('  badge         : ' + path.basename(badgePath) + '   <- edit this in Aseprite');

  if (SCALE > 0) {
    const big = upscale(CANVAS, CANVAS, canvas, SCALE);
    const bigPath = path.join(dir, name + '.' + SCALE + 'x.png');
    fs.writeFileSync(bigPath, encodeRGBA(big.w, big.h, big.data));
    console.log('  export        : ' + big.w + 'x' + big.h + ' at exactly ' + SCALE + 'x -> ' + path.basename(bigPath));
  }
  console.log('');
}
