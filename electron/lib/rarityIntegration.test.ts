/**
 * Integration test: runs the full parse -> rank pipeline against the real
 * local D2R save folder. Skipped automatically when no save folder exists
 * (e.g. CI). Override the folder with the D2R_SAVES env var.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { extname, join } from 'path';
import * as d2s from '@dschu012/d2s';
import * as d2stash from '@dschu012/d2s/lib/d2/stash';
import { constants as constants96 } from '@dschu012/d2s/lib/data/versions/96_constant_data';
import { constants as constants99 } from '@dschu012/d2s/lib/data/versions/99_constant_data';
import { constants as constants105 } from '@dschu012/d2s/lib/data/versions/105_constant_data';
import { MandateState, emptyMandateState, offerItem, rankLabel } from './rarity';
import { toRankableItem } from './rarityConvert';

const SAVE_DIR = process.env.D2R_SAVES || 'C:\\Users\\Adamk\\Saved Games\\Diablo II Resurrected';
const maybeDescribe = existsSync(SAVE_DIR) ? describe : describe.skip;

maybeDescribe('rarity pipeline against real save files', () => {
  beforeAll(() => {
    [[96, constants96], [97, constants96], [98, constants96], [99, constants99],
      [0, constants96], [1, constants96], [2, constants96], [105, constants105]]
      .forEach(([version, constants]) => {
        try { d2s.getConstantData(version as number); } catch (e) {
          d2s.setConstantData(version as number, constants as never);
        }
      });
  });

  it('parses every .d2s and produces a sane mandate board', async () => {
    const files = readdirSync(SAVE_DIR).filter((f) => extname(f).toLowerCase() === '.d2s');
    expect(files.length).toBeGreaterThan(0);

    let parsedChars = 0;
    let totalOffered = 0;
    const failures: string[] = [];

    for (const file of files) {
      const buffer = readFileSync(join(SAVE_DIR, file));
      let response;
      try {
        response = await d2s.read(buffer);
      } catch (e) {
        failures.push(`${file}: ${(e as Error).message}`);
        continue;
      }
      parsedChars += 1;
      const heroClass = response.header.class;
      const state: MandateState = emptyMandateState();
      const board: string[] = [];

      [...(response.items || []), ...(response.corpse_items || [])].forEach((item) => {
        const rankable = toRankableItem(item, heroClass);
        if (!rankable) return;
        totalOffered += 1;
        offerItem(state, rankable);
      });

      Object.keys(state).forEach((slotKey) => {
        const top = state[slotKey].contenders[0];
        if (top) board.push(`  ${slotKey.padEnd(7)} ${top.displayName} [${rankLabel(top)}]`);
      });
      // eslint-disable-next-line no-console
      console.log(`${file} — ${heroClass} lvl ${response.header.level}\n${board.join('\n') || '  (no equippable items)'}`);
    }

    // eslint-disable-next-line no-console
    console.log(`parsed ${parsedChars}/${files.length} saves, offered ${totalOffered} items` +
      (failures.length ? `\nfailures:\n${failures.join('\n')}` : ''));
    expect(parsedChars).toBeGreaterThan(0);
  });

  it('parses the vanilla shared stash (modded stashes may fail, as in production)', async () => {
    const stashFiles = readdirSync(SAVE_DIR).filter((f) => /sharedstash.*\.d2i$/i.test(f));
    let parsed = 0;
    for (const file of stashFiles) {
      const buffer = readFileSync(join(SAVE_DIR, file));
      try {
        const response = await d2stash.read(buffer);
        const count = (response.pages || []).reduce((acc, p) => acc + (p.items || []).length, 0);
        parsed += 1;
        // eslint-disable-next-line no-console
        console.log(`${file}: ${response.pages?.length || 0} pages, ${count} items`);
      } catch (e) {
        // production (items.ts) catches per-file errors the same way
        // eslint-disable-next-line no-console
        console.log(`${file}: failed to parse — ${(e as Error).message}`);
      }
    }
    if (stashFiles.length) expect(parsed).toBeGreaterThan(0);
  });
});
