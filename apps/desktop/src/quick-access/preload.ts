import { ipcRenderer } from "electron";

import {
  QUICK_ACCESS_IPC_CHANNELS,
  QuickAccessCopyField,
  QuickAccessCopyResult,
  QuickAccessFillExecute,
  QuickAccessState,
} from "./models/ipc-channels";

/**
 * Main-window renderer half of Quick Access. Exposed as `ipc.quickAccess` through
 * the shared preload. The renderer is where the unlocked vault lives, so it owns
 * pushing vault state to the main process and fulfilling copy requests.
 */
const quickAccess = {
  updateState: (state: QuickAccessState) => {
    ipcRenderer.send(QUICK_ACCESS_IPC_CHANNELS.UPDATE_STATE, state);
  },
  onCopyRequest: (fn: (request: { id: string; field: QuickAccessCopyField }) => void) => {
    ipcRenderer.on(
      QUICK_ACCESS_IPC_CHANNELS.COPY_REQUEST,
      (_event, request: { id: string; field: QuickAccessCopyField }) => fn(request),
    );
  },
  sendCopyResult: (result: QuickAccessCopyResult) => {
    ipcRenderer.send(QUICK_ACCESS_IPC_CHANNELS.COPY_RESULT, result);
  },
  getShortcut: (): Promise<string> => ipcRenderer.invoke(QUICK_ACCESS_IPC_CHANNELS.GET_SHORTCUT),
  setShortcut: (accelerator: string): Promise<{ ok: boolean; accelerator: string }> =>
    ipcRenderer.invoke(QUICK_ACCESS_IPC_CHANNELS.SET_SHORTCUT, accelerator),
  setSuspended: (suspended: boolean) => {
    ipcRenderer.send(QUICK_ACCESS_IPC_CHANNELS.SET_SUSPENDED, suspended);
  },
  onOpenItemRequest: (fn: (request: { id: string }) => void) => {
    ipcRenderer.on(QUICK_ACCESS_IPC_CHANNELS.OPEN_ITEM_REQUEST, (_event, request: { id: string }) =>
      fn(request),
    );
  },
  onFillRequest: (fn: (request: { id: string }) => void) => {
    ipcRenderer.on(QUICK_ACCESS_IPC_CHANNELS.FILL_REQUEST, (_event, request: { id: string }) =>
      fn(request),
    );
  },
  sendFillExecute: (data: QuickAccessFillExecute) => {
    ipcRenderer.send(QUICK_ACCESS_IPC_CHANNELS.FILL_EXECUTE, data);
  },
};

export default quickAccess;
