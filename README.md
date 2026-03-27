# Serial Monitor Plus

A Visual Studio Code extension for serial port monitoring with **timeline recording** and **audio commentary playback**.

## Features

### 🔌 Serial Monitor
- List and connect to serial ports from the sidebar
- Configurable baud rate, data bits, stop bits, parity, and line ending
- Send and receive serial data with a terminal-style interface
- Timestamps and auto-scroll options
- Custom baud rate support via settings

### 🔴 Timeline Recording
- Record serial I/O (RX/TX) with millisecond-precision timestamps
- Simultaneously record microphone audio for voice commentary
- Audio recording uses SoX — no browser permissions needed
- Sessions are automatically saved with all data + audio

### ▶️ Session Playback
- Replay serial data with original timing
- Synchronized audio playback
- Visual timeline with RX/TX event ticks
- Transport controls: play, pause, seek, variable speed (0.25x–10x)
- Add annotation markers at any point on the timeline
- Filter RX/TX events and toggle timestamps

### 📁 Session Management
- Browse recorded sessions in the sidebar
- Sessions stored as directories (manifest.json + audio.wav)
- Configurable storage location

## Requirements

- **VS Code** 1.85.0+
- **SoX** (for audio recording — optional but recommended):
  - macOS: `brew install sox`
  - Linux: `apt install sox`
  - Windows: `choco install sox.portable`

## Getting Started

1. Install the extension
2. Open the **Serial Monitor Plus** sidebar (plug icon in activity bar)
3. Click a serial port to open the monitor
4. Configure baud rate and other settings in the toolbar
5. Click **Connect** to start monitoring

### Recording a Session

1. While connected to a serial port, click the **🔴 Record** button
2. Speak into your microphone to add voice commentary
3. Click **■ Stop** when done
4. Name your session

### Playing Back a Session

1. Open a session from the **Recorded Sessions** sidebar panel
2. Use the transport controls to play/pause/seek
3. Audio plays in sync with the serial data timeline
4. Click **📌 Add Marker** to annotate interesting moments

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `serialMonitorPlus.defaultBaudRate` | `115200` | Default baud rate |
| `serialMonitorPlus.customBaudRates` | `[]` | Additional baud rates |
| `serialMonitorPlus.defaultLineEnding` | `\n` | Line ending for sent messages |
| `serialMonitorPlus.timestampEnabled` | `false` | Show timestamps |
| `serialMonitorPlus.sessionStoragePath` | `""` | Custom session storage path |

## Development

```bash
# Install dependencies
npm install

# Build (production)
npm run build

# Watch mode (for development)
npm run watch

# Run in VS Code
# Press F5 to launch Extension Development Host
```

## Architecture

```
src/
├── extension.ts              # Entry point, command registration
├── serialPort/
│   ├── types.ts              # Port configuration types
│   ├── serialPortManager.ts  # Port enumeration, tree view
│   └── serialPortService.ts  # Port read/write service
├── monitor/
│   └── monitorPanel.ts       # Serial monitor webview panel
├── recording/
│   ├── types.ts              # Session/event/marker types
│   ├── audioRecorder.ts      # Microphone recording via SoX
│   ├── serialEventLogger.ts  # Timestamped serial event capture
│   └── sessionRecorder.ts    # Recording orchestrator
├── playback/
│   └── playbackPanel.ts      # Playback webview panel
└── storage/
    └── sessionStorage.ts     # Session persistence + tree view
```

## License

MIT
