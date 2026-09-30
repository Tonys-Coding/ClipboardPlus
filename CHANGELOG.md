# Changelog

Clipboard+'s Git history was reconstructed from local development milestones after versions 1.0.0 through 1.4.2 had already been built. Those tags preserve the rollout order; their publication timestamps are intentionally not backdated. Releases from 1.5.0 onward follow the live project history.

## 1.8.2

- Build the Chrome Web Store profile into `dist-store` so running the store build or its validation, packaging, asset, and end-to-end scripts never overwrites the development `dist` folder that is loaded as the unpacked extension. The two profiles can be built in any order and each keeps its own manifest, so the development build retains Native Messaging while the store build excludes it.
- Import queued companion captures in the development profile in the background on service-worker startup and on a one-minute alarm, so new system-wide copies reach history even when the popup and Settings page are closed.
- Route every companion sync through one serialized queue, so overlapping startup, alarm, popup, and Settings triggers import each capture once, never acknowledge a capture before its storage write succeeds, and retry on the next trigger after a failure.
- Keep the public store permission profile unchanged and confirm the store bundle contains no native host calls after tree-shaking.

## 1.8.1

- Keep favorite clips exclusively in the Saved section instead of repeating them in All or the text, link, and code sections.
- Make the All and category counters reflect only non-favorite history, while Saved continues to show the complete favorite count.

## 1.8.0

- Add keyboard access: the suggested, user-customizable Alt+Shift+C shortcut opens Clipboard+ and focuses search, and the arrow, Home, and End keys move through the visible favorites and recent clips without disturbing typing.
- Add an eight-second Undo for individual clip deletion. Bulk clearing stays confirmed and irreversible, and restoration validates an expiring extension-internal token before it restores the original clip, timestamps, favorite state, and metadata.
- Add a read-only Preview dialog that shows the complete clip with preserved whitespace, type, size, and source details.
- Add Copy original for smart snippets in the clip menu and the preview, copying the stored text exactly and bypassing fill-in fields and paste transformations.
- Distinguish checking, active, paused, excluded, restricted, missing permission, disabled, and unreachable listeners, with relevant recovery controls and rechecks after settings, permission, pause, and timer changes.
- Bring shared keyboard and focus behavior to the edit, preview, snippet, and transformation dialogs and to clip menus, keep one menu open at a time, and announce copy success through a polite live region.
- Add an About and help section with the runtime version, current shortcut and shortcut settings, release notes, support links, and a redacted troubleshooting copy that never includes clipboard contents, page addresses, excluded domains, or identifiers.

## 1.7.1

- Activate automatic capture immediately in eligible website tabs that were already open when access was enabled or Clipboard+ was updated.
- Continue past restricted or unavailable tabs without interrupting capture elsewhere.
- Add browser regression coverage for enabling capture without refreshing the current webpage.

## 1.7.0

- Add automatic cleanup after 24 hours, 7 days, 30 days, or 90 days while always preserving favorites.
- Add independent automatic-capture controls for text, links, and recognizable code.
- Add temporary privacy pauses, an indefinite pause, and a one-hour quick pause in the popup.
- Let users omit website addresses, page titles, and the Chrome source label from future automatic captures.
- Add an on-device storage overview with category totals, favorite count, approximate usage, oldest clip, and cleanup actions.
- Run local retention maintenance hourly and whenever Clipboard+ reads its stored state.

## 1.6.3

- Add an interactive top-mounted spotlight that follows pointer movement across the Capture Controls page.
- Replace the abstract side cards with the supplied individual Clipboard+ artwork, arranged as independently floating objects.
- Preserve a quiet center workspace, hide the side objects when space is limited, and disable their motion when reduced motion is requested.
- Add regression coverage for spotlight movement and the supplied artwork.

## 1.6.2

- Frame the Capture Controls page with responsive Clipboard+-themed side artwork on wide displays.
- Build the decoration from layered clipboard cards, content-type symbols, connector rails, and a subtle logo watermark.
- Keep the visuals non-interactive, hide them when space is limited, and disable their restrained motion when reduced motion is requested.

## 1.6.1

- Add first-run disclosure and affirmative consent before automatic website capture.
- Default automatic capture to off and pause legacy capture until the current disclosure is accepted.
- Move HTTP and HTTPS access to optional host permissions and dynamically register the capture listener only while authorized.
- Remove optional website access when automatic capture is disabled and recover cleanly when permission is revoked elsewhere.
- Add separate development and Chrome Web Store build profiles; compile Native Messaging and companion controls out of the store package.
- Add public privacy, support, and local data-deletion pages, verified store listing copy, reviewer instructions, and reproducible store packaging.
- Keep all v1.6 functionality permanently free and document the validation gates for a future encrypted-sync subscription.

## 1.6.0

- Add reusable smart snippets with `{{field}}` placeholders, optional `{{field|default}}` values, duplicate-field reuse, and a live result preview.
- Open the fill-in workflow automatically when a snippet is selected in either the Chrome popup or native Quick Paste palette.
- Add non-destructive paste transformations for whitespace cleanup, formatted JSON, uppercase, lowercase, title case, and tracking-parameter removal.
- Add **Transform & copy** to Chrome clip actions and **Option-Return** transformations to the native palette.
- Keep all snippet values and transformations local, ephemeral, and separate from the saved original.
- Add browser, unit, and native regression coverage for snippet rendering and transformations.

## 1.5.4

- Replace Syne with the Satoshi variable family throughout the Chrome popup and settings page.
- Bring the same bundled Satoshi typography to the macOS Quick Paste palette and menu-bar companion.
- Include the official ITF Free Font License and verify the native font asset during installation.
- Add browser regression coverage that confirms Satoshi is loaded and applied rather than falling back to a system font.

## 1.5.3

- Replace the Chrome popup's tall bordered cards and capture rail with compact, flat Quick Paste-style rows.
- Reduce oversized controls and spacing while retaining the popup's larger history capacity.
- Bring the official Clipboard+ logo and bundled Syne variable font into the native Quick Paste window.
- Package and verify native brand assets during companion installation.

## 1.5.2

- Sign the macOS companion with a persistent, device-local identity instead of a build-specific ad-hoc identity.
- Preserve Accessibility approval across future companion updates.
- Reset the stale ad-hoc Accessibility record once during migration so macOS can bind approval to the stable app identity.
- Verify the installed app's signature before starting the companion.
- Add a signed companion diagnostic that checks or requests Accessibility access without opening the Quick Paste window.

## 1.5.1

- Make the copied content the large, bold primary line in every Chrome and macOS Quick Paste row.
- Move the source website, clip category, and source application into a consistently ordered secondary line.
- Keep page titles available to search without allowing them to replace the copied content in the interface.
- Add regression coverage for browser and native clip presentation.

## 1.5.0

- Add a global macOS Quick Paste palette opened with Control-Shift-V.
- Search favorites and recent clips by content, title, source application, or URL.
- Paste with Return, copy without pasting with Command-Return, and navigate entirely from the keyboard.
- Mirror the 500 most relevant Chrome clips into local companion storage while retaining immediately captured native clips.
- Fall back to copying and prompt for macOS Accessibility permission when automatic pasting is unavailable.

## 1.4.2

- Keep an open clip-action menu above later history rows.
- Open action menus upward when there is not enough space below them.
- Add regression coverage for menu stacking and positioning.

## 1.4.1

- Apply the bundled Syne variable font to every interface control.
- Remove unnecessary header and connection-status wording.
- Simplify clip metadata while preserving actionable warnings.

## 1.4.0

- Classify recognizable code while retaining exact plain-text content.
- Add supplied text, URL, and code classification icons.
- Add type filters, live counts, the capture-rail interface, and storage schema v2 migration.

## 1.3.0

- Introduce the official Clipboard+ logo and bundled Syne font.
- Expand the popup and adopt the dark graphite-and-gold interface.
- Add relative timestamps and align the settings page with the new identity.

## 1.2.0

- Add the optional macOS menu-bar companion for system-wide text capture.
- Add the local Native Messaging bridge, pending queue, installer, uninstaller, and sensitive-app exclusions.

## 1.1.0

- Harden webpage capture with listener health checks and reinjection.
- Add context-menu actions for selected text and links.
- Improve duplicate handling, restricted-page feedback, and browser integration tests.

## 1.0.0

- Launch the Manifest V3 extension with local text and URL history.
- Add favorites, search, editing, deletion, manual entry, save-current-tab, history limits, exclusions, and settings.
- Capture user-initiated webpage copy events while ignoring recognized sensitive fields.
