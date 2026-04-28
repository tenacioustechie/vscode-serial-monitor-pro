# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build          # Production build (minified, no sourcemaps)
npm run watch          # Development watch mode (sourcemaps enabled)
npm run lint           # ESLint TypeScript source
npm test               # Jest tests (experimental VM modules)
npm run vscode:prepublish  # Pre-publish production build
```

**Debug in VS Code:** Press F5 to launch the Extension Development Host (auto-runs `npm: watch`).

## Architecture

This is a VS Code extension with two distinct runtime contexts:

### Extension Host (Node.js) — `src/`
TypeScript source compiled via esbuild to `dist/extension.js`. The following are marked `external` and not bundled: `vscode`, `serialport`, `@serialport/bindings-cpp`, `node-record-lpcm16`.

- **`src/extension.ts`** — Entry point. Registers all VS Code commands and wires up the module tree.
- **`src/serialPort/`** — `SerialPortService` wraps the `serialport` library with EventEmitter-based callbacks (onData, onError, onOpen, onClose). `SerialPortManager` is a `TreeDataProvider` for the port list sidebar.
- **`src/recording/`** — Three-layer recording stack: `AudioRecorder` spawns `rec` (SoX) for microphone capture → `SerialEventLogger` captures timestamped RX/TX events → `SessionRecorder` orchestrates both.
- **`src/playback/`** — `PlaybackPanel` creates a webview and drives replay with variable speed (0.25x–10x).
- **`src/storage/`** — `SessionStorage` persists sessions to disk as directories (`session-{UUID}/manifest.json` + optional `audio.wav`). `SessionTreeProvider` is a `TreeDataProvider` for the sessions sidebar.
- **`src/monitor/`** — `MonitorPanel` creates a webview for live serial I/O.

### Webview (Browser JS) — `media/`
Plain JS files loaded as local resources into webview panels. Not bundled through esbuild. Communicate with the extension host via `vscode.postMessage` / `panel.webview.postMessage`.

- `media/monitor.js` + `media/monitor.css` — Live monitor UI
- `media/playback.js` + `media/playback.css` — Playback timeline UI

### Data Model

Sessions are stored as directories containing:
- `manifest.json` — `RecordingSession` object with `events: SerialEvent[]` and `markers: Marker[]`
- `audio.wav` — Optional synchronized audio from SoX

`SerialEvent.data` is **base64-encoded** for binary safety. `SerialEvent.timestamp` is a millisecond offset from `startTime`.

### Key Patterns

- **Disposables:** All VS Code resources (panels, listeners, commands) are pushed to `context.subscriptions` or explicitly disposed. Follow this pattern in all new code.
- **Webview communication:** Extension → webview via `panel.webview.postMessage({type, ...})`. Webview → extension via `panel.webview.onDidReceiveMessage`. Message types are string discriminants.
- **SoX dependency:** Audio recording requires SoX (`rec` command) to be installed. The extension warns and continues without audio if SoX is unavailable—maintain this graceful degradation.

## Configuration Namespace

All VS Code settings use the `serialMonitorPro.*` prefix. See `package.json` `contributes.configuration` for the full schema.
