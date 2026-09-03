import { ipcRenderer } from "electron";

import {
  QUICK_ACCESS_IPC_CHANNELS,
  QuickAccessCopyField,
  QuickAccessCopyResult,
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
};

export default quickAccess;
