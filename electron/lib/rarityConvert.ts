/**
 * Pure conversion helpers from parsed .d2s items to ranking-engine inputs.
 * No Electron dependencies — usable from tests and scripts.
 */
import type { IItem } from '@dschu012/d2s/lib/d2/types';
import { D2sQuality, RankableItem, baseItemOf, isEligibleForHero } from './rarity';

// Equippable bases that are actually quest props — never real drops
export const QUEST_CODES = new Set(['leg', 'hdm', 'hfh', 'hst', 'msf', 'qf1', 'qf2', 'g33', 'qey', 'qhr', 'vip']);

// .d2s equipped_id values
export const EQ = {
  HEAD: 1, NECK: 2, TORSO: 3, RIGHT_HAND: 4, LEFT_HAND: 5,
  RIGHT_RING: 6, LEFT_RING: 7, BELT: 8, FEET: 9, GLOVES: 10,
  SWAP_RIGHT: 11, SWAP_LEFT: 12,
};
export const HAND_POSITIONS = [EQ.RIGHT_HAND, EQ.LEFT_HAND, EQ.SWAP_RIGHT, EQ.SWAP_LEFT];

export function displayNameOf(item: IItem, baseName: string): string {
  if (item.unique_name) return item.unique_name;
  if (item.set_name) return item.set_name;
  const rare = [item.rare_name, item.rare_name2].filter(Boolean).join(' ');
  if (rare) return `${rare} (${baseName})`;
  const affixed = [item.magic_prefix_name, baseName, item.magic_suffix_name].filter(Boolean).join(' ');
  return affixed || baseName;
}

export function fingerprintOf(item: IItem): string {
  return [item.id || 0, item.type, item.quality || 0, item.level || 0, item.defense_rating || 0].join(':');
}

export function toRankableItem(item: IItem, heroClass: string): RankableItem | null {
  if (item.is_ear || item.simple_item || item.starter_item) return null;
  if (!item.type || QUEST_CODES.has(item.type)) return null;
  const base = baseItemOf(item.type);
  if (!base) return null;
  if (!isEligibleForHero(item.type, heroClass)) return null;
  return {
    code: item.type,
    quality: (item.quality || D2sQuality.Normal) as D2sQuality,
    socketed: !!item.socketed,
    identified: !!item.identified,
    ethereal: !!item.ethereal,
    displayName: displayNameOf(item, base.name),
    // TODO: compute true required level (affixes) for Crafted ties;
    // base requirement only for now — verify crafted ties in-game.
    requiredLevel: base.lvlReq,
    fingerprint: fingerprintOf(item),
  };
}
