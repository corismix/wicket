import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";

import { Utils } from "@bitwarden/common/platform/misc/utils";
import {
  AsyncActionsModule,
  ButtonModule,
  DialogModule,
  DialogRef,
  DialogService,
  FormFieldModule,
  IconButtonModule,
} from "@bitwarden/components";
import { I18nPipe } from "@bitwarden/ui-common";

/**
 * Shortcut capture dialog for the Quick Access global hotkey. Looser than the
 * autotype equivalent on purpose: Shift is allowed and Space is a valid base key,
 * because the default hotkey is CommandOrControl+Shift+Space.
 */
// eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection
@Component({
  templateUrl: "quick-access-shortcut.component.html",
  imports: [
    DialogModule,
    CommonModule,
    I18nPipe,
    ButtonModule,
    IconButtonModule,
    ReactiveFormsModule,
    AsyncActionsModule,
    FormFieldModule,
  ],
})
export class QuickAccessShortcutComponent {
  constructor(
    private dialogRef: DialogRef,
    private formBuilder: FormBuilder,
  ) {}

  private shortcutArray: string[] = [];

  setShortcutForm = this.formBuilder.group({
    shortcut: ["", [Validators.required]],
  });

  submit = async () => {
    const shortcutFormControl = this.setShortcutForm.controls.shortcut;

    if (Utils.isNullOrWhitespace(shortcutFormControl.value)) {
      return;
    }

    await this.dialogRef.close(this.shortcutArray);
  };

  static open(dialogService: DialogService) {
    return dialogService.open<string[]>(QuickAccessShortcutComponent);
  }

  onShortcutKeydown(event: KeyboardEvent): void {
    event.preventDefault();

    const shortcut = this.buildShortcutFromEvent(event);

    if (shortcut != null) {
      this.setShortcutForm.controls.shortcut.setValue(shortcut);
      this.setShortcutForm.controls.shortcut.markAsDirty();
      this.setShortcutForm.controls.shortcut.updateValueAndValidity();
    }
  }

  // <https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent>
  private buildShortcutFromEvent(event: KeyboardEvent): string | null {
    const hasCtrl = event.ctrlKey;
    const hasAlt = event.altKey;
    const hasShift = event.shiftKey;
    const hasSuper = event.metaKey; // Windows key on Windows, Command on macOS

    // Require at least one modifier (Control, Alt, Super)
    if (!hasCtrl && !hasAlt && !hasSuper) {
      return null;
    }

    const key = event.key;

    // disallow pure modifier keys themselves
    if (key === "Control" || key === "Alt" || key === "Meta" || key === "Shift") {
      return null;
    }

    // base key: a single letter, or Space
    const isAlphabetical = typeof key === "string" && /^[a-z]$/i.test(key);
    const isSpace = key === " " || key === "Spacebar";
    if (!isAlphabetical && !isSpace) {
      return null;
    }

    const parts: string[] = [];
    if (hasCtrl) {
      parts.push("Control");
    }
    if (hasAlt) {
      parts.push("Alt");
    }
    if (hasShift) {
      parts.push("Shift");
    }
    if (hasSuper) {
      parts.push("Super");
    }
    parts.push(isSpace ? "Space" : key.toUpperCase());

    this.shortcutArray = parts;

    return parts.join("+").replace("Super", "Cmd");
  }
}
