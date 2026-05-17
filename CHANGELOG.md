# Changelog

All notable changes to Serial Monitor Pro are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] — 2026-05-18

When you open a recorded session, the playback panel now lands at the **end** of the timeline so the full serial log is rendered up front. This lets you tell at a glance whether you opened the right session — no need to scrub or press Play just to check. Hitting **Play** still rewinds to `00:00` and plays from the start, courtesy of the existing v0.5.0 end-of-session detection.

### Changed

- **Playback opens at the end of the timeline.** Previously, opening a session left the cursor at `00:00` and the output area empty until you pressed Play or scrubbed. The cursor now lands at `session.duration` on open, so every event up to the end is already visible. Sessions with `duration === 0` or missing duration still open at `00:00` (no regression).

### Internal

- New pure helper `initialCursorMs(session)` lives in `media/playback-core.js` next to the existing `isAtEnd` helper, matching the established UMD + `node:test` pattern. Unit-tested in `tests/playback-core.test.mjs` for positive, zero, missing, null, NaN, and negative durations.

## [0.6.0] — 2026-05-17

One-click "throw it out" for a recording you didn't want — without modal dialogs and without losing the recording if you change your mind. When a recording is saved, both the VS Code toast and the in-monitor log line now offer **Open** and **Discard** actions. Discard removes the session from the sidebar immediately and shows an **Undo** toast; if you don't undo, the recording is permanently deleted the next time you start another recording, close VS Code, or perform another discard. The **Recorded Sessions** sidebar gets the same flow via a new right-click **Delete Session** action.

### Added

- **Discard button on saved-recording toast and log line.** After a recording is saved (either manually via the Stop button or automatically on disconnect), the existing "Recording saved" notification now includes **Open** and **Discard** buttons, and the corresponding `--- Recording saved: <name> ---` line in the monitor output has matching inline buttons. The inline buttons are CSP-safe (rendered as real `<button>` elements, not via `innerHTML`).
- **Soft-delete with undo.** Clicking **Discard** moves the session directory to a tombstone path (`.discarded-session-<id>`) so it disappears from the **Recorded Sessions** sidebar instantly, then shows a `Recording discarded: <name>` toast with an **Undo** button. Clicking **Undo** restores the session. The tombstone is permanently deleted (`rm -rf`) when the user starts another recording, performs another discard, or closes VS Code.
- **`Delete Session` context menu** on items in the **Recorded Sessions** sidebar, using the same soft-delete + undo flow. Right-click a session → **Delete Session**.
- **Playback panel auto-closes on discard.** If a recording's Playback panel is open when the session is discarded (from the monitor flow or the sidebar), the panel is automatically closed so it doesn't keep stale file handles on the soft-deleted session directory.

### Internal

- New `src/recording/sessionDiscardCore.js` pure-JS file-system module owns the rename / restore / finalize / find-orphans primitives so they can be unit-tested without `vscode`. Tested by `tests/sessionDiscardCore.test.mjs`.
- New `src/recording/sessionDiscardService.ts` TypeScript wrapper layers VS Code concerns (toast lifecycle, sessions-tree refresh, single-slot pending state) on the core.
- `extension.ts` calls `SessionDiscardService.gcOrphans()` at activation so any `.discarded-session-*` directory left behind by a crash is cleaned up.
- `tests/manifest.test.mjs` now asserts that the `serialMonitorPro.deleteSession` command and its `view/item/context` menu entry are both contributed.

## [0.5.0] — 2026-05-17

Recording is now on by default: connecting to a port automatically starts a session and disconnecting saves it, so you never lose a debug session because you forgot to hit Record. The monitor toolbar is also reorganized to put Connect/Disconnect on the left where the eye lands first. Plus a small playback UX fix.

### Added

- **Auto-record on connect.** When the new **Auto-record on connect** checkbox in the monitor toolbar is ticked (default: on), starting a connection automatically starts a recording, and disconnecting automatically stops and saves it. The preference is stored in user settings as `serialMonitorPro.autoRecordOnConnect`, so it travels with VS Code Settings Sync. Untick the box to keep the previous manual-only behavior — the setting is remembered per-user across machines.

### Changed

- **Monitor toolbar reorganized.** Connect/Disconnect (plus the connection-status indicator) now live on the **left** of the primary toolbar, with baud rate, line ending, data bits, stop bits, and parity on the **right**. The primary action is now where you read first instead of where you read last.

### Fixed

- **Pressing Play at the end of a session now restarts playback from 00:00** instead of being a no-op. Previously, when playback reached `session.duration` the loop clamped `currentTimeMs` to the end and paused; clicking ▶ again called `startPlayback()`, but the very next frame the loop saw `currentTimeMs >= session.duration` and immediately paused again. The play handler now detects the end-of-session state and seeks to 0 before resuming.

### Internal

- Extracted the end-of-session check into a new pure helper module (`media/playback-core.js`), exported UMD-style so the webview script and Node `node:test` runner can share it — matching the existing `media/waveform-core.js` pattern.
- New unit tests in `tests/playback-core.test.mjs` cover `isAtEnd` for at/past/before the end, zero duration, missing duration, and start-of-playback.
- Auto-record start/stop logic lives in the extension host (in the existing `SerialPortService.onOpen` / `onClose` handlers inside `MonitorPanel`), not in the webview, so the auto-stop also fires when a port goes away unexpectedly (e.g. cable unplugged) — the in-progress recording is saved instead of orphaned.
- New manifest test (`tests/manifest.test.mjs`) asserts the new `serialMonitorPro.autoRecordOnConnect` setting exists with `type: boolean`, `default: true`, and a non-empty description, so the user-facing default cannot regress silently.

## [0.4.0] — 2026-05-15

Hotfix release for the **"There is no data provider registered that can provide view data."** error that marketplace users saw in the Serial Ports view immediately after installing v0.3.0. The published `.vsix` was missing its `serialport` runtime, so the extension could not finish loading; this release ships the runtime correctly and adds three layers of regression tests so the bug class cannot return.

### Fixed

- **"No data provider registered" error in the Serial Ports view** for marketplace installs. The published `.vsix` was being packaged without `serialport` (and its native-binding helpers `@serialport/*`, `node-addon-api`, `node-gyp-build`, `debug`, `ms`), so `require('serialport')` threw `MODULE_NOT_FOUND` at module load, `activate()` never ran, and the contributed tree views had no data provider attached. `.vscodeignore` now preserves the full runtime tree in the packaged extension.

### Changed

- **`serialport` is now imported lazily** inside the functions that need it instead of at the top of `extension.ts`. A missing or broken native binding can no longer prevent `activate()` from running — the existing error handling in `SerialPortManager.refresh()` now surfaces a real user-visible error instead.
- **`activate()` registers both tree views with placeholder providers as its first action**, then swaps in the real `TreeDataProvider`s inside a `try/catch`. If anything during initialization throws, the UI shows an actual error message via `showErrorMessage` rather than VS Code's cryptic default.
- **Trimmed unused esbuild externals.** `@serialport/bindings-cpp` and `node-record-lpcm16` were marked `external` in the bundler config but never imported anywhere in `src/` (audio recording shells out to the `rec` CLI directly). The dead config is gone.

### Internal

- New static manifest test (`tests/manifest.test.mjs`) asserts that every `esbuild` external (except `vscode`) is a declared runtime dependency, that `.vscodeignore` preserves every external under `node_modules/`, and that every contributed view ID is registered with `createTreeView()` in `extension.ts`.
- New packaging integration test (`tests/packaging.integration.mjs`, exposed as `npm run package:verify`) runs `vsce package`, unzips the resulting `.vsix`, and asserts that `dist/extension.js` plus every external resolves from the packaged `node_modules`. This test would have caught the v0.3.0 regression before publish.
- New activation test (`tests/activation.test.mjs`) calls `activate()` against a stubbed `vscode` API and asserts that both contributed view IDs are registered with non-null `TreeDataProvider`s before `activate()` returns.
- `npm run package:verify` runs in CI before the marketplace publish step, so a regression that strips `serialport` from the `.vsix` blocks the release.

### Known Issues

- The published `.vsix` ships only the host CI's platform-specific native bindings for `@serialport/bindings-cpp`. CI currently builds on Ubuntu, so macOS and Windows users may still see a `MODULE_NOT_FOUND` for the binding when the extension tries to list ports. The fix is to publish platform-specific `.vsix` files via `vsce package --target` per platform; tracked as a follow-up.

## [0.3.0] — 2026-05-15

This release focuses on the playback experience: the timeline now shows an audio waveform of your recorded commentary, markers are usable again with a much nicer UX, and the Recorded Sessions list refreshes itself when a recording stops. Two client-side XSS issues in the playback webview (flagged by CodeQL) are also fixed.

### Added

- **Audio waveform timeline.** The playback timeline now renders the session's audio commentary as a 96-pixel waveform track, with the RX/TX event ticks moved into a slim 8-pixel strip below. Waveforms are decoded from the session's `audio.wav` in the webview, peak-bucketed, and drawn to a canvas — so the visualization scales with the timeline width and updates as you resize the panel.
- **No-audio fallback for playback.** Sessions recorded without SoX (or with the microphone unavailable) render an empty waveform track instead of failing to load, keeping the rest of the playback UI fully functional.
- **Inline marker rename.** Click a marker label in the marker list to edit it in place. Enter or blur saves, Escape cancels, empty/unchanged values revert to the previous label.
- **Auto-numbered marker labels.** New markers are added immediately with a default `Marker N` label, ready to be renamed in the list (see the marker-add fix below for why this changed).
- **Stable marker IDs.** Markers now carry an optional `id` field in `manifest.json` for stable identification across rename and remove operations. Sessions saved before v0.3.0 have IDs back-filled automatically on load — existing recordings continue to work without any migration step.
- **Wider marker pin hit area.** Marker pins on the timeline now have a 16-pixel hit area (up from 2 pixels) while keeping the visible glyph centered on the marker timestamp, making them much easier to grab.
- **Automated Marketplace publishing.** Pushing a version tag on `main` now triggers a GitHub Actions workflow that builds and publishes the extension to the VS Code Marketplace. See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for details.

### Fixed

- **Recorded Sessions list now refreshes after a recording finishes** ([#2](https://github.com/tenacioustechie/vscode-serial-monitor-pro/issues/2)). Previously the new session would not appear in the sidebar until you manually clicked refresh.
- **Adding markers in playback works again.** The old "Add Marker" flow called `window.prompt` for a label, but `window.prompt` is blocked in VS Code webviews and silently returns `null`, so the handler bailed out before sending anything to the extension host. Markers are now added immediately with an auto-numbered label and renamed inline.
- **CSP error that prevented the waveform from loading.** The playback webview's Content Security Policy was tightened to allow the new `waveform.js` resource while still blocking inline scripts.

### Security

- **Fixed two client-side XSS issues in `media/playback.js`** flagged by CodeQL. Marker labels and other session-derived strings are now rendered via safe DOM APIs rather than `innerHTML`, and the session storage layer rejects manifests with unexpected shapes.
- **Locked down GitHub Actions permissions** for the Marketplace publish workflow to the minimum required (`contents: read`), reducing the blast radius of a workflow compromise.

### Internal

- ESLint is now configured for the TypeScript sources (`npm run lint`).
- Unit tests run via the built-in `node:test` runner (`npm test`); new tests cover the WAV header parser, PCM peak bucketer, sine-wave amplitude handling, and stereo downmix used by the waveform.
- Design specs and implementation plans for the waveform timeline and marker fix are checked in under `docs/superpowers/` for reference.

## [0.1.0] — 2026-04-28

### Added

- Serial port monitoring panel with configurable baud rate, data bits, stop bits, parity, and line ending
- Timeline recording — captures every RX/TX event with millisecond-precision timestamps
- Simultaneous microphone audio recording via SoX (optional)
- Session playback panel with variable speed (0.25×–10×), seek bar, and synchronized audio
- Annotation markers on the playback timeline
- Session management sidebar — lists all recorded sessions, stored as plain directories
- Custom baud rate support via `serialMonitorPro.customBaudRates` setting
- Graceful degradation when SoX is unavailable — serial recording continues without audio
