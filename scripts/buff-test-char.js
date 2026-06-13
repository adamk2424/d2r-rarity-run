/**
 * Surgically buff the RarityTest character for tool testing, WITHOUT using the
 * library's (broken-for-D2R-v105) full writer. We preserve every original byte
 * except the specific fields we change:
 *   - convert Classic -> Expansion (status bit), progression = 15
 *   - level 75 (header cache + attributes), full level+quest stat/skill points
 *   - all waypoints (Normal/NM/Hell)
 *   - all quests complete in all difficulties (copied from a beaten character)
 *     -> unlocks Nightmare + Hell
 *   - carried gold at cap + full personal-stash gold
 *
 * Re-encodes only the attributes section via the library's working
 * writeAttributes(), splices it in, then fixes filesize + checksum.
 *
 * Safe: refuses to run on any other character; asserts D2R header offsets
 * before writing; re-reads the result to verify. A timestamped backup exists.
 */
const d2s = require('@dschu012/d2s');
const { writeAttributes } = require('@dschu012/d2s/lib/d2/attributes');
const c96 = require('@dschu012/d2s/lib/data/versions/96_constant_data').constants;
const c99 = require('@dschu012/d2s/lib/data/versions/99_constant_data').constants;
const c105 = require('@dschu012/d2s/lib/data/versions/105_constant_data').constants;
const fs = require('fs');
[[96, c96], [97, c96], [98, c96], [99, c99], [0, c96], [1, c96], [2, c96], [105, c105]]
  .forEach(([v, c]) => { try { d2s.getConstantData(v); } catch (e) { d2s.setConstantData(v, c); } });

const DIR = 'C:\\Users\\Adamk\\Saved Games\\Diablo II Resurrected\\';
const FILE = DIR + 'RarityTest.d2s';
const REF = DIR + 'Bladegal.d2s'; // beaten char: all quests complete, all difficulties

const LEVEL = 75;
const EXP_LEVEL_75 = 441026148;
const STAT_POINTS = (LEVEL - 1) * 5 + 15; // 385
const SKILL_POINTS = (LEVEL - 1) + 6;     // 80
const CARRIED_GOLD = LEVEL * 10000;       // 750000
const STASH_GOLD = 2500000;

// D2R checksum (verified to match the original file)
function d2checksum(buf) {
  let ck = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = (i >= 12 && i < 16) ? 0 : buf[i];
    const add = b + (ck < 0 ? 1 : 0);
    ck = ((ck << 1) + add) | 0;
  }
  return ck >>> 0;
}

function assert(cond, msg) { if (!cond) throw new Error('ABORT: ' + msg); }

(async () => {
  const orig = fs.readFileSync(FILE);
  const r = await d2s.read(orig);
  assert(r.header.name === 'RarityTest', `expected RarityTest, got ${r.header.name}`);
  assert(r.header.version === 105, `expected version 105, got ${r.header.version}`);

  // --- verify D2R header offsets (status@20, class@24, level@27) before patching ---
  assert((orig[20] & 0x08) !== 0, `byte20 not the status byte (died bit) — got ${orig[20]}`);
  assert(orig[24] === 1, `byte24 not Sorceress class (1) — got ${orig[24]}`);
  assert(orig[27] === r.header.level, `byte27 not level (${r.header.level}) — got ${orig[27]}`);

  // --- locate sections in the original ---
  const woo = orig.indexOf(Buffer.from('Woo!', 'latin1'));
  const ws = orig.indexOf(Buffer.from('WS', 'latin1'));
  const gf = orig.indexOf(Buffer.from([0x67, 0x66]));
  const ifx = orig.indexOf(Buffer.from([0x69, 0x66]));
  assert(woo === 403 && ws === 701 && gf === 833 && ifx === 880,
    `unexpected section offsets woo=${woo} ws=${ws} gf=${gf} if=${ifx}`);

  // --- re-encode attributes with new values (uses the working writeAttributes) ---
  r.attributes.level = LEVEL;
  r.attributes.experience = EXP_LEVEL_75;
  r.attributes.unused_stats = STAT_POINTS;
  r.attributes.unused_skill_points = SKILL_POINTS;
  r.attributes.gold = CARRIED_GOLD;
  r.attributes.stashed_gold = STASH_GOLD;
  const attrSection = Buffer.from(await writeAttributes(r, d2s.getConstantData(105)));

  // --- quest section from the beaten reference character (same 298-byte format) ---
  const ref = fs.readFileSync(REF);
  const rwoo = ref.indexOf(Buffer.from('Woo!', 'latin1'));
  const rws = ref.indexOf(Buffer.from('WS', 'latin1'));
  const questSection = ref.slice(rwoo, rws);
  assert(questSection.length === (ws - woo), `quest section length mismatch ${questSection.length} vs ${ws - woo}`);

  // --- header (0..woo) with patched fields ---
  const head = Buffer.from(orig.slice(0, woo));
  head[20] = head[20] | 0x20; // expansion bit
  head[21] = 15;              // progression
  head[27] = LEVEL;           // header level cache

  // --- waypoints+npc (ws..gf) with all waypoints on ---
  const middle = Buffer.from(orig.slice(ws, gf));
  for (const fileStart of [711, 735, 759]) {        // Normal / NM / Hell WP bitfields
    for (let k = 0; k < 5; k++) middle[fileStart - ws + k] = 0xff;
  }

  // --- skills + items (if..end) preserved verbatim ---
  const suffix = orig.slice(ifx);

  let out = Buffer.concat([head, questSection, middle, attrSection, suffix]);
  out.writeUInt32LE(out.length, 8); // filesize
  out.writeUInt32LE(d2checksum(out), 12); // checksum (fn ignores bytes 12..15)

  // fresh backup right before writing
  fs.writeFileSync(FILE + '.prebuff', orig);
  fs.writeFileSync(FILE, out);

  // --- verify by re-reading ---
  const v = await d2s.read(fs.readFileSync(FILE));
  const a = v.attributes;
  const wpAllOn = ['normal', 'nm', 'hell'].every((d) =>
    Object.values(v.header.waypoints[d]).every((act) => Object.values(act).every(Boolean)));
  console.log('VERIFY:');
  console.log('  name/class:', v.header.name, v.header.class, '| version:', v.header.version);
  console.log('  expansion:', v.header.status.expansion, '| progression:', v.header.progression);
  console.log('  level(header):', v.header.level, '| level(attr):', a.level, '| exp:', a.experience);
  console.log('  unused_stats:', a.unused_stats, '| unused_skill_points:', a.unused_skill_points);
  console.log('  gold:', a.gold, '| stashed_gold:', a.stashed_gold);
  console.log('  all waypoints on:', wpAllOn);
  console.log('  NM Baal complete:', v.header.quests_nm.act_v.eve_of_destruction.is_completed,
    '| Normal Baal complete:', v.header.quests_normal.act_v.eve_of_destruction.is_completed);
  console.log('  items preserved:', (v.items || []).length, '(was', (r.items || []).length + ')');
  console.log('  file size:', out.length, '| checksum ok on re-read (no throw)');
})();
