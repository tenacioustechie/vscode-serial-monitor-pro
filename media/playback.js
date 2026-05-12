// Serial Monitor Pro - Playback Webview Script
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  // DOM Elements
  const sessionNameEl = document.getElementById('sessionName');
  const timelineTrack = document.getElementById('timelineTrack');
  const timelineWaveform = document.getElementById('timelineWaveform');
  const timelineProgress = document.getElementById('timelineProgress');
  const timelineCursor = document.getElementById('timelineCursor');
  const timelineMarkers = document.getElementById('timelineMarkers');
  const timelineEvents = document.getElementById('timelineEvents');
  const currentTimeEl = document.getElementById('currentTime');
  const totalTimeEl = document.getElementById('totalTime');
  const playBtn = document.getElementById('playBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const skipBackBtn = document.getElementById('skipBackBtn');
  const skipForwardBtn = document.getElementById('skipForwardBtn');
  const speedSelect = document.getElementById('speedSelect');
  const addMarkerBtn = document.getElementById('addMarkerBtn');
  const audioIndicator = document.getElementById('audioIndicator');
  const showRxToggle = document.getElementById('showRx');
  const showTxToggle = document.getElementById('showTx');
  const showTimestampsToggle = document.getElementById('showTimestamps');
  const output = document.getElementById('output');
  const markersList = document.getElementById('markersList');
  const audioPlayer = document.getElementById('audioPlayer');

  // State
  let session = null;
  let isPlaying = false;
  let currentTimeMs = 0;
  let playbackSpeed = 1;
  let animationFrameId = null;
  let lastFrameTime = null;
  let nextEventIndex = 0;
  let waveformController = null;

  // Signal ready when DOM is loaded
  vscode.postMessage({ type: 'ready' });

  // Handle messages from extension
  window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.type) {
      case 'sessionData':
        session = message.session;
        initializePlayback();
        break;
    }
  });

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

  function renderTimelineTicks() {
    timelineEvents.innerHTML = '';
    if (!session || !session.duration || session.duration === 0) { return; }

    // Limit number of ticks for performance
    const maxTicks = 500;
    const step = Math.max(1, Math.floor(session.events.length / maxTicks));

    for (let i = 0; i < session.events.length; i += step) {
      const event = session.events[i];
      const pct = (event.timestamp / session.duration) * 100;
      const tick = document.createElement('div');
      tick.className = 'timeline-event-tick ' + event.direction;
      tick.style.left = pct + '%';
      timelineEvents.appendChild(tick);
    }
  }

  function startInlineEdit(labelEl, marker) {
    if (labelEl.querySelector('input')) { return; } // already editing

    const original = marker.label;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'marker-label-input';
    input.value = original;

    labelEl.textContent = '';
    labelEl.appendChild(input);
    input.focus();
    input.select();

    let finished = false;
    const finish = (save) => {
      if (finished) { return; }
      finished = true;
      const newLabel = input.value.trim();
      if (save && newLabel !== '' && newLabel !== original) {
        marker.label = newLabel;
        vscode.postMessage({
          type: 'renameMarker',
          id: marker.id,
          label: newLabel,
        });
      }
      renderMarkers();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());
  }

  function renderMarkers() {
    // Timeline markers
    timelineMarkers.innerHTML = '';
    markersList.innerHTML = '';

    if (!session) { return; }

    if (session.markers.length === 0) {
      markersList.innerHTML = '<div class="empty-markers">No markers yet. Click "Add Marker" during playback to annotate moments.</div>';
      return;
    }

    const sorted = [...session.markers].sort((a, b) => a.timestamp - b.timestamp);

    sorted.forEach((marker, idx) => {
      // Timeline pin
      if (session.duration > 0) {
        const pct = (marker.timestamp / session.duration) * 100;
        const pin = document.createElement('div');
        pin.className = 'timeline-marker';
        pin.style.left = pct + '%';
        pin.innerHTML = `
                    <div class="timeline-marker-line" style="background: ${marker.color || '#f6ad55'}"></div>
                    <div class="timeline-marker-tooltip">${formatTime(marker.timestamp)} - ${escapeHtml(marker.label)}</div>
                `;
        pin.addEventListener('click', () => seekTo(marker.timestamp));
        timelineMarkers.appendChild(pin);
      }

      // List item
      const item = document.createElement('div');
      item.className = 'marker-item';
      item.innerHTML = `
                <span class="marker-time">${formatTime(marker.timestamp)}</span>
                <span class="marker-label">${escapeHtml(marker.label)}</span>
                <button class="marker-delete" title="Remove marker">✕</button>
            `;
      item.addEventListener('click', (e) => {
        if (
          !e.target.classList.contains('marker-delete') &&
          !e.target.classList.contains('marker-label') &&
          !e.target.classList.contains('marker-label-input')
        ) {
          seekTo(marker.timestamp);
        }
      });
      item.querySelector('.marker-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({
          type: 'removeMarker',
          id: marker.id,
        });
        session.markers = session.markers.filter((m) => m.id !== marker.id);
        renderMarkers();
      });
      const labelEl = item.querySelector('.marker-label');
      labelEl.addEventListener('click', (e) => {
        e.stopPropagation();
        startInlineEdit(labelEl, marker);
      });
      markersList.appendChild(item);
    });
  }

  // Transport controls
  playBtn.addEventListener('click', () => {
    startPlayback();
  });

  pauseBtn.addEventListener('click', () => {
    pausePlayback();
  });

  skipBackBtn.addEventListener('click', () => {
    seekTo(0);
  });

  skipForwardBtn.addEventListener('click', () => {
    if (session) {
      seekTo(session.duration || 0);
    }
  });

  speedSelect.addEventListener('change', () => {
    playbackSpeed = parseFloat(speedSelect.value);
    if (audioPlayer.src) {
      audioPlayer.playbackRate = playbackSpeed;
    }
  });

  addMarkerBtn.addEventListener('click', () => {
    if (!session) { return; }

    const marker = {
      id: crypto.randomUUID(),
      timestamp: currentTimeMs,
      label: 'Marker ' + (session.markers.length + 1),
      color: '#f6ad55',
    };

    vscode.postMessage({
      type: 'addMarker',
      ...marker,
    });

    session.markers.push(marker);
    renderMarkers();
  });

  // Timeline click to seek
  timelineTrack.addEventListener('click', (e) => {
    if (!session || !session.duration) { return; }
    const rect = timelineTrack.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const targetMs = Math.max(0, Math.min(session.duration, pct * session.duration));
    seekTo(targetMs);
  });

  // Filter toggles
  showRxToggle.addEventListener('change', updateOutputDisplay);
  showTxToggle.addEventListener('change', updateOutputDisplay);
  showTimestampsToggle.addEventListener('change', updateOutputDisplay);

  function startPlayback() {
    if (!session) { return; }

    isPlaying = true;
    playBtn.style.display = 'none';
    pauseBtn.style.display = '';

    // Start audio
    if (audioPlayer.src) {
      audioPlayer.currentTime = currentTimeMs / 1000;
      audioPlayer.playbackRate = playbackSpeed;
      audioPlayer.play().catch(() => { });
    }

    lastFrameTime = performance.now();
    animationFrameId = requestAnimationFrame(playbackLoop);
  }

  function pausePlayback() {
    isPlaying = false;
    playBtn.style.display = '';
    pauseBtn.style.display = 'none';

    if (audioPlayer.src) {
      audioPlayer.pause();
    }

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  function seekTo(ms) {
    currentTimeMs = Math.max(0, ms);
    if (session && session.duration) {
      currentTimeMs = Math.min(currentTimeMs, session.duration);
    }

    // Reset event index
    nextEventIndex = 0;
    if (session) {
      for (let i = 0; i < session.events.length; i++) {
        if (session.events[i].timestamp > currentTimeMs) {
          break;
        }
        nextEventIndex = i + 1;
      }
    }

    // Sync audio
    if (audioPlayer.src) {
      audioPlayer.currentTime = currentTimeMs / 1000;
    }

    updateTimelinePosition();
    updateOutputDisplay();
  }

  function playbackLoop(now) {
    if (!isPlaying || !session) { return; }

    const delta = (now - lastFrameTime) * playbackSpeed;
    lastFrameTime = now;
    currentTimeMs += delta;

    // Check if playback has reached the end
    if (session.duration && currentTimeMs >= session.duration) {
      currentTimeMs = session.duration;
      pausePlayback();
      updateTimelinePosition();
      updateOutputDisplay();
      return;
    }

    // Process events up to current time
    while (nextEventIndex < session.events.length &&
      session.events[nextEventIndex].timestamp <= currentTimeMs) {
      appendEvent(session.events[nextEventIndex]);
      nextEventIndex++;
    }

    updateTimelinePosition();

    animationFrameId = requestAnimationFrame(playbackLoop);
  }

  function updateTimelinePosition() {
    if (!session || !session.duration || session.duration === 0) { return; }

    const pct = Math.min(100, (currentTimeMs / session.duration) * 100);
    timelineProgress.style.width = pct + '%';
    timelineCursor.style.left = pct + '%';
    currentTimeEl.textContent = formatTime(currentTimeMs);
  }

  function appendEvent(event) {
    const showRx = showRxToggle.checked;
    const showTx = showTxToggle.checked;
    const showTs = showTimestampsToggle.checked;

    if (event.direction === 'rx' && !showRx) { return; }
    if (event.direction === 'tx' && !showTx) { return; }

    const line = document.createElement('span');
    line.className = 'output-line ' + event.direction;

    if (showTs) {
      const ts = document.createElement('span');
      ts.className = 'timestamp';
      ts.textContent = formatTime(event.timestamp);
      line.appendChild(ts);
    }

    const prefix = document.createTextNode(event.direction === 'tx' ? '← ' : '→ ');
    const prefixSpan = document.createElement('span');
    prefixSpan.style.opacity = '0.5';
    prefixSpan.appendChild(prefix);
    line.appendChild(prefixSpan);

    // Decode base64 data
    let text;
    try {
      text = atob(event.data);
    } catch {
      text = event.data;
    }
    line.appendChild(document.createTextNode(text));

    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  function updateOutputDisplay() {
    output.innerHTML = '';
    if (!session) { return; }

    // Re-render all events up to current time
    for (let i = 0; i < session.events.length; i++) {
      if (session.events[i].timestamp > currentTimeMs) { break; }
      appendEvent(session.events[i]);
    }
  }

  function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const millis = Math.floor(ms % 1000);
    return String(minutes).padStart(2, '0') + ':' +
      String(seconds).padStart(2, '0') + '.' +
      String(millis).padStart(3, '0');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
