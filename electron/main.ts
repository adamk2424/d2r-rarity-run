import { app, BrowserWindow, ipcMain, dialog, shell, session, Notification } from 'electron';
import { writeFile } from 'fs';
import { extname, join } from 'path';
import { IpcMainEvent } from 'electron/renderer';
import WindowStateKeeper from "electron-window-state";
import { fetchSilospen, getAllDropRates, runSilospenServer } from './lib/silospenDropCalculator'
import itemsDatabase from './lib/items';
import rarityTracker from './lib/rarityTracker';
import settingsStore from './lib/settings';
import { setupStreamFeed, streamPort, updateDataToListeners, updateRarityToListeners } from './lib/stream';
import { registerUpdateDownloader } from './lib/update';
import type { RarityChangeView } from './lib/rarityTracker';

// these constants are set by the build stage
declare const MAIN_WINDOW_WEBPACK_ENTRY: string
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string

export const CSP_HEADER =
  "default-src 'self' 'unsafe-inline' data: ws:; " +
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' data:; " +
  "style-src 'unsafe-inline'; " +
  "style-src-elem 'unsafe-inline' http://localhost:*; " +
  "font-src file: http://localhost:*; " +
  "frame-src file: http://localhost:*;" +
  "connect-src https://api.github.com data: ws: http://localhost:*;";

export let eventToReply: IpcMainEvent | null;
export function setEventToReply(e: IpcMainEvent) {
  eventToReply = e;
}

const assetIconPath = () =>
  join(process.env.NODE_ENV === 'production' ? process.resourcesPath : app.getAppPath(), 'assets', 'icon.png');

/** Native Windows toast(s) for new rarity mandates — visible over the game. */
export function notifyRarityChanges(changes: RarityChangeView[]) {
  if (!Notification.isSupported() || !changes.length) return;
  // cap to avoid a burst of toasts when many items are identified at once
  const shown = changes.slice(0, 3);
  shown.forEach((c) => {
    const title = c.kind === 'new-tie' ? `Free pick unlocked — ${c.slotLabel}` : `New ${c.slotLabel} mandate!`;
    new Notification({
      title,
      body: `${c.displayName}\n${c.rankLabel}`,
      icon: assetIconPath(),
      // visual only — the app plays its own ding, and Focus Assist mutes
      // notification sounds during fullscreen play anyway
      silent: true,
    }).show();
  });
  if (changes.length > shown.length) {
    new Notification({
      title: 'Rarity Challenge',
      body: `+${changes.length - shown.length} more new mandates`,
      icon: assetIconPath(),
    }).show();
  }
}

let mainWindow: BrowserWindow | null

const assetsPath =
  process.env.NODE_ENV === 'production'
    ? process.resourcesPath
    : app.getAppPath()

function createWindow () {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // eslint-disable-next-line node/no-callback-literal
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [ CSP_HEADER ]
      }
    })
  })

  const mainWindowState = WindowStateKeeper({
    defaultWidth: 1100,
    defaultHeight: 700,
  });

  mainWindow = new BrowserWindow({
    icon: join(assetsPath, 'assets', 'icon.png'),
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    minWidth: 540,
    minHeight: 300,
    backgroundColor: '#111111',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      // keep timers/audio running full-speed while D2R has focus
      backgroundThrottling: false,
    }
  })
  mainWindowState.manage(mainWindow);

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY)
  if (process.env.ELECTRON_ENV === 'development') {
    // DevTools no longer auto-opens; use F12 / Ctrl+Shift+I if needed.
    // forward renderer console + crashes to the main stdout for debugging
    mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
    mainWindow.webContents.on('render-process-gone', (_e, details) => {
      console.log('[renderer GONE]', JSON.stringify(details));
    });
    mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
      console.log('[renderer did-fail-load]', code, desc);
    });
  }

  mainWindow.on('closed', () => {
    closeApp();
  });

  registerUpdateDownloader(mainWindow);
  setupStreamFeed();
  runSilospenServer();
}

async function closeApp () {
  itemsDatabase.shutdown();
  app.quit();
}

async function registerListeners () {
  ipcMain.on('readFilesUponStart', (event) => {
    itemsDatabase.readFilesUponStart(event);
  });
  ipcMain.on('openFolderRequest', (event) => {
    itemsDatabase.openAndParseSaves(event);
  });
  ipcMain.on('openUrl', (_, url) => {
    shell.openExternal(url);
  });
  ipcMain.on('silospenRequest', (event, type, itemName) => {
    fetchSilospen(event, type, itemName);
  });
  ipcMain.on('getSetting', (event, key) => {
    event.returnValue = settingsStore.getSetting(key);
  });
  ipcMain.on('getSettings', (event) => {
    eventToReply = event;
    event.returnValue = settingsStore.getSettings();
  });
  ipcMain.on('saveSetting', (event, key, value) => {
    settingsStore.saveSetting(key, value);
  });
  ipcMain.on('saveImage', (event, data: string) => {
    saveImage(data);
  });
  ipcMain.on('loadManualItems', (event) => {
    eventToReply = event;
    itemsDatabase.loadManualItems();
    event.reply('openFolder', itemsDatabase.getItems());
    updateDataToListeners();
  });
  ipcMain.on('saveManualItem', (event, itemId, count) => {
    eventToReply = event;
    itemsDatabase.saveManualItem(itemId, count);
    itemsDatabase.fillInAvailableRunes();
    event.reply('openFolder', itemsDatabase.getItems());
    updateDataToListeners();
  });
  ipcMain.on('saveManualEthItem', (event, itemId, count) => {
    eventToReply = event;
    itemsDatabase.saveManualEthItem(itemId, count);
    event.reply('openFolder', itemsDatabase.getItems());
    updateDataToListeners();
  });
  ipcMain.on('getAllDropRates', (event) => {
    eventToReply = event;
    getAllDropRates();
  });
  ipcMain.on('getStreamPort', (event) => {
    eventToReply = event;
    event.returnValue = streamPort;
  });
  ipcMain.on('getItemNotes', (event) => {
    eventToReply = event;
    itemsDatabase.getItemNotes().then((items) => event.reply('getItemNotes', items))
  });
  ipcMain.on('setItemNote', (event, itemName, note) => {
    eventToReply = event;
    itemsDatabase.setItemNote(itemName, note).then((items) => event.reply('getItemNotes', items))
  });
  ipcMain.on('getRarityState', (event) => {
    event.reply('rarityUpdate', rarityTracker.buildPayload());
  });
  ipcMain.on('resetRarityRun', (event) => {
    rarityTracker.reset();
    itemsDatabase.forceReread();
    event.reply('rarityUpdate', rarityTracker.buildPayload());
    updateRarityToListeners();
  });
  ipcMain.on('setRunCharacter', (event, name: string | null) => {
    rarityTracker.setRunCharacter(name);
    itemsDatabase.forceReread();
    event.reply('rarityUpdate', rarityTracker.buildPayload());
    updateRarityToListeners();
  });
}

app.on('ready', createWindow)
  .whenReady()
  .then(registerListeners)
  .catch(e => console.error(e))

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeApp();
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

const saveImage = async (data: string) => {
  return dialog.showSaveDialog({
    defaultPath: 'HolyGrail.png',
    properties: ['createDirectory'],
  }).then((result) => {
    if (result.filePath) {
      const regExMatches = data.match('data:(image/.*);base64,(.*)');
      if (regExMatches && regExMatches[2]) {
        const buffer = Buffer.from(regExMatches[2], 'base64')
        const filePath = extname(result.filePath).length ? result.filePath : result.filePath + '.png'
        writeFile(filePath, buffer, (err) => {
          if (err) {
            console.log('Failed saving the file: ' + JSON.stringify(err, null, 4));
          }
        });
      }
    }
  }).catch((e) => {
    console.log(e);
  });
}
