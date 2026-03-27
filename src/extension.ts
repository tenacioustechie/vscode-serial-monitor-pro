import * as vscode from 'vscode';
import { SerialPortManager, PortTreeItem } from './serialPort/serialPortManager';
import { MonitorPanel } from './monitor/monitorPanel';
import { SessionRecorder } from './recording/sessionRecorder';
import { SessionStorage, SessionTreeProvider, SessionTreeItem } from './storage/sessionStorage';
import { PlaybackPanel } from './playback/playbackPanel';
import { AudioRecorder } from './recording/audioRecorder';

export async function activate(context: vscode.ExtensionContext) {
  console.log('Serial Monitor Plus is now active');

  // Initialize storage
  const sessionStorage = new SessionStorage(context);

  // Initialize session recorder
  const sessionRecorder = new SessionRecorder(sessionStorage);
  await sessionRecorder.initialize();

  // Initialize serial port manager (tree view)
  const portManager = new SerialPortManager();
  const portTreeView = vscode.window.createTreeView('serialMonitorPorts', {
    treeDataProvider: portManager,
  });

  // Initialize session tree view
  const sessionTreeProvider = new SessionTreeProvider(sessionStorage);
  const sessionTreeView = vscode.window.createTreeView('serialMonitorSessions', {
    treeDataProvider: sessionTreeProvider,
  });

  // Auto-refresh ports on activation
  portManager.refresh();

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('serialMonitorPlus.openMonitor', (item?: PortTreeItem) => {
      if (item && item instanceof PortTreeItem && !item.isDetail) {
        MonitorPanel.createOrShow(context.extensionUri, item, sessionRecorder);
      } else {
        // Show quick pick to select port
        showPortQuickPick(portManager, context.extensionUri, sessionRecorder);
      }
    }),

    vscode.commands.registerCommand('serialMonitorPlus.refreshPorts', () => {
      portManager.refresh();
    }),

    vscode.commands.registerCommand('serialMonitorPlus.startRecording', () => {
      // This is handled by the active monitor panel
      vscode.window.showInformationMessage(
        'Use the Record button in an open Serial Monitor panel to start recording.'
      );
    }),

    vscode.commands.registerCommand('serialMonitorPlus.stopRecording', async () => {
      if (sessionRecorder.isRecording) {
        const name = await vscode.window.showInputBox({
          prompt: 'Enter a name for this recording session',
          placeHolder: 'Session name',
        });
        await sessionRecorder.stopRecording(name ?? undefined);
        sessionTreeProvider.refresh();
      }
    }),

    vscode.commands.registerCommand('serialMonitorPlus.openPlayback', async (item?: SessionTreeItem | string) => {
      let sessionId: string | undefined;

      if (item instanceof SessionTreeItem) {
        sessionId = item.sessionId;
      } else if (typeof item === 'string') {
        sessionId = item;
      } else {
        // Show quick pick to select session
        const sessions = await sessionStorage.listSessions();
        if (sessions.length === 0) {
          vscode.window.showInformationMessage('No recorded sessions found.');
          return;
        }

        const picked = await vscode.window.showQuickPick(
          sessions.map((s) => ({
            label: s.name,
            description: `${new Date(s.date).toLocaleString()} • ${s.hasAudio ? '🎤 ' : ''}${formatDuration(s.duration ?? 0)}`,
            sessionId: s.id,
          })),
          { placeHolder: 'Select a recording session to play back' }
        );

        if (picked) {
          sessionId = (picked as any).sessionId;
        }
      }

      if (sessionId) {
        await PlaybackPanel.createOrShow(context.extensionUri, sessionId, sessionStorage);
      }
    }),

    vscode.commands.registerCommand('serialMonitorPlus.refreshSessions', () => {
      sessionTreeProvider.refresh();
    }),
  );

  // Register disposables
  context.subscriptions.push(
    portTreeView,
    sessionTreeView,
    portManager as any,
    sessionTreeProvider,
    sessionStorage,
    sessionRecorder,
  );
}

async function showPortQuickPick(
  portManager: SerialPortManager,
  extensionUri: vscode.Uri,
  sessionRecorder: SessionRecorder,
) {
  await portManager.refresh();

  const { SerialPort } = require('serialport');
  const ports = await SerialPort.list();

  if (ports.length === 0) {
    vscode.window.showWarningMessage('No serial ports found.');
    return;
  }

  const items: vscode.QuickPickItem[] = ports.map((p: any) => ({
    label: p.path as string,
    description: (p.manufacturer ?? '') as string,
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
    MonitorPanel.createOrShow(extensionUri, mockItem, sessionRecorder);
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
