const fs = require('fs');
const FILE = 'C:\\Users\\Adamk\\Saved Games\\Diablo II Resurrected\\RarityTest.d2s';
function d2checksum(buf) {
  let ck = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = (i >= 12 && i < 16) ? 0 : buf[i];
    ck = ((ck << 1) + b + (ck < 0 ? 1 : 0)) | 0;
  }
  return ck >>> 0;
}
const b = fs.readFileSync(FILE);
const stored = b.readUInt32LE(12);
const computed = d2checksum(b);
console.log('filesize field:', b.readUInt32LE(8), '| actual:', b.length, '| match:', b.readUInt32LE(8) === b.length);
console.log('stored checksum:', stored.toString(16), '| computed:', computed.toString(16), '| VALID:', stored === computed);
