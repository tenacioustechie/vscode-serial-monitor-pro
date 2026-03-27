import { SerialEvent } from './types';
import { SerialPortService } from '../serialPort/serialPortService';
import * as vscode from 'vscode';

export class SerialEventLogger implements vscode.Disposable {
  private events: SerialEvent[] = [];
  private startTime: number = 0;
  private _isLogging = false;
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly portService: SerialPortService) { }

  get isLogging(): boolean {
    return this._isLogging;
  }

  start(): void {
    if (this._isLogging) {
      return;
    }

    this.events = [];
    this.startTime = Date.now();
    this._isLogging = true;

    // Listen for incoming data
    this.disposables.push(
      this.portService.onData((data: Buffer) => {
        if (!this._isLogging) { return; }
        this.events.push({
          timestamp: Date.now() - this.startTime,
          direction: 'rx',
          data: data.toString('base64'),
        });
      })
    );
  }

  /**
   * Log an outgoing (TX) message. Called by the monitor panel when user sends data.
   */
  logTx(data: string): void {
    if (!this._isLogging) {
      return;
    }

    this.events.push({
      timestamp: Date.now() - this.startTime,
      direction: 'tx',
      data: Buffer.from(data).toString('base64'),
    });
  }

  stop(): SerialEvent[] {
    this._isLogging = false;
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    return [...this.events];
  }

  getEvents(): SerialEvent[] {
    return [...this.events];
  }

  getStartTime(): number {
    return this.startTime;
  }

  dispose(): void {
    this.stop();
  }
}
