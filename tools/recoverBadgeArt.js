/**
 * recoverBadgeArt.js — recover the true low-res sprite from an upscaled badge,
 * then re-export it at a clean integer multiple.
 *
 * WHY THIS EXISTS
 * The badges on R2 are 33x33 art exported to 500x500 at 15.152x — a fractional
 * scale, so pixel blocks alternate 15px and 16px wide. Several were also
 * exported with a smoothing resample, which invents interpolated pixels along
 * every edge (one file measured 171 colours where the art has well under 20).
 *
 * Both problems vanish if you go back to the source grid. Sampling the CENTRE of
 * each block ignores the interpolated edges completely, so this reconstructs the
 * sprite the artist actually drew, not the blurred version.
 *
 * Usage:
 *   node tools/recoverBadgeArt.js <file.png> [--grid 33] [--scale 10] [--out dir]
 *
 *   --grid   authored resolution (default: auto-detected, same fit as
 *            inspectBadgeArt.js)
 *   --scale  integer multiple for the re-export (default 10 -> 330x330).
 *            Pass 0 to write ONLY the raw sprite.
 *   --out    output directory (default: alongside the input)
 *
 * Writes <name>.src.png (the recovered NxN sprite, the file to edit in Aseprite)
 * and <name>.<scale>x.png (a clean nearest-neighbour export, the file to upload).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── PNG decode (8-bit, non-interlaced) ──────────────────────────────────────
function decode(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG: ' + file);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const bitDepth = buf[24], colorType = buf[25];
  if (bitDepth !== 8) throw new Error('only 8-bit PNGs supported (got ' + bitDepth + ')');
  if (buf[28] !== 0) throw new Error('interlaced PNGs not supported');
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!bpp) throw new Error('unsupported colour type ' + colorType + ' (indexed PNGs not supported)');

  const idat = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const line = raw.subarray(pos, pos + stride); pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      } else if (f !== 0) throw new Error('bad filter type ' + f);
      cur[x] = v;
    }
  }
  return { w, h, bpp, data: out };
}

// ── PNG encode (RGBA, filter 0) ─────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodeRGBA(w, h, rgba) {
  const stride = w * 4;
  const rawBuf = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    rawBuf[y * (stride + 1)] = 0; // filter: none
    rgba.copy(rawBuf, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rawBuf, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Grid detection (same method as inspectBadgeArt.js) ──────────────────────
const keyAt = (im, x, y) => {
  const i = (y * im.w + x) * im.bpp;
  return im.data.subarray(i, i + im.bpp).join(',');
};
function detectGrid(im) {
  const bounds = [];
  for (let y = 0; y < im.h; y += 2)
    for (let x = 1; x < im.w; x++)
      if (keyAt(im, x, y) !== keyAt(im, x - 1, y)) bounds.push(x);
  for (let x = 0; x < im.w; x += 2)
    for (let y = 1; y < im.h; y++)
      if (keyAt(im, x, y) !== keyAt(im, x, y - 1)) bounds.push(y);
  let best = null;
  for (let N = 8; N <= 160; N++) {
    const step = im.w / N;
    let hit = 0;
    for (const b of bounds) { const m = b / step; if (Math.abs(m - Math.round(m)) < 0.06) hit++; }
    const score = hit / (bounds.length || 1);
    if (!best || score > best.score) best = { N, score };
  }
  return best;
}

// ── Main ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i !== -1 ? args[i + 1] : dflt;
};
const files = args.filter((a, i) =>
  !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));

if (!files.length) {
  console.error('usage: node tools/recoverBadgeArt.js <file.png> [--grid N] [--scale K] [--out dir]');
  process.exit(1);
}

const scale = Number(flag('scale', 10));
const outDir = flag('out', null);
const gridFlag = flag('grid', null);

for (const file of files) {
  const im = decode(file);
  const det = detectGrid(im);
  const N = gridFlag ? Number(gridFlag) : det.N;
  const name = path.basename(file, path.extname(file));
  const dir = outDir || path.dirname(file);

  // Sample the CENTRE of each cell. Centres sit as far as possible from the
  // interpolated edge pixels a smoothing resample leaves behind, so this
  // recovers the artist's colour rather than a blend of two neighbours.
  const sprite = Buffer.alloc(N * N * 4);
  const palette = new Set();
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      const sx = Math.min(im.w - 1, Math.floor((gx + 0.5) * im.w / N));
      const sy = Math.min(im.h - 1, Math.floor((gy + 0.5) * im.h / N));
      const si = (sy * im.w + sx) * im.bpp;
      const di = (gy * N + gx) * 4;
      if (im.bpp === 4) {
        im.data.copy(sprite, di, si, si + 4);
      } else if (im.bpp === 3) {
        im.data.copy(sprite, di, si, si + 3); sprite[di + 3] = 255;
      } else if (im.bpp === 2) {
        sprite[di] = sprite[di + 1] = sprite[di + 2] = im.data[si]; sprite[di + 3] = im.data[si + 1];
      } else {
        sprite[di] = sprite[di + 1] = sprite[di + 2] = im.data[si]; sprite[di + 3] = 255;
      }
      // Fully transparent pixels collapse to one palette entry regardless of RGB.
      palette.add(sprite[di + 3] === 0 ? 'transparent' : sprite.subarray(di, di + 4).join(','));
    }
  }

  const srcPath = path.join(dir, name + '.src.png');
  fs.writeFileSync(srcPath, encodeRGBA(N, N, sprite));

  console.log(name);
  console.log('  detected grid : ' + det.N + 'x' + det.N + '  (fit ' + (det.score * 100).toFixed(1) + '%)' +
    (gridFlag ? '  [overridden -> ' + N + ']' : ''));
  console.log('  recovered     : ' + N + 'x' + N + ', ' + palette.size + ' colours -> ' + path.basename(srcPath));

  if (scale > 0) {
    const W = N * scale;
    const big = Buffer.alloc(W * W * 4);
    for (let y = 0; y < W; y++) {
      const gy = Math.floor(y / scale);
      for (let x = 0; x < W; x++) {
        const gx = Math.floor(x / scale);
        sprite.copy(big, (y * W + x) * 4, (gy * N + gx) * 4, (gy * N + gx) * 4 + 4);
      }
    }
    const bigPath = path.join(dir, name + '.' + scale + 'x.png');
    fs.writeFileSync(bigPath, encodeRGBA(W, W, big));
    console.log('  re-exported   : ' + W + 'x' + W + ' at exactly ' + scale + 'x -> ' + path.basename(bigPath));
  }
  console.log('');
}
