// D2-style item colors, keyed by RarityClass (electron/lib/rarity.ts)
export const RARITY_CLASS_COLORS: { [rarityClass: number]: string } = {
  1: '#9d9d9d', // low quality
  2: '#ffffff', // normal
  3: '#a0a0a0', // socketed (gray)
  4: '#ffffff', // superior
  5: '#6969ff', // magic
  6: '#ffff64', // rare
  7: '#00ff00', // set
  8: '#ffa800', // crafted
  9: '#c7b377', // unique
};

export const COMPLIANCE_COLORS: { [compliance: string]: string } = {
  ok: '#4caf50',
  violation: '#f44336',
  pending: '#ff9800',
  suspended: '#9e9e9e',
  none: '#555555',
};

export const COMPLIANCE_LABELS: { [compliance: string]: string } = {
  ok: 'EQUIPPED',
  violation: 'NOT EQUIPPED',
  pending: 'NOT YET EQUIPPABLE',
  suspended: 'SUSPENDED (2H)',
  none: '—',
};
