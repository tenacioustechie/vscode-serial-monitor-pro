import * as vscode from 'vscode';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { RecordingSession } from '../recording/types';

export class SessionStorage implements vscode.Disposable {
  private storagePath: string;

  constructor(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('serialMonitorPro');
    const customPath = config.get<string>('sessionStoragePath');

    if (customPath && customPath.trim().length > 0) {
      this.storagePath = customPath;
    } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      this.storagePath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, '.serial-sessions');
    } else {
      this.storagePath = path.join(context.globalStorageUri.fsPath, 'sessions');
    }

    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  getSessionDir(sessionId: string): string {
    return path.join(this.storagePath, `session-${sessionId}`);
  }

  getAudioFilePath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'audio.wav');
  }

  getManifestPath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'manifest.json');
  }

  async saveSession(session: RecordingSession): Promise<void> {
    const dir = this.getSessionDir(session.id);
    await fsp.mkdir(dir, { recursive: true });
    const manifestPath = this.getManifestPath(session.id);
    await fsp.writeFile(manifestPath, JSON.stringify(session, null, 2), 'utf-8');
  }

  async loadSession(sessionId: string): Promise<RecordingSession | undefined> {
    const manifestPath = this.getManifestPath(sessionId);
    try {
      const data = await fsp.readFile(manifestPath, 'utf-8');
      const session = JSON.parse(data) as RecordingSession;
      sanitizeSession(session);
      return session;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') { return undefined; }
      throw err;
    }
  }

  async listSessions(): Promise<{ id: string; name: string; date: number; duration?: number; hasAudio: boolean }[]> {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(this.storagePath, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') { return []; }
      throw err;
    }
    const sessions: { id: string; name: string; date: number; duration?: number; hasAudio: boolean }[] = [];

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('session-')) {
        const sessionId = entry.name.replace('session-', '');
        const manifestPath = this.getManifestPath(sessionId);
        try {
          const data = await fsp.readFile(manifestPath, 'utf-8');
          const session = JSON.parse(data) as RecordingSession;
          sessions.push({
            id: session.id,
            name: session.name,
            date: session.startTime,
            duration: session.duration,
            hasAudio: !!session.audioFile,
          });
        } catch {
          // Skip missing or corrupt sessions
        }
      }
    }

    return sessions.sort((a, b) => b.date - a.date);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const dir = this.getSessionDir(sessionId);
    await fsp.rm(dir, { recursive: true, force: true });
  }

  dispose(): void {
    // Nothing to clean up
  }
}

export class SessionTreeProvider implements vscode.TreeDataProvider<SessionTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SessionTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly storage: SessionStorage) { }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SessionTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SessionTreeItem): Promise<SessionTreeItem[]> {
    if (element) {
      return [];
    }

    const sessions = await this.storage.listSessions();
    return sessions.map((s) => {
      const duration = s.duration ? formatDuration(s.duration) : 'Unknown duration';
      const dateStr = new Date(s.date).toLocaleString();
      return new SessionTreeItem(s.id, s.name, dateStr, duration, s.hasAudio);
    });
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

export class SessionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly sessionId: string,
    public readonly sessionName: string,
    dateStr: string,
    duration: string,
    hasAudio: boolean,
  ) {
    super(sessionName, vscode.TreeItemCollapsibleState.None);
    this.description = `${dateStr} • ${duration}`;
    this.tooltip = `${sessionName}\n${dateStr}\nDuration: ${duration}\nAudio: ${hasAudio ? 'Yes' : 'No'}`;
    this.iconPath = new vscode.ThemeIcon(hasAudio ? 'mic' : 'history');
    this.contextValue = 'recordedSession';
    this.command = {
      command: 'serialMonitorPro.openPlayback',
      title: 'Open Playback',
      arguments: [this],
    };
  }
}

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function sanitizeSession(session: RecordingSession): void {
  if (!Array.isArray(session.markers)) {
    session.markers = [];
    return;
  }
  for (const marker of session.markers) {
    if (marker.color !== undefined && !HEX_COLOR_RE.test(marker.color)) {
      marker.color = undefined;
    }
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
