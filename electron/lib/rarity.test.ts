import {
  D2sQuality,
  RankableItem,
  RarityClass,
  baseItemOf,
  compareItems,
  emptyMandateState,
  isEligibleForHero,
  offerItem,
  rarityClassOf,
} from './rarity';

let nextId = 0;
function item(code: string, quality: D2sQuality, overrides: Partial<RankableItem> = {}): RankableItem {
  nextId += 1;
  return {
    code,
    quality,
    socketed: false,
    identified: true,
    ethereal: false,
    displayName: `${code}-${nextId}`,
    requiredLevel: 0,
    fingerprint: `fp-${nextId}`,
    ...overrides,
  };
}

describe('base item data', () => {
  it('knows real items with correct slot/tier/qlvl', () => {
    expect(baseItemOf('crs')).toMatchObject({ name: 'Crystal Sword', slot: 'weapon', tier: 0, qlvl: 11 });
    expect(baseItemOf('7cr')).toMatchObject({ name: 'Phase Blade', slot: 'weapon', tier: 2, qlvl: 73 });
    expect(baseItemOf('uar')).toMatchObject({ name: 'Sacred Armor', slot: 'armor', tier: 2, qlvl: 85 });
    expect(baseItemOf('pab')).toMatchObject({ slot: 'shield', cls: 'pal' });
  });
});

describe('rarityClassOf', () => {
  it('orders Unique > Crafted > Set > Rare > Magic > Superior > Socketed > Normal > Low', () => {
    expect(rarityClassOf(D2sQuality.Unique, false)).toBeGreaterThan(rarityClassOf(D2sQuality.Crafted, false));
    expect(rarityClassOf(D2sQuality.Crafted, false)).toBeGreaterThan(rarityClassOf(D2sQuality.Set, false));
    expect(rarityClassOf(D2sQuality.Set, false)).toBeGreaterThan(rarityClassOf(D2sQuality.Rare, false));
    expect(rarityClassOf(D2sQuality.Rare, false)).toBeGreaterThan(rarityClassOf(D2sQuality.Magic, false));
    expect(rarityClassOf(D2sQuality.Magic, false)).toBeGreaterThan(rarityClassOf(D2sQuality.Superior, false));
    expect(rarityClassOf(D2sQuality.Superior, false)).toBeGreaterThan(rarityClassOf(D2sQuality.Normal, true));
    expect(rarityClassOf(D2sQuality.Normal, true)).toBeGreaterThan(rarityClassOf(D2sQuality.Normal, false));
    expect(rarityClassOf(D2sQuality.Normal, false)).toBeGreaterThan(rarityClassOf(D2sQuality.Low, false));
  });

  it('treats socketed gray items as Socketed even on superior bases', () => {
    expect(rarityClassOf(D2sQuality.Superior, true)).toBe(RarityClass.Socketed);
  });
});

describe('compareItems', () => {
  it('rarity class beats tier: a normal-tier Unique outranks an elite Rare', () => {
    // Gull (unique dagger 'dgr', normal tier) vs rare Phase Blade (elite)
    expect(compareItems(item('dgr', D2sQuality.Unique), item('7cr', D2sQuality.Rare))).toBeGreaterThan(0);
  });

  it('within a rarity class, tier wins', () => {
    // unique elite armor vs unique normal armor
    expect(compareItems(item('uar', D2sQuality.Unique), item('plt', D2sQuality.Unique))).toBeGreaterThan(0);
  });

  it('within rarity+tier, qlvl wins', () => {
    // Phase Blade (qlvl 73) vs Berserker Axe ('7wa', qlvl 85), both elite uniques
    const cmp = compareItems(item('7wa', D2sQuality.Unique), item('7cr', D2sQuality.Unique));
    expect(cmp).toBeGreaterThan(0);
  });

  it('same base + same rarity is a genuine tie', () => {
    expect(compareItems(item('7cr', D2sQuality.Rare), item('7cr', D2sQuality.Rare))).toBe(0);
  });

  it('Crafted sits between Unique and Set', () => {
    expect(compareItems(item('plt', D2sQuality.Crafted), item('uar', D2sQuality.Set))).toBeGreaterThan(0);
    expect(compareItems(item('plt', D2sQuality.Unique), item('uar', D2sQuality.Crafted))).toBeGreaterThan(0);
  });

  it('Crafted vs Crafted compares required level first, regardless of tier', () => {
    const lowReq = item('uar', D2sQuality.Crafted, { requiredLevel: 40 }); // elite base
    const highReq = item('plt', D2sQuality.Crafted, { requiredLevel: 62 }); // normal base
    expect(compareItems(highReq, lowReq)).toBeGreaterThan(0);
  });
});

describe('class eligibility', () => {
  it('class items only count for the matching class', () => {
    expect(isEligibleForHero('pab', 'Paladin')).toBe(true); // Sacred Targe
    expect(isEligibleForHero('pab', 'Barbarian')).toBe(false);
    expect(isEligibleForHero('uar', 'Barbarian')).toBe(true); // unrestricted
  });
});

describe('mandate state', () => {
  it('first item for a slot becomes the mandate', () => {
    const state = emptyMandateState();
    const change = offerItem(state, item('cap', D2sQuality.Magic));
    expect(change).toMatchObject({ slotKey: 'helm', kind: 'new-mandate' });
  });

  it('higher rank replaces, lower rank is ignored, equal rank ties', () => {
    const state = emptyMandateState();
    offerItem(state, item('cap', D2sQuality.Magic));
    expect(offerItem(state, item('cap', D2sQuality.Rare))).toMatchObject({ kind: 'new-mandate' });
    expect(offerItem(state, item('cap', D2sQuality.Magic))).toBeNull();
    expect(offerItem(state, item('cap', D2sQuality.Rare))).toMatchObject({ kind: 'new-tie' });
    expect(state['helm'].contenders).toHaveLength(2);
  });

  it('unidentified items never dictate anything', () => {
    const state = emptyMandateState();
    expect(offerItem(state, item('cap', D2sQuality.Unique, { identified: false }))).toBeNull();
  });

  it('the same physical item re-parsed from a save is not a new find', () => {
    const state = emptyMandateState();
    const found = item('cap', D2sQuality.Rare);
    expect(offerItem(state, found)).not.toBeNull();
    expect(offerItem(state, { ...found })).toBeNull();
  });

  it('a bad unique locks the slot against rares forever (no-mercy clause)', () => {
    const state = emptyMandateState();
    offerItem(state, item('lbt', D2sQuality.Unique)); // Hotspur-style normal unique boots
    expect(offerItem(state, item('utb', D2sQuality.Rare))).toBeNull(); // elite rare boots: rejected
    expect(offerItem(state, item('utb', D2sQuality.Unique))).toMatchObject({ kind: 'new-mandate' });
  });

  it('two rings fill both ring slots; the weaker mandate is the one challenged', () => {
    const state = emptyMandateState();
    expect(offerItem(state, item('rin', D2sQuality.Magic))).toMatchObject({ slotKey: 'ring1' });
    expect(offerItem(state, item('rin', D2sQuality.Magic))).toMatchObject({ slotKey: 'ring2', kind: 'new-mandate' });
    // a rare ring replaces the weaker (ring2) and swaps up to ring1
    expect(offerItem(state, item('rin', D2sQuality.Rare))).toMatchObject({ slotKey: 'ring1', kind: 'new-mandate' });
    // a unique replaces the now-weaker magic ring in ring2 and swaps to ring1
    expect(offerItem(state, item('rin', D2sQuality.Unique))).toMatchObject({ slotKey: 'ring1', kind: 'new-mandate' });
    const classes = [state['ring1'], state['ring2']].map((m) => rarityClassOf(m.contenders[0].quality, false));
    expect(classes).toEqual([RarityClass.Unique, RarityClass.Rare]);
  });
});
