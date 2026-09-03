# Changelog

Clipboard+'s Git history was reconstructed from local development milestones after versions 1.0.0 through 1.4.2 had already been built. Those tags preserve the rollout order; their publication timestamps are intentionally not backdated. Releases from 1.5.0 onward follow the live project history.

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
