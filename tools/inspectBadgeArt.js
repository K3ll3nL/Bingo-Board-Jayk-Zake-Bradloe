// Find the authored grid N by testing which N best explains where colour changes
// occur. For a true NxN source upscaled to W, every colour boundary must sit on
// a multiple of W/N. Score = fraction of observed boundaries within 0.5px of one.
const fs = require('fs'), zlib = require('zlib');
function decode(file) {
  const buf = fs.readFileSync(file);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[buf[25]];
  const idat = []; let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), t = buf.toString('ascii', off + 4, off + 8);
    if (t === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    if (t === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp, out = Buffer.alloc(h * stride); let pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++], line = raw.subarray(pos, pos + stride); pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v = (v + a) & 255; else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
      cur[x] = v;
    }
  }
  return { w, h, bpp, data: out };
}
const key = (im, x, y) => im.data.subarray((y * im.w + x) * im.bpp, (y * im.w + x + 1) * im.bpp).join(',');

for (const f of process.argv.slice(2)) {
  const im = decode(f);
  const bx = [], by = [];
  for (let y = 0; y < im.h; y++) for (let x = 1; x < im.w; x++) if (key(im, x, y) !== key(im, x - 1, y)) bx.push(x);
  for (let x = 0; x < im.w; x++) for (let y = 1; y < im.h; y++) if (key(im, x, y) !== key(im, x, y - 1)) by.push(y);
  const all = bx.concat(by);
  let best = null;
  for (let N = 8; N <= 160; N++) {
    const step = im.w / N;
    let hit = 0;
    for (const b of all) { const m = b / step; if (Math.abs(m - Math.round(m)) < 0.06) hit++; }
    const score = hit / all.length;
    if (!best || score > best.score) best = { N, score, step };
  }
  console.log(f.split(/[\\/]/).pop());
  console.log('  best grid       : ' + best.N + 'x' + best.N +
    '   (' + best.step.toFixed(3) + ' px per art pixel)');
  console.log('  boundary fit    : ' + (best.score * 100).toFixed(1) + '% of colour changes land on that grid');
  console.log('  integer scale?  : ' + (Number.isInteger(best.step) ? 'YES' : 'NO  <- ' + best.step.toFixed(3) + 'x is fractional'));
  const nice = [16, 20, 24, 25, 32, 40, 50, 64].filter(n => 500 % n === 0);
  console.log('  clean sizes for 500px export: ' + nice.join(', ') || '(none)');
  console.log('');
}
