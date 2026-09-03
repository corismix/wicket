# AGENTS.md

Bitwarden `clients` monorepo (browser/desktop/web/cli + shared `libs/`), forked as **Wicket** (desktop rebrand + Quick Access panel). Upstream docs: https://contributing.bitwarden.com/.

## Setup and commands

- Requires Node 24 (`cat .nvmrc`), npm ~11 (`engines` in `package.json`). Install with `npm ci` (`.npmrc` uses `save-exact=true`; do not add caret ranges).
- Lint all: `npm run lint` (eslint + `prettier --check .`). Fix: `npm run lint:fix`. Format: `npm run prettier`. Scoped: `npx nx lint <project>` (e.g. `npx nx lint cli`).
- Test: `npm test -- <path-or-pattern>` for localized Jest runs (e.g. `npm test -- libs/guid`); full suite is `npm test`. Scoped alt: `npx nx test <project>`.
- Type-check: `npm run test:types` (`tsc --noEmit` per lib + `tsc-strict`). Also `npm run test:locales`, `npm run lint:dep-ownership`, `npm run lint:sdk-internal-versions` (all enforced in CI).
- Build/serve via Nx: `npx nx build|serve|test|lint <project>` (e.g. `npx nx build cli`). Default config is `oss-dev`; add `--configuration=commercial-dev` (dev) or `commercial`/`oss` (prod) for licensed builds. Legacy libs need the `@bitwarden/` prefix (`npx nx build @bitwarden/common`). See `docs/using-nx-to-build-projects.md`.
- Desktop Rust (`apps/desktop/desktop_native`): `npm run lint:rust` / `npm run lint:rust:fix`. Do not run plain `cargo fmt`/`clippy`; use `scripts/run-cargo-tool.mjs` wrappers (see `lint-staged.config.mjs`).

## Architecture and boundaries

- `apps/<browser|cli|desktop|web>/` is single-client code; shared code goes as deep/narrow as possible and is promoted to `libs/` only on second use. `bitwarden_license/` is the commercial overlay.
- `libs/common/` is shared with non-Angular clients (CLI): no `@Injectable`, `inject()`, decorators, or template refs. Angular-shared code lives in `libs/angular/`. Cross-package rules are enforced by `eslint.config.mjs` (`*_FORBIDDEN_PACKAGES`); `nx.json` governs build/test targets.
- Per-app constraints: before touching an app or special area, read its instruction file: `apps/desktop/CLAUDE.md` (main vs renderer/IPC), `apps/browser/CLAUDE.md` (`BrowserApi`, Safari tab bugs, MV3 service worker), `apps/cli/CLAUDE.md` (`BW_RESPONSE`/`BW_QUIET`/`BW_CLEANEXIT`, `CliUtils.writeLn`), `apps/web/CLAUDE.md` (no extension APIs, org guards), `.claude/rules/autofill-content-scripts.md` (no Angular, Lit only). Shared patterns: `.claude/rules/{angular,angular-components,typescript,tailwind,testing,i18n}.md`.
- When adding a cipher type, follow `docs/cipher-types.md` (5-layer model stack + switch-statement catalog).

## Wicket fork deltas (do not regress)

- Desktop rebrand: `productName` Wicket, `appId` `com.wicket.desktop` in `apps/desktop/electron-builder*.json` so it installs alongside stock Bitwarden.
- Auto-updates are hard-disabled: `wicketUpdatesDisabled = true` in `apps/desktop/src/main/updater.main.ts` plus no `publish`/`generateUpdatesFilesForAllChannels` in either electron-builder config. Never restore the upstream `https://artifacts.bitwarden.com/desktop` feed.
- Quick Access (global-hotkey vault search): all feature code under `apps/desktop/src/quick-access/` (`main/` = main process, `services/` = renderer, `panel/` = panel window, `models/ipc-channels.ts` = IPC contract). Upstream files get wiring edits only. The main-process projection is secrets-free (`QuickAccessItem`: id/name/username/favorite only); copies are fulfilled in the renderer via `CopyCipherFieldService`. Never send vault secrets or keys over IPC.

## Silent footguns

- Tailwind classes require the `tw-` prefix (`tw-flex`); unprefixed classes are silently ignored. No arbitrary values (`tw-[12px]`), theme tokens only (see `.claude/rules/tailwind.md`).
- Filenames must be lowercase (CI diffs against `.github/whitelist-capital-letters.txt`); never use code regions; new enums forbidden, use frozen const objects per ADR-0025 (`.claude/rules/typescript.md`).
- Security: never add new encryption logic without the Key Management team; never send unencrypted vault data to APIs; never log decrypted data, keys, vault data, or PII.
- i18n: edit only the `en` `messages.json`; shared-lib strings must be added to every consuming app's `messages.json` (Crowdin owns the rest).

## Generated, vendored, local-only paths

Do not hand-edit: `**/dist`, `**/build`, `coverage`, `.angular`, `storybook-static`, `apps/browser/src/_locales`, `apps/browser/src/safari`, `apps/{desktop,cli}/src/locales`, `apps/web/src/locales`, `apps/desktop/desktop_native` (Rust workspace), `apps/desktop/dist-safari`. Local-only (gitignored): `apps/**/config/local.json`, `base/`, `.nx/`, `junit.xml`, `.env` files. Never commit secrets.

## Done means

`npm run lint:fix`, `npm run prettier`, `npm run test:types`, plus targeted `npm test -- <affected-path>` all pass. Run `npm run lint:dep-ownership` when adding cross-package imports and `npm run test:locales` when touching locale files. Do not skip hooks or bypass failures.
