# Serial Monitor Plus

**Serial Monitor Plus** is a VS Code extension for monitoring serial ports with a unique twist: every session can be recorded — serial data and microphone audio together — and played back later with synchronized timing.

Built for embedded developers, hardware engineers, and anyone who needs more than a basic serial terminal.

---

## Features

### Serial Monitor

Connect to any serial port directly from the VS Code sidebar. The monitor panel provides a terminal-style interface for sending and receiving data, with configurable baud rate, data bits, stop bits, parity, and line ending. Custom baud rates are supported via settings.

### Timeline Recording

Record a session and capture everything: every byte received or transmitted is logged with millisecond-precision timestamps, and your microphone is recorded simultaneously so you can narrate what you're observing. No browser permissions or special setup needed for audio — recording uses SoX under the hood.

Sessions are saved automatically as soon as you stop recording.

### Session Playback

Open any recorded session and replay it exactly as it happened. The playback panel shows a visual timeline with RX/TX event ticks, transport controls (play, pause, seek), and variable speed from 0.25x to 10x. Audio plays in sync with the data. You can add annotation markers at any point on the timeline and filter the event view by direction or timestamps.

### Session Management

All recorded sessions are listed in a dedicated sidebar panel. Sessions are stored as plain directories on disk (`manifest.json` + `audio.wav`) so they're easy to archive, share, or inspect outside of VS Code.

---

## Requirements

- **VS Code** 1.85.0 or later
- **SoX** for audio recording (optional — the extension works without it, without audio recording):
  - macOS: `brew install sox`
  - Linux: `apt install sox`
  - Windows: `choco install sox.portable`

---

## Getting Started

1. Open the **Serial Monitor Plus** panel from the activity bar (plug icon).
2. Your connected serial ports appear in the **Serial Ports** list.
3. Click a port to open the monitor, configure settings in the toolbar, and click **Connect**.

### Recording a Session

1. While connected to a port, click the **Record** button in the monitor toolbar.
2. Speak into your microphone to add voice commentary alongside the data.
3. Click **Stop** when done and give the session a name.

### Playing Back a Session

1. Find the session in the **Recorded Sessions** sidebar panel and click it.
2. Use the transport controls to play, pause, or seek through the timeline.
3. Click **Add Marker** to annotate points of interest for later reference.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `serialMonitorPlus.defaultBaudRate` | `115200` | Default baud rate for new connections |
| `serialMonitorPlus.customBaudRates` | `[]` | Additional baud rates to show in the selector |
| `serialMonitorPlus.defaultLineEnding` | `\n` | Line ending appended to outgoing messages |
| `serialMonitorPlus.timestampEnabled` | `false` | Show timestamps on received data |
| `serialMonitorPlus.sessionStoragePath` | `""` | Custom path for session storage (defaults to `.serial-sessions/` in the workspace) |

---

## License

MIT
