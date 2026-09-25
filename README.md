# Clipboard+

Clipboard+ is a private, local-first clipboard history for Chrome and macOS. The extension classifies text, links, and recognizable code, and provides favorites, search, smart snippets, paste transformations, editing, preview, and one-click copying. Automatic website capture is off until the user reviews the disclosure and grants optional access. The source repository also contains the developer-preview macOS companion; it is excluded from the Chrome Web Store package until a notarized consumer installer is available.

## Development

```bash
npm install
npm run build
```

Load the generated `dist` folder through `chrome://extensions` with **Developer mode → Load unpacked**.

Other useful commands:

```bash
npm run dev
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run test:e2e:store
npm run test:e2e:store:headed
npm run test:native
npm run package:store
```

`npm run build` creates the local development build with Native Messaging support. `npm run build:store` creates the Chrome Web Store profile without Native Messaging or companion UI. `npm run package:store` verifies that profile and writes a manifest-root upload ZIP under `artifacts/`.

The headed store test opens an isolated, disposable Chrome profile and asks you to approve website access, copy two synthetic fixture strings, and press the popup shortcut. It verifies actual optional permission grant, revocation, and recovery without refreshing the fixture. It does not use your regular Chrome profile; the copy checks replace the system clipboard with test text.

Each verified extension version updates the manifest, package metadata, README, changelog, and the public release notes together, then is committed, annotated with a matching tag, and pushed to `main`. The macOS companion version moves only when native code changes, because the companion ships separately from the Chrome Web Store package.

## macOS companion

The companion is currently a developer preview and is not included or advertised as available in the v1.8.0 Chrome Web Store package. It remains part of the permanent free feature set and will return to the public interface after Apple signing, notarization, and consumer installation are complete.

Install and start universal capture with:

```bash
npm run install:companion
```

This installs a local `ClipboardPlus.app` menu-bar companion and Native Messaging host under `~/Library/Application Support/ClipboardPlus`, registers `com.clipboardplus.native` for Chrome, and starts the companion through a LaunchAgent. Reload the unpacked extension afterward.

The installer creates one private, device-local signing keychain under Clipboard+'s Application Support folder. This gives every locally built companion the same macOS identity, allowing Accessibility approval to survive later Clipboard+ updates. The signing identity is used only by the local installer and is not uploaded or shared; uninstalling with `--purge` removes it.

Use the `C+` menu to pause or resume system-wide capture. To remove the companion while preserving its pending queue and signing identity, run `zsh scripts/uninstall-macos-companion.sh`; add `--purge` to remove the queue, log, local history, and signing identity as well.

### Quick Paste

Press **Control-Shift-V** from any application to open the native Quick Paste palette. Start typing to search clip content, titles, source applications, and URLs; use the arrow keys to select a result, then press **Return** to paste it into the application you were using. Press **Command-Return** to copy the result without automatically pasting, **Option-Return** to choose a paste transformation, or **Escape** to close the palette. Selecting a smart snippet opens its fill-in fields before Clipboard+ pastes it.

Every result shows the copied content as the large primary line. When available, its source website, category, and source application appear below it, so page titles never compete with the value that will actually be pasted. The Chrome popup and native palette share the official logo, bundled Satoshi variable font, compact spacing, and flat result-row treatment. Satoshi is supplied by Indian Type Foundry through Fontshare under the included ITF Free Font License.

The first automatic paste asks for Clipboard+ Companion under **System Settings → Privacy & Security → Accessibility**. If permission is declined, Clipboard+ still copies the selected clip so it can be pasted normally. Quick Paste locally mirrors up to 500 clips from Chrome, prioritizing favorites, and also includes new system-wide captures immediately.

Upgrading from 1.5.0 or 1.5.1 resets the old build-specific Accessibility entry once. Double-click a Quick Paste result, enable the newly requested **ClipboardPlus** entry, and try again. Later updates retain that approval.

## Privacy and capture boundaries

- Automatic website capture is off by default. Enabling it records the current disclosure, requests optional access to ordinary HTTP and HTTPS websites, and dynamically registers the page listener. Turning it off removes that website access.
- All Chrome history stays in `chrome.storage.local`; pending developer-preview native captures briefly stay in `~/Library/Application Support/ClipboardPlus` until Chrome imports and acknowledges them. Clipboard+ has no backend, analytics, advertising, or account system.
- The companion monitors the macOS text clipboard locally. It ignores macOS concealed, transient, and autogenerated clipboard types.
- 1Password, Bitwarden, LastPass, KeePassXC, and Keychain Access are excluded by default. Other applications can still place sensitive text on the normal clipboard, so use the `C+` pause control when needed.
- Password fields and fields marked for authentication or payment-card autofill are ignored.
- Without the companion, Chrome internal pages, the Chrome Web Store, browser UI, and desktop applications cannot be captured. The companion sees the resulting system clipboard instead and covers most of those gaps.
- Incognito access is disabled in the manifest.

The public [privacy policy](https://tonys-coding.github.io/ClipboardPlus/privacy.html), [support page](https://tonys-coding.github.io/ClipboardPlus/support.html), and [data-deletion instructions](https://tonys-coding.github.io/ClipboardPlus/data-deletion.html) are maintained from `docs/`.

## Using the extension

- Click a clip to copy it immediately.
- Press the suggested **Alt+Shift+C** shortcut (reassignable on Chrome's shortcuts page) to open Clipboard+ with search focused, then use the arrow, Home, and End keys to move through favorites and recent clips and Enter to copy the focused row.
- Create a smart snippet with named fields such as `Hello {{name}}`; add an optional default with `{{company|Clipboard+}}`. Clicking the snippet asks for each unique field and shows the finished result before copying.
- Open a clip's three-dot menu and choose **Preview** to read the full clip with preserved whitespace, type, size, and source details before copying.
- Choose **Copy original** in the clip menu or preview to copy a smart snippet's stored text exactly, without opening its fill-in fields.
- Open a clip's three-dot menu and choose **Transform & copy** to clean whitespace, format JSON, convert letter case, or remove common tracking parameters from a link. Transformations affect only the copied result, never the saved original.
- Use the three-dot menu to favorite, edit, or delete it.
- Deleting a single clip shows an eight-second **Undo** notice. Clearing history or all data stays confirmed and cannot be undone.
- Use **Add clip** for manual text and URLs, or **Save tab** to store the current page.
- Press **Control-Shift-V** to search and paste from any macOS application.
- On a webpage, right-click selected text or a link and use the dedicated **Save … to Clipboard+** action for a guaranteed capture path.
- Open Settings to pause capture, select automatic-capture categories, control source metadata, exclude domains, set history retention, review local storage usage, or clear saved data.

## Capture troubleshooting

Opening the popup checks page restrictions, optional website access, and the page listener, reinjecting it when Chrome has left an authorized eligible tab without one. Inline notices distinguish checking, off, missing permission, excluded sites, restricted browser pages, pauses, and unreachable listeners. Recovery controls let you open Capture Controls, retry, or resume as appropriate. A pause remains resumable even on a restricted or excluded page. The check repeats when capture settings, optional permission, or a timed pause changes; loading checks are bounded rather than spinning indefinitely.

If capture is unavailable, open Clipboard+ Settings, enable automatic website capture, and approve the optional access request. Clipboard+ activates eligible open website tabs immediately. Browser-owned surfaces—including the address bar, New Tab, Chrome settings, and the Chrome Web Store—cannot expose copy events to extensions. Native **Copy link address** may also bypass the page copy event; use Clipboard+'s own context-menu link action in that case.

## About and troubleshooting

Settings includes an **About & help** section with the runtime manifest version, the current popup shortcut and a link to Chrome's shortcut settings, release notes, and support links. **Copy troubleshooting details** writes a short local checklist — product and version, build profile, capture enabled/paused/consent-current booleans, website-access status, and listener registration health — to the clipboard. It deliberately excludes clip contents and counts, page titles and addresses, excluded domains, identifiers, and raw errors, and Clipboard+ never sends it anywhere.

## Store publication

The verified listing copy and reviewer walkthrough are in `docs/store-listing.md` and `docs/review-instructions.md`. Store artwork is generated with `npm run assets:store`. The first submission is intended for unlisted testing before the same listing is made public.

Developer-account registration, two-step verification, trader classification, and business contact verification must be completed by the repository owner in the Chrome Web Store dashboard. No credentials or legal identity records belong in this repository.

## Monetization boundary

Everything included through v1.8.0 remains free. Bug fixes, security updates, privacy controls, accessibility, data ownership, and browser compatibility are not paid upgrades. A future Pro launch is gated on public demand and is planned around end-to-end encrypted cross-device sync, folders or sessions, encrypted backup and restore, and device management. The target launch price is $3.99 monthly or $29.99 yearly with a 14-day no-card trial; no billing or account code exists in v1.8.0.
