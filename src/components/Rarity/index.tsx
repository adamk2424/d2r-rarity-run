import { useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, MenuItem, Select, Switch, Table, TableBody, TableCell,
  TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import type { HistoryEntry, RarityPayload, SlotView } from '../../../electron/lib/rarityTracker';
import { RARITY_CLASS_COLORS, COMPLIANCE_COLORS, COMPLIANCE_LABELS } from '../../utils/rarityColors';

type RarityProps = {
  payload: RarityPayload | null,
};

function CharacterPicker({ payload }: { payload: RarityPayload }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Typography sx={{ color: '#777' }}>Run character:</Typography>
      <Select
        size="small"
        value={payload.active || ''}
        displayEmpty
        onChange={(e) => window.Main.setRunCharacter(e.target.value || null)}
      >
        {payload.knownCharacters.map((c) => (
          <MenuItem key={c.name} value={c.name}>
            {c.name} — {c.heroClass} lvl {c.level}
          </MenuItem>
        ))}
      </Select>
    </Box>
  );
}

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

function EmptyState() {
  return (
    <Box sx={{ padding: 4, textAlign: 'center', color: '#888' }}>
      <Typography variant="h6">Rarity Challenge</Typography>
      <Typography>
        No characters found in the save folder yet. Create an offline character and it will
        appear here; identified items then dictate your gear, slot by slot.
      </Typography>
    </Box>
  );
}

export function RarityBoard({ payload }: RarityProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!payload || payload.knownCharacters.length === 0) {
    return <EmptyState />;
  }

  const char = payload.character;

  return (
    <Box sx={{ padding: 2, textAlign: 'left' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 1, flexWrap: 'wrap' }}>
        <CharacterPicker payload={payload} />
        <Box sx={{ flex: 1 }} />
        <Button size="small" color="error" variant="outlined" onClick={() => setConfirmOpen(true)}>
          Reset run
        </Button>
      </Box>
      {char ? (
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
      ) : (
        <Typography sx={{ color: '#888', padding: 2 }}>
          Scanning… the run board will populate on the next save write.
        </Typography>
      )}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Reset this run?</DialogTitle>
        <DialogContent>
          This wipes the recorded drop history and all slot mandates for{' '}
          <b>{payload.active}</b>. The run re-baselines from whatever is on the character now,
          silently. This cannot be undone.
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
            Reset run
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function HistoryCell({ entry, current }: { entry: HistoryEntry, current: boolean }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        border: current ? '1px solid #c7b377' : '1px solid #333',
        borderRadius: '4px',
        padding: '2px 8px',
        marginRight: 1,
        marginBottom: 1,
      }}
    >
      <Typography component="span" sx={{ color: RARITY_CLASS_COLORS[entry.rarityClass], fontWeight: current ? 700 : 400 }}>
        {entry.displayName}
      </Typography>
      <Typography component="span" sx={{ color: '#777', fontSize: '0.8em', marginLeft: 0.5 }}>
        {entry.rankLabel}
      </Typography>
    </Box>
  );
}

export function RarityHistory({ payload }: RarityProps) {
  if (!payload || payload.knownCharacters.length === 0) {
    return <EmptyState />;
  }
  const char = payload.character;
  if (!char) {
    return <Typography sx={{ color: '#888', padding: 2 }}>No run data yet.</Typography>;
  }

  return (
    <Box sx={{ padding: 2, textAlign: 'left' }}>
      <Typography variant="h6" sx={{ marginBottom: 1 }}>
        Progression — {char.name} ({char.heroClass} lvl {char.level})
      </Typography>
      <Typography sx={{ color: '#888', marginBottom: 2, fontSize: '0.9em' }}>
        Every item that became the mandate for each slot over the course of the run, in order.
        The highlighted item is the current must-wear.
      </Typography>
      <Table size="small">
        <TableBody>
          {char.slots.map((slot) => (
            <TableRow key={slot.slotKey}>
              <TableCell sx={{ width: 90, color: '#bbb', verticalAlign: 'top' }}>{slot.label}</TableCell>
              <TableCell>
                {slot.history.length === 0 ? (
                  <Typography component="span" sx={{ color: '#555' }}>—</Typography>
                ) : (
                  slot.history.map((entry, i) => (
                    <HistoryCell key={i} entry={entry} current={i === slot.history.length - 1} />
                  ))
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
