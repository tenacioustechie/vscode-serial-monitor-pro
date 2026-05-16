---
sidebar_position: 1
---

# Changelog

All notable changes to Serial Monitor Pro are documented here.

## [0.5.0] — 2026-05-17

Small playback UX fix: pressing **Play** at the end of a session now restarts from the beginning instead of doing nothing, so you no longer have to click ⏮ first.

### Fixed

- **Pressing Play at the end of a session now restarts playback from 00:00** instead of being a no-op. Previously, when playback reached `session.duration` the loop clamped `currentTimeMs` to the end and paused; clicking ▶ again called `startPlayback()`, but the very next frame the loop saw `currentTimeMs >= session.duration` and immediately paused again. The play handler now detects the end-of-session state and seeks to 0 before resuming.

### Internal

- Extracted the end-of-session check into a new pure helper module (`media/playback-core.js`), exported UMD-style so the webview script and Node `node:test` runner can share it — matching the existing `media/waveform-core.js` pattern.
- New unit tests in `tests/playback-core.test.mjs` cover `isAtEnd` for at/past/before the end, zero duration, missing duration, and start-of-playback.

## [0.4.0] — 2026-05-15

Hotfix release for the **"There is no data provider registered that can provide view data."** error that marketplace users saw in the Serial Ports view immediately after installing v0.3.0. The published `.vsix` was missing its `serialport` runtime, so the extension could not finish loading; this release ships the runtime correctly and adds regression tests so the bug class cannot return.

### Fixed

- **"No data provider registered" error in the Serial Ports view** for marketplace installs. The published `.vsix` was being packaged without `serialport` and its native-binding helpers, so loading the extension threw `MODULE_NOT_FOUND` before `activate()` could run — leaving the contributed tree views with no data provider attached. The runtime tree is now preserved in the packaged extension.

### Changed

- **`serialport` is now loaded lazily.** A missing or broken native binding can no longer prevent the extension from activating — the error surfaces in the existing port-refresh flow instead, with a real user-visible message.
- **The Serial Ports and Recorded Sessions views register placeholder providers immediately on activation**, then swap in the real ones once initialization succeeds. If anything during init throws, the UI now shows a real error message instead of VS Code's cryptic default.

### Internal

- Added a static manifest test that locks the invariants between `package.json`, `esbuild` externals, and `.vscodeignore`.
- Added a packaging integration test (`npm run package:verify`) that runs `vsce package`, unzips the result, and asserts every runtime external resolves from the packaged extension. This would have caught the v0.3.0 regression before publish.
- Added an activation test that asserts both contributed view IDs are registered with non-null `TreeDataProvider`s before `activate()` returns.
- `npm run package:verify` runs in CI before the marketplace publish step.

### Known Issues

- The published `.vsix` ships only the host CI's platform-specific native bindings for `@serialport/bindings-cpp`. CI currently builds on Ubuntu, so macOS and Windows users may still see a `MODULE_NOT_FOUND` for the binding when the extension tries to list ports. The fix is to publish platform-specific `.vsix` files via `vsce package --target` per platform; tracked as a follow-up.

## [0.3.0] — 2026-05-15

This release focuses on the playback experience: the timeline now shows an audio waveform of your recorded commentary, markers are usable again with a much nicer UX, and the Recorded Sessions list refreshes itself when a recording stops. Two client-side XSS issues in the playback webview (flagged by CodeQL) are also fixed.

### Added

- **Audio waveform timeline.** The playback timeline now renders the session's audio commentary as a 96-pixel waveform track, with the RX/TX event ticks moved into a slim 8-pixel strip below. Waveforms are decoded from the session's `audio.wav` in the webview, peak-bucketed, and drawn to a canvas — so the visualization scales with the timeline width and updates as you resize the panel.
- **No-audio fallback for playback.** Sessions recorded without SoX (or with the microphone unavailable) render an empty waveform track instead of failing to load, keeping the rest of the playback UI fully functional.
- **Inline marker rename.** Click a marker label in the marker list to edit it in place. Enter or blur saves, Escape cancels, empty/unchanged values revert to the previous label.
- **Auto-numbered marker labels.** New markers are added immediately with a default `Marker N` label, ready to be renamed in the list.
- **Stable marker IDs.** Markers now carry an optional `id` field in `manifest.json` for stable identification across rename and remove operations. Sessions saved before v0.3.0 have IDs back-filled automatically on load — existing recordings continue to work without any migration step.
- **Wider marker pin hit area.** Marker pins on the timeline now have a 16-pixel hit area (up from 2 pixels) while keeping the visible glyph centered on the marker timestamp, making them much easier to grab.
- **Automated Marketplace publishing.** Pushing a version tag on `main` now triggers a GitHub Actions workflow that builds and publishes the extension to the VS Code Marketplace.

### Fixed

- **Recorded Sessions list now refreshes after a recording finishes** ([#2](https://github.com/tenacioustechie/vscode-serial-monitor-pro/issues/2)). Previously the new session would not appear in the sidebar until you manually clicked refresh.
- **Adding markers in playback works again.** The old "Add Marker" flow called `window.prompt` for a label, but `window.prompt` is blocked in VS Code webviews and silently returns `null`, so the handler bailed out before sending anything to the extension host. Markers are now added immediately with an auto-numbered label and renamed inline.
- **CSP error that prevented the waveform from loading.** The playback webview's Content Security Policy was adjusted to allow the new `waveform.js` resource while still blocking inline scripts.

### Security

- **Fixed two client-side XSS issues in the playback webview** flagged by CodeQL. Marker labels and other session-derived strings are now rendered via safe DOM APIs rather than `innerHTML`, and the session storage layer rejects manifests with unexpected shapes.
- **Locked down GitHub Actions permissions** for the Marketplace publish workflow to the minimum required (`contents: read`).

### Internal

- ESLint is now configured for the TypeScript sources (`npm run lint`).
- Unit tests run via the built-in `node:test` runner (`npm test`); new tests cover the WAV header parser, PCM peak bucketer, sine-wave amplitude handling, and stereo downmix used by the waveform.

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
