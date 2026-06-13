const d2s = require('@dschu012/d2s');
const c96 = require('@dschu012/d2s/lib/data/versions/96_constant_data').constants;
const c99 = require('@dschu012/d2s/lib/data/versions/99_constant_data').constants;
const c105 = require('@dschu012/d2s/lib/data/versions/105_constant_data').constants;
const fs = require('fs');
[[96, c96], [97, c96], [98, c96], [99, c99], [0, c96], [1, c96], [2, c96], [105, c105]]
  .forEach(([v, c]) => { try { d2s.getConstantData(v); } catch (e) { d2s.setConstantData(v, c); } });

const file = process.argv[2] || 'C:\\Users\\Adamk\\Saved Games\\Diablo II Resurrected\\RarityTest.d2s';
(async () => {
  const r = await d2s.read(fs.readFileSync(file));
  const h = r.header;
  console.log('name:', h.name, '| class:', h.class, '| level(header):', h.level);
  console.log('version:', h.version, '| progression:', h.progression);
  console.log('status:', JSON.stringify(h.status));
  console.log('--- attributes ---');
  console.log(JSON.stringify(r.attributes, null, 1));
  console.log('--- waypoints keys ---');
  console.log(JSON.stringify(h.waypoints, null, 1));
})();
