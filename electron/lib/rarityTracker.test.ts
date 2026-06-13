/**
 * Tracker tests. Mocks electron-json-storage (no disk) and ./settings
 * (no electron) so the singleton can be imported in plain node.
 */
let includeStash = false;

jest.mock('electron-json-storage', () => ({
  getSync: () => undefined,
  set: (_key: string, _data: unknown, cb?: (e: unknown) => void) => cb && cb(null),
}));
jest.mock('./settings', () => ({
  __esModule: true,
  default: { getSettings: () => ({ rarityIncludeStash: includeStash }) },
}));

import rarityTracker from './rarityTracker';
import { D2sQuality } from './rarity';

let nextId = 100;
function d2item(code: string, quality: D2sQuality, extra: Record<string, unknown> = {}) {
  nextId += 1;
  return {
    id: nextId,
    type: code,
    quality,
    identified: 1,
    socketed: 0,
    ethereal: 0,
    is_ear: 0,
    simple_item: 0,
    starter_item: 0,
    level: 1,
    location_id: 0,
    equipped_id: 0,
    ...extra,
  } as never;
}

function d2sResponse(name: string, heroClass: string, opts: {
  level?: number, lastPlayed?: number, items?: unknown[], strength?: number,
} = {}) {
  return {
    header: {
      name,
      class: heroClass,
      level: opts.level ?? 1,
      last_played: opts.lastPlayed ?? 1000,
      status: { hardcore: 0 },
    },
    attributes: { strength: opts.strength ?? 200, dexterity: 200 },
    items: (opts.items ?? []) as never[],
    corpse_items: [] as never[],
    merc_items: [] as never[],
  } as never;
}

function stashWith(items: unknown[]) {
  return { pages: [{ items: items as never[] }] } as never;
}

beforeEach(() => {
  includeStash = false;
  rarityTracker.reset();
  // wipe any state the singleton accumulated across tests
  (rarityTracker as unknown as { state: unknown }).state = {
    runCharacter: null, knownCharacters: {}, characters: {},
  };
});

describe('shared stash pollution (the reported bug)', () => {
  it('a fresh character does NOT inherit shared-stash uniques by default', () => {
    rarityTracker.beginParse();
    // brand-new character: just a normal starting weapon equipped
    rarityTracker.processD2S('RarityTest', d2sResponse('RarityTest', 'Sorceress', {
      items: [d2item('ssd', D2sQuality.Normal, { location_id: 1, equipped_id: 4 })], // Short Sword in hand
    }));
    // shared stash full of endgame uniques
    rarityTracker.processStash(stashWith([
      d2item('rin', D2sQuality.Unique), // Raven Frost etc.
      d2item('uar', D2sQuality.Unique), // unique Sacred Armor
      d2item('7cr', D2sQuality.Unique), // unique Phase Blade
    ]));
    rarityTracker.commit();

    const payload = rarityTracker.buildPayload();
    expect(payload.active).toBe('RarityTest');
    const slots = payload.character!.slots;
    const ring = slots.find((s) => s.slotKey === 'ring1')!;
    const armor = slots.find((s) => s.slotKey === 'armor')!;
    const weapon = slots.find((s) => s.slotKey === 'weapon')!;
    expect(ring.mandate).toBeNull();   // stash ring ignored
    expect(armor.mandate).toBeNull();  // stash armor ignored
    expect(weapon.mandate?.baseName).toBe('Short Sword'); // only the equipped starter
  });

  it('shared stash IS counted when the setting is enabled', () => {
    includeStash = true;
    rarityTracker.beginParse();
    rarityTracker.processD2S('RarityTest', d2sResponse('RarityTest', 'Sorceress'));
    rarityTracker.processStash(stashWith([d2item('rin', D2sQuality.Unique)]));
    rarityTracker.commit();
    const ring = rarityTracker.buildPayload().character!.slots.find((s) => s.slotKey === 'ring1')!;
    expect(ring.mandate).not.toBeNull();
  });
});

describe('only the selected run character is tracked', () => {
  it('ignores other characters in the folder', () => {
    rarityTracker.beginParse();
    // an old endgame character, played long ago
    rarityTracker.processD2S('OldHero', d2sResponse('OldHero', 'Barbarian', {
      level: 90, lastPlayed: 500,
      items: [d2item('uar', D2sQuality.Unique, { location_id: 1, equipped_id: 3 })],
    }));
    // the new run character, most recently played
    rarityTracker.processD2S('RarityTest', d2sResponse('RarityTest', 'Sorceress', {
      level: 1, lastPlayed: 2000,
      items: [d2item('cap', D2sQuality.Normal, { location_id: 1, equipped_id: 1 })],
    }));
    rarityTracker.commit();

    const payload = rarityTracker.buildPayload();
    expect(payload.active).toBe('RarityTest'); // most recent auto-selected
    expect(payload.knownCharacters.map((c) => c.name).sort()).toEqual(['OldHero', 'RarityTest']);
    // RarityTest's armor was never given anything -> no Sacred Armor leak from OldHero
    const armor = payload.character!.slots.find((s) => s.slotKey === 'armor')!;
    expect(armor.mandate).toBeNull();
  });

  it('can switch the active run character explicitly', () => {
    rarityTracker.beginParse();
    rarityTracker.processD2S('OldHero', d2sResponse('OldHero', 'Barbarian', { lastPlayed: 500 }));
    rarityTracker.processD2S('RarityTest', d2sResponse('RarityTest', 'Sorceress', { lastPlayed: 2000 }));
    rarityTracker.commit();
    expect(rarityTracker.buildPayload().active).toBe('RarityTest');

    rarityTracker.setRunCharacter('OldHero');
    expect(rarityTracker.buildPayload().active).toBe('OldHero');
  });
});

describe('silent baseline (no toast/ding spam)', () => {
  it('first scan announces nothing; later drops do', () => {
    // reused object refs model stable in-game item IDs across save writes
    const cap = d2item('cap', D2sQuality.Magic, { location_id: 1, equipped_id: 1 });
    const ring = d2item('rin', D2sQuality.Rare);
    const amu = d2item('amu', D2sQuality.Unique);

    rarityTracker.beginParse();
    rarityTracker.processD2S('RarityTest', d2sResponse('RarityTest', 'Sorceress', { items: [cap, ring] }));
    const firstChanges = rarityTracker.commit();
    expect(firstChanges).toHaveLength(0); // baseline: silent

    // next scan: a unique amulet was picked up (same cap/ring as before)
    rarityTracker.beginParse();
    rarityTracker.processD2S('RarityTest', d2sResponse('RarityTest', 'Sorceress', { items: [cap, ring, amu] }));
    const secondChanges = rarityTracker.commit();
    expect(secondChanges).toHaveLength(1);
    expect(secondChanges[0]).toMatchObject({ slotKey: 'amulet', kind: 'new-mandate' });
  });

  it('reset re-baselines silently (no flood after reset)', () => {
    rarityTracker.beginParse();
    rarityTracker.processD2S('RarityTest', d2sResponse('RarityTest', 'Sorceress', {
      items: [d2item('cap', D2sQuality.Unique, { location_id: 1, equipped_id: 1 })],
    }));
    rarityTracker.commit();

    rarityTracker.reset();

    // the watcher re-reads the same save after reset
    rarityTracker.beginParse();
    rarityTracker.processD2S('RarityTest', d2sResponse('RarityTest', 'Sorceress', {
      items: [d2item('cap', D2sQuality.Unique, { location_id: 1, equipped_id: 1 })],
    }));
    const changes = rarityTracker.commit();
    expect(changes).toHaveLength(0); // silent, not a flood
  });
});

describe('progression history', () => {
  it('records each mandate over time for a slot', () => {
    const capMagic = d2item('cap', D2sQuality.Magic, { location_id: 1, equipped_id: 1 });
    const capRare = d2item('cap', D2sQuality.Rare);
    const capUnique = d2item('cap', D2sQuality.Unique);

    // baseline with a magic helm
    rarityTracker.beginParse();
    rarityTracker.processD2S('RarityTest', d2sResponse('RarityTest', 'Sorceress', { items: [capMagic] }));
    rarityTracker.commit();
    // later: rare helm, then unique helm (same magic cap still carried)
    rarityTracker.beginParse();
    rarityTracker.processD2S('RarityTest', d2sResponse('RarityTest', 'Sorceress', {
      items: [capMagic, capRare, capUnique],
    }));
    rarityTracker.commit();

    const helm = rarityTracker.buildPayload().character!.slots.find((s) => s.slotKey === 'helm')!;
    expect(helm.history.length).toBe(3);
    expect(helm.history[helm.history.length - 1].displayName).toBe(helm.mandate!.displayName);
  });
});
