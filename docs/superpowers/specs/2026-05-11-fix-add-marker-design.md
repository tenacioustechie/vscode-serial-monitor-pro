# Fix: "Add Marker" button does nothing

**Date:** 2026-05-11
**Status:** Approved, ready for implementation

## Problem

Clicking the "Add Marker" button in the playback panel does nothing. No marker
is added, no error appears, no UI feedback occurs.

## Root cause

The handler in [media/playback.js:173-192](../../../media/playback.js#L173-L192)
calls `window.prompt('Enter marker label:', '')`. `window.prompt`, `alert`, and
`confirm` are blocked in VS Code webviews — `prompt` silently returns `null`,
so the early-return at line 175 fires and no `addMarker` message is ever sent
to the extension host.

The rest of the marker pipeline is intact:

- [src/playback/playbackPanel.ts:94-103](../../../src/playback/playbackPanel.ts#L94-L103)
  handles the `addMarker` message and persists the session
- [media/playback.js:103-145](../../../media/playback.js#L103-L145) renders
  pins on the timeline and a markers list, both wired to seek on click
- CSS for pins exists at
  [media/playback.css:138-186](../../../media/playback.css#L138-L186)

## Goals

1. Clicking "Add Marker" must add a visible pin on the timeline at the current
   playback position, persisted across panel reloads
2. The marker's label must be editable after the fact
3. Clicking a pin (timeline) or row (list) seeks to that timestamp
4. Pin click target must be easy to hit (currently 2px wide)

## Non-goals

- Color picker (color stays at default `#f6ad55`)
- Drag-to-reposition pins
- Auto-play on marker click (seek only — playback state preserved)
- Keyboard shortcut for adding markers

## Design

### UX flow

1. User clicks **Add Marker** → marker is added immediately at the current
   playback position with a default label `Marker N` where
   N = `session.markers.length + 1`. No dialog. Pin appears on timeline; row
   appears in list.
2. User can rename the marker by clicking its label in the markers list. The
   label swaps to a text `<input>` pre-filled with the current value.
   - **Enter** or **blur** → save (post `renameMarker` to extension)
   - **Escape** → cancel, restore previous label
   - Empty/whitespace-only label → revert (do not save)
3. Clicking the pin or list row (outside the editing input) seeks to the
   marker's timestamp. Playback state is preserved (paused stays paused).
4. Delete (`✕` in list) works as today.

### Data model change

Add an optional stable `id` to `Marker` in
[src/recording/types.ts](../../../src/recording/types.ts):

```ts
export interface Marker {
  id?: string;       // NEW — UUID; optional for backward compat
  timestamp: number;
  label: string;
  color?: string;
}
```

`id` is optional in the type so already-saved sessions remain valid. On load
in `PlaybackPanel.createOrShow`, backfill ids for any markers missing one and
re-save the session once. After backfill, all in-memory markers carry an id.

### Webview ↔ extension protocol

Three messages handled in
[src/playback/playbackPanel.ts](../../../src/playback/playbackPanel.ts):

| Message | Payload | Behavior |
|---|---|---|
| `addMarker` | `{ id, timestamp, label, color }` | Push to `session.markers`, save |
| `removeMarker` | `{ id }` | Filter `session.markers` by id, save |
| `renameMarker` | `{ id, label }` | Find by id, update `label`, save |

`removeMarker` switches from the current `(timestamp, label)` filter to
id-based lookup, eliminating the ambiguity of two markers sharing those
fields.

The webview is the source of new marker ids — it generates them with
`crypto.randomUUID()` (available in webview contexts) and includes the id in
the `addMarker` payload, so local state and persisted state stay in sync
without a round-trip.

### Webview implementation notes

In [media/playback.js](../../../media/playback.js):

- **Add handler** (replaces the broken `prompt` block): build the marker
  locally with a UUID and the auto-numbered label, post `addMarker`, push to
  `session.markers`, call `renderMarkers()`.
- **Inline rename**: in `renderMarkers`, attach a click handler to
  `.marker-label`. On click, replace the span with an `<input>` of the same
  width, focus and select-all. Bind `keydown` (Enter/Escape) and `blur`. Use a
  flag to ignore the parent row's seek-on-click while editing (or
  `event.stopPropagation()` on the input's mousedown).
- **Auto-numbering**: `Marker ${session.markers.length + 1}` at the moment of
  the click. Collisions after deletes/renames are fine — labels are
  user-editable.

### CSS

In [media/playback.css](../../../media/playback.css):

Widen the pin's hit area without changing visible geometry. Approach: keep the
visible 2px line/glyph as-is, add a transparent ~16-20px wide region centered
on the pin via horizontal padding on `.timeline-marker` plus
`background: transparent` on the padded area. The `.timeline-marker-line`
remains 2px and centered.

Add minimal styles for the inline rename `<input>`:
- match list font-size and color
- transparent background or input-background
- no/minimal border so it doesn't reflow the row

## Files affected

- [src/recording/types.ts](../../../src/recording/types.ts) — add `id?: string` to `Marker`
- [src/playback/playbackPanel.ts](../../../src/playback/playbackPanel.ts) — backfill ids on load; handle `renameMarker`; switch `removeMarker` to id-based
- [media/playback.js](../../../media/playback.js) — replace `prompt` handler; inline rename UX; pass id in messages
- [media/playback.css](../../../media/playback.css) — widen pin hit area; rename input styling

## Verification

No existing tests cover the playback panel or marker logic, and the bug lives
in webview JS that's awkward to exercise via Jest. Verification will be:

1. `npm run lint` — TypeScript / ESLint passes
2. `npm run build` — production build succeeds
3. Manual repro in Extension Development Host (F5):
   - Record a short session (~10s with a few RX/TX events), stop and save
   - Open the saved session in playback
   - Click **Add Marker** at multiple timestamps (paused and during playback)
     → verify pins appear immediately at correct positions
   - Click a label in the list → verify it becomes editable; type a new name;
     press Enter → verify it saves
   - Press Escape mid-edit → verify original label restored
   - Click a timeline pin → verify playhead seeks to that position; playback
     state preserved
   - Click anywhere on a list row outside the label → verify it seeks
   - Click the pin's wider hit area (a few px to either side of the visible
     pin) → verify it still seeks
   - Delete a marker via `✕` → verify it disappears from timeline and list
   - Close and reopen the playback panel → verify all markers persist with
     their renamed labels
   - Open a session that pre-existed the change (no ids) → verify it loads,
     ids get backfilled, and operations work normally

## Risks and mitigations

- **Backfill writes on every legacy-session open.** Mitigation: only re-save
  if at least one marker was missing an id (skip the disk write otherwise).
- **Edit-mode click leaking to row seek.** Mitigation: stop propagation on the
  input itself; the input is inside `.marker-label` whose row click handler
  already excludes clicks on the delete button — extend the same exclusion.
- **`crypto.randomUUID` availability in webviews.** Available in modern
  Chromium (VS Code webview is Electron/Chromium ≥102). Safe to rely on.
