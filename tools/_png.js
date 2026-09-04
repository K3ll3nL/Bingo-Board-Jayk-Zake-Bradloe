/**
 * _png.js — minimal dependency-free PNG decode/encode for the badge tools.
 *
 * Underscore prefix matches the api/_lib convention: this is a shared module,
 * not a runnable tool. Supports 8-bit non-interlaced PNGs (grey / RGB / RGBA,
 * with or without alpha), plus 1/2/4/8-bit INDEXED PNGs — which is what game
 * sprite rips normally are (the Bulbapedia berry sprites are 4-bit indexed).
 * Indexed images are expanded to RGBA on decode, so callers only ever see one
 * format.
 *
 * NOTE: inspectBadgeArt.js and recoverBadgeArt.js still carry their own inline
 * copies of this logic. They work and are verified; folding them onto this
 * module is a tidy-up worth doing next time one of them is touched.
 */
const fs = require('fs');
const zlib = require('zlib');

function decode(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG: ' + file);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const bitDepth = buf[24], colorType = buf[25];
  if (buf[28] !== 0) throw new Error('interlaced PNGs not supported');

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('unsupported colour type ' + colorType);
  if (colorType !== 3 && bitDepth !== 8) {
    throw new Error('only 8-bit non-indexed PNGs supported (got ' + bitDepth + '-bit)');
  }
  if (colorType === 3 && ![1, 2, 4, 8].includes(bitDepth)) {
    throw new Error('bad indexed bit depth ' + bitDepth);
  }

  // Indexed PNGs (colour type 3) are common for game sprites -- the Bulbapedia
  // berry sprites are 4-bit indexed. They carry their palette in PLTE and
  // per-index alpha in tRNS, and pack multiple pixels per byte, so they need a
  // separate unpacking path from the straight 8-bit types.
  const idat = [];
  let plte = null, trns = null;
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IDAT') idat.push(body);
    else if (type === 'PLTE') plte = body;
    else if (type === 'tRNS') trns = body;
    if (type === 'IEND') break;
    off += 12 + len;
  }
  if (colorType === 3 && !plte) throw new Error('indexed PNG missing PLTE chunk');

  const raw = zlib.inflateSync(Buffer.concat(idat));

  // Filtering operates on BYTES. For sub-8-bit depths the filter unit is 1 byte,
  // not one pixel, and the scanline is packed -- getting this wrong is the
  // classic indexed-PNG decode bug.
  const bitsPerPixel = bitDepth * channels;
  const filterBpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const stride = Math.ceil((w * bitsPerPixel) / 8);

  const lines = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const line = raw.subarray(pos, pos + stride); pos += stride;
    const cur = lines.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? lines.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= filterBpp ? cur[x - filterBpp] : 0;
      const b = prev[x];
      const c = x >= filterBpp ? prev[x - filterBpp] : 0;
      let v = line[x];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      } else if (f !== 0) throw new Error('bad PNG filter type ' + f);
      cur[x] = v;
    }
  }

  if (colorType !== 3) return { w, h, bpp: channels, data: lines };

  // Expand indexed to RGBA so every caller sees one uniform format.
  const out = Buffer.alloc(w * h * 4);
  const mask = (1 << bitDepth) - 1;
  const perByte = 8 / bitDepth;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const byte = lines[y * stride + Math.floor(x / perByte)];
      const shift = 8 - bitDepth * ((x % perByte) + 1);
      const idx = (byte >> shift) & mask;
      const d = (y * w + x) * 4;
      out[d] = plte[idx * 3];
      out[d + 1] = plte[idx * 3 + 1];
      out[d + 2] = plte[idx * 3 + 2];
      out[d + 3] = trns && idx < trns.length ? trns[idx] : 255;
    }
  }
  return { w, h, bpp: 4, data: out };
}

// Normalise any supported colour type to a flat RGBA buffer.
function toRGBA(im) {
  const out = Buffer.alloc(im.w * im.h * 4);
  for (let i = 0, n = im.w * im.h; i < n; i++) {
    const s = i * im.bpp, d = i * 4;
    if (im.bpp === 4) im.data.copy(out, d, s, s + 4);
    else if (im.bpp === 3) { im.data.copy(out, d, s, s + 3); out[d + 3] = 255; }
    else if (im.bpp === 2) { out[d] = out[d + 1] = out[d + 2] = im.data[s]; out[d + 3] = im.data[s + 1]; }
    else { out[d] = out[d + 1] = out[d + 2] = im.data[s]; out[d + 3] = 255; }
  }
  return out;
}

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
    rawBuf[y * (stride + 1)] = 0;
    rgba.copy(rawBuf, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rawBuf, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Nearest-neighbour upscale by an INTEGER factor. Never use a fractional factor
// here -- that is the bug that produced 15px/16px alternating blocks in the
// existing badge set.
function upscale(w, h, rgba, k) {
  const W = w * k, H = h * k;
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    const sy = (y / k) | 0;
    for (let x = 0; x < W; x++) {
      const sx = (x / k) | 0;
      rgba.copy(out, (y * W + x) * 4, (sy * w + sx) * 4, (sy * w + sx) * 4 + 4);
    }
  }
  return { w: W, h: H, data: out };
}

module.exports = { decode, toRGBA, encodeRGBA, upscale };
