import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { RecordingSession, RecordingState } from './types';
import { SerialEventLogger } from './serialEventLogger';
import { AudioRecorder } from './audioRecorder';
import { SerialPortService } from '../serialPort/serialPortService';
import { PortConfig } from '../serialPort/types';
import { SessionStorage } from '../storage/sessionStorage';

export class SessionRecorder implements vscode.Disposable {
  private serialEventLogger: SerialEventLogger | undefined;
  private audioRecorder: AudioRecorder | undefined;
  private currentSessionId: string | undefined;
  private startTime: number | undefined;
  private hasSox: boolean = false;

  private readonly _onStateChange = new vscode.EventEmitter<RecordingState>();
  public readonly onStateChange = this._onStateChange.event;

  constructor(
    private readonly sessionStorage: SessionStorage,
  ) { }

  async initialize(): Promise<void> {
    this.hasSox = await AudioRecorder.isSoxAvailable();
    if (!this.hasSox) {
      vscode.window.showWarningMessage(
        'SoX is not installed. Audio recording will be disabled. ' +
        'Install SoX to enable audio commentary: brew install sox (macOS), ' +
        'apt install sox (Linux), choco install sox.portable (Windows).'
      );
    }
  }

  get isRecording(): boolean {
    return !!this.currentSessionId;
  }

  getState(): RecordingState {
    return {
      isRecording: this.isRecording,
      isPaused: false,
      sessionId: this.currentSessionId,
      startTime: this.startTime,
      elapsedMs: this.startTime ? Date.now() - this.startTime : undefined,
    };
  }

  async startRecording(
    portService: SerialPortService,
    portConfig: PortConfig,
  ): Promise<string> {
    if (this.isRecording) {
      throw new Error('Already recording');
    }

    const sessionId = crypto.randomUUID();
    this.currentSessionId = sessionId;
    this.startTime = Date.now();

    // Start serial event logging
    this.serialEventLogger = new SerialEventLogger(portService);
    this.serialEventLogger.start();

    // Start audio recording if SoX is available
    if (this.hasSox) {
      this.audioRecorder = new AudioRecorder();
      const audioPath = this.sessionStorage.getAudioFilePath(sessionId);
      try {
        await this.audioRecorder.start(audioPath);
      } catch (err) {
        vscode.window.showWarningMessage(
          `Audio recording failed to start: ${err}. Session will continue without audio.`
        );
        this.audioRecorder = undefined;
      }
    }

    this._onStateChange.fire(this.getState());
    return sessionId;
  }

  /**
   * Log an outgoing TX event (called when user sends data to serial port).
   */
  logTx(data: string): void {
    this.serialEventLogger?.logTx(data);
  }

  async stopRecording(sessionName?: string): Promise<RecordingSession | undefined> {
    if (!this.isRecording || !this.serialEventLogger || !this.currentSessionId || !this.startTime) {
      return undefined;
    }

    const endTime = Date.now();
    const events = this.serialEventLogger.stop();

    // Stop audio recording
    let audioFile: string | undefined;
    if (this.audioRecorder) {
      audioFile = await this.audioRecorder.stop();
      this.audioRecorder = undefined;
    }

    const session: RecordingSession = {
      id: this.currentSessionId,
      name: sessionName ?? `Session ${new Date(this.startTime).toLocaleString()}`,
      startTime: this.startTime,
      endTime,
      duration: endTime - this.startTime,
      portConfig: this.serialEventLogger['portService']?.config ?? {
        path: 'unknown',
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        lineEnding: '\n',
      },
      events,
      audioFile: audioFile ? 'audio.wav' : undefined,
      markers: [],
    };

    // Save session
    await this.sessionStorage.saveSession(session);

    this.currentSessionId = undefined;
    this.startTime = undefined;
    this.serialEventLogger = undefined;

    this._onStateChange.fire(this.getState());

    return session;
  }

  dispose(): void {
    if (this.isRecording) {
      this.stopRecording().catch(() => { });
    }
    this._onStateChange.dispose();
  }
}
