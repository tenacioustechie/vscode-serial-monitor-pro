---
sidebar_position: 1
---

# Serial Monitor

The serial monitor panel gives you a terminal-style interface for live serial communication directly inside VS Code.

## Connecting to a Port

1. Open the **Serial Monitor Pro** panel from the activity bar.
2. Your connected serial ports appear automatically in the **Serial Ports** list. Click **Refresh** (↻) if a port is not showing.
3. Click a port to open the monitor.
4. Configure connection settings in the toolbar (see below).
5. Click **Connect**.

## Connection Settings

| Setting | Description |
|---|---|
| Baud Rate | Data rate in bits per second. Common values: 9600, 115200. Custom rates can be added via the `serialMonitorPro.customBaudRates` setting. |
| Data Bits | Number of data bits per frame (typically 8). |
| Stop Bits | Number of stop bits (1 or 2). |
| Parity | Error detection bit: None, Even, or Odd. |
| Line Ending | Characters appended to outgoing messages: None, LF, CR, or CRLF. |

## Sending Data

Type a message in the input field at the bottom of the monitor panel and press **Enter** to send. The configured line ending is appended automatically.

## Timestamps

Enable timestamps on received data with the `serialMonitorPro.timestampEnabled` setting, or toggle it from the toolbar. Each incoming line is prefixed with the time it arrived.

<!-- TODO: add screenshot of the monitor panel -->
