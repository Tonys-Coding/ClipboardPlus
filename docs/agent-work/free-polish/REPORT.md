# Clipboard+ v1.8.0 free-polish - implementation report (correction batch 1)

STATUS: accepted by root after correction review and integration checks (not worker self-approved)
Task: `/root/free_polish` (implementation worker; contract owned by root Astra)
Workspace: the Clipboard+ repository root in this workspace
Baseline: clean `0a0e91c` (v1.7.1) plus root's `docs/agent-work/free-polish/PLAN.md`
Contract: `docs/agent-work/free-polish/PLAN.md` (root-owned, unmodified)

This report replaces the first version. It covers the original seven capabilities plus every
correction item in the batched acceptance review, and it states the one environment limitation
with the evidence that proves it.

## Corrections from acceptance review

### 1. Popup refresh and load

- `src/popup/Popup.tsx` now has an explicit `LoadStatus` (`loading` / `ready` / `error`), a
  four-second bound on the initial refresh, and an inline error panel with **Retry loading clips**
  that calls `refresh()` again. A hung or rejected `GET_STATE`/`SYNC_COMPANION` no longer leaves an
  endless spinner or a toast that expires silently.
- Each refresh takes an attempt number; a superseded attempt's late response is discarded, so a
  stale refresh cannot overwrite newer state. A late response from the *current* attempt still
  recovers the popup after a timeout.
- Tests: `replaces an endless spinner with a bounded load error and a working retry`,
  `times out a hung load, and a late response cannot overwrite a newer refresh` (fake timers,
  asserts the stale response is ignored).

### 2. Capture status

- `toggleQuickPause` no longer forces `active`/`paused`; it re-runs the real check and lets the
  resolved conditions decide.
- `probeCaptureListener` validates the reply: `ready !== true` is `unavailable`, `ready` with
  `settingsLoaded !== true` is `loading` (mapped to `checking` with bounded re-probes), so an empty
  or half-initialised reply can never be reported as ready.
- Probing and reinjection now happen only when capture is actually authorized
  (`captureIsAuthorized`: consent current + enabled + website access) and the page is not a known
  restricted page.
- Retries mark `checking`; every check carries an attempt id so a stale check cannot win; the tab
  URL, tab activation, window focus, settings, permissions and timed-pause expiry all trigger a
  recheck.
- The pause notice is now driven by the pause itself, not by the resolved page status, so **Resume**
  stays reachable on excluded and restricted pages while the page state is still reported truthfully.
- Tests: forced-status removal (resume on a restricted page), unauthorized pages never probed or
  reinjected, unstructured reply treated as unavailable, listener-loading settles to active, timed
  pause clears itself without a manual resume, URL-update and tab-activation rechecks.
- Chromium: a real 1.5 s timed pause shows an end time, expires on its own, and capture resumes
  (`timedPauseNotice`, then a capture from the fixture page after expiry).

### 3. Undo

- `restoreDeletedClip` returns a new `capacity` outcome instead of silently pruning the restored
  record, and never displaces a newer capture; the popup surfaces the message from the worker.
- Ordering fixed both ways: the deletion is written durably **before** the tombstone is created
  (a failed deletion cannot produce a valid undo), and the tombstone is consumed only **after** the
  restored state is written (a failed restore keeps the offer for a retry inside its window).
- `readTombstone` drops an expired tombstone instead of retaining the deleted clip, and the hourly
  maintenance alarm now also clears it.
- New `src/background.test.ts` drives the real service-worker message handler with mocked
  `chrome.storage.local`/`session`, `scripting` and `permissions`: durable delete before undo,
  failed delete offers no undo, repeated delete replaces the offer, replayed token rejected, bulk
  clear invalidates, content-script sender rejected, failed restore keeps the offer, capacity
  reported without dropping newer clips, a capture arriving between delete and undo is preserved,
  expired tombstones dropped on read and during maintenance, external revocation disables capture
  and unregisters the listener, unrelated removals ignored.

### 4. About and help

- `src/options/Options.tsx` collects a live status snapshot (state, website access, listener
  registration, current shortcut, runtime version) and refreshes it on local storage changes,
  permission add/remove events, window focus, and immediately before every troubleshooting copy, so
  the report cannot describe a stale state. Unknown/failed checks report `unknown` honestly and a
  failed state read copies nothing with a clear message.
- `Consent current` now uses the same semantics as capture authorization
  (`hasCurrentCaptureConsent`: version **and** recorded timestamp), shared with
  `captureIsAuthorized`.
- Diagnostics feedback is announced through a `role="status" aria-live="polite"` region.
- Support links now point at the public Pages support page and a new public
  `docs/release-notes.html` (added with the existing site CSS/nav, linked from `index.html` and
  `support.html`), because the repository is private and GitHub `/releases` and `/issues` are not
  reachable by store users.
- Tests: live status re-read after a change elsewhere, shortcut refreshed after returning from
  Chrome shortcut settings, consent not current without a timestamp, unknown status copies nothing,
  polite live announcement, redacted report.

### 5. Accessibility

- Dialog-to-dialog handoffs (Preview → Fill fields, Transform → Fill fields) keep the original
  opener: the popup records the control that started the sequence and restores it when the last
  dialog closes, after the background leaves `inert`.
- The Undo notice moved inside `.popup-content`, so background controls are inert while a dialog is
  open (the toast and live region stay outside so they can still be announced).
- Keyboard deletion moves focus to the nearest surviving row, or to search when nothing is left, and
  the next Enter still copies.
- Row labels are a short excerpt (`Copy text clip: …`, 80 characters plus an ellipsis) instead of up
  to 50k characters.
- Tab/Shift+Tab now leave the menu for the next/previous control with focus intact instead of
  unmounting the menu and dropping focus to `<body>`.
- Chromium evidence: Home/End leave `:focus-visible` on list rows and menu items, Tab leaves the
  menu on the next clip row, Escape returns focus to the trigger, the preview trap holds across
  eight Tabs, and a keyboard deletion keeps focus on a row that still copies.

### 6. End-to-end acceptance

- **Playwright semantics verified in the installed source** (`playwright-core` 1.62.1,
  `waitForFunctionExpression`): the injected predicate runs `const success = predicate(); if
  (success) { fulfill(success); return; }`, so an `async` predicate fulfils immediately with its own
  Promise and every such wait passed without polling. That explains the previous false positives.
  Both smoke tests now use `scripts/e2e-helpers.mjs#pollUntil` (explicit awaited polling with
  descriptive failures) instead of async predicates.
- **Store permissions traced, not reinterpreted.** On a fresh store profile the "Enable website
  capture" click leaves `chrome.permissions.contains` false for 16 samples over 8 s with no settings
  write and no registration, while `Target.getTargets` shows only
  `service_worker, page, page, page, page, page` - headless Chrome for Testing never surfaces the
  optional-host-permission prompt, so `chrome.permissions.request()` never resolves. A pre-seeded
  profile `Preferences` entry was also ignored (probe returned `contains: false`). The store test
  therefore *asserts* that Clipboard+ never grants access by itself, never registers a listener,
  never stores a page copy without access, and reports the missing-permission state truthfully.
- The authorized lifecycle runs in the development profile, where website access is a real,
  sustained grant: capture on an already-open tab, capture after a self-expiring pause, capture
  after the user disables and re-enables capture on that same tab without a reload, and
  `chrome.permissions.remove` evidence (`"You cannot remove required permissions."`, access stays
  granted, listener stays registered).
- Copied bytes are verified from the real clipboard (fixture origin granted
  `clipboard-read`/`clipboard-write`): keyboard row copy, snippet fill-in, and **Copy original** all
  match the stored content exactly.
- The suggested shortcut is verified as registered (`⌥⇧C` on macOS); pressing it is attempted and
  the result recorded honestly (`headless-chromium-does-not-surface-action-popups`, with the page
  delta and target types as evidence), because headless Chromium cannot render an action popup.
- Preview typography is asserted in Chromium: text/URL previews keep the Satoshi body font with
  whitespace preserved, code previews keep the monospace face.

### 7. Hygiene

- Absolute developer paths scrubbed from new artifacts (`captureStatus.test.ts` uses
  `file:///tmp/notes.txt`; this report names no user directory).
- `scripts/install-macos-companion.sh` now prints a version-neutral "Reload Clipboard+ in
  chrome://extensions".
- `README.md` states that the native companion version only moves when native code changes.
- The native companion binary stays at 1.7.1 (no native changes were made); the previously listed
  "next checkpoint" advice was removed from this report.
- Screenshots remain synthetic (generated by the smoke test from fixture content).

## Verification (all commands run in this workspace)

| Command | Exit | Salient result |
| --- | --- | --- |
| `npm run typecheck` | 0 | app and node projects clean |
| `npm run lint` | 0 | 0 warnings, 0 errors |
| `npm test` | 0 | 10 files, 103 tests passed |
| `npm run test:e2e` | 0 | development build + validator (17 referenced files, 22 packaged files) + dev Chromium E2E; run twice in a row with the same result |
| `npm run test:e2e:store` | 0 | store build + validator + store Chromium E2E |
| `npm run package:store` | 0 | `artifacts/clipboard-plus-v1.8.0-store.zip` |
| `unzip -t artifacts/clipboard-plus-v1.8.0-store.zip` | 0 | no errors, manifest at ZIP root, 25 files, no maps or native artifacts |

Both smoke tests now refuse to run against the wrong build profile (they check the loaded manifest
for required host permissions/Native Messaging), so a stale `dist` fails fast instead of producing a
confusing timeout.

Dev Chromium summary: `popupShortcut: "⌥⇧C"`; `keyboardClipboardBytesMatchStoredContent: true`;
`copyOriginalClipboardBytesMatchStoredSnippet: true`; `listHomeEndFocusVisible: true`;
`menuHomeEndFocusVisible: true`; `menuTabExitFocus: "Copy text clip: Captured without source
details"`; `deleteKeepsKeyboardFocus: true`; `previewFonts.text` = Satoshi; `previewFonts.code` =
monospace; `previewExactContent: 950`; `undoRestoredSameRecord: true`;
`bulkClearInvalidatesUndo: true`; `timedPauseNotice: true`; `captureOffAndRecovered: true`;
`captureRecoveredOnOpenTab: true`; `aboutVersion: "1.8.0"`; `troubleshootingRedacted: true`;
`shortcutEvidence` and `externalRevocationEvidence` as quoted above.

Store Chromium summary: `defaultCapture: "off"`, `websiteOrigins: 0`,
`registeredContentScripts: 0`, `nativeMessaging: false`, `noGrantBeforeConsent: true`,
`manualClipFlows: true` (add, snippet fill-in with exact clipboard bytes, preview with Satoshi and
exact content, transform, delete + undo restoring the same record), `troubleshootingRedacted: true`,
`capturedWithoutAccess: false`, `popupCaptureNotice: "Website access is off, so copies on websites
are not saved."`, `permissionRemoveWithoutGrant: true`, and the `optionalGrantEvidence` string
quoted above.

## Outstanding risks and limitations

1. Optional host permissions cannot be granted in this harness: headless Chrome for Testing never
   shows the prompt, so `chrome.permissions.request()` stays pending and `chrome.permissions.remove`
   on a required permission throws. The store suite therefore proves the *no-auto-grant* contract
   and the truthful missing-permission state, while the granted lifecycle (including disable and
   re-enable with capture on the same already-open tab) is proven in the development profile. A
   headed Chrome session with a real prompt is the only way to exercise the store grant end to end.
2. The popup's capture check depends on `chrome.tabs.query` exposing the active tab URL; when Chrome
   withholds it the popup falls back to permission and listener checks by design rather than guessing
   that the page is restricted.
3. Accessibility coverage is behavioural (focus, inert, live regions, `:focus-visible`), not a
   screen-reader or axe audit.
4. `npm run test:native` was not run because no shared contract or native source changed.
5. ZIP hashes change on every repackage because `zip` stores build timestamps.

Latest local ZIP hash for reference: `e2d274372730a003d019718db442db049ebff57d4427bf7e72bf4973d602d4ca`
(regenerate at release time and record that value instead).

## Decisions for Astra

1. The native companion stays at 1.7.1 with version-neutral installer text; bump it in the same
   commit only if a native change is included.
2. The About section renders Chrome's own shortcut string (`⌥⇧C` on macOS).
3. Public docs: `docs/release-notes.html` was added and linked from About, `index.html` and
   `support.html` using `https://tonys-coding.github.io/ClipboardPlus/release-notes.html`; root owns
   publishing the whitelist to the separate public site repository.

## Root acceptance addendum — September 24, 2026

The historical worker evidence above is retained; this addendum supersedes its outstanding
headed-browser limitation and preliminary package hash.

- Completed `scripts/e2e-store-headed.mjs` in a fresh disposable Chrome for Testing profile.
  A real native permission prompt was approved; website access persisted; Command+C captured
  synthetic text from a tab opened before consent. Alt+Shift+C opened an actual POPUP context.
  Intentional API revocation disabled capture and removed registration. Explicit UI re-enabling
  restored access/registration and Command+C capture on the same tab without a reload. Chrome
  reused the earlier approval on regrant instead of showing a second prompt. No real history or
  user browser profile was used. The system clipboard was used for synthetic test strings.
- Final bounded integration corrections: exhaust listener-loading retries into an actionable
  unavailable state; reset the retry budget on manual/event retry; respect listener exclusion,
  pause and enabled flags when the tab URL is withheld; protect live storage changes from stale
  initial snapshots; re-read listener registration after settings writes finish; clarify the
  history-capacity Undo error without suggesting another deletion that replaces the Undo token.
- Added five regression tests for these cases. Final suite: **108 tests in 10 files passed**.
  Type checking, linting, both development/store builds and validators, development/store Chromium
  smoke tests, packaging, and ZIP inspection passed again after integration corrections. The
  headed test preceded those narrow UI/status fixes; capture authorization and shortcut handling
  were unchanged, and both automatic browser suites were rerun on the final code.
- Final ZIP: `artifacts/clipboard-plus-v1.8.0-store.zip`, 22 files plus three directory entries;
  manifest at root; no source maps, native binaries, developer scripts, credentials, or logs.
  SHA-256: `5b2ba55857cdd2a8141b976de08e33cc75f699140bf628a6eeaf87ca33e2a630`.
- Root reviewed source, tests, synthetic preview/About screenshots, and privacy boundaries.
  All seven scoped free improvements accepted. Native companion remains 1.7.1 and was not rebuilt.
  Behavioural accessibility checks are not a screen-reader audit. Chrome Web Store submission
  is intentionally not performed; packaged/unlisted Store installation awaits owner upload/review.
