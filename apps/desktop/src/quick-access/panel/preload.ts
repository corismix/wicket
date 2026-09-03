import { contextBridge, ipcRenderer } from "electron";

import {
  QUICK_ACCESS_IPC_CHANNELS,
  QuickAccessCopyField,
  QuickAccessCopyResult,
  QuickAccessState,
} from "../models/ipc-channels";

/**
 * Preload for the Quick Access panel window. The panel is a plain HTML page with no
 * framework; this is its entire API surface.
 */
const quickAccess = {
  getState: (): Promise<QuickAccessState> =>
    ipcRenderer.invoke(QUICK_ACCESS_IPC_CHANNELS.GET_STATE),
  onStateChanged: (fn: (state: QuickAccessState) => void) => {
    ipcRenderer.on(QUICK_ACCESS_IPC_CHANNELS.STATE_CHANGED, (_event, state: QuickAccessState) =>
      fn(state),
    );
  },
  copy: (id: string, field: QuickAccessCopyField) => {
    ipcRenderer.send(QUICK_ACCESS_IPC_CHANNELS.COPY, { id, field });
  },
  onCopyResult: (fn: (result: QuickAccessCopyResult) => void) => {
    ipcRenderer.on(QUICK_ACCESS_IPC_CHANNELS.COPY_RESULT, (_event, result: QuickAccessCopyResult) =>
      fn(result),
    );
  },
  hide: () => {
    ipcRenderer.send(QUICK_ACCESS_IPC_CHANNELS.HIDE);
  },
  getShortcut: (): Promise<string> => ipcRenderer.invoke(QUICK_ACCESS_IPC_CHANNELS.GET_SHORTCUT),
  setShortcut: (accelerator: string): Promise<{ ok: boolean; accelerator: string }> =>
    ipcRenderer.invoke(QUICK_ACCESS_IPC_CHANNELS.SET_SHORTCUT, accelerator),
};

contextBridge.exposeInMainWorld("quickAccess", quickAccess);
