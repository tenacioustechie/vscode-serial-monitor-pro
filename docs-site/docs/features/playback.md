---
sidebar_position: 3
---

# Playback

The playback panel lets you replay any recorded session with variable speed and synchronized audio.

## Opening a Session

1. Find the session in the **Recorded Sessions** sidebar panel.
2. Click it to open the playback panel.

## Transport Controls

| Control | Action |
|---|---|
| **Play / Pause** | Start or pause playback |
| **Seek bar** | Click or drag to jump to any point in the session |
| **Speed selector** | Choose 0.25×, 0.5×, 1×, 2×, 5×, or 10× playback speed |

Audio plays in sync with the data timeline at all speeds.

## Event View

The event panel shows each RX/TX event as it replays, including:
- Timestamp (millisecond offset from session start)
- Direction (RX / TX)
- Decoded data

Filter the event view by direction (RX only, TX only, or both) using the toolbar toggles.

## Markers

Click **Add Marker** at any point during playback to annotate the current position. Markers appear on the timeline as labeled ticks. They are saved to `manifest.json` and persist across sessions.

<!-- TODO: add screenshot of the playback panel with timeline and markers -->
