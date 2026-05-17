# Discard / Delete Recording — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give users a one-click way to discard a recording immediately after it is saved (via an inline button in the monitor log and a `Discard` action on the "Recording saved" VS Code toast), backed by a soft-delete + undo-toast flow that is also exposed as `Delete Session` on the Recorded Sessions sidebar context menu.

**Architecture:** A new file-system core (pure JS, `src/recording/sessionDiscardCore.js`) owns the rename / restore / finalize / garbage-collect primitives so it can be unit-tested without `vscode`. A thin TypeScript wrapper (`src/recording/sessionDiscardService.ts`) layers VS Code concerns on top: toast lifecycle, tree refresh, and the single-slot pending state. `extension.ts` instantiates the service once and shares it with both `MonitorPanel` and the new `serialMonitorPro.deleteSession` command. Webview adds two inline buttons on each "Recording saved" log line via real `<button>` elements (CSP-safe).

**Tech Stack:** TypeScript (`src/`), VS Code Extension API, pure ESM JS (`media/`, plus the new `sessionDiscardCore.js`), `node:test` for unit tests, esbuild bundling, Jest config exists but is not used here (per `package.json` the test script is `node --test tests/*.test.mjs`).

---

## File Structure

**Created:**

- `src/recording/sessionDiscardCore.js` — Pure JS, no `vscode` import. Exports `softDelete(sessionDir)`, `undo(tombstoneDir, originalDir)`, `finalize(tombstoneDir)`, `findOrphans(storagePath)` and a single mutable `Pending` shape. CommonJS module pattern (matches `media/playback-core.js`).
- `src/recording/sessionDiscardService.ts` — TypeScript wrapper that depends on `vscode`, `SessionStorage`, `SessionTreeProvider`. Owns the pending-state slot, drives the "Recording discarded. [Undo]" toast, and refreshes the sessions tree.
- `tests/sessionDiscardCore.test.mjs` — Unit tests for the pure-JS core, against a temp directory created via `fs.mkdtempSync`.

**Modified:**

- `src/extension.ts` — Instantiate `SessionDiscardService`; pass it to `MonitorPanel.createOrShow`; register `serialMonitorPro.deleteSession` command; call `gcOrphans()` once at activation; push the service into `context.subscriptions`.
- `src/monitor/monitorPanel.ts` — Accept the service in the constructor; replace the existing `showInformationMessage('Recording saved: ...')` calls (both in `stopRecording` handler and in the `onClose` auto-stop branch) with action-equipped toasts that route `Open` and `Discard` results; handle new inbound webview messages `discardLastRecording` and `openSession`; call `discardService.finalize()` before starting a new recording.
- `media/monitor.js` — Replace the `recordingSaved` → `appendSystemLine(...)` path with a new helper `appendRecordingSavedLine({ sessionId, sessionName })` that renders the line with two `<button>` elements (`Open`, `Discard`). Replace the buttons with `(discarded)` text on Discard click.
- `media/monitor.css` — Inline action-button styles (`.saved-action-btn`) and `.saved-line-discarded` styling.
- `package.json` —
  - Bump `version` from `0.5.0` → `0.6.0`.
  - Add command `serialMonitorPro.deleteSession` with title `Delete Session` and icon `$(trash)`.
  - Add `view/item/context` menu entry binding the new command to `viewItem == recordedSession`.
- `tests/manifest.test.mjs` — Add an assertion that the new command is contributed AND wired into `view/item/context`.

**Docs:**

- `CHANGELOG.md` — `0.6.0` entry under "Added" (Discard button + Delete Session) and "Internal" (new core module, gc on activate).
- `docs-site/docs/project/changelog.md` — Mirror of the CHANGELOG entry.
- `docs-site/docs/features/recording.md` — New "Discarding a Recording" subsection.
- `docs-site/docs/features/sessions.md` — New "Deleting a Session" subsection.

---

## Test Strategy

The pure-JS `sessionDiscardCore.js` has full unit-test coverage via `tests/sessionDiscardCore.test.mjs`. The TypeScript service wrapper is exercised only via the manifest test (for static wiring) and manual smoke testing — this matches the codebase's established pattern (e.g. `playback-core.js` has unit tests; `PlaybackPanel.ts` does not). The new `deleteSession` command's contribution wiring is statically validated in `manifest.test.mjs`.

---

## Task 1 — Add the pure-JS discard core module

**Files:**
- Create: `src/recording/sessionDiscardCore.js`
- Test: `tests/sessionDiscardCore.test.mjs`

This is the file-system layer: rename to tombstone, rename back, hard-delete tombstone, find orphan tombstones at startup. No `vscode` import. CommonJS so `node --test` can `require` it.

- [ ] **Step 1: Write the failing test file**

Create `tests/sessionDiscardCore.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const core = require(path.join(here, '..', 'src', 'recording', 'sessionDiscardCore.js'));

function makeStorage() {
  const root = mkdtempSync(path.join(tmpdir(), 'smp-discard-'));
  return root;
}

function makeSession(root, id) {
  const dir = path.join(root, `session-${id}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ id }), 'utf8');
  return dir;
}

test('softDelete renames session-<id> to .discarded-session-<id>', () => {
  const root = makeStorage();
  try {
    const dir = makeSession(root, 'aaa');
    const tomb = core.softDelete(root, 'aaa');
    assert.equal(existsSync(dir), false);
    assert.equal(existsSync(tomb), true);
    assert.equal(tomb, path.join(root, '.discarded-session-aaa'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('undo renames .discarded-session-<id> back to session-<id>', () => {
  const root = makeStorage();
  try {
    const dir = makeSession(root, 'bbb');
    const tomb = core.softDelete(root, 'bbb');
    core.undo(root, 'bbb');
    assert.equal(existsSync(dir), true);
    assert.equal(existsSync(tomb), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('finalize removes the tombstone directory', () => {
  const root = makeStorage();
  try {
    makeSession(root, 'ccc');
    core.softDelete(root, 'ccc');
    core.finalize(root, 'ccc');
    assert.equal(existsSync(path.join(root, '.discarded-session-ccc')), false);
    assert.equal(existsSync(path.join(root, 'session-ccc')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('softDelete on missing session throws ENOENT', () => {
  const root = makeStorage();
  try {
    assert.throws(() => core.softDelete(root, 'missing'), { code: 'ENOENT' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('undo when no tombstone exists throws ENOENT', () => {
  const root = makeStorage();
  try {
    assert.throws(() => core.undo(root, 'missing'), { code: 'ENOENT' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('finalize is a no-op when no tombstone exists', () => {
  const root = makeStorage();
  try {
    // Should not throw.
    core.finalize(root, 'never-existed');
    assert.equal(existsSync(path.join(root, '.discarded-session-never-existed')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findOrphans lists every .discarded-session-* directory', () => {
  const root = makeStorage();
  try {
    makeSession(root, 'keep');
    makeSession(root, 'd1');
    makeSession(root, 'd2');
    core.softDelete(root, 'd1');
    core.softDelete(root, 'd2');
    const orphans = core.findOrphans(root).sort();
    assert.deepEqual(orphans, ['d1', 'd2']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findOrphans returns [] when storage dir does not exist', () => {
  const orphans = core.findOrphans(path.join(tmpdir(), 'smp-nope-' + Date.now()));
  assert.deepEqual(orphans, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/brian/codeme/vscode-serial-monitor-plus
node --test tests/sessionDiscardCore.test.mjs
```

Expected: FAIL with `Cannot find module '.../src/recording/sessionDiscardCore.js'`.

- [ ] **Step 3: Implement the core module**

Create `src/recording/sessionDiscardCore.js`:

```js
// Pure-JS file-system primitives for the soft-delete / undo / finalize flow.
// No vscode dependency — unit-tested directly from tests/sessionDiscardCore.test.mjs.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TOMBSTONE_PREFIX = '.discarded-session-';
const LIVE_PREFIX = 'session-';

function sessionPath(storageRoot, sessionId) {
  return path.join(storageRoot, LIVE_PREFIX + sessionId);
}

function tombstonePath(storageRoot, sessionId) {
  return path.join(storageRoot, TOMBSTONE_PREFIX + sessionId);
}

function softDelete(storageRoot, sessionId) {
  const src = sessionPath(storageRoot, sessionId);
  const dst = tombstonePath(storageRoot, sessionId);
  fs.renameSync(src, dst);
  return dst;
}

function undo(storageRoot, sessionId) {
  const src = tombstonePath(storageRoot, sessionId);
  const dst = sessionPath(storageRoot, sessionId);
  fs.renameSync(src, dst);
  return dst;
}

function finalize(storageRoot, sessionId) {
  const tomb = tombstonePath(storageRoot, sessionId);
  fs.rmSync(tomb, { recursive: true, force: true });
}

function findOrphans(storageRoot) {
  let entries;
  try {
    entries = fs.readdirSync(storageRoot, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
  const ids = [];
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith(TOMBSTONE_PREFIX)) {
      ids.push(entry.name.slice(TOMBSTONE_PREFIX.length));
    }
  }
  return ids;
}

module.exports = {
  TOMBSTONE_PREFIX,
  LIVE_PREFIX,
  sessionPath,
  tombstonePath,
  softDelete,
  undo,
  finalize,
  findOrphans,
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/sessionDiscardCore.test.mjs
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/recording/sessionDiscardCore.js tests/sessionDiscardCore.test.mjs
git commit -m "feat(recording): pure-JS file-system core for session soft-delete

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2 — Add the SessionDiscardService TypeScript wrapper

**Files:**
- Create: `src/recording/sessionDiscardService.ts`

The service owns:
- The single pending-discard slot (`pendingId`).
- Calling into the core for the rename / undo / finalize / orphan-gc primitives.
- Refreshing the sessions tree after each state change.
- Driving the "Recording discarded." toast with an `Undo` action.

`SessionStorage` exposes `getSessionDir(id)` which gives us the storage root via `path.dirname`. The service captures the storage root once at construction time.

- [ ] **Step 1: Implement the service**

Create `src/recording/sessionDiscardService.ts`:

```ts
import * as vscode from 'vscode';
import * as path from 'path';
import { SessionStorage, SessionTreeProvider } from '../storage/sessionStorage';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const discardCore = require('./sessionDiscardCore.js') as {
  softDelete(storageRoot: string, sessionId: string): string;
  undo(storageRoot: string, sessionId: string): string;
  finalize(storageRoot: string, sessionId: string): void;
  findOrphans(storageRoot: string): string[];
};

export class SessionDiscardService implements vscode.Disposable {
  private pending: { id: string } | undefined;
  private readonly storageRoot: string;

  constructor(
    private readonly storage: SessionStorage,
    private readonly treeProvider: SessionTreeProvider,
  ) {
    // SessionStorage stores its root privately; derive it from a session-dir lookup.
    // getSessionDir('') gives us "<root>/session-", whose dirname is the storage root.
    this.storageRoot = path.dirname(this.storage.getSessionDir(''));
  }

  /** Discard the named session: rename to tombstone, refresh tree, show undo toast.
   *  If another discard is already pending, finalize it first (single-slot). */
  async softDelete(sessionId: string, sessionName: string): Promise<void> {
    if (this.pending) {
      try {
        discardCore.finalize(this.storageRoot, this.pending.id);
      } catch (err) {
        console.warn('[SessionDiscardService] finalize-on-replace failed:', err);
      }
      this.pending = undefined;
    }

    try {
      discardCore.softDelete(this.storageRoot, sessionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      void vscode.window.showWarningMessage(`Could not discard recording: ${msg}`);
      this.treeProvider.refresh();
      return;
    }

    this.pending = { id: sessionId };
    this.treeProvider.refresh();

    // Drive the undo toast asynchronously — caller does not await.
    void this.driveUndoToast(sessionId, sessionName);
  }

  private async driveUndoToast(sessionId: string, sessionName: string): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
      `Recording discarded: ${sessionName}`,
      'Undo',
    );
    // If a different discard has since taken the pending slot, ignore stale result.
    if (this.pending?.id !== sessionId) {
      return;
    }
    if (choice === 'Undo') {
      try {
        discardCore.undo(this.storageRoot, sessionId);
        this.pending = undefined;
        this.treeProvider.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        void vscode.window.showWarningMessage(`Could not undo discard: ${msg}`);
      }
      return;
    }
    // Dismissed without Undo — finalize.
    try {
      discardCore.finalize(this.storageRoot, sessionId);
    } catch (err) {
      console.warn('[SessionDiscardService] finalize-on-dismiss failed:', err);
    }
    this.pending = undefined;
  }

  /** Called by MonitorPanel before starting a new recording — closes the
   *  discard window on the previously-saved session. */
  async finalizePending(): Promise<void> {
    if (!this.pending) return;
    const id = this.pending.id;
    this.pending = undefined;
    try {
      discardCore.finalize(this.storageRoot, id);
    } catch (err) {
      console.warn('[SessionDiscardService] finalizePending failed:', err);
    }
  }

  get pendingId(): string | undefined {
    return this.pending?.id;
  }

  /** Delete any leftover tombstone directories from a previous run. */
  async gcOrphans(): Promise<void> {
    let orphans: string[];
    try {
      orphans = discardCore.findOrphans(this.storageRoot);
    } catch (err) {
      console.warn('[SessionDiscardService] gcOrphans listing failed:', err);
      return;
    }
    for (const id of orphans) {
      try {
        discardCore.finalize(this.storageRoot, id);
      } catch (err) {
        console.warn(`[SessionDiscardService] failed to gc orphan ${id}:`, err);
      }
    }
  }

  dispose(): void {
    void this.finalizePending();
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/brian/codeme/vscode-serial-monitor-plus
npm run build
```

Expected: build succeeds without errors. (Note: `npm run lint` will be exercised at the end of the plan after all wiring is in.)

- [ ] **Step 3: Commit**

```bash
git add src/recording/sessionDiscardService.ts
git commit -m "feat(recording): SessionDiscardService for soft-delete with undo toast

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3 — Add the deleteSession command + menu in package.json

**Files:**
- Modify: `package.json` (commands, menus, version bump)

- [ ] **Step 1: Bump version to 0.6.0 and add the new command + menu**

Two edits to `package.json`.

(a) Change `"version": "0.5.0"` to `"version": "0.6.0"`.

(b) In `contributes.commands`, append a new command (before the closing `]` of the commands array, after `serialMonitorPro.refreshSessions`):

```json
,
{
  "command": "serialMonitorPro.deleteSession",
  "title": "Delete Session",
  "category": "Serial Monitor Pro",
  "icon": "$(trash)"
}
```

(c) In `contributes.menus["view/item/context"]`, append a new entry (after the existing `serialMonitorPro.openPlayback` entry):

```json
,
{
  "command": "serialMonitorPro.deleteSession",
  "when": "view == serialMonitorSessions && viewItem == recordedSession",
  "group": "1_modification"
}
```

The `1_modification` group is the VS Code convention for destructive context actions — it places the entry below `Open Playback` with a visual separator.

- [ ] **Step 2: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))" && echo OK
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(0.6.0): bump version and contribute Delete Session command

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4 — Wire SessionDiscardService into extension.ts

**Files:**
- Modify: `src/extension.ts`

We construct one `SessionDiscardService` once `sessionStorage` and `sessionTreeProvider` exist (i.e., after the real tree provider replaces the placeholder). The new service is shared with `MonitorPanel.createOrShow`. The new `serialMonitorPro.deleteSession` command uses it directly.

- [ ] **Step 1: Add the import**

In `src/extension.ts` at the top, add:

```ts
import { SessionDiscardService } from './recording/sessionDiscardService';
```

immediately below the existing `SessionRecorder` import.

- [ ] **Step 2: Construct the service and run gc**

In the `try { ... }` block, immediately after the line:

```ts
const sessionTreeProvider = new SessionTreeProvider(sessionStorage);
```

…leave the existing `sessionTreeView` reassignment, then **after**:

```ts
void portManager.refresh();
```

add:

```ts
const discardService = new SessionDiscardService(sessionStorage, sessionTreeProvider);
void discardService.gcOrphans();
```

- [ ] **Step 3: Pass the service to MonitorPanel**

Find both `MonitorPanel.createOrShow(context.extensionUri, item, sessionRecorder)` calls in `extension.ts` (one in `openMonitor`, one in `showPortQuickPick`) and add `discardService` as the fourth argument:

```ts
MonitorPanel.createOrShow(context.extensionUri, item, sessionRecorder, discardService);
```

`showPortQuickPick` needs the service as a parameter — extend its signature:

```ts
async function showPortQuickPick(
  portManager: SerialPortManager,
  extensionUri: vscode.Uri,
  sessionRecorder: SessionRecorder,
  discardService: SessionDiscardService,
) {
```

…and update the `openMonitor` command body's else-branch call to pass it:

```ts
} else {
  void showPortQuickPick(portManager, context.extensionUri, sessionRecorder, discardService);
}
```

- [ ] **Step 4: Register the deleteSession command**

In the `context.subscriptions.push(...)` block of commands, after the existing `refreshSessions` registration, add:

```ts
,
vscode.commands.registerCommand(
  'serialMonitorPro.deleteSession',
  async (item?: SessionTreeItem) => {
    if (!(item instanceof SessionTreeItem)) {
      return;
    }
    await discardService.softDelete(item.sessionId, item.sessionName);
  },
),
```

- [ ] **Step 5: Push the service into subscriptions**

In the final `context.subscriptions.push(portTreeView, sessionTreeView, portManager, sessionTreeProvider, sessionStorage, sessionRecorder);` block, add `discardService` to the list:

```ts
context.subscriptions.push(
  portTreeView,
  sessionTreeView,
  portManager,
  sessionTreeProvider,
  sessionStorage,
  sessionRecorder,
  discardService,
);
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/extension.ts
git commit -m "feat(extension): wire SessionDiscardService and deleteSession command

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5 — Update MonitorPanel to use the new discard flow

**Files:**
- Modify: `src/monitor/monitorPanel.ts`

Three changes:
1. Constructor accepts `SessionDiscardService` and `createOrShow` accepts and forwards it.
2. Both `stopRecording` paths (the explicit message handler AND the `onClose` auto-stop) replace the plain "Recording saved" toast with one that has `Open` and `Discard` action buttons, routing the result to the discard service or to `serialMonitorPro.openPlayback`.
3. Two new inbound messages from the webview (`discardLastRecording`, `openSession`) are handled. Before `startRecording` runs, `discardService.finalizePending()` is awaited.

- [ ] **Step 1: Add the import**

At the top of `src/monitor/monitorPanel.ts`, add below the existing `SessionRecorder` import:

```ts
import { SessionDiscardService } from '../recording/sessionDiscardService';
```

- [ ] **Step 2: Extend IncomingMessage union**

Replace the existing `IncomingMessage` type with:

```ts
type IncomingMessage =
  | {
      type: 'connect';
      baudRate?: number;
      dataBits?: 5 | 6 | 7 | 8;
      stopBits?: 1 | 1.5 | 2;
      parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
      lineEnding?: string;
    }
  | { type: 'disconnect' }
  | { type: 'send'; data: string }
  | { type: 'startRecording' }
  | { type: 'stopRecording'; name?: string }
  | { type: 'updateConfig'; config: Omit<PortConfig, 'path'> }
  | { type: 'updateAutoRecord'; enabled: boolean }
  | { type: 'discardLastRecording'; sessionId: string; sessionName: string }
  | { type: 'openSession'; sessionId: string };
```

- [ ] **Step 3: Update the constructor signature**

Replace the existing constructor signature with:

```ts
private constructor(
  panel: vscode.WebviewPanel,
  extensionUri: vscode.Uri,
  portPath: string,
  private readonly sessionRecorder: SessionRecorder,
  private readonly discardService: SessionDiscardService,
) {
```

- [ ] **Step 4: Update createOrShow signature and forwarding**

Replace `createOrShow` with:

```ts
public static createOrShow(
  extensionUri: vscode.Uri,
  portItem: PortTreeItem | string,
  sessionRecorder: SessionRecorder,
  discardService: SessionDiscardService,
): MonitorPanel {
  const portPath = typeof portItem === 'string' ? portItem : portItem.portInfo.path;

  const existing = MonitorPanel.currentPanels.get(portPath);
  if (existing) {
    existing.panel.reveal(vscode.ViewColumn.One);
    return existing;
  }

  const panel = vscode.window.createWebviewPanel(
    'serialMonitor',
    `Serial Monitor: ${portPath}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
    }
  );

  const monitorPanel = new MonitorPanel(panel, extensionUri, portPath, sessionRecorder, discardService);
  MonitorPanel.currentPanels.set(portPath, monitorPanel);
  return monitorPanel;
}
```

- [ ] **Step 5: Replace the auto-stop save toast (onClose)**

In the `this.portService.onClose(...)` listener, replace this block:

```ts
if (session) {
  void this.panel.webview.postMessage({
    type: 'recordingSaved',
    sessionId: session.id,
    sessionName: session.name,
  });
  void vscode.window.showInformationMessage(
    `Recording saved: ${session.name} (${session.events.length} events)`
  );
}
```

with:

```ts
if (session) {
  void this.panel.webview.postMessage({
    type: 'recordingSaved',
    sessionId: session.id,
    sessionName: session.name,
  });
  this.showRecordingSavedToast(session.id, session.name, session.events.length);
}
```

- [ ] **Step 6: Replace the explicit-stop save toast**

In the `case 'stopRecording'` branch of `handleMessage`, replace:

```ts
const session = await this.sessionRecorder.stopRecording(message.name);
if (session) {
  void this.panel.webview.postMessage({
    type: 'recordingSaved',
    sessionId: session.id,
    sessionName: session.name,
  });
  void vscode.window.showInformationMessage(
    `Recording saved: ${session.name} (${session.events.length} events)`
  );
}
```

with:

```ts
const session = await this.sessionRecorder.stopRecording(message.name);
if (session) {
  void this.panel.webview.postMessage({
    type: 'recordingSaved',
    sessionId: session.id,
    sessionName: session.name,
  });
  this.showRecordingSavedToast(session.id, session.name, session.events.length);
}
```

- [ ] **Step 7: Add the new private helper**

Add this private method to the `MonitorPanel` class, just above the `getHtmlForWebview` method:

```ts
private showRecordingSavedToast(sessionId: string, sessionName: string, eventCount: number): void {
  void vscode.window
    .showInformationMessage(
      `Recording saved: ${sessionName} (${eventCount} events)`,
      'Open',
      'Discard',
    )
    .then((choice) => {
      if (choice === 'Open') {
        void vscode.commands.executeCommand('serialMonitorPro.openPlayback', sessionId);
      } else if (choice === 'Discard') {
        void this.discardService.softDelete(sessionId, sessionName);
      }
    });
}
```

- [ ] **Step 8: Finalize pending discard before startRecording**

In the `case 'startRecording'` branch of `handleMessage`, replace:

```ts
case 'startRecording': {
  if (!this.portService.isOpen || !this.portService.config) {
    void this.panel.webview.postMessage({
      type: 'error',
      message: 'Cannot record: port is not connected',
    });
    return;
  }
  try {
    await this.sessionRecorder.startRecording(this.portService);
  } catch (err) {
    void this.panel.webview.postMessage({
      type: 'error',
      message: `Failed to start recording: ${errMessage(err)}`,
    });
  }
  break;
}
```

with:

```ts
case 'startRecording': {
  if (!this.portService.isOpen || !this.portService.config) {
    void this.panel.webview.postMessage({
      type: 'error',
      message: 'Cannot record: port is not connected',
    });
    return;
  }
  try {
    await this.discardService.finalizePending();
    await this.sessionRecorder.startRecording(this.portService);
  } catch (err) {
    void this.panel.webview.postMessage({
      type: 'error',
      message: `Failed to start recording: ${errMessage(err)}`,
    });
  }
  break;
}
```

Also: in the `portService.onOpen` listener at the top of the constructor, where auto-record runs, finalize before starting. Replace this snippet:

```ts
if (autoRecord && !this.sessionRecorder.isRecording) {
  void this.sessionRecorder.startRecording(this.portService).catch((err) => {
    void this.panel.webview.postMessage({
      type: 'error',
      message: `Failed to auto-start recording: ${errMessage(err)}`,
    });
  });
}
```

with:

```ts
if (autoRecord && !this.sessionRecorder.isRecording) {
  void (async () => {
    try {
      await this.discardService.finalizePending();
      await this.sessionRecorder.startRecording(this.portService);
    } catch (err) {
      void this.panel.webview.postMessage({
        type: 'error',
        message: `Failed to auto-start recording: ${errMessage(err)}`,
      });
    }
  })();
}
```

- [ ] **Step 9: Handle the two new inbound messages**

Add to the `switch (message.type) { ... }` in `handleMessage`, before the closing `}` (after the `case 'updateAutoRecord'` block):

```ts
case 'discardLastRecording': {
  await this.discardService.softDelete(message.sessionId, message.sessionName);
  break;
}

case 'openSession': {
  await vscode.commands.executeCommand('serialMonitorPro.openPlayback', message.sessionId);
  break;
}
```

- [ ] **Step 10: Verify TypeScript compiles**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 11: Commit**

```bash
git add src/monitor/monitorPanel.ts
git commit -m "feat(monitor): wire Open/Discard toast actions and inline discard messages

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6 — Render inline Open/Discard buttons in the monitor webview

**Files:**
- Modify: `media/monitor.js`
- Modify: `media/monitor.css`

The existing `recordingSaved` message handler in `media/monitor.js` only emits a system line. We replace that with a richer line that carries `[Open]` and `[Discard]` buttons. After the user clicks `Discard`, the buttons are replaced with the text `(discarded)`.

- [ ] **Step 1: Modify the recordingSaved handler in monitor.js**

In `media/monitor.js`, find the message switch and replace:

```js
case 'recordingSaved':
  appendSystemLine(`Recording saved: ${message.sessionName}`);
  break;
```

with:

```js
case 'recordingSaved':
  appendRecordingSavedLine(message.sessionId, message.sessionName);
  break;
```

- [ ] **Step 2: Add the new helper function**

In `media/monitor.js`, add this function immediately above the existing `appendSystemLine` function:

```js
function appendRecordingSavedLine(sessionId, sessionName) {
  const line = document.createElement('span');
  line.className = 'output-line system saved-line';

  const prefix = document.createElement('span');
  prefix.textContent = '--- Recording saved: ';
  line.appendChild(prefix);

  const nameSpan = document.createElement('span');
  nameSpan.className = 'saved-line-name';
  nameSpan.textContent = sessionName;
  line.appendChild(nameSpan);

  const openBtn = document.createElement('button');
  openBtn.className = 'saved-action-btn';
  openBtn.type = 'button';
  openBtn.textContent = 'Open';
  openBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'openSession', sessionId });
  });

  const discardBtn = document.createElement('button');
  discardBtn.className = 'saved-action-btn saved-action-discard';
  discardBtn.type = 'button';
  discardBtn.textContent = 'Discard';
  discardBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'discardLastRecording', sessionId, sessionName });
    // Replace the buttons with a (discarded) marker.
    openBtn.remove();
    discardBtn.remove();
    const marker = document.createElement('span');
    marker.className = 'saved-line-discarded';
    marker.textContent = '(discarded)';
    line.appendChild(marker);
    const trailing2 = document.createElement('span');
    trailing2.textContent = ' ---';
    line.appendChild(trailing2);
  });

  // Two spaces between buttons for breathing room.
  line.appendChild(document.createTextNode(' '));
  line.appendChild(openBtn);
  line.appendChild(document.createTextNode(' '));
  line.appendChild(discardBtn);

  const trailing = document.createElement('span');
  trailing.textContent = ' ---';
  line.appendChild(trailing);

  output.appendChild(line);
  if (autoscrollToggle.checked) {
    output.scrollTop = output.scrollHeight;
  }
}
```

- [ ] **Step 3: Add inline button styles to monitor.css**

Append the following to `media/monitor.css`:

```css
/* Inline action buttons on the "Recording saved" log line. */
.saved-action-btn {
    background: transparent;
    color: var(--vscode-textLink-foreground, #6cb6ff);
    border: 1px solid var(--vscode-panel-border, #444);
    border-radius: 3px;
    padding: 0 6px;
    font: inherit;
    font-size: 0.9em;
    cursor: pointer;
    margin: 0 1px;
}

.saved-action-btn:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.08));
}

.saved-action-btn.saved-action-discard {
    color: var(--vscode-errorForeground, #f97583);
    border-color: var(--vscode-errorForeground, #f97583);
}

.saved-line-name {
    font-style: normal;
    color: var(--vscode-foreground);
    margin-right: 6px;
}

.saved-line-discarded {
    color: var(--vscode-descriptionForeground);
    text-decoration: line-through;
    margin: 0 4px;
}
```

- [ ] **Step 4: Manually smoke-test the webview**

This step is manual because there is no headless webview test harness in the repo. Run `npm run watch` in one terminal, press F5 in VS Code to launch the Extension Development Host, connect to a serial port (any port), let the auto-record start, then disconnect. Verify:

- The output area shows `--- Recording saved: <name>  [Open]  [Discard] ---`.
- Clicking `Open` opens the playback panel.
- Clicking `Discard` replaces the buttons with `(discarded)`, removes the session from the sidebar, and shows a `Recording discarded: <name>` toast with an `Undo` button.
- Clicking `Undo` restores the session in the sidebar.
- Connecting again and disconnecting again — and ignoring the second `Discard` window — produces a session that is correctly persisted, while the first one (if discarded) is gone from disk.

- [ ] **Step 5: Commit**

```bash
git add media/monitor.js media/monitor.css
git commit -m "feat(monitor-webview): inline Open/Discard buttons on saved-recording line

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7 — Extend manifest tests for the new command + menu

**Files:**
- Modify: `tests/manifest.test.mjs`

- [ ] **Step 1: Add tests for the deleteSession contribution**

Append to `tests/manifest.test.mjs`:

```js
test('serialMonitorPro.deleteSession command is contributed with a title', () => {
  const commands = pkg.contributes?.commands ?? [];
  const cmd = commands.find((c) => c.command === 'serialMonitorPro.deleteSession');
  assert.ok(cmd, 'package.json must contribute serialMonitorPro.deleteSession');
  assert.ok(cmd.title && cmd.title.length > 0, 'deleteSession must have a non-empty title');
});

test('serialMonitorPro.deleteSession is wired into view/item/context for recordedSession', () => {
  const menus = pkg.contributes?.menus ?? {};
  const entries = menus['view/item/context'] ?? [];
  const entry = entries.find((m) => m.command === 'serialMonitorPro.deleteSession');
  assert.ok(entry, 'view/item/context must include serialMonitorPro.deleteSession');
  assert.match(
    entry.when ?? '',
    /view\s*==\s*serialMonitorSessions/,
    'deleteSession menu entry must scope to view == serialMonitorSessions',
  );
  assert.match(
    entry.when ?? '',
    /viewItem\s*==\s*recordedSession/,
    'deleteSession menu entry must scope to viewItem == recordedSession',
  );
});
```

- [ ] **Step 2: Run the manifest tests**

```bash
node --test tests/manifest.test.mjs
```

Expected: all manifest tests pass, including the two new ones.

- [ ] **Step 3: Commit**

```bash
git add tests/manifest.test.mjs
git commit -m "test(manifest): assert deleteSession command + context-menu wiring

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8 — Update documentation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs-site/docs/project/changelog.md`
- Modify: `docs-site/docs/features/recording.md`
- Modify: `docs-site/docs/features/sessions.md`

- [ ] **Step 1: Update CHANGELOG.md**

Add a new section at the top of `CHANGELOG.md`, **above** the `## [0.5.0]` heading:

```markdown
## [0.6.0] — 2026-05-17

One-click "throw it out" for a recording you didn't want — without modal dialogs and without losing the recording if you change your mind. When a recording is saved, both the VS Code toast and the in-monitor log line now offer **Open** and **Discard** actions. Discard removes the session from the sidebar immediately and shows an **Undo** toast; if you don't undo, the recording is permanently deleted the next time you start another recording, close VS Code, or perform another discard. The **Recorded Sessions** sidebar gets the same flow via a new right-click **Delete Session** action.

### Added

- **Discard button on saved-recording toast and log line.** After a recording is saved (either manually via the Stop button or automatically on disconnect), the existing "Recording saved" notification now includes **Open** and **Discard** buttons, and the corresponding `--- Recording saved: <name> ---` line in the monitor output has matching inline buttons. The inline buttons are CSP-safe (rendered as real `<button>` elements, not via `innerHTML`).
- **Soft-delete with undo.** Clicking **Discard** moves the session directory to a tombstone path (`.discarded-session-<id>`) so it disappears from the **Recorded Sessions** sidebar instantly, then shows a `Recording discarded: <name>` toast with an **Undo** button. Clicking **Undo** restores the session. The tombstone is permanently deleted (`rm -rf`) when the user starts another recording, performs another discard, or closes VS Code.
- **`Delete Session` context menu** on items in the **Recorded Sessions** sidebar, using the same soft-delete + undo flow. Right-click a session → **Delete Session**.

### Internal

- New `src/recording/sessionDiscardCore.js` pure-JS file-system module owns the rename / restore / finalize / find-orphans primitives so they can be unit-tested without `vscode`. Tested by `tests/sessionDiscardCore.test.mjs`.
- New `src/recording/sessionDiscardService.ts` TypeScript wrapper layers VS Code concerns (toast lifecycle, sessions-tree refresh, single-slot pending state) on the core.
- `extension.ts` calls `SessionDiscardService.gcOrphans()` at activation so any `.discarded-session-*` directory left behind by a crash is cleaned up.
- `tests/manifest.test.mjs` now asserts that the `serialMonitorPro.deleteSession` command and its `view/item/context` menu entry are both contributed.

```

- [ ] **Step 2: Mirror to docs-site changelog**

Apply the exact same Markdown block to the top of `docs-site/docs/project/changelog.md` (above the existing `## [0.5.0]` section).

- [ ] **Step 3: Add "Discarding a Recording" subsection to recording.md**

In `docs-site/docs/features/recording.md`, add a new section between "Auto-Record on Connect" and "Audio Recording":

```markdown
## Discarding a Recording

After a recording stops — whether you clicked **Stop** or auto-record handled the disconnect — Serial Monitor Pro shows a notification with **Open** and **Discard** buttons, and adds matching inline buttons to the `Recording saved: …` line in the monitor output.

- **Open** opens the session in the Playback panel.
- **Discard** removes the session from the **Recorded Sessions** sidebar immediately and shows an **Undo** notification. Click **Undo** within the notification to restore the session.

If you don't click **Undo**, the recording is permanently deleted the next time any of the following happens:

- You start another recording on this monitor panel.
- You discard or delete another session.
- VS Code closes.

Orphan tombstones from a crash or forced shutdown are garbage-collected the next time the extension activates, so nothing is left behind on disk.
```

- [ ] **Step 4: Add "Deleting a Session" subsection to sessions.md**

In `docs-site/docs/features/sessions.md`, add a new section between "Custom Storage Path" and "Sharing Sessions":

```markdown
## Deleting a Session

Right-click any session in the **Recorded Sessions** sidebar and choose **Delete Session**. The session is removed from the sidebar immediately and a notification appears with an **Undo** button — click **Undo** to restore it. If you don't undo, the session is permanently deleted the next time you delete another session or close VS Code.
```

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md docs-site/docs/project/changelog.md docs-site/docs/features/recording.md docs-site/docs/features/sessions.md
git commit -m "docs: changelog + docs-site entries for v0.6.0 discard flow

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9 — Final verification

**Files:**
- (No code changes — verification only.)

- [ ] **Step 1: Run the full test suite**

```bash
cd /Users/brian/codeme/vscode-serial-monitor-plus
npm test
```

Expected: all tests pass (including the new `sessionDiscardCore.test.mjs` and the extended manifest tests).

- [ ] **Step 2: Run the linter**

```bash
npm run lint
```

Expected: no errors. Fix any new lint warnings introduced by the changes (most likely on the `monitorPanel.ts` extensions). Lint warnings on pre-existing code that this branch did not touch may be left alone.

- [ ] **Step 3: Run a production build**

```bash
npm run build
```

Expected: build succeeds without errors.

- [ ] **Step 4: Verify packaging**

```bash
npm run package:verify
```

Expected: `vsce package` succeeds and the integration test passes. The generated `.vsix` includes the new `sessionDiscardCore.js` and the updated `monitorPanel.js`.

- [ ] **Step 5: Manual UI smoke**

Press F5 → Extension Development Host. Connect a serial port (any one will do, including a virtual loopback). Verify in order:

  1. Recording auto-starts. Disconnect the port.
  2. The "Recording saved" toast appears with `Open` and `Discard` buttons.
  3. The monitor output line has matching `[Open]` and `[Discard]` buttons.
  4. Click `Discard` on the inline button. Buttons become `(discarded)`; the session disappears from the sidebar; a `Recording discarded: <name>` toast appears with `Undo`.
  5. Click `Undo`. The session reappears in the sidebar.
  6. Reconnect, then disconnect again to produce a second recording. Click `Discard` from the toast this time. Then connect again and let auto-record start.
  7. The previous tombstone is finalized — verify by checking `.serial-sessions/` on disk has no `.discarded-session-*` directories.
  8. Right-click a session in the sidebar → `Delete Session`. The undo toast appears. Click `Undo`. The session is back.

- [ ] **Step 6: Final commit (if any fixups were needed)**

If steps 1–5 surfaced any small fixes, commit them with a `chore` or `fix` message. Otherwise skip.

- [ ] **Step 7: Push the branch**

```bash
git push -u origin feature/dumprecording
```

(Optional — only if the user asks for a PR.)

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| Inline `Discard` button on saved-recording log line | Task 6 |
| `Discard` action on "Recording saved" VS Code toast | Task 5 (showRecordingSavedToast) |
| Soft-delete via tombstone rename | Task 1 (core), Task 2 (service) |
| Sessions disappear from sidebar instantly | Task 2 (treeProvider.refresh) |
| `Recording discarded.` toast with `Undo` | Task 2 (driveUndoToast) |
| Single-slot pending discard, finalizes on next discard | Task 2 (softDelete: finalize-if-pending) |
| Finalize on next-recording-start | Task 5 (finalizePending in startRecording paths) |
| Finalize on shutdown | Task 2 (dispose) + Task 4 (subscriptions) |
| `Delete Session` sidebar context menu | Task 3 (package.json), Task 4 (command handler) |
| `.discarded-session-*` GC on activate | Task 2 (gcOrphans), Task 4 (called in activate) |
| Manifest tests for new command + menu | Task 7 |
| CHANGELOG + docs-site updates | Task 8 |
| Version bumped to 0.6.0 | Task 3 |

No gaps identified.
