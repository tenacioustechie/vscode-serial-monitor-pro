# Waveform Visualization in the Playback Timeline — Design

**Date:** 2026-05-11
**Status:** Approved
**Scope:** Playback panel only (no recording, storage, or data-model changes)

## Goal

Help users scrub long recordings to parts with audio commentary by rendering an audio waveform as the primary visual in the playback timeline.

## User-facing behavior

- When opening a session that has an `audio.wav`, the playback timeline shows a waveform spanning the full session duration. The cursor, progress fill, markers, and serial RX/TX ticks all overlay the same track.
- Clicking anywhere on the track seeks playback, exactly as today.
- When the session has no audio file, the timeline reverts to its existing 48px appearance with full-bar RX/TX ticks. No regression for audio-less sessions.

## Layout

The current 48px `.timeline-bar` becomes a 96px `.timeline-track` containing layered elements:

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│         waveform canvas (full height, behind overlays)       │
│                                                              │
│  cursor │ progress overlay │ marker pins │                   │
│         │                  │             │                   │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ ── tx ── │ ── tx ── │ ── tx ── (8px strip, top-half)         │
│ ── rx ── │ ── rx ── │ ── rx ── (8px strip, bottom-half)      │
└──────────────────────────────────────────────────────────────┘
```

When `audioUri` is absent, the track gets a `no-audio` class that:
- Reverts `height` to 48px.
- Restores RX/TX tick rendering to the full bar height (as it is today).
- Hides the (empty) waveform canvas.

## Architecture

All changes live in the playback layer.

### Extension host — [src/playback/PlaybackPanel.ts](../../../src/playback/PlaybackPanel.ts)

- HTML template change only: replace the inner structure of `.timeline-bar` with `.timeline-track` containing `<canvas id="timelineWaveform">`, the 8px events strip, and the existing progress/cursor/markers overlays.
- No TypeScript logic changes. The existing `sessionData` message already exposes `audioUri` to the webview.

### Webview — two new files

**`media/waveform-core.js`** — pure JS, no DOM access. Exposes:

```js
window.WaveformCore = {
  parseWavHeader(buffer) -> { audioFormat, numChannels, sampleRate, bitsPerSample, dataOffset, dataLength },
  computePeaks(pcmView, bucketCount, bitsPerSample, numChannels) -> Float32Array
};
```

These two functions are unit-tested directly under Jest.

**`media/waveform.js`** — browser wrapper, loaded after `waveform-core.js`. Exposes a single global:

```js
window.SerialMonitorWaveform = {
  // Resolves to a Controller when the first render completes.
  // Rejects on fetch or parse failure.
  attach({ canvas, audioUri }) -> Promise<Controller>
};

// Controller shape: { destroy(): void, redraw(): void }
```

Responsibilities:
- Fetch the WAV via `fetch(audioUri)` into an `ArrayBuffer`.
- Parse the RIFF/WAVE header — walk chunks (`fmt `, `data`, skip others) using a 4-byte tag + 4-byte size loop.
- Read `audioFormat` (must be 1 = PCM), `numChannels`, `sampleRate`, `bitsPerSample` from `fmt `. Reject formats other than 8/16/24/32-bit integer PCM with a `console.warn`.
- Compute peaks in one pass:
  - `bucketCount = 2000` (fixed cap, independent of canvas width — keeps the source of truth stable across resizes).
  - `samplesPerBucket = floor(totalSamples / bucketCount)`.
  - For each bucket, track `min` and `max` across its samples. Downmix multi-channel by averaging on the fly.
  - Normalize to `[-1, 1]` using `bitsPerSample`.
  - Result stored as `Float32Array(bucketCount * 2)` (interleaved `[min0, max0, min1, max1, …]`).
- Render to the canvas: map the 2000 peak buckets to canvas-width pixel columns.
  - If `canvas.width >= bucketCount`, each bucket spans `canvas.width / bucketCount` pixels (waveform stretches; one rectangle per bucket).
  - If `canvas.width < bucketCount`, draw `canvas.width` columns, each combining `floor(bucketCount / canvas.width)` adjacent buckets by taking the min-of-mins and max-of-maxes.
  - Each column is drawn from `min*halfHeight` to `max*halfHeight`, centered vertically.
- Color: `var(--vscode-charts-blue)` with a teal fallback. Drawn at slightly reduced opacity so cursor/progress overlays remain prominent.
- Set up a `ResizeObserver` on the canvas; on resize, redraw from the cached peaks (no re-parsing, no re-fetching).
- After parsing completes, the raw `ArrayBuffer` is released; only the peaks array is retained.
- `destroy()` disconnects the `ResizeObserver`.

### Webview orchestration — [media/playback.js](../../../media/playback.js)

In `initializePlayback()`:
- If `session.audioUri` is set, call `SerialMonitorWaveform.attach({ canvas, audioUri })`.
- On success, no further action — the controller manages its own rendering.
- On failure (fetch or parse rejection), log to console and add `no-audio` to `.timeline-track` so the layout falls back.
- If `session.audioUri` is unset, add `no-audio` immediately.

### Styling — [media/playback.css](../../../media/playback.css)

- `--timeline-height: 96px` (was 48px).
- `.timeline-track` replaces `.timeline-bar` with the same background, border, border-radius, `position: relative`, `overflow: hidden`, `cursor: pointer`.
- `.timeline-waveform` — `position: absolute; inset: 0; width: 100%; height: 100%;` — behind overlays.
- `.timeline-events` — `position: absolute; bottom: 0; left: 0; right: 0; height: 8px;`.
- `.timeline-event-tick.rx` — bottom half of the 8px strip (`height: 50%; bottom: 0`).
- `.timeline-event-tick.tx` — top half of the 8px strip (`height: 50%; top: 0`).
- `.timeline-track.no-audio` — `height: 48px;` and selectors that revert event tick heights to the original 40%/30% full-bar layout. The waveform canvas may remain in the DOM (it's empty) or be removed; either is fine.
- Z-index layering, low to high: waveform, events strip, progress overlay, markers, cursor.

## WAV parsing details

- The recorder produces mono 16-bit PCM at 44.1kHz (see [src/recording/audioRecorder.ts:46-52](../../../src/recording/audioRecorder.ts#L46-L52)). The parser handles this primary case and tolerates other standard PCM variants.
- Chunk walker handles non-standard layouts (e.g., an unexpected `LIST` or `bext` chunk before `data`).
- Rejected formats fail closed: non-PCM, unsupported bit depths, missing `fmt`/`data` chunks all reject the `attach()` promise and trigger the `no-audio` fallback.

## Performance budget

- 2000 bucket cap keeps canvas drawing and resize cheap regardless of recording length.
- Single-pass parse of a 1-hour mono 16-bit 44.1kHz file scans ~158M samples — about 1 second of JS on a modern machine. Acceptable for v1; runs once per panel open.
- No raw audio retained after parsing; peak buffer is ~16 KB for 2000 buckets.

## Edge cases

- **No audio file:** `no-audio` class applied; existing layout preserved.
- **Fetch failure:** caught, logged, fallback applied. Playback continues.
- **Parse failure** (corrupt WAV, compressed format, missing chunks): same as fetch failure.
- **Zero-length audio** (`totalSamples == 0`): treated as parse failure.
- **Audio shorter than session duration** (e.g., SoX started late): peaks map to `[0, audioDuration]` and render in the proportional left portion of the track; the remainder is empty. v1 does not attempt to correct existing audio/event drift.
- **Multi-channel WAV** (defensive, shouldn't occur): downmix to mono by averaging during the bucket pass.
- **Resize:** redraw from cached peaks; if canvas narrows below `bucketCount`, downsample at draw time.
- **Container hidden when panel is in background** (`retainContextWhenHidden: true`): canvas state persists; no special handling needed.

## Testing

- **Unit tests (Jest, existing setup):** split the pure logic from the DOM-touching code by putting `parseWavHeader(buffer)` and `computePeaks(pcmView, bucketCount, bitsPerSample, numChannels)` in `media/waveform-core.js` (plain JS, no DOM APIs — only `ArrayBuffer`/`DataView`/`Float32Array`). `media/waveform.js` loads `waveform-core.js` first via a separate `<script>` tag and uses the globals it exposes. Jest tests load `waveform-core.js` directly (via `require` or `import` against the file path); no bundler involved. Test fixtures:
  - Valid mono 16-bit silence (all zeros) — peaks should all be `[0, 0]`.
  - Valid mono 16-bit sine wave — peaks should approximate `[-1, 1]` near sine peaks, `[0, 0]` near zero crossings.
  - Multi-chunk WAV with a `LIST` chunk before `data` — parser should skip it.
  - Malformed header (no `RIFF`/`WAVE`) — should throw.
  - Non-PCM `audioFormat` — should throw.
- **Manual verification:**
  - Open a session with audio: waveform renders, scrubbing works, 8px event strip remains visible, marker pins overlay cleanly.
  - Open a session without audio: timeline reverts to 48px, RX/TX ticks at original 40%/30% heights.
  - Resize the panel: waveform redraws at the new width without flicker or re-fetch.
  - Switch VS Code themes: waveform color updates via CSS variables; no JS redraw needed.

## Out of scope (v1)

- Zoom or pan on the waveform.
- Silence/speech detection or commentary highlighting.
- Pre-rendered or cached peaks file (`peaks.bin` alongside `audio.wav`). Reconsider if perf complaints surface for long recordings.
- Hover tooltips showing waveform amplitude or time-at-cursor.
- Stereo display (recorder is mono).
- Backfill of peaks for old sessions beyond what natural on-open computation provides — which is: it works automatically.

## File changes summary

| File | Change |
|------|--------|
| [src/playback/PlaybackPanel.ts](../../../src/playback/PlaybackPanel.ts) | HTML template: replace `.timeline-bar` inner structure; add `<canvas id="timelineWaveform">` and two `<script>` tags for `waveform-core.js` then `waveform.js` (loaded before `playback.js`). |
| [media/waveform-core.js](../../../media/waveform-core.js) | New file. Pure JS: `parseWavHeader`, `computePeaks`. No DOM APIs. Exposed as globals (`window.WaveformCore`) for the browser wrapper and importable directly by Jest. |
| [media/waveform.js](../../../media/waveform.js) | New file. Browser wrapper: fetch, canvas draw, `ResizeObserver`. Exposes `window.SerialMonitorWaveform.attach()`. |
| [media/playback.js](../../../media/playback.js) | In `initializePlayback()`, call `attach()` when `audioUri` is set; apply `no-audio` fallback on failure. |
| [media/playback.css](../../../media/playback.css) | New `.timeline-track`, `.timeline-waveform`, updated `.timeline-events` strip layout, `.no-audio` fallback rules. Bump `--timeline-height` to 96px. |
| `test/waveform.test.ts` (or `.js`) | New Jest tests for `parseWavHeader` and `computePeaks`. |
