import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChildProcess, spawn } from 'child_process';

export class AudioRecorder implements vscode.Disposable {
  private process: ChildProcess | undefined;
  private _isRecording = false;
  private outputPath: string | undefined;

  get isRecording(): boolean {
    return this._isRecording;
  }

  /**
   * Check if SoX is available on the system.
   */
  static async isSoxAvailable(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const proc = spawn('sox', ['--version'], { stdio: 'pipe' });
      proc.on('error', () => resolve(false));
      proc.on('close', (code) => resolve(code === 0));
    });
  }

  /**
   * Start recording audio from the default microphone using SoX.
   * @param outputFilePath Path to save the .wav file
   */
  async start(outputFilePath: string): Promise<void> {
    if (this._isRecording) {
      throw new Error('Already recording');
    }

    // Ensure directory exists
    const dir = path.dirname(outputFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.outputPath = outputFilePath;

    return new Promise<void>((resolve, reject) => {
      // Use SoX's `rec` command to record from default input
      // rec outputs wav format by default
      // -r 44100 = sample rate, -c 1 = mono, -b 16 = 16-bit
      const args = [
        '-r', '44100',
        '-c', '1',
        '-b', '16',
        outputFilePath,
      ];

      this.process = spawn('rec', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let started = false;

      this.process.on('error', (err) => {
        this._isRecording = false;
        if (!started) {
          reject(new Error(`Failed to start audio recording: ${err.message}. Is SoX installed?`));
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        // SoX/rec outputs info to stderr; once we see "Input File" we know it started
        if (!started && (text.includes('Input') || text.includes('Encoding') || text.includes(':'))) {
          started = true;
          this._isRecording = true;
          resolve();
        }
      });

      // Give it a moment to start, then resolve anyway
      setTimeout(() => {
        if (!started) {
          started = true;
          this._isRecording = true;
          resolve();
        }
      }, 1000);

      this.process.on('close', () => {
        this._isRecording = false;
      });
    });
  }

  /**
   * Stop recording.
   */
  async stop(): Promise<string | undefined> {
    if (!this.process || !this._isRecording) {
      return this.outputPath;
    }

    return new Promise<string | undefined>((resolve) => {
      this.process!.on('close', () => {
        this._isRecording = false;
        resolve(this.outputPath);
      });

      // Send SIGINT to gracefully stop rec (it finalizes the wav header)
      this.process!.kill('SIGINT');

      // Timeout fallback
      setTimeout(() => {
        if (this._isRecording) {
          this.process?.kill('SIGKILL');
          this._isRecording = false;
          resolve(this.outputPath);
        }
      }, 3000);
    });
  }

  dispose(): void {
    if (this.process && this._isRecording) {
      this.process.kill('SIGINT');
    }
  }
}
