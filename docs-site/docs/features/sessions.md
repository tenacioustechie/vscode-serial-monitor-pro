---
sidebar_position: 4
---

# Session Management

All recorded sessions are listed in the **Recorded Sessions** sidebar panel. Sessions are plain directories on disk — easy to archive, share, or inspect outside of VS Code.

## Viewing Sessions

Open the **Serial Monitor Pro** panel from the activity bar. The **Recorded Sessions** list shows all sessions in your workspace's `.serial-sessions/` directory (or the configured custom path). Click **Refresh** (↻) to reload the list.

## Session Directory Format

Each session is a self-contained directory:

```
.serial-sessions/
└── session-{UUID}/
    ├── manifest.json
    └── audio.wav        ← only present if audio was recorded
```

`manifest.json` structure:

```json
{
  "id": "session-uuid",
  "name": "My Session Name",
  "startTime": 1700000000000,
  "endTime": 1700000060000,
  "port": "/dev/tty.usbmodem1234",
  "baudRate": 115200,
  "events": [
    { "timestamp": 0, "direction": "rx", "data": "SGVsbG8=" },
    { "timestamp": 123, "direction": "tx", "data": "T0s=" }
  ],
  "markers": [
    { "timestamp": 5000, "label": "Interesting event" }
  ]
}
```

## Custom Storage Path

By default sessions are stored in `.serial-sessions/` in your workspace root. Set a custom absolute path with the `serialMonitorPro.sessionStoragePath` setting to use a shared location across projects.

## Sharing Sessions

Zip or copy a `session-{UUID}/` directory and send it to a colleague. They can place it in their own `.serial-sessions/` folder and open it from the **Recorded Sessions** panel.
