// Serial Monitor Plus - Monitor Webview Script
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  // DOM Elements
  const baudRateSelect = document.getElementById('baudRate');
  const lineEndingSelect = document.getElementById('lineEnding');
  const dataBitsSelect = document.getElementById('dataBits');
  const stopBitsSelect = document.getElementById('stopBits');
  const paritySelect = document.getElementById('parity');
  const connectBtn = document.getElementById('connectBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const timestampToggle = document.getElementById('timestampToggle');
  const autoscrollToggle = document.getElementById('autoscrollToggle');
  const clearBtn = document.getElementById('clearBtn');
  const recordBtn = document.getElementById('recordBtn');
  const stopRecordBtn = document.getElementById('stopRecordBtn');
  const recordingTimer = document.getElementById('recordingTimer');
  const output = document.getElementById('output');
  const inputField = document.getElementById('inputField');
  const sendBtn = document.getElementById('sendBtn');

  let isConnected = false;
  let isRecording = false;
  let recordingStartTime = null;
  let recordingInterval = null;

  // Connect button
  connectBtn.addEventListener('click', () => {
    vscode.postMessage({
      type: 'connect',
      baudRate: parseInt(baudRateSelect.value),
      lineEnding: lineEndingSelect.value,
      dataBits: parseInt(dataBitsSelect.value),
      stopBits: parseInt(stopBitsSelect.value),
      parity: paritySelect.value,
    });
  });

  // Disconnect button
  disconnectBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'disconnect' });
  });

  // Send button
  sendBtn.addEventListener('click', sendMessage);

  // Enter key to send
  inputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });

  function sendMessage() {
    const text = inputField.value;
    if (!text && text !== '') { return; }
    vscode.postMessage({ type: 'send', data: text });
    inputField.value = '';
    inputField.focus();
  }

  // Clear output
  clearBtn.addEventListener('click', () => {
    output.innerHTML = '';
  });

  // Record button
  recordBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'startRecording' });
  });

  // Stop recording
  stopRecordBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'stopRecording' });
  });

  // Handle messages from extension
  window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.type) {
      case 'connected':
        setConnected(true);
        appendSystemLine('Connected to port');
        break;

      case 'disconnected':
        setConnected(false);
        appendSystemLine('Disconnected from port');
        break;

      case 'serialData':
        appendDataLine(message.data, 'rx', message.timestamp);
        break;

      case 'txEcho':
        appendDataLine(message.data, 'tx', message.timestamp);
        break;

      case 'error':
        appendErrorLine(message.message);
        break;

      case 'recordingState':
        updateRecordingState(message.state);
        break;

      case 'recordingSaved':
        appendSystemLine(`Recording saved: ${message.sessionName}`);
        break;
    }
  });

  function setConnected(connected) {
    isConnected = connected;
    connectBtn.disabled = connected;
    disconnectBtn.disabled = !connected;
    inputField.disabled = !connected;
    sendBtn.disabled = !connected;
    recordBtn.disabled = !connected;

    // Disable config while connected
    baudRateSelect.disabled = connected;
    dataBitsSelect.disabled = connected;
    stopBitsSelect.disabled = connected;
    paritySelect.disabled = connected;

    statusIndicator.className = 'status-indicator ' + (connected ? 'connected' : 'disconnected');
    statusText.textContent = connected ? 'Connected' : 'Disconnected';

    if (connected) {
      inputField.focus();
    }
  }

  function updateRecordingState(state) {
    isRecording = state.isRecording;

    if (isRecording) {
      recordBtn.style.display = 'none';
      stopRecordBtn.style.display = '';
      stopRecordBtn.disabled = false;
      recordingTimer.style.display = '';
      recordingStartTime = state.startTime || Date.now();
      startRecordingTimer();
      appendSystemLine('🔴 Recording started');
    } else {
      recordBtn.style.display = '';
      recordBtn.disabled = !isConnected;
      stopRecordBtn.style.display = 'none';
      recordingTimer.style.display = 'none';
      stopRecordingTimer();
    }
  }

  function startRecordingTimer() {
    stopRecordingTimer();
    recordingInterval = setInterval(() => {
      const elapsed = Date.now() - recordingStartTime;
      const seconds = Math.floor(elapsed / 1000);
      const minutes = Math.floor(seconds / 60);
      recordingTimer.textContent =
        String(minutes).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
    }, 1000);
  }

  function stopRecordingTimer() {
    if (recordingInterval) {
      clearInterval(recordingInterval);
      recordingInterval = null;
    }
  }

  function appendDataLine(data, direction, timestamp) {
    const line = document.createElement('span');
    line.className = 'output-line ' + direction;

    if (timestampToggle.checked && timestamp) {
      const ts = document.createElement('span');
      ts.className = 'timestamp';
      const d = new Date(timestamp);
      ts.textContent = d.toLocaleTimeString() + '.' + String(d.getMilliseconds()).padStart(3, '0');
      line.appendChild(ts);
    }

    const prefix = document.createElement('span');
    prefix.className = 'direction-prefix';
    prefix.textContent = direction === 'tx' ? '← ' : '→ ';
    prefix.style.opacity = '0.5';
    line.appendChild(prefix);

    const content = document.createTextNode(data);
    line.appendChild(content);

    output.appendChild(line);

    if (autoscrollToggle.checked) {
      output.scrollTop = output.scrollHeight;
    }
  }

  function appendSystemLine(text) {
    const line = document.createElement('span');
    line.className = 'output-line system';
    line.textContent = '--- ' + text + ' ---';
    output.appendChild(line);

    if (autoscrollToggle.checked) {
      output.scrollTop = output.scrollHeight;
    }
  }

  function appendErrorLine(text) {
    const line = document.createElement('span');
    line.className = 'output-line error';
    line.textContent = '⚠ ' + text;
    output.appendChild(line);

    if (autoscrollToggle.checked) {
      output.scrollTop = output.scrollHeight;
    }
  }
})();
