import { useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Select, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import type { RarityPayload, SlotView } from '../../../electron/lib/rarityTracker';
import { RARITY_CLASS_COLORS, COMPLIANCE_COLORS, COMPLIANCE_LABELS } from '../../utils/rarityColors';

type RarityBoardProps = {
  payload: RarityPayload | null,
};

function SlotRow({ slot }: { slot: SlotView }) {
  const mandateColor = slot.mandate ? RARITY_CLASS_COLORS[slot.mandate.rarityClass] : '#555';
  return (
    <TableRow>
      <TableCell sx={{ width: 90, color: '#bbb' }}>{slot.label}</TableCell>
      <TableCell>
        {slot.mandate ? (
          <>
            <Typography component="span" sx={{ color: mandateColor, fontWeight: 600 }}>
              {slot.mandate.displayName}
              {slot.mandate.ethereal ? ' (eth)' : ''}
            </Typography>
            <Typography component="span" sx={{ color: '#888', marginLeft: 1, fontSize: '0.85em' }}>
              {slot.mandate.baseName !== slot.mandate.displayName ? `${slot.mandate.baseName} — ` : ''}
              {slot.mandate.rankLabel}
            </Typography>
            {slot.mandate.ties.length > 0 && (
              <Tooltip title={`Free pick — tied with: ${slot.mandate.ties.join(', ')}`}>
                <Chip size="small" label={`free pick (${slot.mandate.ties.length + 1})`} sx={{ marginLeft: 1 }} />
              </Tooltip>
            )}
          </>
        ) : (
          <Typography component="span" sx={{ color: '#555' }}>nothing found yet — anything goes</Typography>
        )}
      </TableCell>
      <TableCell sx={{ width: 200 }}>
        <Chip
          size="small"
          label={COMPLIANCE_LABELS[slot.compliance]}
          sx={{
            backgroundColor: COMPLIANCE_COLORS[slot.compliance],
            color: slot.compliance === 'none' ? '#aaa' : '#000',
            fontWeight: 700,
          }}
        />
      </TableCell>
      <TableCell sx={{ color: '#999', fontSize: '0.85em' }}>{slot.equippedName || ''}</TableCell>
    </TableRow>
  );
}

export function RarityBoard({ payload }: RarityBoardProps) {
  const characterNames = payload ? Object.keys(payload.characters) : [];
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!payload || characterNames.length === 0) {
    return (
      <Box sx={{ padding: 4, textAlign: 'center', color: '#888' }}>
        <Typography variant="h6">Rarity Run</Typography>
        <Typography>
          No characters tracked yet. Play (or save &amp; exit) an offline character and identified
          items will start dictating your gear, slot by slot.
        </Typography>
      </Box>
    );
  }

  const charName = selected && payload.characters[selected] ? selected : (payload.active || characterNames[0]);
  const char = payload.characters[charName];

  return (
    <Box sx={{ padding: 2, textAlign: 'left' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 1 }}>
        {characterNames.length > 1 ? (
          <Select
            size="small"
            value={charName}
            onChange={(e) => setSelected(e.target.value)}
          >
            {characterNames.map((name) => (
              <MenuItem key={name} value={name}>{name}</MenuItem>
            ))}
          </Select>
        ) : (
          <Typography variant="h6">{char.name}</Typography>
        )}
        <Typography sx={{ color: '#999' }}>
          {char.heroClass} — level {char.level}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button size="small" color="error" variant="outlined" onClick={() => setConfirmOpen(true)}>
          Reset run
        </Button>
      </Box>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ color: '#777' }}>Slot</TableCell>
            <TableCell sx={{ color: '#777' }}>You must wear</TableCell>
            <TableCell sx={{ color: '#777' }}>Status</TableCell>
            <TableCell sx={{ color: '#777' }}>Currently equipped</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {char.slots.map((slot) => <SlotRow key={slot.slotKey} slot={slot} />)}
        </TableBody>
      </Table>
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Reset the Rarity Run?</DialogTitle>
        <DialogContent>
          This wipes the recorded drop history and all slot mandates for ALL tracked
          characters. The run starts fresh from the next save change. This cannot be undone.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button
            color="error"
            onClick={() => {
              window.Main.resetRarityRun();
              setConfirmOpen(false);
            }}
          >
            Reset everything
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
