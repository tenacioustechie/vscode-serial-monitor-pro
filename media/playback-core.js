// Pure playback helpers, shared between the webview script and Node tests.
(function (root) {
  'use strict';

  function isAtEnd(currentTimeMs, duration) {
    if (typeof duration !== 'number' || duration <= 0) { return false; }
    return currentTimeMs >= duration;
  }

  const PlaybackCore = { isAtEnd: isAtEnd };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlaybackCore;
  } else {
    root.PlaybackCore = PlaybackCore;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
