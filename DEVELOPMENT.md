# Development Guide

## Setup

```bash
npm install
```

## Commands

```bash
npm run build          # Production build (minified, no sourcemaps)
npm run watch          # Development watch mode (sourcemaps enabled)
npm run lint           # ESLint on TypeScript source
npm test               # Jest tests (experimental VM modules)
```

**Debug in VS Code:** Press F5 to launch the Extension Development Host. This auto-runs `npm: watch` as a pre-launch task.

## Architecture

The extension has two distinct runtime contexts that cannot share code directly:

### Extension Host (Node.js) — `src/`

TypeScript compiled via esbuild into `dist/extension.js` (CommonJS). The following packages are marked `external` and not bundled — they rely on prebuilt native binaries resolved at runtime: `vscode`, `serialport`, `@serialport/bindings-cpp`, `node-record-lpcm16`.

```
src/
├── extension.ts              # Entry point, command registration
├── serialPort/
│   ├── types.ts              # PortConfig, PortInfo interfaces, standard baud rates
│   ├── serialPortManager.ts  # TreeDataProvider for the port list sidebar
│   └── serialPortService.ts  # Wraps serialport with EventEmitter callbacks
├── monitor/
│   └── monitorPanel.ts       # Webview panel for live serial I/O
├── recording/
│   ├── types.ts              # RecordingSession, SerialEvent, Marker types
│   ├── audioRecorder.ts      # Spawns SoX `rec` for microphone capture
│   ├── serialEventLogger.ts  # Captures timestamped RX/TX events
│   └── sessionRecorder.ts    # Orchestrates audio + serial event recording
├── playback/
│   └── playbackPanel.ts      # Webview panel for session replay
└── storage/
    └── sessionStorage.ts     # Session persistence + SessionTreeProvider
```

### Webview (Browser JS) — `media/`

Plain JS files loaded as local resources into webview panels. **Not** processed by esbuild. Communicate with the extension host via `postMessage`.

```
media/
├── monitor.js / monitor.css     # Live monitor UI
└── playback.js / playback.css   # Playback timeline UI
```

### Data Model

Sessions are stored as directories under `.serial-sessions/` (or a custom path):

```
session-{UUID}/
├── manifest.json    # RecordingSession with events[] and markers[]
└── audio.wav        # Optional — only present if SoX was available
```

- `SerialEvent.data` is **base64-encoded** for binary safety
- `SerialEvent.timestamp` is a **millisecond offset** from `startTime`, not an absolute timestamp

### Key Patterns

**Disposables** — All VS Code resources (panels, listeners, commands) must be pushed to `context.subscriptions` or explicitly disposed. Every new panel or listener should follow this pattern.

**Webview messaging** — Extension → webview: `panel.webview.postMessage({ type, ...payload })`. Webview → extension: `panel.webview.onDidReceiveMessage`. Message `type` is a string discriminant.

**SoX dependency** — Audio recording spawns `rec` (SoX). If SoX is unavailable the extension warns the user and continues without audio. This graceful degradation must be preserved.

**Tree providers** — `SerialPortManager` and `SessionTreeProvider` both implement `vscode.TreeDataProvider`. Refresh is triggered by calling `_onDidChangeTreeData.fire()`.

## Build System

esbuild is configured in [esbuild.js](esbuild.js). Key settings:

- Entry: `src/extension.ts` → `dist/extension.js`
- Format: CommonJS (`cjs`)
- Platform: Node
- Production: minified, no sourcemaps (`--production` flag)
- Development: sourcemaps enabled, not minified

The `vscode:prepublish` script runs `npm run build` automatically before packaging with `vsce`.
