# Clipboard+ product context

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who repeatedly copy and reuse text, links, code, and saved snippets while working in Chrome. The redesigned popup should make reusing recent clips fastest. A developer-preview macOS companion also supports system-wide capture and a quick-paste palette.

## Product Purpose

Clipboard+ keeps useful copied material easy to find and reuse. The core loop is capture or save, find, then click to copy or paste.

## Operating Context

The Chrome extension opens as a compact popup. It has searchable history, a separate Saved area for favorites, text/link/code classification, manual entry, Save tab, preview, editing, smart snippets, transformations, and capture controls. The macOS companion is a developer preview and is not in the Chrome Web Store build.

## Capabilities and Constraints

- Text, URL, and conservative code clips; copied content must be more prominent than source metadata.
- Favorites live separately from All and category-filtered non-favorite history.
- Automatic website capture requires informed consent and optional website access; manual functions work without it.
- Chrome Web Store packaging excludes the native companion. Do not imply universal desktop capture in store-facing UI.
- Local-first storage with no clipboard analytics, account, or backend in the current free release.
- Preserve search, one-click copy, save, and settings workflows during visual exploration.

## Brand Commitments

- Preserve the official supplied Clipboard+ logo at `public/icons/clipboard-plus-logo.png`.
- The current product name is Clipboard+.
- The user prefers the three-pane Workspace prototype as the structural starting point for a redesign, while asking for a more deliberate visual language.
- The live Chrome popup, Capture Controls page, and public website use bundled Hanken Grotesk in the Workspace palette. The macOS companion retains bundled Satoshi.

## Evidence on Hand

- Current extension source and tests under `src/`.
- Existing store screenshots under `store-assets/`.
- Existing logo, category icons, and font assets under `public/`.

## Product Principles

- Make the stored content unmistakably primary.
- Keep capture provenance available without letting it overpower the clip.
- Favor fast retrieval and copying over ornamental controls.
- Keep privacy and permission status truthful.
