---
sidebar_position: 1
---

# Changelog

All notable changes to Serial Monitor Pro are documented here.

## [0.1.0] — 2026-04-28

### Added

- Serial port monitoring panel with configurable baud rate, data bits, stop bits, parity, and line ending
- Timeline recording — captures every RX/TX event with millisecond-precision timestamps
- Simultaneous microphone audio recording via SoX (optional)
- Session playback panel with variable speed (0.25×–10×), seek bar, and synchronized audio
- Annotation markers on the playback timeline
- Session management sidebar — lists all recorded sessions, stored as plain directories
- Custom baud rate support via `serialMonitorPro.customBaudRates` setting
- Graceful degradation when SoX is unavailable — serial recording continues without audio
