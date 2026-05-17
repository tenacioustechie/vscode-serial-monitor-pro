// Pure playback helpers, shared between the webview script and Node tests.
(function (root) {
  'use strict';

  function isAtEnd(currentTimeMs, duration) {
    if (typeof duration !== 'number' || duration <= 0) { return false; }
    return currentTimeMs >= duration;
  }

  function initialCursorMs(session) {
    if (!session) { return 0; }
    const d = session.duration;
    return typeof d === 'number' && isFinite(d) && d > 0 ? d : 0;
  }

  const PlaybackCore = { isAtEnd: isAtEnd, initialCursorMs: initialCursorMs };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlaybackCore;
  } else {
    root.PlaybackCore = PlaybackCore;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
