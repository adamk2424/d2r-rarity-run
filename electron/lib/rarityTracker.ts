/**
 * Rarity Run tracker — main-process singleton.
 *
 * Tracks ONE run character (selectable; defaults to the most-recently-played).
 * Other characters in the same save folder are listed (for the picker) but not
 * tracked. The shared stash is cross-character and pre-populated, so it is
 * ignored by default (opt-in via the rarityIncludeStash setting) and, when on,
 * only offered to the run character.
 *
 * A character's FIRST scan establishes a silent baseline (no DING / no toast):
 * everything already on the character when the run begins is recorded but not
 * announced. Only items discovered in later scans fire notifications. The same
 * applies after a reset.
 */
import storage from 'electron-json-storage';
import type { ID2S, IItem, IStash } from '@dschu012/d2s/lib/d2/types';
import {
  MandateChange,
  MandateState,
  RankableItem,
  baseItemOf,
  emptyMandateState,
  offerItem,
  rankLabel,
  rarityClassOf,
} from './rarity';
import { EQ, HAND_POSITIONS, displayNameOf, fingerprintOf, toRankableItem } from './rarityConvert';
import settingsStore from './settings';

const STORAGE_KEY = 'rarityRunV2';

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

type KnownCharacter = {
  name: string,
  heroClass: string,
  level: number,
  lastPlayed: number,
};

type CharacterRunState = {
  name: string,
  heroClass: string,
  level: number,
  strength: number,
  dexterity: number,
  lastPlayed: number,
  baselined: boolean,
  mandates: MandateState,
  equipped: { [position: number]: EquippedItem },
};

type PersistedState = {
  runCharacter: string | null,
  knownCharacters: { [name: string]: KnownCharacter },
  characters: { [name: string]: CharacterRunState },
};

// Per-parse-pass scratch (not persisted)
type ParsedChar = {
  name: string,
  heroClass: string,
  level: number,
  lastPlayed: number,
  strength: number,
  dexterity: number,
  items: IItem[],
  equipped: { [position: number]: EquippedItem },
};

export type Compliance = 'none' | 'ok' | 'violation' | 'pending' | 'suspended';

export type HistoryEntry = {
  displayName: string,
  rankLabel: string,
  rarityClass: number,
};

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
  history: HistoryEntry[],
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
  knownCharacters: KnownCharacter[],
  character: CharacterView | null,
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
  parseBuffer: { [name: string]: ParsedChar };
  pendingStashItems: IItem[];
  pendingChanges: RarityChangeView[];
  dirty: boolean;

  constructor() {
    this.state = { runCharacter: null, knownCharacters: {}, characters: {} };
    this.parseBuffer = {};
    this.pendingStashItems = [];
    this.pendingChanges = [];
    this.dirty = false;
    try {
      const stored = storage.getSync(STORAGE_KEY) as PersistedState;
      if (stored && stored.characters) {
        this.state = {
          runCharacter: stored.runCharacter || null,
          knownCharacters: stored.knownCharacters || {},
          characters: stored.characters || {},
        };
      }
    } catch (e) {
      console.log('rarityTracker: could not load persisted state', e);
    }
  }

  beginParse = () => {
    this.parseBuffer = {};
    this.pendingStashItems = [];
    this.pendingChanges = [];
  };

  processD2S = (saveName: string, response: ID2S) => {
    const header = response.header;
    if (!header || !header.class) return;
    const name = header.name || saveName;

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

    this.parseBuffer[name] = {
      name,
      heroClass: header.class,
      level: header.level || 1,
      lastPlayed: header.last_played || 0,
      strength: response.attributes ? response.attributes.strength || 0 : 0,
      dexterity: response.attributes ? response.attributes.dexterity || 0 : 0,
      // equipped + inventory + personal stash + cube + corpse all count;
      // merc items and items inside sockets do not
      items: [...(response.items || []), ...(response.corpse_items || [])],
      equipped,
    };

    // keep the known-characters registry fresh for the picker
    this.state.knownCharacters[name] = {
      name,
      heroClass: header.class,
      level: header.level || 1,
      lastPlayed: header.last_played || 0,
    };
    this.dirty = true;
  };

  processStash = (response: IStash) => {
    (response.pages || []).forEach((page) => {
      (page.items || []).forEach((item) => this.pendingStashItems.push(item));
    });
  };

  activeName = (): string | null => {
    const { runCharacter, knownCharacters } = this.state;
    if (runCharacter && knownCharacters[runCharacter]) return runCharacter;
    // default: most-recently-played known character
    let best: string | null = null;
    let bestPlayed = -1;
    Object.values(knownCharacters).forEach((c) => {
      if (c.lastPlayed > bestPlayed) {
        bestPlayed = c.lastPlayed;
        best = c.name;
      }
    });
    return best;
  };

  ensureCharacter = (parsed: ParsedChar): CharacterRunState => {
    if (!this.state.characters[parsed.name]) {
      this.state.characters[parsed.name] = {
        name: parsed.name,
        heroClass: parsed.heroClass,
        level: parsed.level,
        strength: parsed.strength,
        dexterity: parsed.dexterity,
        lastPlayed: parsed.lastPlayed,
        baselined: false,
        mandates: emptyMandateState(),
        equipped: parsed.equipped,
      };
      this.dirty = true;
    }
    return this.state.characters[parsed.name];
  };

  offerToCharacter = (char: CharacterRunState, item: IItem) => {
    const rankable: RankableItem | null = toRankableItem(item, char.heroClass);
    if (!rankable) return;
    const change: MandateChange | null = offerItem(char.mandates, rankable);
    if (change) {
      this.dirty = true;
      // suppress announcements during the silent baseline scan
      if (char.baselined) {
        this.pendingChanges.push({
          character: char.name,
          slotKey: change.slotKey,
          slotLabel: SLOT_LABELS[change.slotKey] || change.slotKey,
          kind: change.kind,
          displayName: rankable.displayName,
          rankLabel: rankLabel(rankable),
        });
      }
    }
  };

  /**
   * Flush this parse pass: pick the active character, offer its items (and,
   * if enabled, the shared stash), then persist and return announced changes.
   */
  commit = (): RarityChangeView[] => {
    const activeName = this.activeName();
    if (activeName && this.parseBuffer[activeName]) {
      const parsed = this.parseBuffer[activeName];
      const char = this.ensureCharacter(parsed);
      char.heroClass = parsed.heroClass;
      char.level = parsed.level;
      char.strength = parsed.strength;
      char.dexterity = parsed.dexterity;
      char.lastPlayed = parsed.lastPlayed;
      char.equipped = parsed.equipped;

      parsed.items.forEach((item) => this.offerToCharacter(char, item));

      const includeStash = !!(settingsStore.getSettings() as { rarityIncludeStash?: boolean }).rarityIncludeStash;
      if (includeStash) {
        this.pendingStashItems.forEach((item) => this.offerToCharacter(char, item));
      }

      // first scan complete — future scans announce
      if (!char.baselined) {
        char.baselined = true;
        this.dirty = true;
      }
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

  setRunCharacter = (name: string | null) => {
    this.state.runCharacter = name;
    this.dirty = true;
    storage.set(STORAGE_KEY, this.state, (err) => {
      if (err) console.log('rarityTracker: persist failed', err);
    });
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
    if (equippedFps.some((fp) => contenderFps.has(fp))) {
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

  buildCharacterView = (char: CharacterRunState): CharacterView => {
    const slots: SlotView[] = SLOT_ORDER.map((slotKey) => {
      const mandate = char.mandates[slotKey];
      const top = mandate && mandate.contenders.length ? mandate.contenders[0] : null;
      const { compliance, equippedName } = this.complianceFor(char, slotKey);
      const history: HistoryEntry[] = (mandate ? mandate.history : []).map((h) => ({
        displayName: h.displayName,
        rankLabel: rankLabel(h),
        rarityClass: rarityClassOf(h.quality, h.socketed),
      }));
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
        history,
        compliance,
        equippedName,
      };
    });
    return { name: char.name, heroClass: char.heroClass, level: char.level, slots };
  };

  buildPayload = (): RarityPayload => {
    const active = this.activeName();
    const knownCharacters = Object.values(this.state.knownCharacters)
      .sort((a, b) => b.lastPlayed - a.lastPlayed);
    const char = active ? this.state.characters[active] : null;
    return {
      active,
      knownCharacters,
      character: char ? this.buildCharacterView(char) : null,
    };
  };

  /** Reset the active run: wipe its recorded mandates so it re-baselines.
   *  Keeps the known-character registry and run-character selection. */
  reset = () => {
    const active = this.activeName();
    if (active && this.state.characters[active]) {
      delete this.state.characters[active];
    }
    storage.set(STORAGE_KEY, this.state, (err) => {
      if (err) console.log('rarityTracker: persist failed', err);
    });
  };
}

const rarityTracker = new RarityTracker();
export default rarityTracker;
