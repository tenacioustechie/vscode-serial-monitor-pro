# Discard / Delete a Just-Finished Recording — Design

**Date:** 2026-05-17
**Target release:** v0.6.0
**Status:** Approved — implementation pending

## Problem

When a recording stops — either manually (Stop button) or automatically (port disconnect with auto-record on) — the session is saved to disk and listed in **Recorded Sessions**. If the user immediately decides the recording was not useful, the only way to discard it today is to locate the session directory on disk and remove it by hand. There is no in-UI delete.

This proposal adds a low-friction "discard" affordance immediately after a recording is saved, plus a matching `Delete Session` context-menu action on the Recorded Sessions sidebar.

## Goals

- After a recording is saved, the user can discard it in **one click** from either the in-monitor log line or the VS Code toast.
- No confirmation prompt for the post-stop discard — accidental clicks are recoverable via an `Undo` toast.
- The discard flow is also available from the **Recorded Sessions** sidebar (right-click → `Delete Session`) using the same soft-delete + undo mechanism.
- No data is lost during a system crash: orphan tombstones from a previous session are garbage-collected on activation.

## Non-goals

- Bulk delete / multi-select in the sidebar.
- A trash bin UI for browsing previously-discarded sessions.
- Modal confirmation prompts.

## User experience

### Post-recording discard (monitor view)

When a recording is saved, the existing "Recording saved" output is enhanced in two places:

1. **VS Code information toast** — replaces the current `Recording saved: <name> (<n> events)` toast with the same text plus two action buttons: `Open` and `Discard`.
2. **In-monitor system log line** — replaces the current `--- Recording saved: <name> ---` line with one that carries two small inline buttons:
   ```
   --- Recording saved: Session 5/17/2026, 8:42:11 PM   [Open]  [Discard]  ---
   ```

Clicking `Discard` from either location:

1. Soft-deletes the session (see Architecture).
2. The session disappears from the **Recorded Sessions** sidebar on the next refresh.
3. The inline `[Open] [Discard]` buttons in the log line are replaced with greyed-out `(discarded)` text.
4. A follow-up VS Code toast appears: `Recording discarded.` with a single action button: `Undo`.

Clicking `Undo`:

1. Restores the session directory.
2. The session reappears in the sidebar on refresh.
3. (The inline log line stays as `(discarded)` — it is a historical record of what the user did, not live state. The sidebar is authoritative for "does this session exist".)

If the user does not click `Undo`, the soft-deletion is finalized (irrecoverable) the next time any of the following happens:

- The user starts a new recording on this monitor panel.
- The user initiates another discard or `Delete Session` (sidebar). Single-slot invariant: only one pending discard at a time.
- The monitor panel closes / the extension deactivates.

### Sidebar `Delete Session`

The **Recorded Sessions** tree's existing `recordedSession` context value gains a right-click menu item: `Delete Session`. It invokes the same soft-delete + undo flow as the monitor view. The "until next recording" rule doesn't apply here — the pending-discard window simply closes when another delete is initiated or the extension deactivates.

## Architecture

### New module: `src/recording/sessionDiscardService.ts`

A single shared service that owns the pending-discard state machine and the rename / restore / finalize operations.

```ts
class SessionDiscardService implements vscode.Disposable {
  // At most one pending soft-deletion at a time, process-wide.
  private pending?: { id: string; tombstoneDir: string };

  constructor(private storage: SessionStorage, private treeProvider: SessionTreeProvider) {}

  /** Rename session-<id> → .discarded-session-<id> and refresh the sessions tree.
   *  If another discard is already pending, finalize it first. */
  async softDelete(sessionId: string): Promise<void>;

  /** Rename the tombstone back to session-<id>. Returns true if a restore happened. */
  async undo(): Promise<boolean>;

  /** rm -rf the tombstone and clear pending state. Called on shutdown,
   *  on next discard, and on next recording start. */
  async finalize(): Promise<void>;

  get pendingId(): string | undefined;

  /** Walk storage on activate and delete orphan .discarded-session-* dirs. */
  async gcOrphans(): Promise<void>;

  dispose(): void; // finalize any pending discard
}
```

**Rename mechanism:** `fs.rename(<storagePath>/session-<id>, <storagePath>/.discarded-session-<id>)`. Same filesystem (both paths live under `storagePath`), so the rename is atomic.

**Why the tombstone prefix works without changes to `listSessions`:** `SessionStorage.listSessions()` already filters with `entry.name.startsWith('session-')`. Anything renamed to `.discarded-session-*` is invisible to the sidebar without further code changes.

### Toast lifecycle

A single `vscode.window.showInformationMessage('Recording discarded.', 'Undo')` call drives the entire undo flow. The promise resolves to `'Undo'` (user clicked the button) or `undefined` (user dismissed the toast). On `'Undo'`, call `undo()`; on `undefined`, leave the pending state — it is finalized later by one of the triggers above.

### Wiring

- **`src/extension.ts`** — Constructs one `SessionDiscardService` alongside the existing `SessionStorage` and `SessionRecorder`. Passes it to `MonitorPanel.createOrShow`. Registers two new commands:
  - `serialMonitorPro.deleteSession` — invoked from the sidebar context menu, takes a `SessionTreeItem`, calls `softDelete` then drives the same `Undo` toast.
  - `serialMonitorPro.openPlayback` (existing) — used by the new "Open" action from the monitor; no signature change.

  Calls `discardService.gcOrphans()` once on activate. Disposes the service on deactivate.

- **`src/monitor/monitorPanel.ts`** — Three changes:
  1. The `recordingSaved` webview message gains a `sessionId` field. The "Recording saved" `showInformationMessage` is called with `'Open'` and `'Discard'` actions and routes the result to the discard service or to `serialMonitorPro.openPlayback`.
  2. New inbound message types from the webview: `{ type: 'discardLastRecording', sessionId }` and `{ type: 'openSession', sessionId }`.
  3. The `startRecording` handler calls `await discardService.finalize()` before `sessionRecorder.startRecording(...)` so that starting a new recording closes the discard window on any previously-saved session.

- **`media/monitor.js`** — Replaces the existing `appendSystemLine('Recording saved: ...')` call (triggered by the `recordingSaved` message) with a new `appendRecordingSavedLine(sessionId, sessionName)` helper that renders a system line with two real `<button>` elements (`Open`, `Discard`). Both buttons send messages to the extension host. CSP-safe — no `innerHTML`, matching the XSS hardening that landed in v0.3.0.

  When the `Discard` button on a saved line is clicked, the two buttons are replaced with the text `(discarded)`. The line stays in the scrollback as a historical record.

- **`media/monitor.css`** — Small style rules for the inline action buttons and the `(discarded)` marker.

- **`package.json`** —
  - Adds a `serialMonitorPro.deleteSession` command with title `Delete Session`.
  - Adds a `view/item/context` menu entry binding that command to `viewItem == recordedSession`.
  - Bumps version to `0.6.0`.

### Data flow on discard (monitor inline button)

```
[user clicks Discard in monitor log line]
        |
        v
media/monitor.js posts { type: 'discardLastRecording', sessionId }
        |
        v
MonitorPanel.handleMessage → discardService.softDelete(sessionId)
        |
        +-- fs.rename(session-<id>, .discarded-session-<id>)
        +-- treeProvider.refresh()
        +-- showInformationMessage('Recording discarded.', 'Undo')
                |
                +-- 'Undo' clicked → discardService.undo() → rename back → refresh
                +-- toast dismissed → pending stays; finalize() runs on next trigger
```

### Edge cases

| Case | Behavior |
|---|---|
| Discard clicked, then panel closed before Undo | `MonitorPanel.dispose` → `SessionDiscardService.dispose` → `finalize()`. Tombstone is removed. |
| Crash with `.discarded-session-*` left on disk | `gcOrphans()` at activate deletes orphan tombstones. |
| Two discards back-to-back (sidebar then monitor, or vice versa) | The earlier one is finalized first inside `softDelete`, then the new one becomes pending. Single-slot invariant. |
| User clicks Undo after a second discard started | Earlier tombstone was already finalized. The toast result for the now-finalized session is treated as a no-op (we check `pending?.id === expected`). |
| Discard for a session that no longer exists on disk (race) | `fs.rename` throws `ENOENT`; swallowed with a warning toast. Tree refreshed regardless. |
| Audio file (`audio.wav`) discard | Moved with the directory rename; restored or finalized atomically with the manifest. |
| Storage path changes between save and discard | Soft-delete operates on the absolute path captured inside `softDelete` at call time, not at finalize. |
| Cross-filesystem rename | All session dirs live under one `storagePath`, so `fs.rename` is always same-volume. |

## Testing

- **`tests/sessionDiscardService.test.mjs`** — Drives the service against a temp directory:
  - `softDelete` renames and hides from `listSessions`.
  - `undo` restores and re-exposes in `listSessions`.
  - Calling `softDelete` while a discard is pending finalizes the previous one.
  - `gcOrphans` removes leftover tombstones.
  - `dispose` finalizes pending tombstones.

- **`tests/manifest.test.mjs`** — Adds an assertion that the `serialMonitorPro.deleteSession` command is registered and bound to `view/item/context` for `recordedSession`.

- Webview button rendering and message wiring are not auto-tested — verified manually during the implementation pass, matching the existing pattern for monitor UI (which has no dedicated test harness).

## Files changed

**New:**
- `src/recording/sessionDiscardService.ts`
- `tests/sessionDiscardService.test.mjs`
- `docs/superpowers/specs/2026-05-17-discard-recording-design.md` (this file)

**Modified:**
- `src/extension.ts` — instantiate service, register `deleteSession` command, gc on activate
- `src/monitor/monitorPanel.ts` — `Open` / `Discard` actions on saved toast, new inbound messages, finalize-on-new-recording
- `media/monitor.js` — `appendRecordingSavedLine` helper, button rendering, message posting
- `media/monitor.css` — inline action button styles, `(discarded)` marker
- `package.json` — `0.6.0`, `deleteSession` command + menu contribution
- `tests/manifest.test.mjs` — assert delete-session command + menu wiring

**Docs:**
- `CHANGELOG.md` — v0.6.0 entry
- `docs-site/docs/project/changelog.md` — mirror of CHANGELOG entry
- User-facing docs section covering the monitor `Discard` button and the sidebar `Delete Session` action (locate the existing "Recording" / "Recorded Sessions" page in `docs-site/`)

## Rollout

- Version: `0.6.0`.
- No data-migration required: existing sessions on disk continue to work, and the tombstone naming convention does not affect older sessions.
- A user who has an in-flight pending discard when they upgrade VS Code is safe — `gcOrphans` cleans up on next activate.

## GitHub issue (text supplied to user)

The full issue title, description, acceptance criteria, and closure message are recorded in the brainstorming output and will be transcribed when the issue is opened.
