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
