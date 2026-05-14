import * as vscode from 'vscode';
import { SerialPort } from 'serialport';
import { PortConfig } from './types';

export class SerialPortService extends vscode.Disposable {
  private port: SerialPort | undefined;
  private _config: PortConfig | undefined;
  private _isOpen = false;

  private readonly _onData = new vscode.EventEmitter<Buffer>();
  public readonly onData = this._onData.event;

  private readonly _onError = new vscode.EventEmitter<Error>();
  public readonly onError = this._onError.event;

  private readonly _onOpen = new vscode.EventEmitter<void>();
  public readonly onOpen = this._onOpen.event;

  private readonly _onClose = new vscode.EventEmitter<void>();
  public readonly onClose = this._onClose.event;

  constructor() {
    super(() => this.dispose());
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  get config(): PortConfig | undefined {
    return this._config;
  }

  async open(config: PortConfig): Promise<void> {
    if (this._isOpen) {
      await this.close();
    }

    this._config = config;

    return new Promise<void>((resolve, reject) => {
      this.port = new SerialPort({
        path: config.path,
        baudRate: config.baudRate,
        dataBits: config.dataBits,
        stopBits: config.stopBits === 1.5 ? 1 : config.stopBits,
        parity: config.parity,
        autoOpen: false,
      });

      this.port.on('data', (data: Buffer) => {
        this._onData.fire(data);
      });

      this.port.on('error', (err: Error) => {
        this._onError.fire(err);
      });

      this.port.on('close', () => {
        this._isOpen = false;
        this._onClose.fire();
      });

      this.port.open((err) => {
        if (err) {
          reject(err);
          return;
        }
        this._isOpen = true;
        this._onOpen.fire();
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    if (!this.port || !this._isOpen) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      this.port!.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        this._isOpen = false;
        this.port = undefined;
        resolve();
      });
    });
  }

  write(data: string): void {
    if (!this.port || !this._isOpen) {
      throw new Error('Port is not open');
    }

    const lineEnding = this._config?.lineEnding ?? '';
    this.port.write(data + lineEnding);
  }

  writeRaw(data: Buffer): void {
    if (!this.port || !this._isOpen) {
      throw new Error('Port is not open');
    }

    this.port.write(data);
  }

  dispose(): void {
    if (this.port && this._isOpen) {
      this.port.close();
    }
    this._onData.dispose();
    this._onError.dispose();
    this._onOpen.dispose();
    this._onClose.dispose();
  }
}
