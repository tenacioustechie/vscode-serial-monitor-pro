---
sidebar_position: 2
---

# FAQ & Troubleshooting

## My serial port doesn't appear in the list

1. Make sure the device is connected and the USB driver is installed.
2. Click the **Refresh** (↻) button in the **Serial Ports** panel header.
3. On Linux, ensure your user is in the `dialout` group: `sudo usermod -aG dialout $USER` (requires logout/login).
4. On macOS, some CP210x and CH340 adapters need third-party drivers. Check the device manufacturer's site.

## Audio recording is not working

Audio recording requires SoX to be installed. Verify it is available:

```bash
rec --version
```

If the command is not found, follow the [installation guide](../getting-started/installation#sox--audio-recording-optional).

When SoX is unavailable, the extension displays a warning and continues without audio — serial data is still captured and saved normally.

## The extension crashes when connecting to a port

Serial Monitor Pro bundles `serialport` and `@serialport/bindings-cpp` as external native modules. If you installed the extension from a `.vsix` file on a machine with a different platform/architecture from where it was built, the native bindings may not match.

Install from the VS Code Marketplace to get the correct prebuilt binaries for your platform.

## Playback audio is out of sync

Audio sync is based on the wall-clock time at recording start. If the system clock was adjusted during recording, sync may drift. This is uncommon but can happen on systems with NTP corrections.

## Where are my recorded sessions stored?

By default in `.serial-sessions/` in your workspace root. You can change this with the `serialMonitorPro.sessionStoragePath` setting. See [Configuration](./configuration) for details.

## Can I share sessions with colleagues?

Yes. Copy or zip the `session-{UUID}/` directory from `.serial-sessions/` and send it. Place it in the recipient's `.serial-sessions/` folder and it will appear in the **Recorded Sessions** panel after a refresh.
