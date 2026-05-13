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

    console.log('[wave-diag] fetch ->', audioUri);
    let response;
    try {
      response = await fetch(audioUri);
    } catch (e) {
      console.error('[wave-diag] fetch threw (likely CSP connect-src block):', e);
      throw e;
    }
    console.log('[wave-diag] fetch response', { ok: response.ok, status: response.status });
    if (!response.ok) {
      throw new Error('Failed to fetch audio: ' + response.status);
    }
    const buffer = await response.arrayBuffer();
    console.log('[wave-diag] arrayBuffer bytes =', buffer.byteLength);
    const header = Core.parseWavHeader(buffer);
    console.log('[wave-diag] wav header', header);
    const pcm = new DataView(buffer, header.dataOffset, header.dataLength);
    const peaks = Core.computePeaks(pcm, BUCKET_COUNT, header.bitsPerSample, header.numChannels);
    // Quick sanity: look at peak amplitude range.
    let maxAbs = 0;
    for (let i = 0; i < peaks.length; i++) {
      const a = Math.abs(peaks[i]);
      if (a > maxAbs) { maxAbs = a; }
    }
    console.log('[wave-diag] peaks computed, len=' + peaks.length + ' maxAbs=' + maxAbs.toFixed(4));

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
