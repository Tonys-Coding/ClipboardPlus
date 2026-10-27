---
name: Clipboard+ Popup
description: A technical reference folio for finding and reusing clips in Chrome.
colors:
  petrol-rail: "#173744"
  rail-ink: "#f5f8f5"
  rail-muted: "#bdd0d0"
  ink: "#1c3038"
  muted-ink: "#586b72"
  quiet-ink: "#718187"
  paper: "#ffffff"
  chalk-canvas: "#f3f5f3"
  rule: "#dce4e4"
  focus-gold: "#b3830f"
  focus-gold-dark: "#674700"
  selected-paper: "#fff8e7"
  danger: "#ac3f34"
  success: "#247354"
  dark-ink: "#eaf1ef"
  dark-paper: "#14282f"
  dark-canvas: "#0e1d24"
  dark-rule: "#344b53"
typography:
  heading:
    fontFamily: '"Hanken Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "16px"
    fontWeight: 730
    lineHeight: 1.25
    letterSpacing: "-.02em"
  clip-title:
    fontFamily: '"Hanken Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: '"Hanken Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "13px"
  label:
    fontFamily: '"Hanken Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "11px"
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.55
rounded:
  tight: "3px"
  nav: "4px"
  control: "5px"
  search: "6px"
  dialog: "8px"
  popup-frame: "14px"
spacing:
  compact: "8px"
  row: "13px"
  section: "16px"
  detail: "18px"
components:
  button-primary:
    backgroundColor: "{colors.petrol-rail}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    height: "37px"
    padding: "0 13px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "37px"
    padding: "0 13px"
  search-field:
    backgroundColor: "#f7f9f8"
    textColor: "{colors.ink}"
    rounded: "{rounded.search}"
    height: "39px"
    padding: "0 11px"
  navigation-active:
    backgroundColor: "#315c68"
    textColor: "{colors.paper}"
    rounded: "{rounded.nav}"
    height: "38px"
    padding: "0 10px"
  clip-row-selected:
    backgroundColor: "{colors.selected-paper}"
    textColor: "{colors.ink}"
    padding: "13px 42px 12px 13px"
---

# Design System: Clipboard+ Popup

## Overview

**Creative North Star: "The Technical Reference Desk"**

The Chrome popup treats copied material like entries in a working folio: easy to scan, quick to retrieve, and calm enough for repeated use. Deep petrol anchors navigation; a white list gives the clip itself priority; a chalk detail surface holds the full text and its provenance. The official Clipboard+ mark stays in the header. The locally bundled Hanken Grotesk supplies a compact but characterful reading voice, while code uses the system monospace stack.

The interface is flat and aligned inside a quiet rounded frame. Quiet rules separate work areas, and the gold trace ties the active row to its detail heading. Light is the default, while a locally saved dark mode keeps the same structure and hierarchy. Capture Controls and the public website now share this palette, Hanken typography, and rounded boundaries; the macOS companion retains its own native treatment.

**Key Characteristics:**

- Three aligned work areas under a compact search and action header.
- Content-first list rows with provenance in smaller, quieter type.
- Petrol navigation, chalk detail, and a restrained gold selection trace.
- Square-leaning controls and borders, with elevation reserved for overlays.
- A 14px framed popup boundary; the interior controls remain compact.

## Colors

The palette uses petrol for structure, cool near-neutrals for reading, and gold only where attention needs a precise location.

### Primary

- **Petrol Rail** (`#173744`): Navigation and primary actions; it defines the workspace without competing with clip text.
- **Focus Gold** (`#b3830f`): Keyboard focus and the selected-row/detail locator. Its darker companion (`#674700`) supports legible small gold text.

### Neutral

- **Ink** (`#1c3038`): Clip content, headings, and primary reading text.
- **Muted Ink** (`#586b72`) and **Quiet Ink** (`#718187`): Secondary metadata and low-emphasis labels.
- **Paper** (`#ffffff`): Header and recent-list surface.
- **Chalk Canvas** (`#f3f5f3`): Detail work surface and popup ground.
- **Rule** (`#dce4e4`): Pane divisions, row separators, and metadata lines.
- **Rail Ink** (`#f5f8f5`) and **Rail Muted** (`#bdd0d0`): Active and resting navigation text on petrol.
- **Selected Paper** (`#fff8e7`): Warm highlight behind the active clip row.

### Status

- **Danger** (`#ac3f34`) and **Success** (`#247354`): Destructive and copied feedback, never category decoration.

**The Focus Trace Rule.** Gold locates current selection or keyboard focus; it does not fill primary buttons or large surfaces.

### Dark appearance

The optional dark mode keeps the petrol rail and gold focus trace. Ink becomes `#eaf1ef`, the list surface `#14282f`, the detail surface `#0e1d24`, and rules `#344b53`. Secondary text is cool and bright enough to remain legible; selected rows become a restrained warm charcoal instead of a glowing card. The popup switch and the Capture Controls selector edit one extension-local preference. The public site's toggle stores a separate browser-local preference because GitHub Pages cannot read extension storage. Neither choice changes automatic capture or clip data.

## Typography

**Display and Body Font:** Hanken Grotesk, bundled locally as a variable font, with system sans fallbacks.

**Code Font:** The system monospace stack (`ui-monospace`, `SFMono-Regular`, `Menlo`, `Consolas`, `monospace`).

**Character:** Compact, clear, and slightly editorial. Weight and alignment create hierarchy more often than size changes.

### Hierarchy

- **Heading** (730, 16px, 1.25): Results headings and detail content scale.
- **Clip title** (700, 14px, 1.35): The first readable line in every result row, clamped to two lines.
- **Body** (13px): Inputs, notices, and supporting prose.
- **Label** (11px): Clip metadata, counts, and source labels; counts use tabular numerals.
- **Code** (500, 12px, 1.55): Full code previews and modal code bodies.

**The Content First Rule.** Clip text takes the strongest list weight; source, kind, app, and recency remain secondary.

## Layout

The popup document is intrinsically 760 × 600px; a 6px outer inset leaves a 748 × 588px framed shell. A 64px header sits above a three-column work area: 142px navigation, 336px scrollable results, and the remaining width for detail. Results and detail each begin with a 52px heading band. List rows are at least 80px high; the current clip is selected on opening and can still be copied with one click. Do not size the document or shell from `100vw`: Chrome initially measures action popups in a tiny viewport and would collapse the window into a strip.

At 700px and below, the detail pane hides and the rail becomes 132px. At 520px and below, the rail narrows to 56px and keeps labeled controls accessible through their button names and titles; the brand name and Add clip text hide. The list remains the primary work surface. Spacing clusters around compact 8px gaps, 13px row insets, 16px section insets, and 18px detail edges.

## Elevation & Depth

The three work areas are flat. Background shifts and thin rules establish hierarchy; list rows do not float. The outer frame has a very soft offset shadow; menus, dialogs, and transient feedback rise more clearly above the workspace.

### Shadow Vocabulary

- **Menu** (`0 12px 28px rgba(15, 42, 50, .18)`): Open clip actions.
- **Dialog** (`0 22px 55px rgba(8, 29, 36, .27)`): Modal editing and preview surfaces.
- **Feedback** (`0 10px 22px rgba(15, 42, 50, .2)`): Toast and undo bar.

**The Flat Desk Rule.** Resting navigation, list, and detail surfaces use tone and rules; shadows signal temporary overlays only.

## Shapes

The form language is square-leaning and practical inside a 14px rounded popup frame. Buttons and fields use a 5px corner, the search field 6px, navigation selections 4px, and dialogs 8px. Clip rows remain rectangular with a hairline divider and a 1px gold edge when selected. Small 3px corners are reserved for menu and notice actions.

## Components

### Buttons

- **Primary:** Petrol fill, white type, 37px height, 5px radius, and 13px horizontal inset; hover shifts to a lighter petrol. Disabled buttons lower opacity.
- **Secondary:** White fill, ink type, cool border, and the same height and corner. Hover lightens the surface and strengthens the border.
- **Icon:** A 36px square hit area with an unobtrusive resting surface; hover adds a pale fill and border. All buttons receive a 2px gold `:focus-visible` outline with 2px offset.

### Inputs / Fields

- **Search:** A 39px pale field with a cool border and 6px radius. Focus changes the border to gold, the fill to paper, and adds a soft 3px gold halo.
- **Text areas:** White fields with a cool border and 5px radius; they share the gold keyboard outline.

### Navigation

- **Rail:** Petrol background, muted labels at rest, white labels on hover and selection. Active items have a lighter petrol fill and a narrow gold marker. Counts align on the right with tabular numerals; the final Save tab action sits at the bottom.
- **Icon map:** Lucide Playing Cards Fan denotes All, Save denotes Saved and Save tab, Pencil Ruler denotes Text, Link 2 denotes Links, and Code XML denotes Code. Type icons repeat unchanged in rows, previews, and Capture Controls. The supplied Clipboard+ logo is not replaced.

### Clip Rows

- **Resting:** White rectangular rows separated by a thin cool rule. The content excerpt is bold and first; source and kind follow below at label scale. Hover uses a cool pale wash.
- **Selected:** Warm paper fill and a 1px gold left edge. Focus selects the row; clicking copies it. Copied feedback uses a pale green row and a success label.
- **Actions:** A small trailing menu button opens a shadowed white menu with compact 34px actions.

### Detail Surface and Notices

- **Detail:** Chalk ground, gold rule at the heading, readable full clip text, tabular provenance lines, and a primary copy action at the bottom.
- **Capture notice:** A compact warm panel above the workspace; checking and error variants use their own truthful status colors. It may add height, but does not replace the clip list.

## Do's and Don'ts

### Do:

- **Do** keep copied content more prominent than its source metadata.
- **Do** use the gold trace for active selection and visible keyboard focus.
- **Do** preserve the white list against the chalk detail surface and petrol rail.
- **Do** keep capture and permission notices truthful and compact.

### Don't:

- **Don't** turn rows into floating cards or add decorative wash effects.
- **Don't** use gold as a broad fill or a second primary action color.
- **Don't** apply the web surfaces' Hanken Grotesk choice to the macOS companion by default.

## Related web surfaces

Capture Controls is an operational page: wider measures, 14px rounded section boundaries, readable secondary text, and a shared light/dark preference with the popup. Floating clipboard artwork remains at the sides, never behind text or controls; the former cursor-following spotlight is removed. Lucide's quiet line icons identify clip types and page actions, while the supplied Clipboard+ logo remains the brand mark. Text uses Pencil Ruler, links use Link 2, and code uses Code XML in both the popup and Capture Controls. The public website is a reading and discovery surface: the homepage demonstrates the real Workspace, while privacy, support, deletion, and release notes use a restrained single-column reading measure. Public pages share the same light-default/dark-toggle palette but keep their preference in website-local storage.
