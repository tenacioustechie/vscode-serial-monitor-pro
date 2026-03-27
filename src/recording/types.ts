import { PortConfig } from '../serialPort/types';

export interface RecordingSession {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  portConfig: PortConfig;
  events: SerialEvent[];
  audioFile?: string;
  markers: Marker[];
}

export interface SerialEvent {
  /** Milliseconds offset from session startTime */
  timestamp: number;
  direction: 'rx' | 'tx';
  /** base64-encoded for binary safety */
  data: string;
}

export interface Marker {
  /** Milliseconds offset from session startTime */
  timestamp: number;
  label: string;
  color?: string;
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  sessionId?: string;
  startTime?: number;
  elapsedMs?: number;
}
