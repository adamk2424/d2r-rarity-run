# The Rarity Run — D2R Challenge Ruleset

A Diablo 2: Resurrected challenge run: **you must wear the rarest gear that drops.**
You don't choose your equipment — the loot does.

## Core rule

For every equipment slot, you must equip the highest-ranked item that has dropped
for you in that slot. When a new item outranks your current one, you must switch
to it as soon as you are able to equip it. **No downgrades, ever.**

## Ranking order

An item's rank is determined in this order (higher beats lower at each step;
move to the next step only on a tie):

1. **Rarity class:**

   `Unique > Crafted > Set > Rare > Magic > Superior > Socketed (gray) > Normal > Low quality (Cracked/Crude/Damaged/Dull/Rusty)`

2. **Base tier:** `Elite > Exceptional > Normal`

3. **Quality level (qlvl)** of the base item (the stat the game uses to assign
   items to treasure classes). Higher qlvl = rarer = wins.

4. **Still tied?** Free pick between them.

**Crafted items** rank between Unique and Set. Among crafted candidates for a
slot, the one with the **highest level requirement** wins (level requirement is
visible in-game and reflects affix strength); tie-break by base qlvl, then free
pick. Crafting is the one deliberate way to influence your own gear — but only
until a Unique drops for that slot.

## Eligibility — what counts as "dropped"

- Only items that **drop and are picked up by you** count (plus items you craft).
- Gambled, shopped, imbued, and quest-reward items are **not** eligible.
- Rarity is locked in **at identify**. Unidentified items don't dictate anything
  until you ID them. (Seasoned players can usually tell what an unid'd unique is
  anyway — that's part of the fun.)
- **Class-specific items** (pelts, barb helms, paladin shields, necro heads,
  orbs, claws, amazon weapons) only count if they're for **your** class.
- **Level requirement too high?** The item is not valid until you meet it — then
  it immediately becomes mandatory.
- **Stat requirements:** you MUST allocate stats to wear mandated gear, even at
  the cost of vitality. If you don't have enough total points yet, you may wait
  until you do.

## Respecs

**Unlimited free respecs** (Akara resets and Tokens of Absolution are treated as
free and unrestricted). You have no control over what you must wear, so you keep
full control over stats and skills.

## Weapon swap rule (the playability valve)

You have two weapon swap sets (I and II). When a new higher-ranked weapon drops:

- You only need to replace **one** of the two swap sets (your choice which).
- You must still be able to equip it — allocate stats as needed — but you may
  swap back to the other set to actually fight.
- Each swap set independently obeys **no downgrades**: a set may lag behind the
  newest mandates, but it may only ever change to something ranked higher than
  what it currently holds.

This lets you keep one "usable" weapon set alive while the other absorbs the
chaos — but both sets only ever ratchet upward.

If a mandated weapon is two-handed, it occupies both hands of that swap set and
the shield mandate is suspended for that set.

## Slots

Helm, body armor, weapon(s), shield/off-hand, gloves, belt, boots, amulet, and
both ring slots (the two rarest rings found). **Charms are exempt** (see MF charm
below). Quivers/ammo are exempt.

## Runewords & sockets

- **Runewords are effectively banned**: socketed gray items rank below Magic, so
  the ranking almost never dictates one — and you may not complete a runeword in
  a mandated socketed item.
- Runes, gems, and jewels **may** be socketed into your mandated gear freely.

## No mercy clause

There are **no resets and no escape hatches**. A terrible low-level Unique locks
that slot until a higher-ranked Unique drops. That's the run.

## Optional: the Loot Goblin's Bargain (MF charm)

To make Unique/Set drops more common in late game (and make the no-mercy clause
bite harder), you *may* carry one special small charm:

- **+100% Magic Find** — unlocked when you reach Nightmare.
- Upgraded to **+200% Magic Find** when you reach Hell.

Double-edged sword: more uniques means more slots locked by whatever drops.
(Offline implementation: the charm is added via save edit or mod, since no
vanilla +100% MF small charm exists.)

## Misc rulings

- **Ethereal mandated items**: when one breaks, it is consumed — revert to the
  next-highest item you've found for that slot.
- Items left on the ground unseen obviously can't be enforced — the spirit of
  the run is that you pick up and ID anything that could outrank your gear.

---

*Companion app in this repo watches your offline save files, ranks every pickup
automatically, DINGs when a new mandate appears, and shows a per-slot overlay
(OBS browser source) with what you must be wearing — including a compliance
check against what you actually have equipped.*
