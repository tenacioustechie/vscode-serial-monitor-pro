import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { parseWavHeader, computePeaks } = require(path.join(here, '..', 'media', 'waveform-core.js'));

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
