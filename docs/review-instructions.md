# Chrome Web Store review instructions

1. Install Clipboard+ and open its Settings page. Automatic capture is initially off and no website permission has been granted.
2. Confirm Add clip, Save tab, search, favorites, editing, deletion, snippets, and transformations work without optional website access.
3. In Settings, select **Enable website capture** and grant access to ordinary HTTP and HTTPS websites.
4. Open a normal webpage, refresh it, select ordinary text, and copy. The copied text should appear in Clipboard+ with its page source.
5. Copy from a password input or an input using a recognized authentication or payment autocomplete purpose. It must not be saved.
6. Verify text, link, and code category controls; the privacy pause; and source-information toggles affect only future automatic captures.
7. Select an automatic-cleanup interval and confirm expired non-favorites are removed while favorites remain.
8. Review the local category counts and storage estimate, then use Clear history and Clear all data to verify local deletion.
9. Turn Automatic web capture off. Confirm Chrome removes the optional website permission and subsequent webpage copies are not saved.
10. Open the popup with the Alt+Shift+C shortcut (or reassign it on Chrome's shortcuts page), confirm search is focused, press the Down arrow to enter the clip list, and press Enter to copy the focused clip. Right-click does not open the preview automatically.
11. From a clip's three-dot menu, open Preview to read the complete clip with preserved whitespace, then use Copy. For a smart snippet, use Copy original to copy the stored `{{field}}` text instead of the filled result, and confirm the saved clip is unchanged.
12. Delete a single clip and confirm the eight-second Undo notice restores it in its original position. Clear history and clear all data remain irreversible. Clipboard+ also shows one accurate capture state — off, missing permission, excluded, restricted, paused, or unreachable listener — with the matching action.
13. Open Settings → About & help. Confirm the manifest version, current shortcut, and shortcut settings link appear, and that Copy troubleshooting details copies a short checklist with no clipboard contents, page addresses, excluded domains, or identifiers.

The v1.8.0 store package has no account, backend, analytics, advertisements, native messaging, remote executable code, or off-device clipboard processing.
