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
