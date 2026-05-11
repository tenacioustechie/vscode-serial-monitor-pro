# Fix "Add Marker" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore working "Add Marker" behavior in the playback panel: clicking the button immediately drops a labeled pin on the timeline, the label is renameable inline in the markers list, and pins are easy to click.

**Architecture:** Bug is `window.prompt()` being blocked in VS Code webviews. Replace it with auto-add (default label `Marker N`) plus inline rename in the list. Add a stable `id` field to `Marker` so rename/delete operations are unambiguous; backfill ids for legacy sessions on load.

**Tech Stack:** TypeScript (extension host), plain JS/CSS (webview). No new dependencies. No test framework usage (codebase currently has zero test files).

**Spec:** [docs/superpowers/specs/2026-05-11-fix-add-marker-design.md](../specs/2026-05-11-fix-add-marker-design.md)

---

## Notes for the engineer

- VS Code webviews are sandboxed iframes that block `window.prompt`, `window.alert`, `window.confirm`. They silently return `null`/`undefined`. Never use them in `media/*.js`.
- Webview ↔ extension communication is one-way `postMessage`. Webview state and persisted state must be kept in sync manually after every operation.
- This codebase has no test files. Verification is `npm run lint`, `npm run build`, and manual repro in the Extension Development Host (F5 in VS Code).
- Commit after each task. Conventional-commits style (`fix:`, `feat:`, `refactor:`) — see recent commits for examples.

---

## Task 1: Add `id` field to Marker type

**Files:**
- Modify: `src/recording/types.ts`

- [ ] **Step 1: Add optional `id` field to the `Marker` interface**

Edit `src/recording/types.ts`. Find the `Marker` interface (around lines 23-28) and add `id?: string` as the first field:

```ts
export interface Marker {
  /** Stable UUID. Optional for backward compat with sessions saved before this field existed. */
  id?: string;
  /** Milliseconds offset from session startTime */
  timestamp: number;
  label: string;
  color?: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No errors. (The field is optional, so all existing usages remain valid.)

- [ ] **Step 3: Commit**

```bash
git add src/recording/types.ts
git commit -m "feat: add optional id field to Marker for stable identification"
```

---

## Task 2: Backfill marker ids on session load

**Files:**
- Modify: `src/playback/playbackPanel.ts`

- [ ] **Step 1: Backfill missing ids in `createOrShow`**

In `src/playback/playbackPanel.ts`, find the `createOrShow` method (around lines 33-67). After the line `const session = await sessionStorage.loadSession(sessionId);` (~line 44) and the `if (!session) {...}` guard, add a backfill block before `vscode.window.createWebviewPanel(...)`:

```ts
    const session = await sessionStorage.loadSession(sessionId);
    if (!session) {
      vscode.window.showErrorMessage(`Session not found: ${sessionId}`);
      return undefined;
    }

    // Backfill stable ids for markers saved before the id field existed.
    let backfilled = false;
    for (const marker of session.markers) {
      if (!marker.id) {
        marker.id = crypto.randomUUID();
        backfilled = true;
      }
    }
    if (backfilled) {
      await sessionStorage.saveSession(session);
    }

    const panel = vscode.window.createWebviewPanel(
```

- [ ] **Step 2: Add the `crypto` import at the top of the file**

At the top of `src/playback/playbackPanel.ts`, add the import alongside the existing imports:

```ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { RecordingSession, SerialEvent, Marker } from '../recording/types';
import { SessionStorage } from '../storage/sessionStorage';
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No errors. (`crypto.randomUUID` is part of Node's built-in `crypto`, available since Node 14.17.)

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/playback/playbackPanel.ts
git commit -m "feat: backfill stable ids for markers loaded from disk"
```

---

## Task 3: Update extension message handlers (id-based remove + new rename)

**Files:**
- Modify: `src/playback/playbackPanel.ts`

- [ ] **Step 1: Switch `removeMarker` to id-based and add `renameMarker` handler**

In `src/playback/playbackPanel.ts`, replace the `handleMessage` switch body (around lines 69-120). Find the `removeMarker` case and replace it; add a new `renameMarker` case immediately after:

```ts
      case 'addMarker': {
        const marker: Marker = {
          id: message.id,
          timestamp: message.timestamp,
          label: message.label,
          color: message.color,
        };
        this.session.markers.push(marker);
        await this.sessionStorage.saveSession(this.session);
        break;
      }

      case 'removeMarker': {
        this.session.markers = this.session.markers.filter(
          (m) => m.id !== message.id
        );
        await this.sessionStorage.saveSession(this.session);
        break;
      }

      case 'renameMarker': {
        const target = this.session.markers.find((m) => m.id === message.id);
        if (target) {
          target.label = message.label;
          await this.sessionStorage.saveSession(this.session);
        }
        break;
      }

      case 'renameSession': {
```

Note: the `addMarker` case is also updated to accept an `id` from the webview (the webview is now the source of truth for new ids).

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No errors.

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/playback/playbackPanel.ts
git commit -m "feat: handle renameMarker and switch removeMarker to id-based lookup"
```

---

## Task 4: Replace `prompt()` with auto-add in the webview

**Files:**
- Modify: `media/playback.js`

- [ ] **Step 1: Replace the `addMarkerBtn` click handler**

In `media/playback.js`, find the `addMarkerBtn.addEventListener('click', ...)` handler (around lines 173-192) and replace its body:

```js
  addMarkerBtn.addEventListener('click', () => {
    if (!session) { return; }

    const marker = {
      id: crypto.randomUUID(),
      timestamp: currentTimeMs,
      label: 'Marker ' + (session.markers.length + 1),
      color: '#f6ad55',
    };

    vscode.postMessage({
      type: 'addMarker',
      ...marker,
    });

    session.markers.push(marker);
    renderMarkers();
  });
```

- [ ] **Step 2: Manual verification (Extension Development Host)**

Press F5 in VS Code to launch the Extension Development Host. In the new window:
1. Open the Serial Monitor Pro sidebar
2. Connect to any serial port and record a short session (~10 seconds — even with no traffic is fine), then stop and save it
3. Open the saved session from the Sessions sidebar (opens playback panel)
4. Click **Add Marker** at time 0 → expect a 📌 pin to appear at the far left of the timeline and a list entry "00:00.000 Marker 1" to appear below
5. Click **▶ Play** then click **Add Marker** again partway through → expect a second pin and a "Marker 2" list entry at the current time
6. Close and reopen the playback panel → expect both markers to still be present (persistence working)

Expected: pins visible on timeline, entries in list, persisted across reopen.

- [ ] **Step 3: Commit**

```bash
git add media/playback.js
git commit -m "fix: add markers immediately with auto-numbered labels (window.prompt is blocked in webviews)"
```

---

## Task 5: Switch webview `removeMarker` to id-based

**Files:**
- Modify: `media/playback.js`

- [ ] **Step 1: Update the delete-button handler in `renderMarkers`**

In `media/playback.js`, find the delete handler inside `renderMarkers` (around lines 131-142). Replace the `vscode.postMessage({...})` call and the local filter to use `id`:

```js
      item.querySelector('.marker-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({
          type: 'removeMarker',
          id: marker.id,
        });
        session.markers = session.markers.filter((m) => m.id !== marker.id);
        renderMarkers();
      });
```

- [ ] **Step 2: Manual verification**

Press F5 (or reload the Extension Development Host with Cmd+R / Ctrl+R if already running). In a session with markers from Task 4:
1. Hover a marker row → ✕ button appears
2. Click ✕ → expect both the timeline pin AND the list row to disappear
3. Reopen the panel → expect the deletion persisted

Expected: deletion works, persists.

- [ ] **Step 3: Commit**

```bash
git add media/playback.js
git commit -m "refactor: identify markers by id in remove message"
```

---

## Task 6: Inline rename in the markers list

**Files:**
- Modify: `media/playback.js`

- [ ] **Step 1: Update the row click handler to ignore the label**

In `media/playback.js`, find the row click handler in `renderMarkers` (around lines 126-130). Add `marker-label` to the exclusion check so clicking the label doesn't seek (it'll open the editor instead):

```js
      item.addEventListener('click', (e) => {
        if (
          !e.target.classList.contains('marker-delete') &&
          !e.target.classList.contains('marker-label') &&
          !e.target.classList.contains('marker-label-input')
        ) {
          seekTo(marker.timestamp);
        }
      });
```

- [ ] **Step 2: Add inline-edit handler on the label**

Still in `renderMarkers` in `media/playback.js`, after the row click handler and before `markersList.appendChild(item);`, attach a click handler to the label element that opens the editor:

```js
      const labelEl = item.querySelector('.marker-label');
      labelEl.addEventListener('click', (e) => {
        e.stopPropagation();
        startInlineEdit(labelEl, marker);
      });

      markersList.appendChild(item);
```

- [ ] **Step 3: Add the `startInlineEdit` helper function**

In `media/playback.js`, add this helper function. Place it just above `function renderMarkers()` (around line 89):

```js
  function startInlineEdit(labelEl, marker) {
    if (labelEl.querySelector('input')) { return; } // already editing

    const original = marker.label;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'marker-label-input';
    input.value = original;

    labelEl.textContent = '';
    labelEl.appendChild(input);
    input.focus();
    input.select();

    let finished = false;
    const finish = (save) => {
      if (finished) { return; }
      finished = true;
      const newLabel = input.value.trim();
      if (save && newLabel !== '' && newLabel !== original) {
        marker.label = newLabel;
        vscode.postMessage({
          type: 'renameMarker',
          id: marker.id,
          label: newLabel,
        });
      }
      renderMarkers();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());
  }
```

- [ ] **Step 4: Manual verification**

Reload the Extension Development Host. With markers from earlier tasks:
1. Click a marker label → expect it to swap to a text input pre-filled with the label, focused and selected
2. Type a new name and press **Enter** → expect the label to update and persist (close/reopen panel to confirm)
3. Click another label, type something, press **Escape** → expect the original label restored, no save
4. Click another label, type something, click somewhere else (blur) → expect save
5. Click on the timestamp portion of a row (not the label) → expect playhead seeks to that marker
6. Click on the label of a row → expect editor opens, NO seek

Expected: rename works, escape cancels, blur saves, click-to-seek still works for non-label areas.

- [ ] **Step 5: Commit**

```bash
git add media/playback.js
git commit -m "feat: inline rename of marker labels in the list"
```

---

## Task 7: CSS — widen pin click target and style rename input

**Files:**
- Modify: `media/playback.css`

- [ ] **Step 1: Widen the pin hit area while keeping the visible pin centered**

In `media/playback.css`, replace the `.timeline-marker` rule (around lines 138-145) and the `.timeline-marker::before` rule (around lines 147-154):

```css
.timeline-marker {
  position: absolute;
  top: 0;
  width: 16px;
  height: 100%;
  margin-left: -8px;
  cursor: pointer;
  pointer-events: auto;
  display: flex;
  justify-content: center;
}

.timeline-marker::before {
  content: '📌';
  position: absolute;
  top: -2px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 14px;
  z-index: 6;
}
```

The line and tooltip selectors below stay unchanged — `.timeline-marker-line` is already a flex child that will center inside the new 16px-wide parent, and `.timeline-marker-tooltip` is positioned at `left: 50%` which now centers on the wider parent (same visual position as before).

- [ ] **Step 2: Add styling for the rename input**

In `media/playback.css`, add this rule. Place it right after the `.marker-item .marker-label` rule (around line 388):

```css
.marker-item .marker-label-input {
  flex: 1;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, transparent);
  border-radius: 2px;
  padding: 1px 4px;
  font-family: inherit;
  font-size: inherit;
  outline: none;
  width: 100%;
  min-width: 0;
}

.marker-item .marker-label-input:focus {
  border-color: var(--vscode-focusBorder);
}
```

- [ ] **Step 3: Manual verification**

Reload the Extension Development Host. With markers in a session:
1. Try clicking a few pixels to either side of the visible 📌 pin → expect it still seeks (wider hit area working)
2. Verify the pin is still visually centered on the marker's timestamp position (compare to other pins or the timeline cursor at the same position)
3. Verify the tooltip on hover still appears centered above the pin
4. Click a label to enter rename mode → expect the input has a visible border, matches the row's font, doesn't reflow the row's layout dramatically

Expected: pins easier to click, visuals unchanged, rename input looks clean.

- [ ] **Step 4: Commit**

```bash
git add media/playback.css
git commit -m "feat: widen marker pin hit area and style rename input"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run lint and build**

Run: `npm run lint`
Expected: No errors.

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 2: Full end-to-end manual test**

Reload Extension Development Host (or restart with F5). Run through the full verification list from the spec:

1. Record a short session (~10s with at least a few RX/TX events if possible), stop and save
2. Open the saved session in playback
3. Click **Add Marker** at multiple timestamps, both paused and during playback → pins appear immediately at correct positions
4. Click a label in the list → it becomes editable; type a new name; press Enter → saves
5. Press Escape mid-edit → original label restored
6. Click a timeline pin → playhead seeks; playback state preserved (paused stays paused, playing stays playing)
7. Click anywhere on a list row outside the label and ✕ → it seeks to that marker
8. Click a few pixels to either side of a pin's visible glyph → still seeks (wider hit area)
9. Delete a marker via ✕ → disappears from timeline and list
10. Close and reopen the playback panel → all markers persist with renamed labels
11. **Legacy session test:** if any session was recorded before these changes, open it → it loads, ids get backfilled (silently re-saved), all operations work

Expected: every step passes.

- [ ] **Step 3: Stage the spec for commit alongside the implementation**

The spec file [docs/superpowers/specs/2026-05-11-fix-add-marker-design.md](../specs/2026-05-11-fix-add-marker-design.md) exists but was not committed earlier. Stage it now.

```bash
git add docs/superpowers/specs/2026-05-11-fix-add-marker-design.md docs/superpowers/plans/2026-05-11-fix-add-marker.md
git commit -m "docs: add design spec and implementation plan for marker fix"
```

---

## Summary of changes

| File | Change |
|---|---|
| `src/recording/types.ts` | Add optional `id?: string` to `Marker` |
| `src/playback/playbackPanel.ts` | Backfill ids on load; handle `renameMarker`; id-based `removeMarker`; accept id in `addMarker` |
| `media/playback.js` | Replace `prompt()` with auto-add; inline rename; id-based remove |
| `media/playback.css` | Widen pin hit area to 16px (visible pin stays centered); style rename input |
| `docs/superpowers/specs/2026-05-11-fix-add-marker-design.md` | (already created) Design spec |
| `docs/superpowers/plans/2026-05-11-fix-add-marker.md` | (this file) Implementation plan |
