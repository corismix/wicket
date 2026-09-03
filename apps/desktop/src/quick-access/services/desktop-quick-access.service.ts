import { Injectable, OnDestroy } from "@angular/core";
import {
  catchError,
  combineLatest,
  distinctUntilChanged,
  map,
  of,
  Subject,
  switchMap,
  takeUntil,
} from "rxjs";

import { Account, AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
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

              this.latestViews = views;
              return { status: "unlocked" as const, items: views.map(toQuickAccessItem) };
            }),
          );
        }),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        takeUntil(this.destroy$),
      )
      .subscribe((state) => {
        ipc.quickAccess.updateState(state);
      });

    ipc.quickAccess.onCopyRequest((request) => {
      void this.handleCopyRequest(request.id, request.field);
    });
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
