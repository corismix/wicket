// Quick Access: a 1Password-style global-hotkey search panel over the unlocked vault.
// Purely additive feature; not part of upstream Bitwarden.

export const QUICK_ACCESS_IPC_CHANNELS = {
  /** Renderer (main window) -> main: latest vault status + searchable item projection. */
  UPDATE_STATE: "quick-access.updateState",
  /** Panel -> main (invoke): current cached state. */
  GET_STATE: "quick-access.getState",
  /** Main -> panel: pushed whenever the cached state changes. */
  STATE_CHANGED: "quick-access.stateChanged",
  /** Panel -> main: copy a field of a cipher to the clipboard. */
  COPY: "quick-access.copy",
  /** Main -> renderer (main window): perform the copy where keys/ciphers live. */
  COPY_REQUEST: "quick-access.copyRequest",
  /** Renderer (main window) -> main -> panel: outcome of a copy request. */
  COPY_RESULT: "quick-access.copyResult",
  /** Panel -> main: hide the panel. */
  HIDE: "quick-access.hide",
  /** Panel -> main (invoke): current global shortcut accelerator. */
  GET_SHORTCUT: "quick-access.getShortcut",
  /** Panel -> main (invoke): set + persist a new global shortcut accelerator. */
  SET_SHORTCUT: "quick-access.setShortcut",
  /** Renderer (main window) -> main: suspend/resume hotkey registration while capturing a new one. */
  SET_SUSPENDED: "quick-access.setSuspended",
  /** Panel -> main: open a vault item in the main window. */
  OPEN_ITEM: "quick-access.openItem",
  /** Main -> renderer (main window): navigate to + view a vault item. */
  OPEN_ITEM_REQUEST: "quick-access.openItemRequest",
  /** Panel -> main: autofill (type) a vault item's credentials into the previously focused app. */
  FILL: "quick-access.fill",
  /** Main -> renderer (main window): supply the credentials for a fill. */
  FILL_REQUEST: "quick-access.fillRequest",
  /** Renderer (main window) -> main: the credentials to type, or why not. */
  FILL_EXECUTE: "quick-access.fillExecute",
  /** Main -> panel: fill failure to surface (success leaves the panel hidden). */
  FILL_RESULT: "quick-access.fillResult",
} as const;

export type QuickAccessStatus = "loggedOut" | "locked" | "unlocked";

export interface QuickAccessItem {
  id: string;
  name: string;
  username: string | null;
  favorite: boolean;
}

export interface QuickAccessState {
  status: QuickAccessStatus;
  items: QuickAccessItem[];
}

export type QuickAccessCopyField = "username" | "password";

export interface QuickAccessCopyResult {
  id: string;
  field: QuickAccessCopyField;
  ok: boolean;
}

export interface QuickAccessFillExecute {
  id: string;
  ok: boolean;
  username?: string | null;
  password?: string | null;
  /** Human-readable reason when ok is false. */
  reason?: string;
}

export interface QuickAccessFillResult {
  ok: boolean;
  message: string;
}
