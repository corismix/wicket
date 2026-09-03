import { Injectable, OnDestroy } from "@angular/core";
import { Router } from "@angular/router";
import {
  catchError,
  combineLatest,
  distinctUntilChanged,
  map,
  of,
  retry,
  Subject,
  switchMap,
  takeUntil,
} from "rxjs";

import { Account, AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { MessageSender } from "@bitwarden/common/platform/messaging";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { LogService } from "@bitwarden/logging";
import { CopyCipherFieldService } from "@bitwarden/vault";

import { QuickAccessItem, QuickAccessState } from "../models/ipc-channels";

/**
 * Renderer half of Quick Access. Publishes a small searchable projection of the
 * unlocked vault (names + usernames only, never secrets) to the main process, and
 * fulfills copy requests coming back from the panel.
 */
@Injectable({
  providedIn: "root",
})
export class DesktopQuickAccessService implements OnDestroy {
  private destroy$ = new Subject<void>();

  /** Latest decrypted views, kept so copy requests don't need a second decryption pass. */
  private latestViews: CipherView[] = [];

  constructor(
    private accountService: AccountService,
    private authService: AuthService,
    private cipherService: CipherService,
    private copyCipherFieldService: CopyCipherFieldService,
    private logService: LogService,
    private router: Router,
    private messageSender: MessageSender,
  ) {}

  async init() {
    this.accountService.activeAccount$
      .pipe(
        switchMap((account: Account | null) => {
          if (account == null) {
            this.latestViews = [];
            return of({ status: "loggedOut", items: [] } as QuickAccessState);
          }

          return combineLatest([
            this.authService.authStatusFor$(account.id),
            this.cipherService
              .cipherViews$(account.id)
              // Locked/erroring vault decryption must not tear down the state stream.
              .pipe(catchError(() => of([] as CipherView[]))),
          ]).pipe(
            map(([authStatus, views]): QuickAccessState => {
              if (authStatus !== AuthenticationStatus.Unlocked) {
                this.latestViews = [];
                return {
                  status:
                    authStatus === AuthenticationStatus.Locked
                      ? ("locked" as const)
                      : ("loggedOut" as const),
                  items: [],
                };
              }

              // cipherViews$ emits null while decrypted ciphers are cleared (e.g. right
              // after unlock, before decryption finishes) - treat as "no items yet".
              const safeViews = views ?? [];
              this.latestViews = safeViews;
              return {
                status: "unlocked" as const,
                items: safeViews.map(toQuickAccessItem),
              };
            }),
          );
        }),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        // The vault state streams span lock/unlock transitions; never let one bad
        // emission kill the bridge permanently - resubscribe instead.
        retry(),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (state) => {
          ipc.quickAccess.updateState(state);
        },
        error: (e) => {
          this.logService.error("Quick Access vault state stream died", e);
        },
      });

    ipc.quickAccess.onCopyRequest((request) => {
      void this.handleCopyRequest(request.id, request.field);
    });

    ipc.quickAccess.onOpenItemRequest((request) => {
      void this.handleOpenItemRequest(request.id);
    });
  }

  getShortcut(): Promise<string> {
    return ipc.quickAccess.getShortcut();
  }

  setShortcut(accelerator: string): Promise<{ ok: boolean; accelerator: string }> {
    return ipc.quickAccess.setShortcut(accelerator);
  }

  setSuspended(suspended: boolean) {
    ipc.quickAccess.setSuspended(suspended);
  }

  /** Open a vault item in the main window's vault view. */
  private async handleOpenItemRequest(id: string) {
    // The vault component owns the view/edit dialog (incl. re-prompt). Navigate there
    // first so its broadcaster subscription is active, then ask it to open the item.
    await this.router.navigate(["/vault"]);
    this.messageSender.send("quickAccessViewCipher", { cipherId: id });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async handleCopyRequest(id: string, field: "username" | "password") {
    const cipher = this.latestViews.find((view) => view.id === id);
    let ok = false;

    if (cipher != null) {
      const valueToCopy = cipher.login?.[field] ?? null;
      if (valueToCopy != null) {
        try {
          ok = await this.copyCipherFieldService.copy(valueToCopy, field, cipher);
        } catch (e) {
          this.logService.error("Quick Access copy failed", e);
          ok = false;
        }
      }
    }

    ipc.quickAccess.sendCopyResult({ id, field, ok });
  }
}

function toQuickAccessItem(view: CipherView): QuickAccessItem {
  return {
    id: view.id,
    name: view.name,
    username: view.login?.username ?? null,
    favorite: view.favorite ?? false,
  };
}
