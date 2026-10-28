# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Chrome extension (Manifest V3) for design review of live websites. A designer or QA engineer picks elements on a page the way DevTools Inspect does, writes what is wrong, sets a severity, and exports a report (self-contained HTML or PDF) with annotated screenshots, element selectors and computed styles.

Built with React 19 + TypeScript + Vite via `@crxjs/vite-plugin`. State in Zustand; settings persisted through `chrome.storage.sync`, review sessions and screenshots in IndexedDB owned by the service worker. UI is Tailwind v4 with our own small primitives in `src/ui/` (no shadcn / Radix) and `@floating-ui/react` for positioning. i18n via i18next (English and Russian, English default). Validation with Zod.

Contexts: popup, MV3 background service worker, content script (injected on demand, renders everything inside a Shadow DOM), and the report page (`src/report/`).

Package manager: **yarn** (corepack). Node 22.

### Private planning docs

If a `.ai/` folder exists at the repo root, read it before starting work:

- `.ai/spec.md` — product spec with acceptance criteria (AC)
- `.ai/tasks.md` — feature breakdown, the per-feature process and the report template

`.ai/` is git-ignored and must never be committed or referenced from committed code or docs.

## Commands

Build / dev:

- `yarn dev` — dev build; load `dist/` as unpacked in `chrome://extensions`
- `yarn build` — production build (`tsc -b && vite build`) → `dist/` and `release/design-review-<version>.zip`
- `yarn build:e2e` — E2E build (`VITE_E2E=1`) → `dist-e2e/` (see **E2E build**)
- `yarn check` — Biome lint + format check (run before every commit; husky runs it)
- `yarn lint:fix` / `yarn format` — Biome autofix / format
- `yarn bundle:report` — composition of `content.js` by package and module (in-memory build with a sourcemap); the budget itself is in `tests/contracts/bundle.test.ts`

Tests:

- `yarn test` — Vitest unit + contract tests (environment `node` by default; files opt into `jsdom` with `// @vitest-environment jsdom`)
- `yarn test:coverage` — thresholds 70/70/60/70
- `yarn test:e2e:local` — Playwright against `dist-e2e/`, project `chromium-mac`
- `yarn test:e2e:update-snapshots` — refresh local mac baselines
- `*:ci` variants run under `xvfb-run` with project `chromium-ci` (Linux baselines)
- **Run `yarn build:e2e` before any Playwright command.**
- Visual baselines live per environment under `chromium-mac/` and `chromium-ci/` next to each spec. Never overwrite `chromium-ci` baselines from a Mac — use the `Update Visual Snapshots` workflow or the `*:ci` scripts.

## Architecture

### Layout

- `manifest.config.ts` — MV3 manifest. Permissions: `activeTab`, `scripting`, `storage`, `unlimitedStorage`. No host permissions in production.
- `src/background/` — service worker: commands, injection, `captureVisibleTab`, IndexedDB (`db.ts`), session migration, message handling
- `src/content/` — injected UI: overlay (toolbar, panel, issue form, markers), picker (live + snapshot), area select, crop, hotkeys, SPA navigation tracking
- `src/popup/` — home, settings, restricted-page state, scope migration dialog
- `src/report/` — extension page that renders the report and exports HTML / PDF (pdfmake)
- `src/ui/` — our primitives: Button, Segmented, Menu, Tooltip, Dialog, Checkbox, Kbd, Badge
- `src/shared/` — model, Zod schemas, typed messaging, `sessionKey`, color formatting
- `src/services/chrome/` — guarded wrappers over `chrome.*`
- `src/store/` — Zustand stores; settings use `withChromeSync`
- `src/i18n/` — i18next; resources in `src/i18n/resources/<lang>/<namespace>.json`
- `public/_locales/` — only manifest / store strings (`__MSG_*__`)
- `tests/` — `setup.ts`, `constants/testIds.ts`, `helpers/extension.ts`, `mocks/`, `fixtures/site/` (static test site), `contracts/`, `unit/`, `e2e/`

Path aliases: `@/*` → `src/*`, `@tests/*` → `tests/*`.

### Context boundaries

- **Only the background touches IndexedDB.** Content, popup and report go through messages. Enforced by a contract test.
- **`src/shared/messaging.ts` is the only wire contract** between contexts. Every message is a member of one discriminated union and is validated with Zod on both ends.
- Background listeners register **synchronously at the top level** of `src/background/index.ts`. A listener attached behind an `await` misses the event that woke a cold worker.
- Outside the extension context (unit tests) `chrome.*` may be `undefined` — always go through `src/services/chrome/`.

### Sessions

A session is keyed by `sessionKey(url, scope)`:

- `domain` (default): `origin`
- `page`: `origin + normalized pathname`, no query, no hash

`scope` is fixed on the session at creation. Every issue stores its own `pageUrl`, `pagePath`, `pageTitle` and `env`. Issue numbers are sequential per session and never reused.

### Picker and snapshot

The picker reads from a `PickSource` — either the live DOM (`elementsFromPoint`) or a snapshot (screenshot + geometry and styles of visible nodes captured at freeze time). Box model, tooltip, arrow-key navigation, area select and cropping must work identically on both sources. Do not reach into the live DOM while a snapshot is active.

Clicks on the host page are blocked only while the picker is active: capture-phase listeners on `window`, `preventDefault` + `stopImmediatePropagation`.

### E2E build

Playwright cannot click the extension action, and without a user gesture `activeTab` is never granted. The E2E build (`VITE_E2E=1`, output `dist-e2e/`) therefore adds `host_permissions: ['<all_urls>']` and exposes `globalThis.__drE2E` in the service worker so tests can start a review on a tab. **None of this may reach `dist/`** — contract tests check the built production manifest and bundle.

## Shadow DOM styling rules

Our overlay lives on arbitrary third-party pages. These rules are not optional:

- **No `rem`.** Sites set `html { font-size: 62.5% }` and similar. The Tailwind theme uses px for `--spacing` and the type scale.
- Design tokens are CSS variables declared on `:host` (overlay) and `:root` (popup, report).
- Tailwind v4 relies on `@property`, which is not registered inside a shadow root — provide fallbacks for the `--tw-*` variables on `:host`.
- Overlay CSS is compiled to a string (`?inline`) and attached via `adoptedStyleSheets`. No `<link>` to extension URLs, no inline `style` injection into the host document.
- Every floating element (menus, tooltips, dialogs) renders into a container inside our shadow root, never into `document.body`.
- Root container: `all: initial`, `z-index: 2147483647`.
- Never use `innerHTML` with page-derived strings. Selectors, text and attribute values from the host page are untrusted.

## Conventions

- **TypeScript strict everywhere.** `import type` for types, no `any` without a comment explaining why, unused vars prefixed `_`.
- Biome is the single linter / formatter (`biome.json`): no semicolons, single quotes, trailing commas, width 100, indent 2. No `console` except `warn` / `error`.
- Every UI string goes through i18next, in English and Russian. Key sets must match (contract test).
- Every interactive element gets a `data-testid` from `tests/constants/testIds.ts`.
- Accessibility: real `<button>`, `<input>`, `<label>`; `aria-label` on icon-only buttons; severity is never conveyed by color alone (color + marker shape + text).
- **Local-first.** No network requests, analytics or remote code. Nothing leaves the user's machine except files the user exports.
- **Permissions.** Do not add manifest permissions without explicit approval — they change the install prompt and store review. If permissions, storage or data handling change, update `privacy.html` and the README permissions section in the same PR.
- Don't store binary data in `chrome.storage`; screenshots go to IndexedDB as Blobs.
- Commits follow Conventional Commits: `feat(picker): …`, `fix(snapshot): …`, `test(e2e): …`, `docs: …`, `chore: …`.

## Workflow

Branches: `feature/<meaningful-name>` or `fix/<meaningful-name>` (CI enforces the prefix). No `stage-N` names.

For each feature:

1. Branch from fresh `main`.
2. Implement task by task; after each task run `yarn check && yarn test && yarn build`.
3. If the feature touches the browser: `yarn build:e2e && yarn test:e2e:local`.
4. Run `/review` on your own diff against the spec and the feature's AC; fix what it finds.
5. Run `/security-review`; fix what it finds.
6. Write the report (template in `.ai/tasks.md` when available) and **stop**. Do not start the next feature without an explicit go-ahead.

If the spec is ambiguous or contradicts the code, do not pick silently — list it under "Deviations / open questions" in the report and ask.

## CI

GitHub Actions in `.github/workflows/`:

- `build.yml` — `yarn check` + `yarn build`
- `tests.yml` — Vitest, then `yarn build:e2e` + Playwright (`chromium-ci`) in the Playwright container
- `update-visual-snapshots.yml` — manual refresh of `chromium-ci` baselines
- `release.yml` — on a `v*` tag: tag must match `package.json` version, tests, build, GitHub Release with the zip
- `branch-naming-policy.yml`, `validate-pr-body.yml`, `validate-issue-template.yml` — repo hygiene; PR and issue templates are bilingual (RU / EN)
