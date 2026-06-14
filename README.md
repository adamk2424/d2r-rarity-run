# D2R Rarity Run

A companion app for the **Rarity Run** challenge in Diablo 2: Resurrected:
*you must wear the rarest gear that drops* — see [RULES.md](RULES.md) for the full ruleset.

The app watches your offline save files, ranks every identified pickup
(rarity class → elite/exceptional/normal tier → qlvl), DINGs when an item
becomes your new mandated gear for a slot, and shows a per-slot board with a
compliance check of what you're actually wearing. A compact overlay for OBS
(browser source) is served on `http://localhost:3666`.

Built on top of (forked from) the excellent
[Holy Grail by Zeddicus](https://github.com/zeddicus-pl/d2rHolyGrail) — all of
its grail-tracking features are still in the other tabs.

## Download & run (no terminal needed)

1. Go to the [**Releases**](https://github.com/adamk2424/d2r-rarity-run/releases) page.
2. Download **`RarityChallenge-portable-<version>.exe`** — a single file, no install.
   (Or `RarityChallenge-Setup-<version>.exe` if you'd rather install it with a
   Start-menu shortcut.)
3. **Double-click it** to launch. Windows SmartScreen may warn because the app is
   unsigned — choose *More info → Run anyway*.
4. In the app, click **Select folder** and pick your D2R save folder
   (usually `C:\Users\<you>\Saved Games\Diablo II Resurrected`).

Works with **offline single-player** characters only (online saves live on
Blizzard's servers). To show the overlay on stream, add a Browser source in OBS
pointing at `http://localhost:3666`.

Running from source instead? Double-click **`Launch Rarity Challenge (from source).bat`**
(requires Node.js + Yarn), or see the developer section below.

---

# Holy Grail
Application for automatic tracking of Holy Grail challenge progress in Diablo 2 Resurrected (for offline characters)
Made with Electron, React and Typescript.

Check [https://holygrail.link](https://holygrail.link) for more info.

# Info for developers

## Installation

Use a package manager of your choice (npm, yarn, etc.) in order to install all dependencies

```bash
yarn
```

## Usage

Just run `start` script.

```bash
yarn start
```

## Packaging

To generate the project package based on the OS you're running on, just run:

```bash
yarn package
```

## Contributing

Pull requests are always welcome 😃.

## License

[ISC](https://choosealicense.com/licenses/isc/)
