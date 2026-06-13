import { useState, useEffect, useMemo } from 'react';
import { io } from "socket.io-client";
import { FileReaderResponse, Settings } from '../@types/main.d';
import { useTranslation } from 'react-i18next';
import { Grid, createTheme } from '@mui/material';
import { getHolyGrailSeedData } from '../../electron/lib/holyGrailSeedData';
import { ThemeProvider } from '@mui/system';
import { GlobalStyle } from '../styles/GlobalStyle';
import { computeStats } from '../utils/objects';

import { Header, Container } from './styles';
import 'react-circular-progressbar/dist/styles.css';
import { Statistics } from '../components/Stats';
import type { RarityPayload } from '../../electron/lib/rarityTracker';
import { RARITY_CLASS_COLORS, COMPLIANCE_COLORS } from '../utils/rarityColors';

function RarityOverlay({ payload }: { payload: RarityPayload }) {
  const charName = payload.active || Object.keys(payload.characters)[0];
  const char = payload.characters[charName];
  if (!char) return null;
  return (
    <div style={{
      fontFamily: 'sans-serif',
      background: 'rgba(0,0,0,0.75)',
      borderRadius: 8,
      padding: '10px 14px',
      width: 380,
      color: '#eee',
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, color: '#c7b377' }}>
        RARITY RUN — {char.name} ({char.heroClass} lvl {char.level})
      </div>
      {char.slots.map((slot) => (
        <div key={slot.slotKey} style={{ display: 'flex', alignItems: 'center', fontSize: 13, lineHeight: '20px' }}>
          <span style={{
            display: 'inline-block',
            width: 9,
            height: 9,
            borderRadius: '50%',
            marginRight: 7,
            backgroundColor: COMPLIANCE_COLORS[slot.compliance],
            flexShrink: 0,
          }} />
          <span style={{ width: 58, color: '#999', flexShrink: 0 }}>{slot.label}</span>
          {slot.mandate ? (
            <span style={{
              color: RARITY_CLASS_COLORS[slot.mandate.rarityClass],
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {slot.mandate.displayName}
              {slot.mandate.ties.length > 0 ? ` (+${slot.mandate.ties.length} tie)` : ''}
            </span>
          ) : (
            <span style={{ color: '#666' }}>—</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function StreamApp() {
  const [settings, setSettings] = useState<Settings>({} as Settings);
  const [rarity, setRarity] = useState<RarityPayload | null>(null);
  const [data, setData] = useState<FileReaderResponse>({ items: {}, ethItems: {}, stats: {}, availableRunes: {} });
  const totalStats = useMemo(
    () => computeStats(data.items, data.ethItems, getHolyGrailSeedData(settings, false), getHolyGrailSeedData(settings, true), settings),
    [data, settings]
  );
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const socket = io();
    socket.on("updatedSettings", function (settings: Settings) {
      i18n.changeLanguage(settings.lang);
      setSettings(settings);
    });
    socket.on("openFolder", function (data: FileReaderResponse) {
      setData(data);
    });
    socket.on("rarityUpdate", function (payload: RarityPayload) {
      setRarity(payload);
    });
  }, []);

  if (data === null) {
    return null;
  }

  // Rarity Run overlay takes over when a run is being tracked
  if (rarity && Object.keys(rarity.characters).length > 0) {
    return <>
      <GlobalStyle />
      <RarityOverlay payload={rarity} />
    </>;
  }

  return <>
    <GlobalStyle />
    <ThemeProvider theme={createTheme({palette: { mode: 'dark' }})}>
      <Container>
        <Grid item xs={12}>
          <Header>{t('Holy Grail')}</Header>
        </Grid>
        <Grid item xs={8} style={{ position: 'relative' }}>
          <Statistics appSettings={settings} holyGrailStats={totalStats} onlyCircle />
        </Grid>
      </Container>
    </ThemeProvider>
  </>;
}