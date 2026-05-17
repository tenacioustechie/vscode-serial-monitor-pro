import * as vscode from 'vscode';
import { SerialPortService } from '../serialPort/serialPortService';
import { PortConfig, STANDARD_BAUD_RATES } from '../serialPort/types';
import { SessionRecorder } from '../recording/sessionRecorder';
import { SessionDiscardService } from '../recording/sessionDiscardService';
import { PortTreeItem } from '../serialPort/serialPortManager';

type IncomingMessage =
  | {
      type: 'connect';
      baudRate?: number;
      dataBits?: 5 | 6 | 7 | 8;
      stopBits?: 1 | 1.5 | 2;
      parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
      lineEnding?: string;
    }
  | { type: 'disconnect' }
  | { type: 'send'; data: string }
  | { type: 'startRecording' }
  | { type: 'stopRecording'; name?: string }
  | { type: 'updateConfig'; config: Omit<PortConfig, 'path'> }
  | { type: 'updateAutoRecord'; enabled: boolean }
  | { type: 'discardLastRecording'; sessionId: string; sessionName: string }
  | { type: 'openSession'; sessionId: string };

export class MonitorPanel implements vscode.Disposable {
  public static currentPanels: Map<string, MonitorPanel> = new Map();

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly portService: SerialPortService;
  private disposables: vscode.Disposable[] = [];
  private portPath: string;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    portPath: string,
    private readonly sessionRecorder: SessionRecorder,
    private readonly discardService: SessionDiscardService,
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.portPath = portPath;
    this.portService = new SerialPortService();

    this.panel.webview.html = this.getHtmlForWebview();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      (raw: unknown) => { void this.handleMessage(raw as IncomingMessage); },
      undefined,
      this.disposables
    );

    // Handle panel disposal
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Forward serial data to webview
    this.disposables.push(
      this.portService.onData((data) => {
        void this.panel.webview.postMessage({
          type: 'serialData',
          data: data.toString('utf-8'),
          timestamp: Date.now(),
        });
      })
    );

    this.disposables.push(
      this.portService.onError((err) => {
        void this.panel.webview.postMessage({
          type: 'error',
          message: err.message,
        });
      })
    );

    this.disposables.push(
      this.portService.onClose(() => {
        void this.panel.webview.postMessage({ type: 'disconnected' });

        if (this.sessionRecorder.isRecording) {
          void this.sessionRecorder.stopRecording().then((session) => {
            if (session) {
              void this.panel.webview.postMessage({
                type: 'recordingSaved',
                sessionId: session.id,
                sessionName: session.name,
              });
              this.showRecordingSavedToast(session.id, session.name, session.events.length);
            }
          }).catch((err) => {
            void this.panel.webview.postMessage({
              type: 'error',
              message: `Failed to auto-stop recording: ${errMessage(err)}`,
            });
          });
        }
      })
    );

    this.disposables.push(
      this.portService.onOpen(() => {
        void this.panel.webview.postMessage({ type: 'connected' });

        const autoRecord = vscode.workspace
          .getConfiguration('serialMonitorPro')
          .get<boolean>('autoRecordOnConnect') ?? true;
        if (autoRecord && !this.sessionRecorder.isRecording) {
          this.discardService.finalizePending();
          void this.sessionRecorder.startRecording(this.portService).catch((err) => {
            void this.panel.webview.postMessage({
              type: 'error',
              message: `Failed to auto-start recording: ${errMessage(err)}`,
            });
          });
        }
      })
    );

    // Forward recording state changes
    this.disposables.push(
      this.sessionRecorder.onStateChange((state) => {
        void this.panel.webview.postMessage({
          type: 'recordingState',
          state,
        });
      })
    );
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    portItem: PortTreeItem | string,
    sessionRecorder: SessionRecorder,
    discardService: SessionDiscardService,
  ): MonitorPanel {
    const portPath = typeof portItem === 'string' ? portItem : portItem.portInfo.path;

    const existing = MonitorPanel.currentPanels.get(portPath);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.One);
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      'serialMonitor',
      `Serial Monitor: ${portPath}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      }
    );

    const monitorPanel = new MonitorPanel(panel, extensionUri, portPath, sessionRecorder, discardService);
    MonitorPanel.currentPanels.set(portPath, monitorPanel);
    return monitorPanel;
  }

  private async handleMessage(message: IncomingMessage): Promise<void> {
    switch (message.type) {
      case 'connect': {
        const config = vscode.workspace.getConfiguration('serialMonitorPro');
        const customBaudRates = config.get<number[]>('customBaudRates') ?? [];
        const portConfig: PortConfig = {
          path: this.portPath,
          baudRate: message.baudRate ?? config.get<number>('defaultBaudRate') ?? 115200,
          dataBits: message.dataBits ?? 8,
          stopBits: message.stopBits ?? 1,
          parity: message.parity ?? 'none',
          lineEnding: message.lineEnding ?? config.get<string>('defaultLineEnding') ?? '\n',
        };
        try {
          await this.portService.open(portConfig);
          void this.panel.webview.postMessage({
            type: 'connected',
            config: portConfig,
            baudRates: [...STANDARD_BAUD_RATES, ...customBaudRates].sort((a, b) => a - b),
          });
        } catch (err) {
          void this.panel.webview.postMessage({
            type: 'error',
            message: `Failed to open port: ${errMessage(err)}`,
          });
        }
        break;
      }

      case 'disconnect': {
        try {
          await this.portService.close();
        } catch (err) {
          void this.panel.webview.postMessage({
            type: 'error',
            message: `Failed to close port: ${errMessage(err)}`,
          });
        }
        break;
      }

      case 'send': {
        try {
          this.portService.write(message.data);
          // Log TX event if recording
          if (this.sessionRecorder.isRecording) {
            this.sessionRecorder.logTx(message.data);
          }
          void this.panel.webview.postMessage({
            type: 'txEcho',
            data: message.data,
            timestamp: Date.now(),
          });
        } catch (err) {
          void this.panel.webview.postMessage({
            type: 'error',
            message: `Failed to send: ${errMessage(err)}`,
          });
        }
        break;
      }

      case 'startRecording': {
        if (!this.portService.isOpen || !this.portService.config) {
          void this.panel.webview.postMessage({
            type: 'error',
            message: 'Cannot record: port is not connected',
          });
          return;
        }
        try {
          this.discardService.finalizePending();
          await this.sessionRecorder.startRecording(this.portService);
        } catch (err) {
          void this.panel.webview.postMessage({
            type: 'error',
            message: `Failed to start recording: ${errMessage(err)}`,
          });
        }
        break;
      }

      case 'stopRecording': {
        try {
          const session = await this.sessionRecorder.stopRecording(message.name);
          if (session) {
            void this.panel.webview.postMessage({
              type: 'recordingSaved',
              sessionId: session.id,
              sessionName: session.name,
            });
            this.showRecordingSavedToast(session.id, session.name, session.events.length);
          }
        } catch (err) {
          void this.panel.webview.postMessage({
            type: 'error',
            message: `Failed to stop recording: ${errMessage(err)}`,
          });
        }
        break;
      }

      case 'updateConfig': {
        // Reconnect with new config
        if (this.portService.isOpen) {
          await this.portService.close();
          const config: PortConfig = {
            path: this.portPath,
            ...message.config,
          };
          await this.portService.open(config);
        }
        break;
      }

      case 'updateAutoRecord': {
        await vscode.workspace
          .getConfiguration('serialMonitorPro')
          .update('autoRecordOnConnect', message.enabled, vscode.ConfigurationTarget.Global);
        break;
      }

      case 'discardLastRecording': {
        this.discardService.softDelete(message.sessionId, message.sessionName);
        break;
      }

      case 'openSession': {
        await vscode.commands.executeCommand('serialMonitorPro.openPlayback', message.sessionId);
        break;
      }
    }
  }

  private showRecordingSavedToast(sessionId: string, sessionName: string, eventCount: number): void {
    void vscode.window
      .showInformationMessage(
        `Recording saved: ${sessionName} (${eventCount} events)`,
        'Open',
        'Discard',
      )
      .then((choice) => {
        if (choice === 'Open') {
          void vscode.commands.executeCommand('serialMonitorPro.openPlayback', sessionId);
        } else if (choice === 'Discard') {
          void this.discardService.softDelete(sessionId, sessionName);
        }
      });
  }

  private getHtmlForWebview(): string {
    const webview = this.panel.webview;
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'monitor.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'monitor.js'));

    const config = vscode.workspace.getConfiguration('serialMonitorPro');
    const customBaudRates = config.get<number[]>('customBaudRates') ?? [];
    const allBaudRates = [...STANDARD_BAUD_RATES, ...customBaudRates].sort((a, b) => a - b);
    const defaultBaudRate = config.get<number>('defaultBaudRate') ?? 115200;
    const autoRecordOnConnect = config.get<boolean>('autoRecordOnConnect') ?? true;
    const autoRecordChecked = autoRecordOnConnect ? 'checked' : '';

    const baudRateOptions = allBaudRates.map(r =>
      `<option value="${r}" ${r === defaultBaudRate ? 'selected' : ''}>${r}</option>`
    ).join('');

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <link href="${cssUri.toString()}" rel="stylesheet">
    <title>Serial Monitor: ${this.portPath}</title>
</head>
<body>
    <div class="monitor-container">
        <div class="toolbar">
            <div class="toolbar-group">
                <button id="connectBtn" class="btn btn-primary">Connect</button>
                <button id="disconnectBtn" class="btn btn-danger" disabled>Disconnect</button>
                <span id="statusIndicator" class="status-indicator disconnected">●</span>
                <span id="statusText">Disconnected</span>
            </div>

            <div class="toolbar-group">
                <label for="baudRate">Baud Rate:</label>
                <select id="baudRate">${baudRateOptions}</select>

                <label for="lineEnding">Line Ending:</label>
                <select id="lineEnding">
                    <option value="">None</option>
                    <option value="\\n" selected>LF (\\n)</option>
                    <option value="\\r">CR (\\r)</option>
                    <option value="\\r\\n">CRLF (\\r\\n)</option>
                </select>

                <label for="dataBits">Data Bits:</label>
                <select id="dataBits">
                    <option value="5">5</option>
                    <option value="6">6</option>
                    <option value="7">7</option>
                    <option value="8" selected>8</option>
                </select>

                <label for="stopBits">Stop Bits:</label>
                <select id="stopBits">
                    <option value="1" selected>1</option>
                    <option value="2">2</option>
                </select>

                <label for="parity">Parity:</label>
                <select id="parity">
                    <option value="none" selected>None</option>
                    <option value="even">Even</option>
                    <option value="odd">Odd</option>
                    <option value="mark">Mark</option>
                    <option value="space">Space</option>
                </select>
            </div>
        </div>

        <div class="toolbar secondary-toolbar">
            <div class="toolbar-group">
                <label>
                    <input type="checkbox" id="timestampToggle"> Timestamps
                </label>
                <label>
                    <input type="checkbox" id="autoscrollToggle" checked> Auto-scroll
                </label>
                <button id="clearBtn" class="btn btn-small">Clear</button>
            </div>
            <div class="toolbar-group recording-controls">
                <label class="auto-record-label">
                    <input type="checkbox" id="autoRecordToggle" ${autoRecordChecked}> Auto-record on connect
                </label>
                <button id="recordBtn" class="btn btn-record" disabled title="Start Recording">
                    <span class="record-dot">●</span> Record
                </button>
                <button id="stopRecordBtn" class="btn btn-stop-record" disabled title="Stop Recording" style="display:none;">
                    <span>■</span> Stop
                </button>
                <span id="recordingTimer" class="recording-timer" style="display:none;">00:00</span>
            </div>
        </div>

        <div id="output" class="output-area" tabindex="0"></div>

        <div class="input-area">
            <input type="text" id="inputField" placeholder="Type message to send..." disabled>
            <button id="sendBtn" class="btn btn-primary" disabled>Send</button>
        </div>
    </div>

    <script nonce="${nonce}" src="${jsUri.toString()}"></script>
</body>
</html>`;
  }

  dispose(): void {
    MonitorPanel.currentPanels.delete(this.portPath);

    this.portService.dispose();
    this.disposables.forEach(d => { d.dispose(); });
    this.panel.dispose();
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
