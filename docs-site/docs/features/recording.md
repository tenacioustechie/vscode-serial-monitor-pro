---
sidebar_position: 2
---

# Recording

Serial Monitor Pro can record an entire session — every byte sent and received, timestamped to the millisecond — along with simultaneous microphone audio so you can narrate what you're observing.

## Starting a Recording

1. Connect to a serial port (see [Serial Monitor](./serial-monitor)).
2. Click the **Record** (⏺) button in the monitor toolbar.
3. Recording begins immediately. Speak into your microphone to add voice commentary.

## Stopping a Recording

1. Click the **Stop** (■) button.
2. Enter a name for the session when prompted.
3. The session is saved automatically.

## Auto-Record on Connect

By default, connecting to a port automatically starts a recording, and disconnecting automatically stops and saves it — so you don't have to remember to hit Record before a debug session. Toggle this from the **Auto-record on connect** checkbox in the monitor toolbar, or via the [`serialMonitorPro.autoRecordOnConnect`](../reference/configuration#serialmonitorproautorecordonconnect) setting. The preference is stored at the user level and syncs across machines with VS Code Settings Sync.

## Audio Recording

Audio is captured using [SoX](https://sourceforge.net/projects/sox/) (`rec` command) at 16-bit PCM, 44.1 kHz, saved as `audio.wav`. If SoX is not installed, a warning is displayed and recording continues without audio — the serial data is still captured.

## Session Storage

Sessions are stored as directories under `.serial-sessions/` in your workspace (or a custom path configured via `serialMonitorPro.sessionStoragePath`):

```
.serial-sessions/
└── session-{UUID}/
    ├── manifest.json   ← serial events + markers + metadata
    └── audio.wav       ← optional audio (only if SoX was available)
```

`manifest.json` contains `SerialEvent` objects with:
- `timestamp` — millisecond offset from the session start
- `direction` — `rx` (received) or `tx` (sent)
- `data` — base64-encoded bytes (safe for binary data)

<!-- TODO: add screenshot of recording in progress -->
