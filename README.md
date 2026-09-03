# Clipboard+

Clipboard+ is a private Chrome clipboard history for text and links. Click any saved item to copy it again, pin favorites, search recent history, edit or delete entries, add clips manually, and save the current tab.

## Development

```sh
npm install
npm test
npm run build
```

Load `dist/` from `chrome://extensions` with Developer mode enabled.

## Privacy and browser limits

All clips stay in `chrome.storage.local`; Clipboard+ has no account, analytics, cloud service, or clipboard-read permission. Automatic capture listens only for user-initiated copy events on permitted webpages. Password fields and recognized authentication/payment fields are ignored. Chrome internal pages, extension stores, other restricted pages, desktop apps, and Incognito cannot be captured.
