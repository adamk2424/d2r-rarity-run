/**
 * Rarity Run ranking engine.
 *
 * Implements the ordering from RULES.md:
 *   1. Rarity class: Unique > Crafted > Set > Rare > Magic > Superior
 *      > Socketed (gray) > Normal > Low quality
 *   2. Base tier: Elite > Exceptional > Normal
 *   3. Base qlvl (treasure-class proxy)
 *   4. Tie -> free pick
 *
 * Crafted vs Crafted compares required level first (visible in-game),
 * then base qlvl.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const baseItems: { [code: string]: BaseItem } = require('./rarityData/baseItems.json');

export type Slot =
  | 'helm' | 'armor' | 'weapon' | 'shield' | 'gloves'
  | 'belt' | 'boots' | 'amulet' | 'ring';

export const ALL_SLOTS: Slot[] = [
  'helm', 'armor', 'weapon', 'shield', 'gloves', 'belt', 'boots', 'amulet', 'ring',
];

export type BaseItem = {
  name: string,
  slot: Slot,
  tier: 0 | 1 | 2,            // normal | exceptional | elite
  qlvl: number,
  lvlReq: number,
  strReq: number,
  dexReq: number,
  cls: string | null,         // ama|sor|nec|pal|bar|dru|ass
  hands?: 1 | 2 | 3,          // weapons: one | two | one-or-two handed
};

// Mirrors the quality byte in the .d2s item format (@dschu012/d2s)
export enum D2sQuality {
  Low = 1,
  Normal = 2,
  Superior = 3,
  Magic = 4,
  Set = 5,
  Rare = 6,
  Unique = 7,
  Crafted = 8,
}

// Challenge ranking — bigger beats smaller. Deliberately NOT the same
// order as D2sQuality (Crafted sits between Unique and Set per RULES.md).
export enum RarityClass {
  LowQuality = 1,
  Normal = 2,
  Socketed = 3,
  Superior = 4,
  Magic = 5,
  Rare = 6,
  Set = 7,
  Crafted = 8,
  Unique = 9,
}

export const RARITY_CLASS_NAMES: { [k in RarityClass]: string } = {
  [RarityClass.LowQuality]: 'Low quality',
  [RarityClass.Normal]: 'Normal',
  [RarityClass.Socketed]: 'Socketed',
  [RarityClass.Superior]: 'Superior',
  [RarityClass.Magic]: 'Magic',
  [RarityClass.Rare]: 'Rare',
  [RarityClass.Set]: 'Set',
  [RarityClass.Crafted]: 'Crafted',
  [RarityClass.Unique]: 'Unique',
};

export const TIER_NAMES = ['Normal', 'Exceptional', 'Elite'];

/** Normalized view of one parsed save-file item, as fed to the engine. */
export type RankableItem = {
  code: string,            // 3-4 char base item code, e.g. 'crs'
  quality: D2sQuality,
  socketed: boolean,
  identified: boolean,
  ethereal: boolean,
  /** Displayable name: unique/set/rare name if any, else base name */
  displayName: string,
  /** Total required level of the actual item (affixes included) — used for Crafted ties */
  requiredLevel: number,
  /** Stable identity so the same item seen in repeated save parses isn't "new" */
  fingerprint: string,
};

export function baseItemOf(code: string): BaseItem | undefined {
  return baseItems[code];
}

export function rarityClassOf(quality: D2sQuality, socketed: boolean): RarityClass {
  switch (quality) {
    case D2sQuality.Unique: return RarityClass.Unique;
    case D2sQuality.Crafted: return RarityClass.Crafted;
    case D2sQuality.Set: return RarityClass.Set;
    case D2sQuality.Rare: return RarityClass.Rare;
    case D2sQuality.Magic: return RarityClass.Magic;
    // A socketed gray item ranks as Socketed even on a superior base
    case D2sQuality.Superior: return socketed ? RarityClass.Socketed : RarityClass.Superior;
    case D2sQuality.Normal: return socketed ? RarityClass.Socketed : RarityClass.Normal;
    case D2sQuality.Low:
    default:
      return RarityClass.LowQuality;
  }
}

const CLASS_CODE_BY_HERO: { [hero: string]: string } = {
  Amazon: 'ama',
  Sorceress: 'sor',
  Necromancer: 'nec',
  Paladin: 'pal',
  Barbarian: 'bar',
  Druid: 'dru',
  Assassin: 'ass',
};

/** Class-specific items only count when they match the character's class. */
export function isEligibleForHero(code: string, heroClass: string): boolean {
  const base = baseItems[code];
  if (!base) return false;
  if (!base.cls) return true;
  return base.cls === (CLASS_CODE_BY_HERO[heroClass] || heroClass);
}

/**
 * Challenge ordering. Returns >0 if a outranks b, <0 if b outranks a,
 * 0 for a genuine tie (free pick).
 * Both items must belong to the same slot for the result to be meaningful.
 */
export function compareItems(a: RankableItem, b: RankableItem): number {
  const baseA = baseItems[a.code];
  const baseB = baseItems[b.code];
  if (!baseA || !baseB) throw new Error(`Unknown base item code: ${!baseA ? a.code : b.code}`);

  const classA = rarityClassOf(a.quality, a.socketed);
  const classB = rarityClassOf(b.quality, b.socketed);
  if (classA !== classB) return classA - classB;

  // Crafted vs Crafted: highest required level wins, then base qlvl
  if (classA === RarityClass.Crafted) {
    if (a.requiredLevel !== b.requiredLevel) return a.requiredLevel - b.requiredLevel;
    return baseA.qlvl - baseB.qlvl;
  }

  if (baseA.tier !== baseB.tier) return baseA.tier - baseB.tier;
  return baseA.qlvl - baseB.qlvl;
}

export type SlotMandate = {
  slot: Slot,
  /** Highest-ranked item(s) found for this slot. >1 entry means a tie = free pick. */
  contenders: RankableItem[],
  /** Ascending history of every item that was ever the mandate (for ethereal reversion). */
  history: RankableItem[],
};

export type MandateState = {
  // ring gets two mandates (two slots); every other slot gets one
  [slot: string]: SlotMandate,
};

export function emptyMandateState(): MandateState {
  const state: MandateState = {};
  for (const slot of ALL_SLOTS) {
    if (slot === 'ring') {
      state['ring1'] = { slot, contenders: [], history: [] };
      state['ring2'] = { slot, contenders: [], history: [] };
    } else {
      state[slot] = { slot, contenders: [], history: [] };
    }
  }
  return state;
}

export type MandateChange = {
  slotKey: string,
  kind: 'new-mandate' | 'new-tie',
  item: RankableItem,
};

function alreadySeen(mandate: SlotMandate, item: RankableItem): boolean {
  return (
    mandate.contenders.some((c) => c.fingerprint === item.fingerprint) ||
    mandate.history.some((c) => c.fingerprint === item.fingerprint)
  );
}

function offerToSlot(mandate: SlotMandate, slotKey: string, item: RankableItem): MandateChange | null {
  if (mandate.contenders.length === 0 || compareItems(item, mandate.contenders[0]) > 0) {
    mandate.contenders = [item];
    mandate.history.push(item);
    return { slotKey, kind: 'new-mandate', item };
  }
  if (compareItems(item, mandate.contenders[0]) === 0) {
    mandate.contenders.push(item);
    mandate.history.push(item);
    return { slotKey, kind: 'new-tie', item };
  }
  return null;
}

/**
 * Rings fill BOTH slots: the two rarest rings found are both mandated.
 * A new ring claims an empty slot first; otherwise it challenges the
 * weaker of the two current mandates. Ties on the weaker slot are a
 * free pick for that slot only. Invariant kept: ring1 ranks >= ring2.
 */
function offerRing(state: MandateState, item: RankableItem): MandateChange | null {
  const r1 = state['ring1'];
  const r2 = state['ring2'];
  if (alreadySeen(r1, item) || alreadySeen(r2, item)) return null;

  if (r1.contenders.length === 0) return offerToSlot(r1, 'ring1', item);
  if (r2.contenders.length === 0) return offerToSlot(r2, 'ring2', item);

  const change = offerToSlot(r2, 'ring2', item);
  if (change && compareItems(r2.contenders[0], r1.contenders[0]) > 0) {
    // new ring outranks ring1 too — swap so ring1 stays the stronger slot
    const tmp = state['ring1'];
    state['ring1'] = { ...state['ring2'], slot: 'ring' };
    state['ring2'] = { ...tmp, slot: 'ring' };
    return { ...change, slotKey: 'ring1' };
  }
  return change;
}

/**
 * Feed one identified, class-eligible item into the state.
 * Returns a change record if the item became (or tied) a mandate, else null.
 */
export function offerItem(state: MandateState, item: RankableItem): MandateChange | null {
  const base = baseItems[item.code];
  if (!base) return null;
  if (!item.identified) return null;

  if (base.slot === 'ring') return offerRing(state, item);

  const mandate = state[base.slot];
  if (alreadySeen(mandate, item)) return null;
  return offerToSlot(mandate, base.slot, item);
}

/** Human-readable rank label, e.g. "Unique Elite (qlvl 73)". */
export function rankLabel(item: RankableItem): string {
  const base = baseItems[item.code];
  const cls = rarityClassOf(item.quality, item.socketed);
  if (!base) return RARITY_CLASS_NAMES[cls];
  const tierPart = base.slot === 'ring' || base.slot === 'amulet'
    ? ''
    : ` ${TIER_NAMES[base.tier]}`;
  return `${RARITY_CLASS_NAMES[cls]}${tierPart} (qlvl ${base.qlvl})`;
}
