/**
 * Generates a dependency-free app icon (dark rounded tile + faceted gold gem)
 * and writes assets/icon.png and assets/icon.ico. PNG encoded via zlib; ICO
 * wraps the PNG (Vista+ supports embedded-PNG icons).
 *
 * Usage: node scripts/make-icon.js
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SIZE = 256;

// --- CRC32 (PNG) ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// --- draw ---
const px = Buffer.alloc(SIZE * SIZE * 4); // RGBA, zero = transparent
const set = (x, y, r, g, b, a) => {
  const i = (y * SIZE + x) * 4;
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
};

const margin = 8;
const radius = 46;
function inRoundRect(x, y) {
  const minx = margin, maxx = SIZE - margin, miny = margin, maxy = SIZE - margin;
  if (x < minx || x > maxx || y < miny || y > maxy) return false;
  const r = radius;
  if (x < minx + r && y < miny + r) return Math.hypot(x - (minx + r), y - (miny + r)) <= r;
  if (x > maxx - r && y < miny + r) return Math.hypot(x - (maxx - r), y - (miny + r)) <= r;
  if (x < minx + r && y > maxy - r) return Math.hypot(x - (minx + r), y - (maxy - r)) <= r;
  if (x > maxx - r && y > maxy - r) return Math.hypot(x - (maxx - r), y - (maxy - r)) <= r;
  return true;
}

const cx = 128, cy = 130;
const hw = 74, hh = 96; // gem half-width / half-height

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (!inRoundRect(x, y)) continue;
    // dark background tile
    set(x, y, 21, 23, 28, 255); // #15171c

    const dx = Math.abs(x - cx) / hw;
    const dy = Math.abs(y - cy) / hh;
    const d = dx + dy;
    if (d <= 1) {
      // faceted gold gem: four facets, lighter at top
      let r, g, b;
      if (y < cy) {
        if (x < cx) { r = 233; g = 221; b = 173; } else { r = 207; g = 185; b = 123; }
      } else {
        if (x < cx) { r = 165; g = 144; b = 86; } else { r = 124; g = 107; b = 66; }
      }
      // facet seam lines (slightly darker near the gem's central cross/edges)
      const nearVert = Math.abs(x - cx) < 2;
      const nearHorz = Math.abs(y - cy) < 2;
      const nearEdge = d > 0.94;
      if (nearVert || nearHorz || nearEdge) { r = (r * 0.72) | 0; g = (g * 0.72) | 0; b = (b * 0.72) | 0; }
      set(x, y, r, g, b, 255);
    }
  }
}

// --- encode PNG ---
function makePng() {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const stride = SIZE * 4;
  const raw = Buffer.alloc(SIZE * (stride + 1));
  for (let y = 0; y < SIZE; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    px.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function makeIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = 0; entry[1] = 0; // 0 => 256px
  entry.writeUInt16LE(1, 4);  // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(6 + 16, 12);
  return Buffer.concat([header, entry, png]);
}

const png = makePng();
const ico = makeIco(png);
const assets = path.join(__dirname, '..', 'assets');
fs.writeFileSync(path.join(assets, 'icon.png'), png);
fs.writeFileSync(path.join(assets, 'icon.ico'), ico);
console.log(`Wrote assets/icon.png (${png.length} B) and assets/icon.ico (${ico.length} B)`);
