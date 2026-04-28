---
sidebar_position: 2
---

# Quick Start

## 1. Open the Panel

Click the **Serial Monitor Pro** icon (plug) in the VS Code activity bar. The **Serial Ports** and **Recorded Sessions** panels appear in the sidebar.

## 2. Connect to a Port

1. Your connected serial ports are listed automatically in the **Serial Ports** panel.
2. Click a port to open the monitor panel.
3. Set the baud rate and other options in the toolbar.
4. Click **Connect**.

Received data appears in the terminal-style output. Type a message in the input field at the bottom and press **Enter** to send.

## 3. Record a Session

1. While connected, click the **Record** (⏺) button in the monitor toolbar.
2. Speak into your microphone to add voice commentary — the microphone records in parallel with the serial data.
3. Click **Stop** when done.
4. Give the session a name in the prompt.

Sessions are saved automatically to the workspace `.serial-sessions/` directory.

## 4. Play Back a Session

1. Find the session in the **Recorded Sessions** sidebar panel.
2. Click it to open the playback panel.
3. Click **Play** to start replay. Audio plays in sync with the data timeline.
4. Use the seek bar to jump to any point. Adjust playback speed from 0.25× to 10×.

<!-- TODO: add walkthrough screenshot/GIF -->
