/**
 * Rarity Run tracker — main-process singleton.
 *
 * Receives parsed .d2s / stash files from items.ts, feeds every identified
 * equippable item through the ranking engine (rarity.ts), persists the
 * per-character mandate state (items that were vendored/lost still dictate!),
 * and builds display payloads for the renderer and the stream overlay.
 */
import storage from 'electron-json-storage';
import type { ID2S, IItem, IStash } from '@dschu012/d2s/lib/d2/types';
import {
  MandateChange,
  MandateState,
  baseItemOf,
  emptyMandateState,
  offerItem,
  rankLabel,
  rarityClassOf,
} from './rarity';
import { EQ, HAND_POSITIONS, displayNameOf, fingerprintOf, toRankableItem } from './rarityConvert';

const STORAGE_KEY = 'rarityRunV1';

export const SLOT_ORDER = [
  'weapon', 'shield', 'helm', 'armor', 'gloves', 'belt', 'boots', 'amulet', 'ring1', 'ring2',
];

export const SLOT_LABELS: { [slotKey: string]: string } = {
  weapon: 'Weapon',
  shield: 'Shield',
  helm: 'Helm',
  armor: 'Armor',
  gloves: 'Gloves',
  belt: 'Belt',
  boots: 'Boots',
  amulet: 'Amulet',
  ring1: 'Ring 1',
  ring2: 'Ring 2',
};

type EquippedItem = { fingerprint: string, name: string, code: string };

type CharacterRunState = {
  name: string,
  heroClass: string,
  level: number,
  strength: number,
  dexterity: number,
  lastPlayed: number,
  mandates: MandateState,
  equipped: { [position: number]: EquippedItem },
};

type PersistedState = {
  characters: { [name: string]: CharacterRunState },
};

export type Compliance = 'none' | 'ok' | 'violation' | 'pending' | 'suspended';

export type SlotView = {
  slotKey: string,
  label: string,
  mandate: null | {
    displayName: string,
    rankLabel: string,
    rarityClass: number,
    baseName: string,
    ethereal: boolean,
    ties: string[],
  },
  compliance: Compliance,
  equippedName: string | null,
};

export type CharacterView = {
  name: string,
  heroClass: string,
  level: number,
  slots: SlotView[],
};

export type RarityPayload = {
  active: string | null,
  characters: { [name: string]: CharacterView },
};

export type RarityChangeView = {
  character: string,
  slotKey: string,
  slotLabel: string,
  kind: 'new-mandate' | 'new-tie',
  displayName: string,
  rankLabel: string,
};

class RarityTracker {
  state: PersistedState;
  pendingStashItems: IItem[];
  pendingChanges: RarityChangeView[];
  dirty: boolean;

  constructor() {
    this.state = { characters: {} };
    this.pendingStashItems = [];
    this.pendingChanges = [];
    this.dirty = false;
    try {
      const stored = storage.getSync(STORAGE_KEY) as PersistedState;
      if (stored && stored.characters) {
        this.state = stored;
      }
    } catch (e) {
      console.log('rarityTracker: could not load persisted state', e);
    }
  }

  ensureCharacter = (name: string, heroClass: string): CharacterRunState => {
    if (!this.state.characters[name]) {
      this.state.characters[name] = {
        name,
        heroClass,
        level: 1,
        strength: 0,
        dexterity: 0,
        lastPlayed: 0,
        mandates: emptyMandateState(),
        equipped: {},
      };
      this.dirty = true;
    }
    return this.state.characters[name];
  };

  offerToCharacter = (char: CharacterRunState, item: IItem) => {
    const rankable = toRankableItem(item, char.heroClass);
    if (!rankable) return;
    const change: MandateChange | null = offerItem(char.mandates, rankable);
    if (change) {
      this.dirty = true;
      this.pendingChanges.push({
        character: char.name,
        slotKey: change.slotKey,
        slotLabel: SLOT_LABELS[change.slotKey] || change.slotKey,
        kind: change.kind,
        displayName: rankable.displayName,
        rankLabel: rankLabel(rankable),
      });
    }
  };

  processD2S = (saveName: string, response: ID2S) => {
    const header = response.header;
    if (!header || !header.class) return;
    const char = this.ensureCharacter(header.name || saveName, header.class);
    char.heroClass = header.class;
    char.level = header.level || char.level;
    char.lastPlayed = header.last_played || 0;
    if (response.attributes) {
      char.strength = response.attributes.strength || char.strength;
      char.dexterity = response.attributes.dexterity || char.dexterity;
    }

    // Equipped snapshot (for compliance display)
    const equipped: { [position: number]: EquippedItem } = {};
    (response.items || []).forEach((item) => {
      if (item.location_id === 1 && item.equipped_id) {
        const base = baseItemOf(item.type);
        equipped[item.equipped_id] = {
          fingerprint: fingerprintOf(item),
          name: displayNameOf(item, base ? base.name : item.type_name || item.type),
          code: item.type,
        };
      }
    });
    char.equipped = equipped;

    // Offer everything the character carries (equipped, inventory, stash, cube)
    // plus corpse items. Merc items are NOT part of the challenge. Items inside
    // sockets are not offered (gems/runes/jewels aren't equipment).
    [...(response.items || []), ...(response.corpse_items || [])].forEach((item) => {
      this.offerToCharacter(char, item);
    });
  };

  processStash = (response: IStash) => {
    (response.pages || []).forEach((page) => {
      (page.items || []).forEach((item) => this.pendingStashItems.push(item));
    });
  };

  /**
   * Called once per parse pass, after all save files were processed.
   * Returns the change list of this pass (empty if nothing new).
   */
  commit = (): RarityChangeView[] => {
    // Shared stash items can't be attributed to a character by the file format,
    // so they are offered to every tracked character (a run uses one character).
    if (this.pendingStashItems.length) {
      Object.values(this.state.characters).forEach((char) => {
        this.pendingStashItems.forEach((item) => this.offerToCharacter(char, item));
      });
      this.pendingStashItems = [];
    }

    const changes = this.pendingChanges;
    this.pendingChanges = [];

    if (this.dirty) {
      this.dirty = false;
      storage.set(STORAGE_KEY, this.state, (err) => {
        if (err) console.log('rarityTracker: persist failed', err);
      });
    }
    return changes;
  };

  complianceFor = (char: CharacterRunState, slotKey: string): { compliance: Compliance, equippedName: string | null } => {
    const mandate = char.mandates[slotKey];
    const singlePositions: { [slotKey: string]: number } = {
      helm: EQ.HEAD, amulet: EQ.NECK, armor: EQ.TORSO,
      belt: EQ.BELT, boots: EQ.FEET, gloves: EQ.GLOVES,
    };

    let equippedNames: (string | null)[] = [];
    let equippedFps: string[] = [];
    if (slotKey === 'weapon' || slotKey === 'shield') {
      const hands = HAND_POSITIONS.map((p) => char.equipped[p]).filter(Boolean) as EquippedItem[];
      equippedFps = hands.map((e) => e.fingerprint);
      // show what's in the active hands
      equippedNames = [char.equipped[EQ.RIGHT_HAND]?.name || null, char.equipped[EQ.LEFT_HAND]?.name || null];
    } else if (slotKey === 'ring1' || slotKey === 'ring2') {
      const rings = [char.equipped[EQ.RIGHT_RING], char.equipped[EQ.LEFT_RING]].filter(Boolean) as EquippedItem[];
      equippedFps = rings.map((e) => e.fingerprint);
      equippedNames = rings.map((e) => e.name);
    } else {
      const eq = char.equipped[singlePositions[slotKey]];
      equippedFps = eq ? [eq.fingerprint] : [];
      equippedNames = eq ? [eq.name] : [];
    }
    const equippedName = equippedNames.filter(Boolean).join(' / ') || null;

    if (!mandate || mandate.contenders.length === 0) {
      return { compliance: 'none', equippedName };
    }

    const contenderFps = new Set(mandate.contenders.map((c) => c.fingerprint));
    if (slotKey === 'ring1' || slotKey === 'ring2') {
      // each mandated ring must be on one of the two fingers; fingerprints are
      // distinct between ring1/ring2 so simple membership works
      if (equippedFps.some((fp) => contenderFps.has(fp))) return { compliance: 'ok', equippedName };
    } else if (equippedFps.some((fp) => contenderFps.has(fp))) {
      return { compliance: 'ok', equippedName };
    }

    // not equipped — is it even equippable yet?
    const top = mandate.contenders[0];
    const base = baseItemOf(top.code);
    if (base && (base.lvlReq > char.level || base.strReq > char.strength || base.dexReq > char.dexterity)) {
      return { compliance: 'pending', equippedName };
    }

    // shield slot is suspended while a two-handed weapon is mandated
    if (slotKey === 'shield') {
      const weaponTop = char.mandates['weapon']?.contenders[0];
      const weaponBase = weaponTop ? baseItemOf(weaponTop.code) : undefined;
      if (weaponBase && weaponBase.hands === 2) {
        return { compliance: 'suspended', equippedName };
      }
    }

    return { compliance: 'violation', equippedName };
  };

  buildPayload = (): RarityPayload => {
    const characters: { [name: string]: CharacterView } = {};
    let active: string | null = null;
    let activeLastPlayed = -1;

    Object.values(this.state.characters).forEach((char) => {
      if (char.lastPlayed > activeLastPlayed) {
        activeLastPlayed = char.lastPlayed;
        active = char.name;
      }
      const slots: SlotView[] = SLOT_ORDER.map((slotKey) => {
        const mandate = char.mandates[slotKey];
        const top = mandate && mandate.contenders.length ? mandate.contenders[0] : null;
        const { compliance, equippedName } = this.complianceFor(char, slotKey);
        return {
          slotKey,
          label: SLOT_LABELS[slotKey],
          mandate: top
            ? {
                displayName: top.displayName,
                rankLabel: rankLabel(top),
                rarityClass: rarityClassOf(top.quality, top.socketed),
                baseName: baseItemOf(top.code)?.name || top.code,
                ethereal: top.ethereal,
                ties: mandate.contenders.slice(1).map((c) => c.displayName),
              }
            : null,
          compliance,
          equippedName,
        };
      });
      characters[char.name] = {
        name: char.name,
        heroClass: char.heroClass,
        level: char.level,
        slots,
      };
    });

    return { active, characters };
  };

  reset = () => {
    this.state = { characters: {} };
    this.pendingStashItems = [];
    this.pendingChanges = [];
    storage.set(STORAGE_KEY, this.state, (err) => {
      if (err) console.log('rarityTracker: persist failed', err);
    });
  };
}

const rarityTracker = new RarityTracker();
export default rarityTracker;
