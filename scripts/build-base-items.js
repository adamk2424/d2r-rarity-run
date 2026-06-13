/**
 * Builds electron/lib/rarityData/baseItems.json from blizzhackers/d2data dumps
 * in data/d2data/ (weapons.json, armor.json, misc.json, itemtypes.json).
 *
 * Output: { [itemCode]: BaseItem } for every equippable base item.
 *   name      display name
 *   slot      helm|armor|weapon|shield|gloves|belt|boots|amulet|ring
 *   tier      0=normal 1=exceptional 2=elite (0 for rings/amulets)
 *   qlvl      quality level (drives treasure-class tiebreak)
 *   lvlReq    base level requirement
 *   strReq/dexReq  stat requirements (0 if none)
 *   cls       class restriction code (ama|sor|nec|pal|bar|dru|ass) or null
 *   hands     1=one-handed, 2=two-handed, 3=one-or-two-handed (weapons only)
 *
 * Usage: node scripts/build-base-items.js
 */
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data', 'd2data');
const outFile = path.join(__dirname, '..', 'electron', 'lib', 'rarityData', 'baseItems.json');

const weapons = JSON.parse(fs.readFileSync(path.join(dataDir, 'weapons.json')));
const armor = JSON.parse(fs.readFileSync(path.join(dataDir, 'armor.json')));
const misc = JSON.parse(fs.readFileSync(path.join(dataDir, 'misc.json')));
const itemtypes = JSON.parse(fs.readFileSync(path.join(dataDir, 'itemtypes.json')));

// Walk the itemtype Equiv chain, collecting every ancestor type code and any
// class restriction found along the way.
function typeChain(typeCode) {
  const chain = new Set();
  let cls = null;
  const visit = (code) => {
    if (!code || chain.has(code)) return;
    chain.add(code);
    const t = itemtypes[code];
    if (!t) return;
    if (t.Class) cls = t.Class;
    visit(t.Equiv1);
    visit(t.Equiv2);
  };
  visit(typeCode);
  return { chain, cls };
}

function slotFor(typeCode) {
  const t = itemtypes[typeCode];
  if (!t || !t.Body) return null; // not equippable on the body
  const { chain, cls } = typeChain(typeCode);
  // Quivers (ammo) are exempt from the challenge; shields also chain through
  // 'seco' (second hand) so only the 'misl' ancestor identifies ammo
  if (chain.has('misl')) return null;
  const loc = t.BodyLoc1;
  let slot = null;
  if (loc === 'head') slot = 'helm';
  else if (loc === 'tors') slot = 'armor';
  else if (loc === 'feet') slot = 'boots';
  else if (loc === 'glov') slot = 'gloves';
  else if (loc === 'belt') slot = 'belt';
  else if (loc === 'neck') slot = 'amulet';
  else if (loc === 'rrin' || loc === 'lrin') slot = 'ring';
  else if (loc === 'rarm' || loc === 'larm') slot = chain.has('shld') ? 'shield' : 'weapon';
  return slot ? { slot, cls } : null;
}

function tierFor(item) {
  if (item.code === item.ultracode) return 2;
  if (item.code === item.ubercode) return 1;
  return 0;
}

const out = {};
let skipped = 0;

for (const [src, isWeapon] of [[weapons, true], [armor, false], [misc, false]]) {
  for (const item of Object.values(src)) {
    if (!item.code || !item.type) continue;
    if (item.spawnable === 0) { skipped++; continue; }
    const s = slotFor(item.type);
    if (!s) { skipped++; continue; }
    const entry = {
      name: item.name,
      slot: s.slot,
      tier: tierFor(item),
      qlvl: item.level || 1,
      lvlReq: item.levelreq || 0,
      strReq: item.reqstr || 0,
      dexReq: item.reqdex || 0,
      cls: s.cls || null,
    };
    if (isWeapon) {
      entry.hands = item['1or2handed'] ? 3 : item['2handed'] ? 2 : 1;
    }
    out[item.code] = entry;
  }
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));

const bySlot = {};
for (const e of Object.values(out)) bySlot[e.slot] = (bySlot[e.slot] || 0) + 1;
console.log(`Wrote ${Object.keys(out).length} base items to ${outFile} (skipped ${skipped} non-equippable/non-spawnable)`);
console.log('Per slot:', JSON.stringify(bySlot));
