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

  const WaveformCore = { parseWavHeader: parseWavHeader, computePeaks: computePeaks };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WaveformCore;
  } else {
    root.WaveformCore = WaveformCore;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
