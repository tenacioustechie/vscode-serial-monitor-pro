import * as vscode from 'vscode';
import { SerialPortService } from '../serialPort/serialPortService';
import { PortConfig, STANDARD_BAUD_RATES } from '../serialPort/types';
import { SessionRecorder } from '../recording/sessionRecorder';
import { PortTreeItem } from '../serialPort/serialPortManager';

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
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.portPath = portPath;
    this.portService = new SerialPortService();

    this.panel.webview.html = this.getHtmlForWebview();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      this.handleMessage.bind(this),
      undefined,
      this.disposables
    );

    // Handle panel disposal
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Forward serial data to webview
    this.disposables.push(
      this.portService.onData((data) => {
        this.panel.webview.postMessage({
          type: 'serialData',
          data: data.toString('utf-8'),
          timestamp: Date.now(),
        });
      })
    );

    this.disposables.push(
      this.portService.onError((err) => {
        this.panel.webview.postMessage({
          type: 'error',
          message: err.message,
        });
      })
    );

    this.disposables.push(
      this.portService.onClose(() => {
        this.panel.webview.postMessage({ type: 'disconnected' });
      })
    );

    this.disposables.push(
      this.portService.onOpen(() => {
        this.panel.webview.postMessage({ type: 'connected' });
      })
    );

    // Forward recording state changes
    this.disposables.push(
      this.sessionRecorder.onStateChange((state) => {
        this.panel.webview.postMessage({
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

    const monitorPanel = new MonitorPanel(panel, extensionUri, portPath, sessionRecorder);
    MonitorPanel.currentPanels.set(portPath, monitorPanel);
    return monitorPanel;
  }

  private async handleMessage(message: any): Promise<void> {
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
          this.panel.webview.postMessage({
            type: 'connected',
            config: portConfig,
            baudRates: [...STANDARD_BAUD_RATES, ...customBaudRates].sort((a, b) => a - b),
          });
        } catch (err: any) {
          this.panel.webview.postMessage({
            type: 'error',
            message: `Failed to open port: ${err.message}`,
          });
        }
        break;
      }

      case 'disconnect': {
        try {
          await this.portService.close();
        } catch (err: any) {
          this.panel.webview.postMessage({
            type: 'error',
            message: `Failed to close port: ${err.message}`,
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
          this.panel.webview.postMessage({
            type: 'txEcho',
            data: message.data,
            timestamp: Date.now(),
          });
        } catch (err: any) {
          this.panel.webview.postMessage({
            type: 'error',
            message: `Failed to send: ${err.message}`,
          });
        }
        break;
      }

      case 'startRecording': {
        if (!this.portService.isOpen || !this.portService.config) {
          this.panel.webview.postMessage({
            type: 'error',
            message: 'Cannot record: port is not connected',
          });
          return;
        }
        try {
          await this.sessionRecorder.startRecording(this.portService);
        } catch (err: any) {
          this.panel.webview.postMessage({
            type: 'error',
            message: `Failed to start recording: ${err.message}`,
          });
        }
        break;
      }

      case 'stopRecording': {
        try {
          const session = await this.sessionRecorder.stopRecording(message.name);
          if (session) {
            this.panel.webview.postMessage({
              type: 'recordingSaved',
              sessionId: session.id,
              sessionName: session.name,
            });
            vscode.window.showInformationMessage(
              `Recording saved: ${session.name} (${session.events.length} events)`
            );
          }
        } catch (err: any) {
          this.panel.webview.postMessage({
            type: 'error',
            message: `Failed to stop recording: ${err.message}`,
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
    }
  }

  private getHtmlForWebview(): string {
    const webview = this.panel.webview;
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'monitor.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'monitor.js'));

    const config = vscode.workspace.getConfiguration('serialMonitorPro');
    const customBaudRates = config.get<number[]>('customBaudRates') ?? [];
    const allBaudRates = [...STANDARD_BAUD_RATES, ...customBaudRates].sort((a, b) => a - b);
    const defaultBaudRate = config.get<number>('defaultBaudRate') ?? 115200;

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
    <link href="${cssUri}" rel="stylesheet">
    <title>Serial Monitor: ${this.portPath}</title>
</head>
<body>
    <div class="monitor-container">
        <div class="toolbar">
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

            <div class="toolbar-group">
                <button id="connectBtn" class="btn btn-primary">Connect</button>
                <button id="disconnectBtn" class="btn btn-danger" disabled>Disconnect</button>
                <span id="statusIndicator" class="status-indicator disconnected">●</span>
                <span id="statusText">Disconnected</span>
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

    <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    MonitorPanel.currentPanels.delete(this.portPath);

    this.portService.dispose();
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
