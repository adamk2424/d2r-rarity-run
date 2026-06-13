// Leaf utility with no imports — kept separate so modules that need it at
// evaluation time (e.g. holyGrailSeedData) don't form an import cycle with
// objects.ts. See git history: a cycle here caused a blank-window crash
// ("simplifyItemName is not a function").
export const simplifyItemName = (name: string): string =>
  name.replace(/[^a-z0-9]/gi, '').toLowerCase();
