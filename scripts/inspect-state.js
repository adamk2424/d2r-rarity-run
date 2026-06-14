const fs = require('fs');
const P = 'C:/Users/Adamk/AppData/Roaming/d2rholygrail/rarityRunV2.json';
const s = JSON.parse(fs.readFileSync(P, 'utf8'));
console.log('runCharacter:', s.runCharacter);
console.log('known chars:', Object.keys(s.knownCharacters || {}));
console.log('tracked chars:', Object.keys(s.characters || {}));
for (const name of Object.keys(s.characters || {})) {
  const rt = s.characters[name];
  console.log(`\n=== ${name} | baselined: ${rt.baselined} | level: ${rt.level} ===`);
  for (const k of Object.keys(rt.mandates)) {
    const m = rt.mandates[k];
    if (m.contenders.length === 0 && m.history.length === 0) continue;
    console.log(`${k.padEnd(7)} contenders:${m.contenders.length} history:${m.history.length} -> ${m.history.map((h) => h.displayName).join('  >  ')}`);
  }
}
