import { useState, useEffect } from 'react';
import { io } from "socket.io-client";
import { Settings } from '../@types/main.d';
import { useTranslation } from 'react-i18next';
import { GlobalStyle } from '../styles/GlobalStyle';
import type { RarityPayload } from '../../electron/lib/rarityTracker';
import { RARITY_CLASS_COLORS, COMPLIANCE_COLORS } from '../utils/rarityColors';

function RarityOverlay({ payload }: { payload: RarityPayload }) {
  const char = payload.character;
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
        RARITY CHALLENGE — {char.name} ({char.heroClass} lvl {char.level})
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
  // settings kept for language sync only
  const [, setSettings] = useState<Settings>({} as Settings);
  const [rarity, setRarity] = useState<RarityPayload | null>(null);
  const { i18n } = useTranslation();

  useEffect(() => {
    const socket = io();
    socket.on("updatedSettings", function (settings: Settings) {
      i18n.changeLanguage(settings.lang);
      setSettings(settings);
    });
    socket.on("rarityUpdate", function (payload: RarityPayload) {
      setRarity(payload);
    });
  }, []);

  return <>
    <GlobalStyle />
    {rarity && rarity.character
      ? <RarityOverlay payload={rarity} />
      : <div style={{ fontFamily: 'sans-serif', color: '#888', padding: 10 }}>
          Rarity Challenge — waiting for character…
        </div>
    }
  </>;
}
