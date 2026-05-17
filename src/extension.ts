import * as vscode from 'vscode';
import { SerialPortManager, PortTreeItem } from './serialPort/serialPortManager';
import { MonitorPanel } from './monitor/monitorPanel';
import { SessionRecorder } from './recording/sessionRecorder';
import { SessionDiscardService } from './recording/sessionDiscardService';
import { SessionStorage, SessionTreeProvider, SessionTreeItem } from './storage/sessionStorage';
import { PlaybackPanel } from './playback/playbackPanel';

export async function activate(context: vscode.ExtensionContext) {
  console.log('Serial Monitor Pro is now active');

  // Register both tree views up front with a placeholder provider so the UI
  // never shows VS Code's cryptic "no data provider registered" error, even
  // if downstream initialization throws.
  const emptyProvider: vscode.TreeDataProvider<vscode.TreeItem> = {
    getTreeItem: (e) => e,
    getChildren: () => Promise.resolve([]),
  };
  let portTreeView = vscode.window.createTreeView('serialMonitorPorts', {
    treeDataProvider: emptyProvider,
  });
  let sessionTreeView = vscode.window.createTreeView('serialMonitorSessions', {
    treeDataProvider: emptyProvider,
  });
  context.subscriptions.push(portTreeView, sessionTreeView);

  try {
    const sessionStorage = new SessionStorage(context);

    const sessionRecorder = new SessionRecorder(sessionStorage);
    await sessionRecorder.initialize();

    // Replace placeholder providers with the real ones.
    const portManager = new SerialPortManager();
    portTreeView.dispose();
    portTreeView = vscode.window.createTreeView('serialMonitorPorts', {
      treeDataProvider: portManager,
    });

    const sessionTreeProvider = new SessionTreeProvider(sessionStorage);
    sessionTreeView.dispose();
    sessionTreeView = vscode.window.createTreeView('serialMonitorSessions', {
      treeDataProvider: sessionTreeProvider,
    });

    void portManager.refresh();

    const discardService = new SessionDiscardService(sessionStorage, sessionTreeProvider);
    void discardService.gcOrphans();

    context.subscriptions.push(
      sessionRecorder.onSessionSaved(() => {
        sessionTreeProvider.refresh();
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('serialMonitorPro.openMonitor', (item?: PortTreeItem) => {
        if (item && item instanceof PortTreeItem && !item.isDetail) {
          MonitorPanel.createOrShow(context.extensionUri, item, sessionRecorder, discardService);
        } else {
          void showPortQuickPick(portManager, context.extensionUri, sessionRecorder, discardService);
        }
      }),

      vscode.commands.registerCommand('serialMonitorPro.refreshPorts', () => {
        void portManager.refresh();
      }),

      vscode.commands.registerCommand('serialMonitorPro.startRecording', () => {
        void vscode.window.showInformationMessage(
          'Use the Record button in an open Serial Monitor panel to start recording.'
        );
      }),

      vscode.commands.registerCommand('serialMonitorPro.stopRecording', async () => {
        if (sessionRecorder.isRecording) {
          const name = await vscode.window.showInputBox({
            prompt: 'Enter a name for this recording session',
            placeHolder: 'Session name',
          });
          await sessionRecorder.stopRecording(name ?? undefined);
        }
      }),

      vscode.commands.registerCommand('serialMonitorPro.openPlayback', async (item?: SessionTreeItem | string) => {
        let sessionId: string | undefined;

        if (item instanceof SessionTreeItem) {
          sessionId = item.sessionId;
        } else if (typeof item === 'string') {
          sessionId = item;
        } else {
          const sessions = await sessionStorage.listSessions();
          if (sessions.length === 0) {
            void vscode.window.showInformationMessage('No recorded sessions found.');
            return;
          }

          interface SessionQuickPickItem extends vscode.QuickPickItem {
            sessionId: string;
          }
          const items: SessionQuickPickItem[] = sessions.map((s) => ({
            label: s.name,
            description: `${new Date(s.date).toLocaleString()} • ${s.hasAudio ? '🎤 ' : ''}${formatDuration(s.duration ?? 0)}`,
            sessionId: s.id,
          }));
          const picked = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a recording session to play back',
          });

          if (picked) {
            sessionId = picked.sessionId;
          }
        }

        if (sessionId) {
          await PlaybackPanel.createOrShow(context.extensionUri, sessionId, sessionStorage);
        }
      }),

      vscode.commands.registerCommand('serialMonitorPro.refreshSessions', () => {
        sessionTreeProvider.refresh();
      }),

      vscode.commands.registerCommand(
        'serialMonitorPro.deleteSession',
        async (item?: SessionTreeItem) => {
          if (!(item instanceof SessionTreeItem)) {
            return;
          }
          await discardService.softDelete(item.sessionId, item.sessionName);
        },
      ),
    );

    context.subscriptions.push(
      portTreeView,
      sessionTreeView,
      portManager,
      sessionTreeProvider,
      sessionStorage,
      sessionRecorder,
      discardService,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(
      `Serial Monitor Pro failed to activate fully: ${msg}. The extension is loaded with limited functionality.`,
    );
    console.error('Serial Monitor Pro activation error:', err);
  }
}

async function showPortQuickPick(
  portManager: SerialPortManager,
  extensionUri: vscode.Uri,
  sessionRecorder: SessionRecorder,
  discardService: SessionDiscardService,
) {
  await portManager.refresh();

  const { SerialPort } = await import('serialport');
  const ports = await SerialPort.list();

  if (ports.length === 0) {
    void vscode.window.showWarningMessage('No serial ports found.');
    return;
  }

  const items: vscode.QuickPickItem[] = ports.map((p) => ({
    label: p.path,
    description: p.manufacturer ?? '',
    detail: p.serialNumber ? `SN: ${p.serialNumber}` : undefined,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a serial port to monitor',
  });

  if (picked) {
    const portPath = picked.label;
    const mockItem = new PortTreeItem(
      portPath,
      { path: portPath },
      vscode.TreeItemCollapsibleState.None,
      false,
    );
    MonitorPanel.createOrShow(extensionUri, mockItem, sessionRecorder, discardService);
  }
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

export function deactivate() {
  // Dispose all monitor panels
  MonitorPanel.currentPanels.forEach(panel => panel.dispose());
  MonitorPanel.currentPanels.clear();
}
