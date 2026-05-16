# Monitor Toolbar Layout + Auto-Record-on-Connect

## Summary

Two related changes to the Serial Monitor webview:

1. **Reorder the primary toolbar** so Connect/Disconnect (and status indicator) sit on the **left**, and the serial configuration selects (baud rate, line ending, data bits, stop bits, parity) sit on the **right**.
2. **Add an "Auto-record on connect" checkbox** to the secondary toolbar (in the existing recording-controls group). When ticked, recording starts automatically on port open and stops automatically on port close. The state is persisted in VS Code user settings (`serialMonitorPro.autoRecordOnConnect`) so it participates in Settings Sync. Default: enabled.

## Motivation

- Connect/Disconnect is the most frequent action on the monitor, but currently lives on the right where the eye lands last. Moving it left makes the primary action visually primary.
- Recording is one of this extension's flagship features but currently requires the user to remember to click Record after every connect. Defaulting auto-record to on means a fresh user immediately benefits from session capture; users who want manual control can untick the box and have that preference sync across machines.

## UI Changes

### Primary toolbar ([src/monitor/monitorPanel.ts:271-314](../../../src/monitor/monitorPanel.ts#L271-L314))

Swap the order of the two `.toolbar-group` divs in the primary toolbar. The existing `justify-content: space-between` on `.toolbar` ([media/monitor.css:35](../../../media/monitor.css#L35)) handles the horizontal spacing; no CSS changes required.

**Before:**
```
[ baud | line-end | data | stop | parity ]            [ Connect ] [ Disconnect ] ● Disconnected
```

**After:**
```
[ Connect ] [ Disconnect ] ● Disconnected            [ baud | line-end | data | stop | parity ]
```

### Secondary toolbar — new checkbox

Add to the `.recording-controls` group, *before* the Record button:

```html
<label class="auto-record-label">
  <input type="checkbox" id="autoRecordToggle"> Auto-record on connect
</label>
```

Final secondary toolbar:
```
[ Timestamps ] [ Auto-scroll ] [ Clear ]    [ Auto-record on connect ] [ ● Record ] [ ■ Stop ] [ 00:00 ]
```

## Configuration

New setting in `package.json` `contributes.configuration.properties`:

```json
"serialMonitorPro.autoRecordOnConnect": {
  "type": "boolean",
  "default": true,
  "scope": "window",
  "description": "Automatically start recording when a serial port is connected and stop when it is disconnected."
}
```

`scope: "window"` (the default) makes this a user-level setting, which VS Code Settings Sync covers automatically.

## Behavior

### Initial state

`MonitorPanel.getHtmlForWebview()` already reads `serialMonitorPro` config for baud rates. It will additionally read `autoRecordOnConnect` and inject `checked` on the checkbox accordingly, mirroring that pattern.

### Toggle persistence

When the user toggles the checkbox, the webview posts:

```ts
{ type: 'updateAutoRecord', enabled: boolean }
```

The extension host handles this by calling:

```ts
vscode.workspace.getConfiguration('serialMonitorPro')
  .update('autoRecordOnConnect', enabled, vscode.ConfigurationTarget.Global);
```

Writing to `Global` is what makes the value participate in Settings Sync. No round-trip back to the webview is needed because the checkbox is the source of truth visually.

### Auto-record logic (extension host)

Auto-record decisions live in the **extension host**, not the webview, because the port `onOpen` / `onClose` events already fire there and the host has direct access to `SessionRecorder` and `SerialPortService`. This also gives correct behavior when disconnection is triggered by the device unplugging (the webview wouldn't know).

In the existing [monitorPanel.ts:80-84 `onOpen` handler](../../../src/monitor/monitorPanel.ts#L80-L84):

```ts
this.portService.onOpen(() => {
  void this.panel.webview.postMessage({ type: 'connected' });
  const autoRecord = vscode.workspace
    .getConfiguration('serialMonitorPro')
    .get<boolean>('autoRecordOnConnect') ?? true;
  if (autoRecord && !this.sessionRecorder.isRecording) {
    void this.sessionRecorder.startRecording(this.portService);
  }
});
```

In the existing [monitorPanel.ts:74-78 `onClose` handler](../../../src/monitor/monitorPanel.ts#L74-L78):

```ts
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
    });
  }
});
```

Note: we don't gate auto-stop on the `autoRecordOnConnect` setting — if a recording is active when the port closes, we stop it. (Otherwise unticking mid-session would leave an orphaned recording running.)

### IncomingMessage type

Extend the union in [src/monitor/monitorPanel.ts:7-20](../../../src/monitor/monitorPanel.ts#L7-L20):

```ts
| { type: 'updateAutoRecord'; enabled: boolean }
```

### Webview script changes ([media/monitor.js](../../../media/monitor.js))

- Add `autoRecordToggle` element reference.
- On `change` event, post `{ type: 'updateAutoRecord', enabled: autoRecordToggle.checked }`.

The webview does **not** initiate start/stop recording on connect/disconnect — that's the extension host's job.

## Edge Cases

| Case | Behavior |
|------|----------|
| Connection fails | `onOpen` never fires → no recording attempt. |
| Port unplugged during recording | `onClose` fires → recording auto-stops and is saved. Matches user expectation. |
| User unticks auto-record while recording | No effect on the current recording. Setting only governs *future* opens. |
| Reconfigure mid-session (`updateConfig` triggers close→open) | The current implementation closes and reopens; auto-stop will save the in-progress recording and auto-start will begin a new one. A system line in the monitor output will make this visible to the user. (Acceptable; reconfiguring is rare and rarely happens mid-recording.) |
| User clicks Record before connecting | Record button is already disabled until connected ([media/monitor.js:123](../../../media/monitor.js#L123)). N/A. |
| SoX missing → recording start fails silently | `SessionRecorder.startRecording` already handles SoX absence gracefully per the project's documented contract. Auto-record inherits that behavior. |

## Testing

The project uses Node's built-in test runner (`node --test tests/*.test.mjs`) plus a packaging integration test. Manual verification (via F5 Extension Development Host) is the primary check for UI changes since there is no existing webview test harness:

1. Open monitor → verify Connect/Disconnect are on the left, config selects on the right.
2. Verify "Auto-record on connect" checkbox is present in the secondary toolbar, ticked by default.
3. Connect to a port → verify recording starts automatically (timer visible, system line shown).
4. Disconnect → verify recording stops and "Recording saved" toast appears.
5. Untick the checkbox, reload the monitor → verify it stays unticked (setting persisted).
6. With auto-record off, connect → verify recording does **not** start automatically; manual Record still works.
7. Inspect `settings.json` to confirm `serialMonitorPro.autoRecordOnConnect` is written at the user level.

No new automated tests are added; the logic touched is webview message wiring + a single `getConfiguration` read, both of which are exercised by the manual flow above.

## Out of Scope

- Workspace-level override of the setting (current scope is `window`, the default — user can manually adjust if needed).
- Visual redesign of the toolbar beyond the swap and one checkbox addition.
- Changes to the playback panel or recording session storage.
