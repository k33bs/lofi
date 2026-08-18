import '../../build/Release/black-magic.node';
import '../../icon.ico';
import '../../icon.png';
import '../../icon_liked.png';

import {
  app,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  HandlerDetails,
  ipcMain,
  IpcMainEvent,
  Menu,
  nativeImage,
  Rectangle,
  screen,
  shell,
  Tray,
} from 'electron';
import Store from 'electron-store';
import { clamp } from 'lodash';
import * as path from 'path';

import { version } from '../../version.generated';
import {
  ApplicationUrl,
  IpcMessage,
  MACOS,
  MAX_SIDE_LENGTH,
  MIN_SIDE_LENGTH,
  WindowName,
  WindowTitle,
} from '../constants';
import { MouseData } from '../models/ipc-messages.models';
import { DEFAULT_SETTINGS, Settings } from '../models/settings';
import {
  checkIfAppIsOnLeftSide,
  findWindow,
  getAboutWindowOptions,
  getFullscreenVisualizationWindowOptions,
  getFullscreenVizBounds,
  getSettingsWindowOptions,
  getTrackInfoWindowOptions,
  moveTrackInfo,
  setAlwaysOnTop,
  settingsSchema,
  showDevTool,
} from './main.utils';

const DEFAULT_SIZE = 150;

app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendArgument('disable-gpu-vsync');
app.commandLine.appendSwitch('enable-transparent-visuals');

if (process.env.NODE_ENV === 'development') {
  app.commandLine.appendSwitch('trace-warnings');
  app.commandLine.appendSwitch('enable-logging', '1');
}

// Electron no longer infers the app name from the bundle's package.json in dev,
// so userData would fall back to the generic "Electron" directory and settings
// (including auth tokens) would land in the wrong place. Must run before any
// electron-store is constructed.
app.setName('lofi');
app.setPath('userData', path.join(app.getPath('appData'), 'lofiapp'));

Store.initRenderer();
const store = new Store({ clearInvalidConfig: true });
const storeSettings = store.get('settings') as Settings;

let settings: Settings = DEFAULT_SETTINGS;
try {
  settingsSchema.parse(storeSettings);
  settings = storeSettings;
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(`Invalid settings file: ${error}`);
}

let mainWindow: BrowserWindow | null = null;
let mousePoller: NodeJS.Timeout;
let initialBounds: Rectangle;
let lastMovingAt = 0;
const DRAG_IDLE_RESET_MS = 500;
// minimum sliver of the window that must stay reachable on some display
const VISIBLE_MARGIN = 40;

let tray: Tray = null;
Menu.setApplicationMenu(null);

const isSingleInstance: boolean = app.requestSingleInstanceLock();
if (!isSingleInstance) {
  app.quit();
}

const icon = nativeImage.createFromPath(`${__dirname}/icon.png`).resize({ height: 16 });
const iconTrackLiked = nativeImage.createFromPath(`${__dirname}/icon_liked.png`).resize({ height: 16 });

const MAIN_WINDOW_OPTIONS: BrowserWindowConstructorOptions = {
  x: settings?.x ?? -1,
  y: settings?.y ?? -1,
  height: settings.size ?? DEFAULT_SIZE,
  width: settings.size ?? DEFAULT_SIZE,
  minHeight: MIN_SIDE_LENGTH,
  minWidth: MIN_SIDE_LENGTH,
  maxHeight: MAX_SIDE_LENGTH,
  maxWidth: MAX_SIDE_LENGTH,
  movable: false,
  frame: false,
  resizable: true,
  maximizable: false,
  minimizable: true,
  transparent: true,
  hasShadow: false,
  skipTaskbar: !settings?.isVisibleInTaskbar,
  focusable: !!settings?.isVisibleInTaskbar,
  title: 'Lofi',
  webPreferences: {
    nodeIntegration: true,
    contextIsolation: false,
  },
  backgroundColor: 'rgba(0,0,0,0)',
  roundedCorners: false,
};

const sendWindowReady = (): void => {
  if (!mainWindow) {
    return;
  }
  const displays = screen.getAllDisplays();
  const bounds = mainWindow.getBounds();
  const currentDisplay = screen.getDisplayMatching(bounds);
  const isOnLeft = checkIfAppIsOnLeftSide(currentDisplay, bounds.x, bounds.width);
  mainWindow.webContents.send(IpcMessage.WindowReady, { isOnLeft, displays });
};

// registered ONCE at startup: ipcMain is a global singleton and listeners stack,
// so registering these per-window would duplicate them on window recreation
const registerIpcHandlers = (): void => {
  // the renderer requests this on mount so recreated windows and
  // crash-recovery remounts regain their displays and drag wiring
  ipcMain.on(IpcMessage.WindowReady, () => {
    sendWindowReady();
  });

  ipcMain.on(IpcMessage.WindowMoving, (_: IpcMainEvent, { mouseX, mouseY }: MouseData) => {
    if (!mainWindow) {
      return;
    }
    const { x, y } = screen.getCursorScreenPoint();

    const bounds: Partial<Rectangle> = {
      x: x - mouseX,
      y: y - mouseY,
    };

    // a gap between frames means the previous drag ended without WindowMoved
    // (crash mid-drag) — treat this frame as a fresh drag so stale bounds self-heal
    if (Date.now() - lastMovingAt > DRAG_IDLE_RESET_MS) {
      initialBounds = null;
    }
    lastMovingAt = Date.now();

    // Bounds increase even when set to the same value, this is a quirk of the setBounds function
    // We must keep the bounds constant to keep the window where it should be
    // See: https://github.com/dvx/lofi/issues/118
    if (!initialBounds) {
      initialBounds = mainWindow.getBounds();
    } else {
      bounds.width = initialBounds.width;
      bounds.height = initialBounds.height;
    }

    // clamp to the cursor's display so a glitched frame can never throw the window off-screen
    const { workArea } = screen.getDisplayNearestPoint({ x, y });
    const width = bounds.width ?? initialBounds.width;
    bounds.x = clamp(bounds.x, workArea.x - width + VISIBLE_MARGIN, workArea.x + workArea.width - VISIBLE_MARGIN);
    bounds.y = clamp(bounds.y, workArea.y, workArea.y + workArea.height - VISIBLE_MARGIN);

    // Use setBounds instead of setPosition
    // See: https://github.com/electron/electron/issues/9477#issuecomment-406833003
    mainWindow.setBounds(bounds);
    moveTrackInfo(mainWindow, screen);

    mainWindow.webContents.send(IpcMessage.WindowMoved, bounds);
  });

  ipcMain.on(IpcMessage.WindowMoved, (_: IpcMainEvent) => {
    initialBounds = null;
  });

  ipcMain.on(IpcMessage.ScreenSize, (_: IpcMainEvent) => {
    if (!mainWindow) {
      return;
    }
    const bounds = mainWindow.getBounds();
    const { bounds: displayBounds } = screen.getDisplayMatching(bounds);

    mainWindow.webContents.send(IpcMessage.ScreenSize, {
      height: displayBounds.height,
      width: displayBounds.width,
    });
  });

  ipcMain.on(
    IpcMessage.SettingsChanged,
    (_: IpcMainEvent, { x, y, size, isAlwaysOnTop, isDebug, isVisibleInTaskbar, visualizationScreenId }: Settings) => {
      if (!mainWindow) {
        return;
      }
      setAlwaysOnTop({ window: mainWindow, isAlwaysOnTop });
      mainWindow.setSkipTaskbar(!isVisibleInTaskbar);
      // skipTaskbar is a no-op on macOS; the dock icon is the taskbar equivalent
      if (process.platform === 'darwin') {
        if (isVisibleInTaskbar) {
          app.dock.show();
        } else {
          app.dock.hide();
        }
      }
      showDevTool(mainWindow, isDebug);

      mainWindow.setBounds({ x, y, height: size, width: size });
      if (x === -1 && y === -1) {
        mainWindow.center();
      }
      moveTrackInfo(mainWindow, screen);

      const fullscreenVizWindow = findWindow(WindowTitle.FullscreenViz);
      if (fullscreenVizWindow) {
        const fullscreenVizBounds = getFullscreenVizBounds(mainWindow.getBounds(), screen, visualizationScreenId);
        fullscreenVizWindow.setBounds(fullscreenVizBounds);
      }
    }
  );

  ipcMain.on(IpcMessage.CloseApp, () => {
    clearTimeout(mousePoller);
    app.quit();
  });

  ipcMain.on(IpcMessage.OpenLink, (_: IpcMainEvent, url: ApplicationUrl) => {
    if (!Object.values(ApplicationUrl).includes(url)) {
      // eslint-disable-next-line no-console
      console.error(`Invalid url ${url}`);
      return;
    }
    shell.openExternal(url);
  });

  ipcMain.on(IpcMessage.ShowAbout, (_: IpcMainEvent) => {
    mainWindow?.webContents.send(IpcMessage.ShowAbout);
  });

  ipcMain.on(IpcMessage.ShowFullscreenVizualizer, (_: IpcMainEvent) => {
    mainWindow?.webContents.send(IpcMessage.ShowFullscreenVizualizer);
  });

  ipcMain.on(IpcMessage.ShowSettings, (_: IpcMainEvent) => {
    mainWindow?.webContents.send(IpcMessage.ShowSettings);
  });

  ipcMain.on(IpcMessage.TrackLiked, (_: IpcMainEvent, isTrackLiked: boolean) => {
    if (tray) {
      tray.setImage(isTrackLiked ? iconTrackLiked : icon);
    }
  });
};

const createMainWindow = (): void => {
  mainWindow = new BrowserWindow(MAIN_WINDOW_OPTIONS);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.setVisibleOnAllWorkspaces(true);

  mainWindow.loadURL(`file://${path.join(__dirname, './index.html')}`);

  showDevTool(mainWindow, !!settings?.isDebug);

  mainWindow.on('resize', () => {
    moveTrackInfo(mainWindow, screen);
  });

  mainWindow.on('resized', () => {
    // setBounds during a drag can echo size changes on scaled displays (see #118);
    // reacting to those mid-drag fights the drag loop and flings the window.
    // Gate on recent drag activity, not bare initialBounds — a crash mid-drag
    // could otherwise leave resizing disabled forever
    if (initialBounds && Date.now() - lastMovingAt < DRAG_IDLE_RESET_MS) {
      return;
    }
    const size = mainWindow.getSize();
    const [width, height] = size;
    const newSize = Math.min(width, height);
    mainWindow.setSize(newSize, newSize, true);
    mainWindow.webContents.send(IpcMessage.WindowResized, newSize);
  });

  const windowOpenHandler = (
    details: HandlerDetails
  ): { action: 'allow' | 'deny'; overrideBrowserWindowOptions?: BrowserWindowConstructorOptions } => {
    switch (details.frameName) {
      case WindowName.About: {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: getAboutWindowOptions(),
        };
      }

      case WindowName.FullscreenViz: {
        const fullscreenVizBounds = getFullscreenVizBounds(
          mainWindow.getBounds(),
          screen,
          settings.visualizationScreenId
        );
        return {
          action: 'allow',
          overrideBrowserWindowOptions: getFullscreenVisualizationWindowOptions(fullscreenVizBounds),
        };
      }

      case WindowName.Settings: {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: getSettingsWindowOptions(),
        };
      }

      case WindowName.TrackInfo: {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: getTrackInfoWindowOptions(mainWindow, settings.isAlwaysOnTop),
        };
      }

      case WindowName.Auth: {
        shell.openExternal(details.url);
        break;
      }

      default: {
        throw new Error(`Invalid frame name: ${details.frameName}`);
      }
    }

    return { action: 'deny' };
  };

  mainWindow.webContents.on('did-create-window', (childWindow, { frameName }) => {
    switch (frameName) {
      case WindowName.About: {
        if (MACOS) {
          childWindow.setWindowButtonVisibility(false);
        }
        childWindow.center();
        break;
      }

      case WindowName.FullscreenViz: {
        childWindow.setAlwaysOnTop(true, 'pop-up-menu');
        childWindow.setIgnoreMouseEvents(true);
        const sourceId = childWindow.getMediaSourceId();
        mainWindow.moveAbove(sourceId);

        childWindow.on('focus', () => {
          setAlwaysOnTop({ window: mainWindow, isAlwaysOnTop: true });
        });

        childWindow.on('blur', () => {
          setAlwaysOnTop({ window: mainWindow, isAlwaysOnTop: true });
        });

        childWindow.on('close', () => {
          setAlwaysOnTop({ window: mainWindow, isAlwaysOnTop: settings.isAlwaysOnTop });
        });
        break;
      }

      case WindowName.Settings: {
        childWindow.webContents.setWindowOpenHandler(windowOpenHandler);
        if (MACOS) {
          childWindow.setWindowButtonVisibility(false);
        }
        childWindow.center();
        break;
      }

      case WindowName.TrackInfo: {
        moveTrackInfo(mainWindow, screen);
        childWindow.setIgnoreMouseEvents(true);
        setAlwaysOnTop({ window: childWindow, isAlwaysOnTop: settings.isAlwaysOnTop });
        if (MACOS) {
          childWindow.setWindowButtonVisibility(false);
        }
        break;
      }

      default: {
        break;
      }
    }

    showDevTool(childWindow, settings.isDebug);
  });

  mainWindow.webContents.setWindowOpenHandler(windowOpenHandler);

  // per-window: every created window (including recreations) needs this,
  // not just the first one
  mainWindow.once('ready-to-show', () => {
    const displays = screen.getAllDisplays();
    // same reachability rule as the drag clamp, so a drag-allowed position
    // is never "corrected" by a recenter at next launch
    const isAppVisible = displays.some(
      ({ workArea: { x: areaX, y: areaY, width, height } }) =>
        settings.x >= areaX - settings.size + VISIBLE_MARGIN &&
        settings.x <= areaX + width - VISIBLE_MARGIN &&
        settings.y >= areaY &&
        settings.y <= areaY + height - VISIBLE_MARGIN
    );

    if (!isAppVisible || (settings.x === -1 && settings.y === -1)) {
      mainWindow.center();
    }

    setAlwaysOnTop({ window: mainWindow, isAlwaysOnTop: settings.isAlwaysOnTop });
    sendWindowReady();
    moveTrackInfo(mainWindow, screen);
  });
};

app.on('ready', () => {
  if (settings?.version === null || settings.version !== String(version)) {
    store.clear();
    settings = store.get('settings') as Settings;
  }

  registerIpcHandlers();
  createMainWindow();

  if (process.platform === 'darwin' && !settings?.isVisibleInTaskbar) {
    app.dock.hide();
  }

  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `lofi v${version}`,
      enabled: false,
      icon,
    },
    { type: 'separator' },
    {
      label: 'Settings',
      type: 'normal',
      click: () => {
        mainWindow.webContents.send(IpcMessage.ShowSettings);
      },
    },
    {
      label: 'About',
      type: 'normal',
      click: () => {
        mainWindow.webContents.send(IpcMessage.ShowAbout);
      },
    },
    {
      label: 'Exit',
      type: 'normal',
      click: () => {
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
  tray.setToolTip(`lofi v${version}`);
});

// not emitted for app.quit(), so the tray Exit item still quits normally
app.on('window-all-closed', () => {
  // tray app: losing all windows (e.g. during crash recovery) must not quit;
  // heal by recreating the widget instead
  if (!mainWindow) {
    createMainWindow();
  }
});

app.on('activate', () => {
  // On OS X it"s common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (MACOS && mainWindow === null) {
    createMainWindow();
  }
});
