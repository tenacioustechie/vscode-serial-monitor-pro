# Waveform Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render an audio waveform as the primary visual in the playback timeline so users can scrub long recordings to parts with audio commentary.

**Architecture:** All changes are in the playback layer. A new pure-JS module (`media/waveform-core.js`) parses WAV headers and computes peaks; a browser wrapper (`media/waveform.js`) fetches the WAV, drives canvas drawing, and handles resize. `playback.js` orchestrates attach/fallback. The current 48px timeline becomes a 96px track with the waveform as the dominant layer; RX/TX serial events collapse to an 8px strip at the bottom. When a session has no audio, the layout reverts to today's 48px full-bar RX/TX rendering.

**Tech Stack:** Plain JS (webview), TypeScript (extension host), HTML5 Canvas, Node 20's built-in `node:test` for unit tests (zero new deps).

**Spec:** [docs/superpowers/specs/2026-05-11-waveform-timeline-design.md](../specs/2026-05-11-waveform-timeline-design.md)

---

## Task 1: Wire up Node's built-in test runner

**Files:**
- Modify: `package.json` (line containing `"test":`)
- Create: `tests/` directory

- [ ] **Step 1: Confirm Node version supports `node:test`**

Run: `node --version`
Expected: v18.0.0 or higher (v20+ recommended). The `node:test` module is stable from v20.

- [ ] **Step 2: Update the `test` script in [package.json](../../../package.json)**

Find the line:

```json
"test": "node --experimental-vm-modules node_modules/.bin/jest"
```

Replace with:

```json
"test": "node --test tests/*.test.mjs"
```

- [ ] **Step 3: Create the tests directory with a placeholder smoke test**

Create `tests/smoke.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('smoke: node:test is wired up', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 4: Run the smoke test to verify the runner works**

Run: `npm test`
Expected output includes: `# pass 1` and exit code 0.

- [ ] **Step 5: Commit**

```bash
git add package.json tests/smoke.test.mjs
git commit -m "chore: wire up node:test runner

Project shipped with a Jest script in package.json but no Jest install
and no tests. Switch the test script to Node's built-in runner so we
can add tests without pulling in a new framework."
```

---

## Task 2: WAV header parser — silence fixture and minimum viable parse

**Files:**
- Create: `media/waveform-core.js`
- Create: `tests/waveform-core.test.mjs`

- [ ] **Step 1: Write the first failing test (silence WAV header round-trip)**

Create `tests/waveform-core.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { parseWavHeader } = require(path.join(here, '..', 'media', 'waveform-core.js'));

// Helper: build a minimal mono 16-bit PCM WAV with N samples of silence.
function buildSilenceWav(sampleRate, numSamples) {
  const dataBytes = numSamples * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const writeAscii = (off, s) => { for (let i = 0; i < s.length; i++) { bytes[off + i] = s.charCodeAt(i); } };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);          // fmt chunk size
  view.setUint16(20, 1, true);           // audioFormat = PCM
  view.setUint16(22, 1, true);           // numChannels = 1
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byteRate
  view.setUint16(32, 2, true);           // blockAlign
  view.setUint16(34, 16, true);          // bitsPerSample
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);
  // samples already zero-initialized
  return buf;
}

test('parseWavHeader: mono 16-bit PCM silence', () => {
  const buf = buildSilenceWav(44100, 1000);
  const header = parseWavHeader(buf);
  assert.equal(header.audioFormat, 1);
  assert.equal(header.numChannels, 1);
  assert.equal(header.sampleRate, 44100);
  assert.equal(header.bitsPerSample, 16);
  assert.equal(header.dataOffset, 44);
  assert.equal(header.dataLength, 2000);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test`
Expected: failure with a module-not-found error pointing at `media/waveform-core.js`.

- [ ] **Step 3: Create `media/waveform-core.js` with the minimum parser**

```js
// Pure-JS WAV header parsing and PCM peak bucketing.
// No DOM APIs. Loaded both as a classic <script> in the playback webview
// (exposing window.WaveformCore) and via require() from node:test.
(function (root) {
  'use strict';

  function readAscii(view, offset, length) {
    let s = '';
    for (let i = 0; i < length; i++) {
      s += String.fromCharCode(view.getUint8(offset + i));
    }
    return s;
  }

  function parseWavHeader(buffer) {
    const view = new DataView(buffer);
    if (readAscii(view, 0, 4) !== 'RIFF') {
      throw new Error('Not a RIFF file');
    }
    if (readAscii(view, 8, 4) !== 'WAVE') {
      throw new Error('Not a WAVE file');
    }

    let offset = 12;
    let fmt = null;
    let dataOffset = -1;
    let dataLength = 0;

    while (offset + 8 <= view.byteLength) {
      const tag = readAscii(view, offset, 4);
      const size = view.getUint32(offset + 4, true);
      const payload = offset + 8;

      if (tag === 'fmt ') {
        fmt = {
          audioFormat: view.getUint16(payload, true),
          numChannels: view.getUint16(payload + 2, true),
          sampleRate: view.getUint32(payload + 4, true),
          bitsPerSample: view.getUint16(payload + 14, true),
        };
      } else if (tag === 'data') {
        dataOffset = payload;
        dataLength = size;
      }

      // Chunks are word-aligned: size + (size & 1) padding byte.
      offset = payload + size + (size & 1);
    }

    if (!fmt) { throw new Error('Missing fmt chunk'); }
    if (dataOffset < 0) { throw new Error('Missing data chunk'); }
    if (fmt.audioFormat !== 1) {
      throw new Error('Unsupported audio format: ' + fmt.audioFormat);
    }
    if (![8, 16, 24, 32].includes(fmt.bitsPerSample)) {
      throw new Error('Unsupported bit depth: ' + fmt.bitsPerSample);
    }

    return {
      audioFormat: fmt.audioFormat,
      numChannels: fmt.numChannels,
      sampleRate: fmt.sampleRate,
      bitsPerSample: fmt.bitsPerSample,
      dataOffset: dataOffset,
      dataLength: dataLength,
    };
  }

  const WaveformCore = { parseWavHeader: parseWavHeader };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WaveformCore;
  } else {
    root.WaveformCore = WaveformCore;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test`
Expected: smoke test plus the new parser test both pass.

- [ ] **Step 5: Commit**

```bash
git add media/waveform-core.js tests/waveform-core.test.mjs
git commit -m "feat(playback): add WAV header parser for waveform rendering"
```

---

## Task 3: WAV parser — error cases and multi-chunk tolerance

**Files:**
- Modify: `tests/waveform-core.test.mjs`

- [ ] **Step 1: Add failing tests for malformed and multi-chunk WAVs**

Append to `tests/waveform-core.test.mjs`:

```js
test('parseWavHeader: rejects non-RIFF input', () => {
  const buf = new ArrayBuffer(44);
  assert.throws(() => parseWavHeader(buf), /Not a RIFF file/);
});

test('parseWavHeader: rejects non-WAVE form', () => {
  const buf = new ArrayBuffer(44);
  const bytes = new Uint8Array(buf);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // 'RIFF'
  bytes.set([0x41, 0x56, 0x49, 0x20], 8); // 'AVI '
  assert.throws(() => parseWavHeader(buf), /Not a WAVE file/);
});

test('parseWavHeader: rejects non-PCM audioFormat', () => {
  const buf = buildSilenceWav(44100, 10);
  new DataView(buf).setUint16(20, 3, true); // IEEE float
  assert.throws(() => parseWavHeader(buf), /Unsupported audio format/);
});

test('parseWavHeader: rejects exotic bit depths', () => {
  const buf = buildSilenceWav(44100, 10);
  new DataView(buf).setUint16(34, 12, true);
  assert.throws(() => parseWavHeader(buf), /Unsupported bit depth/);
});

test('parseWavHeader: skips a LIST chunk before data', () => {
  // Build: RIFF/WAVE | fmt(16) | LIST(8) | data(20)
  const listPayload = 8;
  const dataPayload = 20;
  const totalAfterRiff = 4 + (8 + 16) + (8 + listPayload) + (8 + dataPayload);
  const buf = new ArrayBuffer(8 + totalAfterRiff);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const writeAscii = (off, s) => { for (let i = 0; i < s.length; i++) { bytes[off + i] = s.charCodeAt(i); } };

  writeAscii(0, 'RIFF');
  view.setUint32(4, totalAfterRiff, true);
  writeAscii(8, 'WAVE');

  let p = 12;
  // fmt
  writeAscii(p, 'fmt '); view.setUint32(p + 4, 16, true);
  view.setUint16(p + 8, 1, true);   // PCM
  view.setUint16(p + 10, 1, true);  // mono
  view.setUint32(p + 12, 44100, true);
  view.setUint32(p + 16, 88200, true);
  view.setUint16(p + 20, 2, true);
  view.setUint16(p + 22, 16, true);
  p += 8 + 16;

  // LIST (skippable)
  writeAscii(p, 'LIST'); view.setUint32(p + 4, listPayload, true);
  p += 8 + listPayload;

  // data
  writeAscii(p, 'data'); view.setUint32(p + 4, dataPayload, true);
  const dataOffsetExpected = p + 8;
  p += 8 + dataPayload;

  const header = parseWavHeader(buf);
  assert.equal(header.dataOffset, dataOffsetExpected);
  assert.equal(header.dataLength, dataPayload);
});

test('parseWavHeader: handles odd-sized chunk padding', () => {
  // A LIST of odd size should advance with a pad byte and still locate data.
  const listPayload = 7; // odd → 1 pad byte
  const dataPayload = 10;
  const totalAfterRiff = 4 + (8 + 16) + (8 + listPayload + 1) + (8 + dataPayload);
  const buf = new ArrayBuffer(8 + totalAfterRiff);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const writeAscii = (off, s) => { for (let i = 0; i < s.length; i++) { bytes[off + i] = s.charCodeAt(i); } };

  writeAscii(0, 'RIFF');
  view.setUint32(4, totalAfterRiff, true);
  writeAscii(8, 'WAVE');

  let p = 12;
  writeAscii(p, 'fmt '); view.setUint32(p + 4, 16, true);
  view.setUint16(p + 8, 1, true);
  view.setUint16(p + 10, 1, true);
  view.setUint32(p + 12, 44100, true);
  view.setUint32(p + 16, 88200, true);
  view.setUint16(p + 20, 2, true);
  view.setUint16(p + 22, 16, true);
  p += 8 + 16;

  writeAscii(p, 'LIST'); view.setUint32(p + 4, listPayload, true);
  p += 8 + listPayload + 1; // +1 pad

  writeAscii(p, 'data'); view.setUint32(p + 4, dataPayload, true);
  const dataOffsetExpected = p + 8;

  const header = parseWavHeader(buf);
  assert.equal(header.dataOffset, dataOffsetExpected);
});
```

- [ ] **Step 2: Run the tests and confirm they pass**

The parser already handles all these cases (RIFF/WAVE checks, audio format guard, bit depth guard, chunk walker with odd-byte padding). Run:

```
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/waveform-core.test.mjs
git commit -m "test(waveform): cover malformed, non-PCM, and multi-chunk WAVs"
```

---

## Task 4: Peak bucketer for 16-bit mono silence

**Files:**
- Modify: `media/waveform-core.js`
- Modify: `tests/waveform-core.test.mjs`

- [ ] **Step 1: Write failing test for `computePeaks` on silence**

Append to `tests/waveform-core.test.mjs`:

```js
const { computePeaks } = require(path.join(here, '..', 'media', 'waveform-core.js'));

test('computePeaks: 16-bit mono silence produces zero peaks', () => {
  const buf = buildSilenceWav(44100, 1000);
  const header = parseWavHeader(buf);
  const pcm = new DataView(buf, header.dataOffset, header.dataLength);
  const peaks = computePeaks(pcm, 10, header.bitsPerSample, header.numChannels);
  assert.equal(peaks.length, 20);
  for (let i = 0; i < peaks.length; i++) {
    assert.equal(peaks[i], 0);
  }
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test`
Expected: failure — `computePeaks` is not exported.

- [ ] **Step 3: Implement `computePeaks` in `media/waveform-core.js`**

Inside the IIFE in `media/waveform-core.js`, before the `WaveformCore` object literal, add:

```js
  // Read one sample at the given byte offset and normalize to [-1, 1].
  function readSample(view, offset, bitsPerSample) {
    if (bitsPerSample === 16) {
      return view.getInt16(offset, true) / 32768;
    }
    if (bitsPerSample === 8) {
      // 8-bit WAV is unsigned, midpoint 128.
      return (view.getUint8(offset) - 128) / 128;
    }
    if (bitsPerSample === 24) {
      const b0 = view.getUint8(offset);
      const b1 = view.getUint8(offset + 1);
      const b2 = view.getUint8(offset + 2);
      let v = (b2 << 16) | (b1 << 8) | b0;
      if (v & 0x800000) { v |= ~0xFFFFFF; } // sign-extend
      return v / 8388608;
    }
    if (bitsPerSample === 32) {
      return view.getInt32(offset, true) / 2147483648;
    }
    throw new Error('Unsupported bit depth: ' + bitsPerSample);
  }

  function computePeaks(pcmView, bucketCount, bitsPerSample, numChannels) {
    const bytesPerSample = bitsPerSample / 8;
    const bytesPerFrame = bytesPerSample * numChannels;
    const totalFrames = Math.floor(pcmView.byteLength / bytesPerFrame);
    const peaks = new Float32Array(bucketCount * 2);

    if (totalFrames === 0 || bucketCount === 0) {
      return peaks;
    }

    const framesPerBucket = totalFrames / bucketCount;

    for (let b = 0; b < bucketCount; b++) {
      const startFrame = Math.floor(b * framesPerBucket);
      const endFrame = Math.min(totalFrames, Math.floor((b + 1) * framesPerBucket));
      let min = Infinity;
      let max = -Infinity;

      for (let f = startFrame; f < endFrame; f++) {
        // Downmix multi-channel to mono by averaging across channels.
        let sum = 0;
        const frameOffset = f * bytesPerFrame;
        for (let c = 0; c < numChannels; c++) {
          sum += readSample(pcmView, frameOffset + c * bytesPerSample, bitsPerSample);
        }
        const v = sum / numChannels;
        if (v < min) { min = v; }
        if (v > max) { max = v; }
      }

      if (min === Infinity) { min = 0; max = 0; }
      peaks[b * 2] = min;
      peaks[b * 2 + 1] = max;
    }

    return peaks;
  }
```

Then update the exported `WaveformCore` object:

```js
  const WaveformCore = { parseWavHeader: parseWavHeader, computePeaks: computePeaks };
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test`
Expected: silence-peaks test passes alongside earlier tests.

- [ ] **Step 5: Commit**

```bash
git add media/waveform-core.js tests/waveform-core.test.mjs
git commit -m "feat(waveform): add PCM peak bucketer for mono silence"
```

---

## Task 5: Peak bucketer — sine wave, multi-channel downmix, edge cases

**Files:**
- Modify: `tests/waveform-core.test.mjs`

- [ ] **Step 1: Add tests for sine wave, stereo downmix, and zero-frame edge case**

Append to `tests/waveform-core.test.mjs`:

```js
// Helper: build a mono 16-bit PCM WAV containing a sine wave at frequency Hz.
function buildSineWav(sampleRate, frequency, numSamples, amplitude) {
  const dataBytes = numSamples * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const writeAscii = (off, s) => { for (let i = 0; i < s.length; i++) { bytes[off + i] = s.charCodeAt(i); } };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < numSamples; i++) {
    const sample = Math.round(Math.sin(2 * Math.PI * frequency * i / sampleRate) * amplitude * 32767);
    view.setInt16(44 + i * 2, sample, true);
  }
  return buf;
}

test('computePeaks: full-amplitude sine wave produces peaks near ±1', () => {
  // 100 cycles of a sine at 100 Hz, 44100 Hz sample rate.
  const buf = buildSineWav(44100, 100, 44100, 1.0);
  const header = parseWavHeader(buf);
  const pcm = new DataView(buf, header.dataOffset, header.dataLength);
  // Use enough buckets that each bucket spans many full sine cycles.
  const peaks = computePeaks(pcm, 50, header.bitsPerSample, header.numChannels);
  for (let b = 0; b < 50; b++) {
    assert.ok(peaks[b * 2] < -0.9, `bucket ${b} min ${peaks[b * 2]} not near -1`);
    assert.ok(peaks[b * 2 + 1] > 0.9, `bucket ${b} max ${peaks[b * 2 + 1]} not near +1`);
  }
});

test('computePeaks: stereo input is downmixed to mono', () => {
  // Build a stereo 16-bit WAV where left = +1.0 and right = -1.0 throughout.
  // Downmix should average to 0 → peaks near zero.
  const numFrames = 1000;
  const dataBytes = numFrames * 4; // 2 channels × 2 bytes
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const writeAscii = (off, s) => { for (let i = 0; i < s.length; i++) { bytes[off + i] = s.charCodeAt(i); } };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);          // stereo
  view.setUint32(24, 44100, true);
  view.setUint32(28, 44100 * 4, true);
  view.setUint16(32, 4, true);          // block align
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let f = 0; f < numFrames; f++) {
    view.setInt16(44 + f * 4, 32767, true);      // L = +1
    view.setInt16(44 + f * 4 + 2, -32768, true); // R = -1
  }

  const header = parseWavHeader(buf);
  const pcm = new DataView(buf, header.dataOffset, header.dataLength);
  const peaks = computePeaks(pcm, 5, header.bitsPerSample, header.numChannels);
  for (let b = 0; b < 5; b++) {
    assert.ok(Math.abs(peaks[b * 2]) < 0.01, `bucket ${b} min not near zero`);
    assert.ok(Math.abs(peaks[b * 2 + 1]) < 0.01, `bucket ${b} max not near zero`);
  }
});

test('computePeaks: zero-frame PCM returns an all-zero peaks array', () => {
  const pcm = new DataView(new ArrayBuffer(0));
  const peaks = computePeaks(pcm, 4, 16, 1);
  assert.equal(peaks.length, 8);
  for (let i = 0; i < peaks.length; i++) {
    assert.equal(peaks[i], 0);
  }
});
```

- [ ] **Step 2: Run tests and confirm they pass**

Run: `npm test`
Expected: all tests pass. The bucketer's downmix and edge handling are already in place from Task 4.

- [ ] **Step 3: Commit**

```bash
git add tests/waveform-core.test.mjs
git commit -m "test(waveform): cover sine wave amplitude and stereo downmix"
```

---

## Task 6: Browser wrapper — `attach()` skeleton with fetch and parse

**Files:**
- Create: `media/waveform.js`

- [ ] **Step 1: Create the wrapper module with fetch + parse + render-to-canvas**

Create `media/waveform.js`:

```js
// Browser-only wrapper for media/waveform-core.js.
// Exposes window.SerialMonitorWaveform.attach({ canvas, audioUri }).
// waveform-core.js MUST be loaded before this file.
(function () {
  'use strict';

  const Core = window.WaveformCore;
  if (!Core) {
    console.error('[SerialMonitorWaveform] waveform-core.js must load first');
    return;
  }

  const BUCKET_COUNT = 2000;

  function drawCanvas(canvas, peaks) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (cssWidth === 0 || cssHeight === 0) { return; }

    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const styles = getComputedStyle(canvas);
    const color = styles.getPropertyValue('--waveform-color').trim()
      || styles.getPropertyValue('--vscode-charts-blue').trim()
      || '#4cc2c2';
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.8;

    const halfH = cssHeight / 2;
    const bucketCount = peaks.length / 2;

    if (cssWidth >= bucketCount) {
      // Stretch: each bucket spans (cssWidth / bucketCount) pixels.
      const colWidth = cssWidth / bucketCount;
      for (let b = 0; b < bucketCount; b++) {
        const min = peaks[b * 2];
        const max = peaks[b * 2 + 1];
        const x = b * colWidth;
        const y = halfH - max * halfH;
        const h = Math.max(1, (max - min) * halfH);
        ctx.fillRect(x, y, Math.max(1, colWidth), h);
      }
    } else {
      // Compact: merge adjacent buckets into one column.
      const bucketsPerColumn = Math.ceil(bucketCount / cssWidth);
      for (let x = 0; x < cssWidth; x++) {
        const startB = Math.floor(x * bucketCount / cssWidth);
        const endB = Math.min(bucketCount, startB + bucketsPerColumn);
        let min = Infinity;
        let max = -Infinity;
        for (let b = startB; b < endB; b++) {
          const bmin = peaks[b * 2];
          const bmax = peaks[b * 2 + 1];
          if (bmin < min) { min = bmin; }
          if (bmax > max) { max = bmax; }
        }
        if (min === Infinity) { continue; }
        const y = halfH - max * halfH;
        const h = Math.max(1, (max - min) * halfH);
        ctx.fillRect(x, y, 1, h);
      }
    }
  }

  async function attach(options) {
    const canvas = options.canvas;
    const audioUri = options.audioUri;
    if (!canvas) { throw new Error('canvas required'); }
    if (!audioUri) { throw new Error('audioUri required'); }

    const response = await fetch(audioUri);
    if (!response.ok) {
      throw new Error('Failed to fetch audio: ' + response.status);
    }
    const buffer = await response.arrayBuffer();
    const header = Core.parseWavHeader(buffer);
    const pcm = new DataView(buffer, header.dataOffset, header.dataLength);
    const peaks = Core.computePeaks(pcm, BUCKET_COUNT, header.bitsPerSample, header.numChannels);

    drawCanvas(canvas, peaks);

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => drawCanvas(canvas, peaks));
      resizeObserver.observe(canvas);
    }

    return {
      destroy: function () {
        if (resizeObserver) {
          resizeObserver.disconnect();
          resizeObserver = null;
        }
      },
      redraw: function () {
        drawCanvas(canvas, peaks);
      },
    };
  }

  window.SerialMonitorWaveform = { attach: attach };
})();
```

- [ ] **Step 2: Lint check — confirm the file parses**

Run: `node -c media/waveform.js`
Expected: no output (exit 0). This catches syntax errors quickly without a browser.

- [ ] **Step 3: Commit**

```bash
git add media/waveform.js
git commit -m "feat(playback): add browser waveform wrapper with canvas rendering"
```

---

## Task 7: CSS — 96px track, waveform layer, 8px event strip, no-audio fallback

**Files:**
- Modify: [media/playback.css](../../../media/playback.css)

- [ ] **Step 1: Update the `--timeline-height` variable**

Find at the top of `media/playback.css`:

```css
  --timeline-height: 48px;
```

Replace with:

```css
  --timeline-height: 96px;
  --timeline-height-no-audio: 48px;
  --timeline-events-strip-height: 8px;
  --waveform-color: var(--vscode-charts-blue, #4cc2c2);
```

- [ ] **Step 2: Rename `.timeline-bar` to `.timeline-track` and reshape its contents**

Find the current `.timeline-bar` rule:

```css
.timeline-bar {
  position: relative;
  height: var(--timeline-height);
  background: var(--vscode-input-background, #1a1a2e);
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
  border: 1px solid var(--vscode-panel-border, #333);
}
```

Replace with:

```css
.timeline-track {
  position: relative;
  height: var(--timeline-height);
  background: var(--vscode-input-background, #1a1a2e);
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
  border: 1px solid var(--vscode-panel-border, #333);
}

.timeline-track.no-audio {
  height: var(--timeline-height-no-audio);
}

.timeline-waveform {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.timeline-track.no-audio .timeline-waveform {
  display: none;
}
```

- [ ] **Step 3: Update the events strip layout for waveform mode**

Find:

```css
.timeline-events {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
  pointer-events: none;
}

.timeline-event-tick {
  position: absolute;
  bottom: 0;
  width: 1px;
  opacity: 0.6;
}

.timeline-event-tick.rx {
  background: var(--rx-color);
  height: 40%;
}

.timeline-event-tick.tx {
  background: var(--tx-color);
  height: 30%;
  bottom: auto;
  top: 0;
}
```

Replace with:

```css
.timeline-events {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--timeline-events-strip-height);
  pointer-events: none;
  z-index: 2;
}

.timeline-track.no-audio .timeline-events {
  top: 0;
  bottom: 0;
  height: 100%;
}

.timeline-event-tick {
  position: absolute;
  width: 1px;
  opacity: 0.85;
}

.timeline-event-tick.rx {
  background: var(--rx-color);
  bottom: 0;
  height: 50%;
}

.timeline-event-tick.tx {
  background: var(--tx-color);
  top: 0;
  height: 50%;
}

.timeline-track.no-audio .timeline-event-tick.rx {
  height: 40%;
  opacity: 0.6;
}

.timeline-track.no-audio .timeline-event-tick.tx {
  height: 30%;
  opacity: 0.6;
}
```

- [ ] **Step 4: Update z-index layering on progress, cursor, and markers**

Find:

```css
.timeline-progress {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg,
      rgba(99, 179, 237, 0.15) 0%,
      rgba(99, 179, 237, 0.25) 100%);
  transition: width 0.05s linear;
  pointer-events: none;
}

.timeline-cursor {
  position: absolute;
  top: 0;
  left: 0;
  width: 2px;
  height: 100%;
  background: var(--vscode-focusBorder, #007acc);
  box-shadow: 0 0 6px rgba(0, 122, 204, 0.5);
  pointer-events: none;
  z-index: 10;
  transition: left 0.05s linear;
}
```

Replace with:

```css
.timeline-progress {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg,
      rgba(99, 179, 237, 0.15) 0%,
      rgba(99, 179, 237, 0.25) 100%);
  transition: width 0.05s linear;
  pointer-events: none;
  z-index: 3;
}

.timeline-cursor {
  position: absolute;
  top: 0;
  left: 0;
  width: 2px;
  height: 100%;
  background: var(--vscode-focusBorder, #007acc);
  box-shadow: 0 0 6px rgba(0, 122, 204, 0.5);
  pointer-events: none;
  z-index: 10;
  transition: left 0.05s linear;
}
```

Find:

```css
.timeline-markers {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
  pointer-events: none;
  z-index: 5;
}
```

(No content change — confirm `z-index: 5` remains. It sits above the events strip and progress, below the cursor.)

- [ ] **Step 5: Commit**

```bash
git add media/playback.css
git commit -m "feat(playback): restyle timeline as 96px waveform track with 8px event strip"
```

---

## Task 8: HTML template — swap timeline structure and load waveform scripts

**Files:**
- Modify: [src/playback/PlaybackPanel.ts](../../../src/playback/PlaybackPanel.ts)

- [ ] **Step 1: Add waveform script URIs in `getHtmlForWebview()`**

In [src/playback/PlaybackPanel.ts](../../../src/playback/PlaybackPanel.ts), find this block in `getHtmlForWebview()`:

```ts
    const webview = this.panel.webview;
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'playback.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'playback.js'));
```

Replace with:

```ts
    const webview = this.panel.webview;
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'playback.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'playback.js'));
    const waveformCoreUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'waveform-core.js'));
    const waveformUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'waveform.js'));
```

- [ ] **Step 2: Swap `.timeline-bar` for `.timeline-track` and add the canvas**

Find this block (also in `getHtmlForWebview()`):

```html
        <div class="timeline-container">
            <div class="timeline-bar" id="timelineBar">
                <div class="timeline-progress" id="timelineProgress"></div>
                <div class="timeline-cursor" id="timelineCursor"></div>
                <div class="timeline-markers" id="timelineMarkers"></div>
                <div class="timeline-events" id="timelineEvents"></div>
            </div>
            <div class="timeline-labels">
                <span id="currentTime">00:00.000</span>
                <span id="totalTime">${formatDuration(this.session.duration ?? 0)}</span>
            </div>
        </div>
```

Replace with:

```html
        <div class="timeline-container">
            <div class="timeline-track" id="timelineTrack">
                <canvas class="timeline-waveform" id="timelineWaveform"></canvas>
                <div class="timeline-events" id="timelineEvents"></div>
                <div class="timeline-progress" id="timelineProgress"></div>
                <div class="timeline-markers" id="timelineMarkers"></div>
                <div class="timeline-cursor" id="timelineCursor"></div>
            </div>
            <div class="timeline-labels">
                <span id="currentTime">00:00.000</span>
                <span id="totalTime">${formatDuration(this.session.duration ?? 0)}</span>
            </div>
        </div>
```

- [ ] **Step 3: Load the two waveform scripts before `playback.js`**

Find the last `<script>` tag at the bottom of `getHtmlForWebview()`:

```html
    <script nonce="${nonce}" src="${jsUri}"></script>
```

Replace with:

```html
    <script nonce="${nonce}" src="${waveformCoreUri}"></script>
    <script nonce="${nonce}" src="${waveformUri}"></script>
    <script nonce="${nonce}" src="${jsUri}"></script>
```

- [ ] **Step 4: Build and confirm TypeScript compiles**

Run: `npm run build`
Expected: exit code 0, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/playback/PlaybackPanel.ts
git commit -m "feat(playback): swap timeline bar for waveform track and load waveform scripts"
```

---

## Task 9: Wire up `playback.js` — call `attach()` and handle fallback

**Files:**
- Modify: [media/playback.js](../../../media/playback.js)

- [ ] **Step 1: Rename `timelineBar` DOM reference to `timelineTrack`**

Find:

```js
  const timelineBar = document.getElementById('timelineBar');
```

Replace with:

```js
  const timelineTrack = document.getElementById('timelineTrack');
  const timelineWaveform = document.getElementById('timelineWaveform');
```

Find the click handler:

```js
  // Timeline click to seek
  timelineBar.addEventListener('click', (e) => {
    if (!session || !session.duration) { return; }
    const rect = timelineBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const targetMs = Math.max(0, Math.min(session.duration, pct * session.duration));
    seekTo(targetMs);
  });
```

Replace with:

```js
  // Timeline click to seek
  timelineTrack.addEventListener('click', (e) => {
    if (!session || !session.duration) { return; }
    const rect = timelineTrack.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const targetMs = Math.max(0, Math.min(session.duration, pct * session.duration));
    seekTo(targetMs);
  });
```

- [ ] **Step 2: Add waveform attach call in `initializePlayback()`**

Find:

```js
  function initializePlayback() {
    if (!session) { return; }

    // Set up audio if available
    if (session.audioUri) {
      audioPlayer.src = session.audioUri;
      audioIndicator.style.display = '';
    }

    // Render event ticks on timeline
    renderTimelineTicks();

    // Render markers
    renderMarkers();

    // Render empty output state
    updateOutputDisplay();
  }
```

Replace with:

```js
  let waveformController = null;

  function initializePlayback() {
    if (!session) { return; }

    // Set up audio if available
    if (session.audioUri) {
      audioPlayer.src = session.audioUri;
      audioIndicator.style.display = '';
      attachWaveform(session.audioUri);
    } else {
      timelineTrack.classList.add('no-audio');
    }

    // Render event ticks on timeline
    renderTimelineTicks();

    // Render markers
    renderMarkers();

    // Render empty output state
    updateOutputDisplay();
  }

  function attachWaveform(audioUri) {
    if (!window.SerialMonitorWaveform) {
      console.warn('SerialMonitorWaveform not available; falling back to no-audio layout');
      timelineTrack.classList.add('no-audio');
      return;
    }
    window.SerialMonitorWaveform.attach({
      canvas: timelineWaveform,
      audioUri: audioUri,
    }).then((controller) => {
      waveformController = controller;
    }).catch((err) => {
      console.warn('Waveform load failed:', err);
      timelineTrack.classList.add('no-audio');
    });
  }
```

- [ ] **Step 3: Build and confirm the project still compiles**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 4: Run `node -c` to syntax-check the modified playback.js**

Run: `node -c media/playback.js`
Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add media/playback.js
git commit -m "feat(playback): attach waveform on load with no-audio fallback"
```

---

## Task 10: Manual verification

This task is manual. Use the VS Code Extension Development Host (press F5).

- [ ] **Step 1: Build the extension**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 2: Launch the Extension Development Host**

In VS Code, press `F5`. A second VS Code window opens with the extension loaded.

- [ ] **Step 3: Verify a session WITH audio**

In the Extension Development Host:
1. Open the Serial Monitor Pro view from the activity bar.
2. From the Sessions list, double-click any session whose icon is the microphone (audio present).
3. The playback panel opens. **Expected:**
   - Timeline track is ~96px tall.
   - A teal/blue waveform fills the height.
   - A thin 8px strip at the bottom shows RX/TX tick marks (RX below center of strip, TX above).
   - The playback cursor (blue line) sits above the waveform.
   - Marker pins (📌) appear at the top of the track with a vertical line through.
   - Clicking anywhere on the track seeks playback.
   - Pressing play causes the cursor to advance and audio to play in sync.

- [ ] **Step 4: Verify a session WITHOUT audio**

In the Sessions list, double-click a session whose icon is the history icon (no audio).

**Expected:**
- Timeline track is back to ~48px tall (no waveform).
- RX/TX ticks fill the bar at original heights (RX bottom 40%, TX top 30%).
- All other playback behavior unchanged.

- [ ] **Step 5: Resize the panel**

With the audio session open, drag the panel narrower and wider.

**Expected:**
- Waveform redraws cleanly at the new width.
- No flickering or fetch happening (check the dev tools network panel — `Webview Developer Tools` from the command palette).

- [ ] **Step 6: Switch VS Code theme**

In the Extension Development Host, switch to a different theme (light/dark/high contrast).

**Expected:**
- Waveform color follows the new theme via `--vscode-charts-blue`.

- [ ] **Step 7: Record a fresh session with audio**

Use the Serial Monitor Pro recording controls to record a short (~30s) session with audio commentary.

**Expected:**
- Stop recording, then open the new session in playback.
- Waveform renders showing distinct peaks where you spoke and flat regions where you were silent.
- Eye-balling the waveform reveals where the commentary lives — the core acceptance criterion for this feature.

- [ ] **Step 8: Verify error path with a deleted audio file**

Close the playback panel. In the file system, rename `audio.wav` to `audio.wav.bak` inside one session directory. Reopen that session in playback.

**Expected:**
- Console (Webview Developer Tools) shows a "Waveform load failed" warning.
- Timeline falls back to 48px no-audio layout.
- The rest of playback still works.

Restore the file after testing (`mv audio.wav.bak audio.wav`).

- [ ] **Step 9: Commit (no code change, but note verification)**

```bash
git commit --allow-empty -m "chore: verify waveform timeline against acceptance criteria"
```

---

## Self-review notes

- **Spec coverage:** Layout (Task 7, 8), waveform-core module (Tasks 2–5), browser wrapper (Task 6), playback orchestration (Task 9), error paths (Task 9 + Step 8 of Task 10), testing approach (Task 1 + Tasks 2–5), edge cases (Tasks 3, 5, and verification 10.4/10.8), styling (Task 7), HTML structure (Task 8), file changes summary all mapped.
- **No remaining placeholders.** Every code block is complete; every command has expected output.
- **Type consistency:** `parseWavHeader(buffer)` returns `{ audioFormat, numChannels, sampleRate, bitsPerSample, dataOffset, dataLength }` everywhere; `computePeaks(pcmView, bucketCount, bitsPerSample, numChannels)` returns `Float32Array` of length `bucketCount * 2`; `attach({ canvas, audioUri })` returns a `Promise<{ destroy, redraw }>` consistent across Tasks 6, 9.
