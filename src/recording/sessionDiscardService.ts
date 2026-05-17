import * as vscode from 'vscode';
import * as path from 'path';
import { SessionStorage, SessionTreeProvider } from '../storage/sessionStorage';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const discardCore = require('./sessionDiscardCore.js') as {
  softDelete(storageRoot: string, sessionId: string): string;
  undo(storageRoot: string, sessionId: string): string;
  finalize(storageRoot: string, sessionId: string): void;
  findOrphans(storageRoot: string): string[];
};

export class SessionDiscardService implements vscode.Disposable {
  private pending: { id: string } | undefined;
  private readonly storageRoot: string;

  constructor(
    private readonly storage: SessionStorage,
    private readonly treeProvider: SessionTreeProvider,
  ) {
    // getSessionDir('') returns "<root>/session-", whose dirname is the storage root.
    this.storageRoot = path.dirname(this.storage.getSessionDir(''));
  }

  softDelete(sessionId: string, sessionName: string): void {
    if (this.pending) {
      try {
        discardCore.finalize(this.storageRoot, this.pending.id);
      } catch (err) {
        console.warn('[SessionDiscardService] finalize-on-replace failed:', err);
      }
      this.pending = undefined;
    }

    try {
      discardCore.softDelete(this.storageRoot, sessionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      void vscode.window.showWarningMessage(`Could not discard recording: ${msg}`);
      this.treeProvider.refresh();
      return;
    }

    this.pending = { id: sessionId };
    this.treeProvider.refresh();

    void this.driveUndoToast(sessionId, sessionName);
  }

  private async driveUndoToast(sessionId: string, sessionName: string): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
      `Recording discarded: ${sessionName}`,
      'Undo',
    );
    if (this.pending?.id !== sessionId) {
      return;
    }
    if (choice === 'Undo') {
      try {
        discardCore.undo(this.storageRoot, sessionId);
        this.pending = undefined;
        this.treeProvider.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        void vscode.window.showWarningMessage(`Could not undo discard: ${msg}`);
      }
      return;
    }
    try {
      discardCore.finalize(this.storageRoot, sessionId);
    } catch (err) {
      console.warn('[SessionDiscardService] finalize-on-dismiss failed:', err);
    }
    this.pending = undefined;
  }

  finalizePending(): void {
    if (!this.pending) return;
    const id = this.pending.id;
    this.pending = undefined;
    try {
      discardCore.finalize(this.storageRoot, id);
    } catch (err) {
      console.warn('[SessionDiscardService] finalizePending failed:', err);
    }
  }

  get pendingId(): string | undefined {
    return this.pending?.id;
  }

  gcOrphans(): void {
    let orphans: string[];
    try {
      orphans = discardCore.findOrphans(this.storageRoot);
    } catch (err) {
      console.warn('[SessionDiscardService] gcOrphans listing failed:', err);
      return;
    }
    for (const id of orphans) {
      try {
        discardCore.finalize(this.storageRoot, id);
      } catch (err) {
        console.warn(`[SessionDiscardService] failed to gc orphan ${id}:`, err);
      }
    }
  }

  dispose(): void {
    this.finalizePending();
  }
}
