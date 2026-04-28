---
sidebar_position: 2
---

# Contributing

Contributions are welcome. This guide covers setting up the development environment, the build system, and how to submit changes.

## Prerequisites

- [Node.js](https://nodejs.org) 20+
- [VS Code](https://code.visualstudio.com) 1.85+
- SoX (optional, for testing audio recording): see [Installation](../getting-started/installation#sox--audio-recording-optional)

## Setup

```bash
git clone https://github.com/tenacioustechie/vscode-serial-monitor-pro.git
cd vscode-serial-monitor-pro
npm install
```

## Development Commands

```bash
npm run build      # Production build (minified, no sourcemaps)
npm run watch      # Development watch mode (sourcemaps enabled)
npm run lint       # ESLint on TypeScript source
npm test           # Jest tests
```

**Debug in VS Code:** Press `F5` to launch the Extension Development Host. This auto-runs `npm: watch` as a pre-launch task and opens a new VS Code window with the extension loaded.

## Project Structure

```
src/                    ← TypeScript extension host source
├── extension.ts        ← Entry point, command registration
├── serialPort/         ← Port listing and serial communication
├── monitor/            ← Live monitor webview panel
├── recording/          ← Audio + serial event recording stack
├── playback/           ← Session replay webview panel
└── storage/            ← Session persistence and tree provider
media/                  ← Webview JS/CSS (not bundled via esbuild)
docs-site/              ← This documentation site (Docusaurus)
```

## Submitting Changes

1. Fork the repository and create a branch from `main`.
2. Make your changes. Add tests for any new logic.
3. Run `npm run lint` and `npm test` — both must pass.
4. Open a pull request against `main` with a clear description.

## Docs Changes

The docs site source lives in `docs-site/`. To preview locally:

```bash
cd docs-site
npm install
npm start
```

This opens a local dev server at `http://localhost:3000` with hot reload.
