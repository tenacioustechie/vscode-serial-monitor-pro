import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { RecordingSession, SerialEvent, Marker } from '../recording/types';
import { SessionStorage } from '../storage/sessionStorage';

export class PlaybackPanel implements vscode.Disposable {
  private static currentPanels: Map<string, PlaybackPanel> = new Map();

  private readonly panel: vscode.WebviewPanel;
  private session: RecordingSession;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    session: RecordingSession,
    private readonly sessionStorage: SessionStorage,
  ) {
    this.panel = panel;
    this.session = session;

    this.panel.webview.html = this.getHtmlForWebview();

    this.panel.webview.onDidReceiveMessage(
      this.handleMessage.bind(this),
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public static async createOrShow(
    extensionUri: vscode.Uri,
    sessionId: string,
    sessionStorage: SessionStorage,
  ): Promise<PlaybackPanel | undefined> {
    const existing = PlaybackPanel.currentPanels.get(sessionId);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.One);
      return existing;
    }

    const session = await sessionStorage.loadSession(sessionId);
    if (!session) {
      vscode.window.showErrorMessage(`Session not found: ${sessionId}`);
      return undefined;
    }

    // Backfill stable ids for markers saved before the id field existed.
    let backfilled = false;
    for (const marker of session.markers) {
      if (!marker.id) {
        marker.id = crypto.randomUUID();
        backfilled = true;
      }
    }
    if (backfilled) {
      await sessionStorage.saveSession(session);
    }

    const panel = vscode.window.createWebviewPanel(
      'serialPlayback',
      `Playback: ${session.name}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
          vscode.Uri.file(sessionStorage.getSessionDir(sessionId)),
        ],
      }
    );

    const playbackPanel = new PlaybackPanel(panel, extensionUri, session, sessionStorage);
    PlaybackPanel.currentPanels.set(sessionId, playbackPanel);
    return playbackPanel;
  }

  private async handleMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'ready': {
        // Send session data to webview
        const audioUri = this.session.audioFile
          ? this.panel.webview.asWebviewUri(
            vscode.Uri.file(
              path.join(
                this.sessionStorage.getSessionDir(this.session.id),
                this.session.audioFile
              )
            )
          ).toString()
          : undefined;

        this.panel.webview.postMessage({
          type: 'sessionData',
          session: {
            ...this.session,
            audioUri,
          },
        });
        break;
      }

      case 'addMarker': {
        const marker: Marker = {
          timestamp: message.timestamp,
          label: message.label,
          color: message.color,
        };
        this.session.markers.push(marker);
        await this.sessionStorage.saveSession(this.session);
        break;
      }

      case 'removeMarker': {
        this.session.markers = this.session.markers.filter(
          (m) => m.timestamp !== message.timestamp || m.label !== message.label
        );
        await this.sessionStorage.saveSession(this.session);
        break;
      }

      case 'renameSession': {
        this.session.name = message.name;
        await this.sessionStorage.saveSession(this.session);
        this.panel.title = `Playback: ${message.name}`;
        break;
      }
    }
  }

  private getHtmlForWebview(): string {
    const webview = this.panel.webview;
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'playback.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'playback.js'));

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; media-src ${webview.cspSource};">
    <link href="${cssUri}" rel="stylesheet">
    <title>Session Playback</title>
</head>
<body>
    <div class="playback-container">
        <div class="playback-header">
            <h2 id="sessionName">${this.session.name}</h2>
            <div class="session-meta">
                <span id="sessionDate">${new Date(this.session.startTime).toLocaleString()}</span>
                <span class="separator">•</span>
                <span id="sessionPort">${this.session.portConfig.path} @ ${this.session.portConfig.baudRate}</span>
                <span class="separator">•</span>
                <span id="sessionDuration">${formatDuration(this.session.duration ?? 0)}</span>
                <span class="separator">•</span>
                <span id="eventCount">${this.session.events.length} events</span>
            </div>
        </div>

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

        <div class="transport-controls">
            <button id="skipBackBtn" class="btn btn-transport" title="Skip to start">⏮</button>
            <button id="playBtn" class="btn btn-transport btn-play" title="Play">▶</button>
            <button id="pauseBtn" class="btn btn-transport" title="Pause" style="display:none;">⏸</button>
            <button id="skipForwardBtn" class="btn btn-transport" title="Skip to end">⏭</button>

            <div class="speed-control">
                <label for="speedSelect">Speed:</label>
                <select id="speedSelect">
                    <option value="0.25">0.25x</option>
                    <option value="0.5">0.5x</option>
                    <option value="1" selected>1x</option>
                    <option value="2">2x</option>
                    <option value="4">4x</option>
                    <option value="10">10x</option>
                </select>
            </div>

            <div class="marker-control">
                <button id="addMarkerBtn" class="btn btn-marker" title="Add marker at current position">📌 Add Marker</button>
            </div>

            <div class="audio-indicator" id="audioIndicator" style="display:none;">
                🎤 Audio
            </div>
        </div>

        <div class="output-container">
            <div class="output-header">
                <span>Serial Output</span>
                <div class="output-toggles">
                    <label><input type="checkbox" id="showRx" checked> RX</label>
                    <label><input type="checkbox" id="showTx" checked> TX</label>
                    <label><input type="checkbox" id="showTimestamps" checked> Timestamps</label>
                </div>
            </div>
            <div id="output" class="output-area" tabindex="0"></div>
        </div>

        <div class="markers-panel" id="markersPanel">
            <div class="markers-header">
                <span>Markers & Notes</span>
            </div>
            <div id="markersList" class="markers-list"></div>
        </div>
    </div>

    <audio id="audioPlayer" preload="auto"></audio>

    <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    PlaybackPanel.currentPanels.delete(this.session.id);
    this.disposables.forEach(d => d.dispose());
    this.panel.dispose();
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
