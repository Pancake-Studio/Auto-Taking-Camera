export enum AppStage {
  LOADING_MODEL = 'LOADING_MODEL',
  IDLE = 'IDLE',
  COUNTDOWN = 'COUNTDOWN',
  CAPTURE_FLASH = 'CAPTURE_FLASH',
  PROCESSING = 'PROCESSING',
  RESULT = 'RESULT',
}

export interface DetectedGesture {
  name: 'Open_Palm' | 'OK_Hand' | 'None';
  x: number; // Normalized 0-1
  y: number; // Normalized 0-1
}

export interface PhotoData {
  id: string;
  dataUrl: string;
  timestamp: number;
}
