import * as path from "path";
import * as url from "url";

import { app, BrowserWindow, globalShortcut, ipcMain, screen } from "electron";

import { LogService } from "@bitwarden/logging";

import { WindowMain } from "../../main/window.main";
import { ElectronStorageService } from "../../platform/main/electron-storage.service";
import {
  QUICK_ACCESS_IPC_CHANNELS,
  QuickAccessCopyField,
  QuickAccessCopyResult,
  QuickAccessState,
} from "../models/ipc-channels";

const SHORTCUT_STORAGE_KEY = "quickAccessKeyboardShortcut";
const DEFAULT_SHORTCUT = "CommandOrControl+Shift+Space";

const PANEL_WIDTH = 640;
const PANEL_HEIGHT = 440;

/**
 * Main-process half of Quick Access. Owns the global hotkey and the always-on-top
 * panel window, and brokers vault data between the panel and the main window's
 * renderer (the only place the unlocked vault lives).
 *
 * Modeled on MainDesktopAutotypeMvpService (PM-41067).
 */
export class MainDesktopQuickAccessService {
  private panel: BrowserWindow | null = null;
  private accelerator = DEFAULT_SHORTCUT;
  private state: QuickAccessState = { status: "loggedOut", items: [] };

  constructor(
    private logService: LogService,
    private windowMain: WindowMain,
    private storageService: ElectronStorageService,
  ) {}

  async init() {
    // globalShortcut cannot be used before the app is ready, and Main constructs its
    // services before that. Gate registration on app readiness.
    await app.whenReady();

    const stored = await this.storageService.get<string>(SHORTCUT_STORAGE_KEY);
    if (typeof stored === "string" && stored.length > 0) {
      this.accelerator = stored;
    }

    this.registerIpcListeners();
    this.registerShortcut();
  }

  dispose() {
    Object.values(QUICK_ACCESS_IPC_CHANNELS).forEach((channel) => {
      ipcMain.removeAllListeners(channel);
    });
    ipcMain.removeHandler(QUICK_ACCESS_IPC_CHANNELS.GET_STATE);
    ipcMain.removeHandler(QUICK_ACCESS_IPC_CHANNELS.GET_SHORTCUT);
    ipcMain.removeHandler(QUICK_ACCESS_IPC_CHANNELS.SET_SHORTCUT);

    if (globalShortcut.isRegistered(this.accelerator)) {
      globalShortcut.unregister(this.accelerator);
    }

    this.destroyPanel();
  }

  private registerIpcListeners() {
    ipcMain.on(QUICK_ACCESS_IPC_CHANNELS.UPDATE_STATE, (_event, state: QuickAccessState) => {
      this.state = {
        status: state?.status ?? "loggedOut",
        items: Array.isArray(state?.items) ? state.items : [],
      };
      if (this.panel != null && !this.panel.isDestroyed()) {
        this.panel.webContents.send(QUICK_ACCESS_IPC_CHANNELS.STATE_CHANGED, this.state);
      }
    });

    ipcMain.handle(QUICK_ACCESS_IPC_CHANNELS.GET_STATE, () => this.state);

    ipcMain.on(
      QUICK_ACCESS_IPC_CHANNELS.COPY,
      (_event, request: { id: string; field: QuickAccessCopyField }) => {
        if (this.windowMain.win != null && !this.windowMain.win.isDestroyed()) {
          this.windowMain.win.webContents.send(QUICK_ACCESS_IPC_CHANNELS.COPY_REQUEST, request);
        } else {
          this.logService.debug("Quick Access copy requested but the main window does not exist.");
          this.sendCopyResult({ id: request?.id ?? "", field: request?.field, ok: false });
        }
      },
    );

    ipcMain.on(QUICK_ACCESS_IPC_CHANNELS.COPY_RESULT, (_event, result: QuickAccessCopyResult) => {
      this.sendCopyResult(result);
    });

    ipcMain.on(QUICK_ACCESS_IPC_CHANNELS.HIDE, () => this.hidePanel());

    ipcMain.handle(QUICK_ACCESS_IPC_CHANNELS.GET_SHORTCUT, () => this.accelerator);

    ipcMain.handle(QUICK_ACCESS_IPC_CHANNELS.SET_SHORTCUT, async (_event, accelerator: string) => {
      if (typeof accelerator !== "string" || accelerator.length === 0) {
        return { ok: false, accelerator: this.accelerator };
      }

      const previous = this.accelerator;
      if (globalShortcut.isRegistered(previous)) {
        globalShortcut.unregister(previous);
      }

      this.accelerator = accelerator;
      if (!this.registerShortcut()) {
        // Roll back to the previous shortcut if the new one cannot be registered.
        this.accelerator = previous;
        this.registerShortcut();
        return { ok: false, accelerator: this.accelerator };
      }

      await this.storageService.save(SHORTCUT_STORAGE_KEY, accelerator);
      return { ok: true, accelerator: this.accelerator };
    });
  }

  private sendCopyResult(result: QuickAccessCopyResult) {
    if (this.panel != null && !this.panel.isDestroyed()) {
      this.panel.webContents.send(QUICK_ACCESS_IPC_CHANNELS.COPY_RESULT, result);
    }
  }

  private registerShortcut(): boolean {
    const result = globalShortcut.register(this.accelerator, () => this.togglePanel());
    if (result) {
      this.logService.debug("Quick Access hotkey registered: " + this.accelerator);
    } else {
      this.logService.error("Failed to register Quick Access hotkey: " + this.accelerator);
    }
    return result;
  }

  private togglePanel() {
    if (this.panel != null && !this.panel.isDestroyed() && this.panel.isVisible()) {
      this.hidePanel();
      return;
    }

    void this.showPanel();
  }

  private async showPanel() {
    if (this.panel == null || this.panel.isDestroyed()) {
      await this.createPanel();
    }

    if (this.panel == null) {
      return;
    }

    this.positionPanel();
    // Make sure the panel has the freshest known state on every open.
    this.panel.webContents.send(QUICK_ACCESS_IPC_CHANNELS.STATE_CHANGED, this.state);
    this.panel.show();
    this.panel.focus();
  }

  private hidePanel() {
    if (this.panel != null && !this.panel.isDestroyed()) {
      this.panel.hide();
    }
  }

  private destroyPanel() {
    if (this.panel != null && !this.panel.isDestroyed()) {
      this.panel.destroy();
    }
    this.panel = null;
  }

  private positionPanel() {
    if (this.panel == null) {
      return;
    }

    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const { x, y, width, height } = display.workArea;
    this.panel.setBounds({
      x: Math.round(x + (width - PANEL_WIDTH) / 2),
      y: Math.round(y + height * 0.15),
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
    });
  }

  private getPanelUrl(): string {
    if (process.env.BITWARDEN_USE_CUSTOM_FILE_SCHEME !== "true") {
      return url.format({
        protocol: "file:",
        pathname: path.join(__dirname, "/quick-access-panel.html"),
        slashes: true,
      });
    }

    // Mirror of WindowMain's custom-scheme mode; the protocol handler is registered
    // on the shared session and resolves against the build output directory.
    return url.format({
      protocol: "bw-desktop-file:",
      host: "bundle",
      pathname: "quick-access-panel.html",
      slashes: true,
    });
  }

  private async createPanel() {
    this.panel = new BrowserWindow({
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      frame: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      backgroundColor: "#1b2029",
      webPreferences: {
        preload: path.join(__dirname, "quickAccessPanel.js"),
        spellcheck: false,
        nodeIntegration: false,
        backgroundThrottling: false,
        contextIsolation: true,
        session: this.windowMain.session,
        devTools: process.env.NODE_ENV === "development",
      },
    });

    this.panel.setAlwaysOnTop(true, "floating");

    // 1Password Quick Access behavior: clicking away dismisses the panel.
    this.panel.on("blur", () => this.hidePanel());
    this.panel.on("closed", () => {
      this.panel = null;
    });

    await this.panel.loadURL(this.getPanelUrl());
  }
}
