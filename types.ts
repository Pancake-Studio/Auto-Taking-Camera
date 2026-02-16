/// <reference types="vite/client" />
export enum AppStage {
  LOADING_MODEL = 'LOADING_MODEL',
  IDLE = 'IDLE',
  COUNTDOWN = 'COUNTDOWN',
  CAPTURE_FLASH = 'CAPTURE_FLASH',
  PROCESSING = 'PROCESSING',
  RESULT = 'RESULT',
}

export interface DetectedGesture {
  id?: number; // Stable hand ID for tracking
  name: 'OK_Hand' | 'Two_Fingers' | 'None';
  x: number; // Normalized 0-1
  y: number; // Normalized 0-1
}

export interface PhotoData {
  id: string;
  dataUrl: string;
  timestamp: number;
}
