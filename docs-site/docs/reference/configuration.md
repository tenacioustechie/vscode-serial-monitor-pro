---
sidebar_position: 1
---

# Configuration

All Serial Monitor Pro settings use the `serialMonitorPro.*` prefix. Configure them in VS Code's Settings UI (`Ctrl+,` / `Cmd+,`) or directly in `settings.json`.

## Settings Reference

### `serialMonitorPro.defaultBaudRate`

| | |
|---|---|
| Type | `number` |
| Default | `115200` |

Default baud rate used when opening a new serial port connection. Can be overridden per-connection in the monitor toolbar.

---

### `serialMonitorPro.customBaudRates`

| | |
|---|---|
| Type | `number[]` |
| Default | `[]` |

Additional baud rates to show in the baud rate selector dropdown alongside the standard rates. Useful for non-standard hardware.

**Example** (`settings.json`):
```json
"serialMonitorPro.customBaudRates": [57600, 250000, 1000000]
```

---

### `serialMonitorPro.defaultLineEnding`

| | |
|---|---|
| Type | `string` |
| Default | `"\n"` |
| Options | `""` (None), `"\n"` (LF), `"\r"` (CR), `"\r\n"` (CRLF) |

Line ending characters appended to messages sent via the monitor input field. Most microcontroller serial interfaces expect LF (`\n`) or CRLF (`\r\n`).

---

### `serialMonitorPro.timestampEnabled`

| | |
|---|---|
| Type | `boolean` |
| Default | `false` |

When enabled, each line of received data is prefixed with the time it arrived. Useful for correlating serial output with real-world events.

---

### `serialMonitorPro.sessionStoragePath`

| | |
|---|---|
| Type | `string` |
| Default | `""` |

Absolute path to a directory where recorded sessions are stored. Leave empty to use `.serial-sessions/` in the workspace root. Useful when you want sessions stored in a shared or project-independent location.

**Example** (`settings.json`):
```json
"serialMonitorPro.sessionStoragePath": "/Users/you/serial-sessions"
```
