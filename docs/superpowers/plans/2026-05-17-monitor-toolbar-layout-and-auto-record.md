# Monitor Toolbar Layout + Auto-Record-on-Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder the Serial Monitor primary toolbar so Connect/Disconnect sit on the left, and add a synced "Auto-record on connect" checkbox (default on) that starts recording on port open and stops it on port close.

**Architecture:** Single VS Code config key `serialMonitorPro.autoRecordOnConnect` (window scope → covered by Settings Sync). Webview reflects the value; the extension host owns the auto-start/auto-stop logic by hooking into the existing `SerialPortService.onOpen` / `onClose` handlers in `MonitorPanel`. The webview only re-posts the user's toggle state back so the host can `getConfiguration().update(...)` it.

**Tech Stack:** TypeScript + esbuild for the extension host, plain JS for the webview, `node --test` for the manifest test.

**Spec:** [docs/superpowers/specs/2026-05-17-monitor-toolbar-layout-and-auto-record-design.md](../specs/2026-05-17-monitor-toolbar-layout-and-auto-record-design.md)

---

## File Structure

| File | Change | Responsibility |
|------|--------|---------------|
| [package.json](../../../package.json) | Modify (`contributes.configuration.properties`) | Declare the new `serialMonitorPro.autoRecordOnConnect` setting. |
| [tests/manifest.test.mjs](../../../tests/manifest.test.mjs) | Modify (add one test) | Static assertion that the new setting exists with the correct shape. |
| [src/monitor/monitorPanel.ts](../../../src/monitor/monitorPanel.ts) | Modify | Toolbar HTML reorder, inject `autoRecordOnConnect` initial state, extend `IncomingMessage` union, add `updateAutoRecord` handler, auto-start on `onOpen`, auto-stop on `onClose`. |
| [media/monitor.js](../../../media/monitor.js) | Modify | Bind the `autoRecordToggle` `change` event and post `updateAutoRecord` to the host. |

No new files. No CSS changes required (existing `.toolbar { justify-content: space-between }` handles the layout swap).

---

## Task 1: Add the `autoRecordOnConnect` config setting (TDD)

**Files:**
- Modify: [tests/manifest.test.mjs](../../../tests/manifest.test.mjs) (append a new test)
- Modify: [package.json](../../../package.json) (extend `contributes.configuration.properties`)

- [ ] **Step 1: Write the failing test**

Append to [tests/manifest.test.mjs](../../../tests/manifest.test.mjs):

```javascript
test('serialMonitorPro.autoRecordOnConnect is a boolean setting defaulting to true', () => {
  const props = pkg.contributes?.configuration?.properties ?? {};
  const setting = props['serialMonitorPro.autoRecordOnConnect'];
  assert.ok(setting, 'package.json must contribute serialMonitorPro.autoRecordOnConnect');
  assert.equal(setting.type, 'boolean', 'autoRecordOnConnect must be a boolean');
  assert.equal(setting.default, true, 'autoRecordOnConnect must default to true');
  assert.ok(setting.description, 'autoRecordOnConnect must have a description');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: the new `serialMonitorPro.autoRecordOnConnect is a boolean setting...` test fails with "package.json must contribute serialMonitorPro.autoRecordOnConnect".

- [ ] **Step 3: Add the setting to `package.json`**

In [package.json](../../../package.json), inside `contributes.configuration.properties`, add a new entry **after** the existing `serialMonitorPro.sessionStoragePath` block (before the closing `}` of `properties`):

```json
,
"serialMonitorPro.autoRecordOnConnect": {
  "type": "boolean",
  "default": true,
  "scope": "window",
  "description": "Automatically start recording when a serial port is connected and stop when it is disconnected."
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: all manifest tests (including the new one) pass.

- [ ] **Step 5: Commit**

```bash
git add package.json tests/manifest.test.mjs
git commit -m "feat: add serialMonitorPro.autoRecordOnConnect setting"
```

---

## Task 2: Reorder the primary toolbar

**Files:**
- Modify: [src/monitor/monitorPanel.ts](../../../src/monitor/monitorPanel.ts) lines 272-313 (swap the two `<div class="toolbar-group">` blocks in the primary toolbar)

- [ ] **Step 1: Swap the toolbar groups**

In [src/monitor/monitorPanel.ts](../../../src/monitor/monitorPanel.ts), replace the primary toolbar block (everything between `<div class="toolbar">` and the closing `</div>` that ends the primary toolbar — currently lines 271-314) with this exact HTML, where the Connect/Disconnect group is now first:

```html
        <div class="toolbar">
            <div class="toolbar-group">
                <button id="connectBtn" class="btn btn-primary">Connect</button>
                <button id="disconnectBtn" class="btn btn-danger" disabled>Disconnect</button>
                <span id="statusIndicator" class="status-indicator disconnected">●</span>
                <span id="statusText">Disconnected</span>
            </div>

            <div class="toolbar-group">
                <label for="baudRate">Baud Rate:</label>
                <select id="baudRate">${baudRateOptions}</select>

                <label for="lineEnding">Line Ending:</label>
                <select id="lineEnding">
                    <option value="">None</option>
                    <option value="\\n" selected>LF (\\n)</option>
                    <option value="\\r">CR (\\r)</option>
                    <option value="\\r\\n">CRLF (\\r\\n)</option>
                </select>

                <label for="dataBits">Data Bits:</label>
                <select id="dataBits">
                    <option value="5">5</option>
                    <option value="6">6</option>
                    <option value="7">7</option>
                    <option value="8" selected>8</option>
                </select>

                <label for="stopBits">Stop Bits:</label>
                <select id="stopBits">
                    <option value="1" selected>1</option>
                    <option value="2">2</option>
                </select>

                <label for="parity">Parity:</label>
                <select id="parity">
                    <option value="none" selected>None</option>
                    <option value="even">Even</option>
                    <option value="odd">Odd</option>
                    <option value="mark">Mark</option>
                    <option value="space">Space</option>
                </select>
            </div>
        </div>
```

- [ ] **Step 2: Verify compile + lint**

Run: `npm run lint && npm run build`
Expected: no lint or build errors.

- [ ] **Step 3: Commit**

```bash
git add src/monitor/monitorPanel.ts
git commit -m "feat(monitor): move Connect/Disconnect to left of primary toolbar"
```

---

## Task 3: Inject `autoRecordOnConnect` initial state + render the checkbox

**Files:**
- Modify: [src/monitor/monitorPanel.ts](../../../src/monitor/monitorPanel.ts) — `getHtmlForWebview()` (read config + extend the recording-controls group)

- [ ] **Step 1: Read the config value in `getHtmlForWebview`**

In [src/monitor/monitorPanel.ts](../../../src/monitor/monitorPanel.ts), inside `getHtmlForWebview()`, locate the existing block (around lines 249-252):

```typescript
    const config = vscode.workspace.getConfiguration('serialMonitorPro');
    const customBaudRates = config.get<number[]>('customBaudRates') ?? [];
    const allBaudRates = [...STANDARD_BAUD_RATES, ...customBaudRates].sort((a, b) => a - b);
    const defaultBaudRate = config.get<number>('defaultBaudRate') ?? 115200;
```

Add immediately below it:

```typescript
    const autoRecordOnConnect = config.get<boolean>('autoRecordOnConnect') ?? true;
    const autoRecordChecked = autoRecordOnConnect ? 'checked' : '';
```

- [ ] **Step 2: Add the checkbox to the secondary toolbar HTML**

In the same method, find the `.recording-controls` group (currently around lines 326-334):

```html
            <div class="toolbar-group recording-controls">
                <button id="recordBtn" class="btn btn-record" disabled title="Start Recording">
                    <span class="record-dot">●</span> Record
                </button>
                <button id="stopRecordBtn" class="btn btn-stop-record" disabled title="Stop Recording" style="display:none;">
                    <span>■</span> Stop
                </button>
                <span id="recordingTimer" class="recording-timer" style="display:none;">00:00</span>
            </div>
```

Insert a new `<label>` as the first child of that `<div>`, so the group now reads:

```html
            <div class="toolbar-group recording-controls">
                <label class="auto-record-label">
                    <input type="checkbox" id="autoRecordToggle" ${autoRecordChecked}> Auto-record on connect
                </label>
                <button id="recordBtn" class="btn btn-record" disabled title="Start Recording">
                    <span class="record-dot">●</span> Record
                </button>
                <button id="stopRecordBtn" class="btn btn-stop-record" disabled title="Stop Recording" style="display:none;">
                    <span>■</span> Stop
                </button>
                <span id="recordingTimer" class="recording-timer" style="display:none;">00:00</span>
            </div>
```

- [ ] **Step 3: Verify compile + lint**

Run: `npm run lint && npm run build`
Expected: no lint or build errors.

- [ ] **Step 4: Commit**

```bash
git add src/monitor/monitorPanel.ts
git commit -m "feat(monitor): add Auto-record on connect checkbox to toolbar"
```

---

## Task 4: Wire the checkbox toggle → persist setting via `getConfiguration().update`

**Files:**
- Modify: [media/monitor.js](../../../media/monitor.js) (capture element + change listener)
- Modify: [src/monitor/monitorPanel.ts](../../../src/monitor/monitorPanel.ts) (extend `IncomingMessage` union, add handler case)

- [ ] **Step 1: Add the element ref and change listener in the webview**

In [media/monitor.js](../../../media/monitor.js), after the existing DOM element declarations (around line 24), add:

```javascript
  const autoRecordToggle = document.getElementById('autoRecordToggle');
```

Then, near the other button event listeners (e.g., after the `clearBtn.addEventListener` block around line 69), add:

```javascript
  // Auto-record on connect toggle
  autoRecordToggle.addEventListener('change', () => {
    vscode.postMessage({
      type: 'updateAutoRecord',
      enabled: autoRecordToggle.checked,
    });
  });
```

- [ ] **Step 2: Extend the `IncomingMessage` union**

In [src/monitor/monitorPanel.ts](../../../src/monitor/monitorPanel.ts), update the `IncomingMessage` type (currently lines 7-20) by adding one new union member before the closing semicolon:

```typescript
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
  | { type: 'updateAutoRecord'; enabled: boolean };
```

- [ ] **Step 3: Handle the new message**

In the same file, in the `handleMessage` `switch` (currently ends around line 241), add a new `case` immediately before the closing brace of the switch (i.e., after the existing `'updateConfig'` case):

```typescript
      case 'updateAutoRecord': {
        await vscode.workspace
          .getConfiguration('serialMonitorPro')
          .update('autoRecordOnConnect', message.enabled, vscode.ConfigurationTarget.Global);
        break;
      }
```

- [ ] **Step 4: Verify compile + lint**

Run: `npm run lint && npm run build`
Expected: no lint or build errors. The TypeScript compiler should not flag `IncomingMessage` exhaustiveness since the existing switch has no `default` and other cases aren't exhaustive-checked.

- [ ] **Step 5: Commit**

```bash
git add src/monitor/monitorPanel.ts media/monitor.js
git commit -m "feat(monitor): persist Auto-record toggle to user settings"
```

---

## Task 5: Auto-start recording on port open

**Files:**
- Modify: [src/monitor/monitorPanel.ts](../../../src/monitor/monitorPanel.ts) — the `onOpen` handler (currently lines 80-84)

- [ ] **Step 1: Extend the `onOpen` handler**

In [src/monitor/monitorPanel.ts](../../../src/monitor/monitorPanel.ts), replace the existing `onOpen` handler block (currently lines 80-84):

```typescript
    this.disposables.push(
      this.portService.onOpen(() => {
        void this.panel.webview.postMessage({ type: 'connected' });
      })
    );
```

with:

```typescript
    this.disposables.push(
      this.portService.onOpen(() => {
        void this.panel.webview.postMessage({ type: 'connected' });

        const autoRecord = vscode.workspace
          .getConfiguration('serialMonitorPro')
          .get<boolean>('autoRecordOnConnect') ?? true;
        if (autoRecord && !this.sessionRecorder.isRecording) {
          void this.sessionRecorder.startRecording(this.portService).catch((err) => {
            void this.panel.webview.postMessage({
              type: 'error',
              message: `Failed to auto-start recording: ${errMessage(err)}`,
            });
          });
        }
      })
    );
```

- [ ] **Step 2: Verify compile + lint**

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/monitor/monitorPanel.ts
git commit -m "feat(monitor): auto-start recording on port open when enabled"
```

---

## Task 6: Auto-stop recording on port close

**Files:**
- Modify: [src/monitor/monitorPanel.ts](../../../src/monitor/monitorPanel.ts) — the `onClose` handler (currently lines 74-78)

- [ ] **Step 1: Extend the `onClose` handler**

Replace the existing `onClose` handler block (currently lines 74-78):

```typescript
    this.disposables.push(
      this.portService.onClose(() => {
        void this.panel.webview.postMessage({ type: 'disconnected' });
      })
    );
```

with:

```typescript
    this.disposables.push(
      this.portService.onClose(() => {
        void this.panel.webview.postMessage({ type: 'disconnected' });

        if (this.sessionRecorder.isRecording) {
          void this.sessionRecorder.stopRecording().then((session) => {
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
          }).catch((err) => {
            void this.panel.webview.postMessage({
              type: 'error',
              message: `Failed to auto-stop recording: ${errMessage(err)}`,
            });
          });
        }
      })
    );
```

Note: auto-stop is **not** gated by the `autoRecordOnConnect` setting — if a recording is active when the port closes (for any reason: user untick mid-session, manual record then disconnect, device unplug), we always stop and save it, so we never leave an orphaned recording running.

- [ ] **Step 2: Verify compile + lint**

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/monitor/monitorPanel.ts
git commit -m "feat(monitor): auto-stop recording on port close"
```

---

## Task 7: Full verification

**Files:** none modified.

- [ ] **Step 1: Run all checks**

Run: `npm run lint && npm test && npm run build`
Expected: lint clean, all tests pass, build produces `dist/extension.js`.

- [ ] **Step 2: Manual verification in Extension Development Host**

Press F5 in VS Code to launch the Extension Development Host, then:

1. Open the Serial Monitor on a port. Confirm:
   - Connect/Disconnect buttons appear on the **left** of the primary toolbar, with status indicator beside them.
   - Baud rate / line ending / data bits / stop bits / parity selects appear on the **right** of the primary toolbar.
   - "Auto-record on connect" checkbox appears in the secondary toolbar, **ticked by default**, immediately before the Record button.
2. Click Connect → confirm recording starts automatically (timer appears, "🔴 Recording started" system line shows).
3. Click Disconnect → confirm recording stops and a "Recording saved: ..." toast appears.
4. Untick "Auto-record on connect", reload the webview (close and reopen the monitor) → confirm the checkbox is still unticked (setting persisted).
5. With auto-record off, click Connect → confirm recording does **not** start automatically; manual Record still works.
6. Re-tick auto-record → open `~/Library/Application Support/Code/User/settings.json` (or use Cmd+, → search `autoRecordOnConnect`) → confirm `serialMonitorPro.autoRecordOnConnect: true` is written at the user level.

- [ ] **Step 3: No extra commit if everything passes**

If manual verification surfaces a bug, fix in a new commit. Otherwise, the work is complete.

---

## Self-Review Notes

**Spec coverage check:**
- Toolbar reorder → Task 2 ✓
- Checkbox visible in secondary toolbar with default-on → Task 3 ✓
- New config setting → Task 1 ✓
- Setting Sync (Global update target) → Task 4 ✓
- Initial state injection → Task 3 ✓
- Auto-start on open → Task 5 ✓
- Auto-stop on close (always, not gated by setting) → Task 6 ✓
- IncomingMessage union extension → Task 4 ✓
- All edge cases in spec are covered by host-side behavior in Tasks 5–6; the reconnect-during-`updateConfig` edge case is inherent in the existing code path and produces the documented stop→start behavior automatically.

**Placeholder scan:** no TBDs, no "add appropriate handling", every step contains the literal code or command to run.

**Type consistency:** `updateAutoRecord` message shape `{ type, enabled }` is consistent between webview post (Task 4 Step 1) and host handler (Task 4 Step 3). `serialMonitorPro.autoRecordOnConnect` is referenced identically in package.json (Task 1), `getHtmlForWebview` (Task 3), `updateAutoRecord` handler (Task 4), and `onOpen` (Task 5).
