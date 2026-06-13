import { useState } from 'react';
import { Box, Tabs, Tab } from '@mui/material';
import { Container, Logo, ButtonPanel } from './styles';
import SettingsPanel from '../Settings'
import { FileReaderResponse, ItemNotes, Settings } from '../../@types/main.d';
import { Language } from './language';
import { RarityBoard, RarityHistory } from '../Rarity';
import type { RarityPayload } from '../../../electron/lib/rarityTracker';

/* eslint-disable no-unused-vars */
// Rarity Challenge shows only the first two tabs. The remaining members are
// retained so the legacy grail components (tab.tsx, summary.tsx) still type-check;
// they are no longer rendered.
export enum TabState {
  RarityRun,
  Progression,
  Statistics,
  UniqueArmor,
  UniqueWeapons,
  UniqueOther,
  Sets,
  Runes,
  Runewords,
  None,
}
/* eslint-enable no-unused-vars */

export const title = (str: string): string => {
  return str.substring(0, 1).toUpperCase() + str.substring(1);
}

type ListProps = {
  fileReaderResponse: FileReaderResponse | null,
  appSettings: Settings,
  itemNotes: ItemNotes,
  rarityPayload: RarityPayload | null,
}

// eslint-disable-next-line no-unused-vars
export function List({ fileReaderResponse, appSettings, itemNotes, rarityPayload }: ListProps) {
  const [tab, setTab] = useState(TabState.RarityRun);

  if (fileReaderResponse === null) {
    return null;
  }

  return (
    <Container>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <ButtonPanel>
          <Language />
          <SettingsPanel appSettings={appSettings} />
        </ButtonPanel>
        <Logo>
          <h1>Rarity Challenge</h1>
        </Logo>
        <Tabs
          value={tab}
          onChange={(_, value) => { setTab(value); }}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Rarity Run" />
          <Tab label="Progression" />
        </Tabs>
      </Box>
      {tab === TabState.RarityRun && <RarityBoard payload={rarityPayload} />}
      {tab === TabState.Progression && <RarityHistory payload={rarityPayload} />}
    </Container>
  );
}
