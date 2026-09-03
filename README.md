# Clipboard+

Clipboard+ is a private Chrome clipboard history for text and links. Click any saved item to copy it again, pin favorites, search recent history, edit or delete entries, add clips manually, and save the current tab.

## Development

```sh
npm install
npm test
npm run build
```

Load `dist/` from `chrome://extensions` with Developer mode enabled.

## Optional macOS companion

The menu-bar companion captures copied text from ordinary macOS applications and queues it locally for the extension. It excludes recognized password managers, authentication tools, and other sensitive applications. Run `npm run install:companion` after loading the extension, then follow the installer prompt for its extension ID. Use `zsh scripts/uninstall-macos-companion.sh` to remove the installed companion files.

## Privacy and browser limits

All clips stay in local device storage; Clipboard+ has no account, analytics, or cloud service. Web capture listens only for user-initiated copy events on permitted webpages. Password fields and recognized authentication/payment fields are ignored. Chrome internal pages, extension stores, other restricted pages, and Incognito cannot be captured.
