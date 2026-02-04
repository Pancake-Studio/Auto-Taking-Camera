import React, { useEffect, useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { detectGestureInVideo } from '../services/gestureService';
import { DetectedGesture } from '../types';
import { GESTURE_HOLD_DURATION_MS } from '../constants';

interface GestureCanvasProps {
    webcamRef: React.RefObject<Webcam>;
    isDetectionActive: boolean;
    onGestureTrigger: (gestureName: string) => void;
    stage: string; // Used for cursor messaging
    error: string | null;
}

const GestureCanvas: React.FC<GestureCanvasProps> = ({
    webcamRef,
    isDetectionActive,
    onGestureTrigger,
    stage,
    error
}) => {
    const requestRef = useRef<number>(0);
    const lastVideoTimeRef = useRef<number>(-1);

    // Local state for smooth optimized rendering preventing App re-renders
    const [gesture, setGesture] = useState<DetectedGesture | null>(null);
    const [loadingProgress, setLoadingProgress] = useState(0);

    // Wave Detection State
    const historyRef = useRef<{ x: number, time: number }[]>([]);
    const accumulatedTimeRef = useRef<number>(0);
    const lastFrameTimeRef = useRef<number>(0);

    // Clear state when detection becomes inactive
    useEffect(() => {
        if (!isDetectionActive) {
            setGesture(null);
            setLoadingProgress(0);
            accumulatedTimeRef.current = 0;
            historyRef.current = [];
        }
    }, [isDetectionActive]);

    const animate = useCallback((time: number) => {
        if (isDetectionActive && !error && webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState === 4) {
            const video = webcamRef.current.video;
            const now = Date.now();
            const dt = now - (lastFrameTimeRef.current || now);
            lastFrameTimeRef.current = now;

            if (video.currentTime !== lastVideoTimeRef.current) {
                lastVideoTimeRef.current = video.currentTime;
                const result = detectGestureInVideo(video, now);

                if (result) {
                    const currentGestureName = result.name;

                    // Logic to prevent "Double Shot"
                    if (window.lastTriggeredGesture === currentGestureName) {
                        setGesture({ ...result, name: currentGestureName as any });
                        // No progress update
                        historyRef.current = []; // Reset history
                        accumulatedTimeRef.current = 0;
                    } else {
                        // Valid logic
                        if (window.lastTriggeredGesture && window.lastTriggeredGesture !== currentGestureName) {
                            window.lastTriggeredGesture = null;
                        }

                        // WAVE DETECTION LOGIC
                        // 1. Add current position to history
                        historyRef.current.push({ x: result.x, time: now });
                        // 2. Keep last 400ms (Reduced from 1000ms to enforce continuous movement)
                        historyRef.current = historyRef.current.filter(p => now - p.time < 400);

                        // 3. Analyze movement (Amplitude of X)
                        const xs = historyRef.current.map(p => p.x);
                        const minX = Math.min(...xs);
                        const maxX = Math.max(...xs);
                        const amplitude = maxX - minX;

                        // Threshold: Must move at least 1.5% of screen width (Small movements allowed)
                        // Reduced samples requirement to 3 to catch fast swipes
                        const isWaving = amplitude > 0.015 && historyRef.current.length >= 3;

                        setGesture({ ...result, name: currentGestureName as any });

                        if (isWaving) {
                            accumulatedTimeRef.current += dt;
                            // Store last wave time
                            (historyRef.current as any).lastWaveTime = now;
                        } else {
                            const lastWave = (historyRef.current as any).lastWaveTime || 0;
                            if (now - lastWave < 350) {
                                // Grace period: User just stopped or moved too fast
                                accumulatedTimeRef.current += dt;
                            }
                            // Else: Pause
                        }

                        const progress = Math.min(accumulatedTimeRef.current / GESTURE_HOLD_DURATION_MS, 1);
                        setLoadingProgress(progress);

                        if (progress >= 1) {
                            // Trigger!
                            onGestureTrigger(currentGestureName);
                            accumulatedTimeRef.current = 0;
                            historyRef.current = [];
                            setLoadingProgress(0);
                        }
                    }

                } else {
                    setGesture(null);
                    setLoadingProgress(0);
                    accumulatedTimeRef.current = 0;
                    historyRef.current = [];
                    // Clear lock if hand dropped
                    if (window.lastTriggeredGesture) {
                        window.lastTriggeredGesture = null;
                    }
                }
            }
        } else {
            // Not active
            if (gesture) setGesture(null);
        }
        requestRef.current = requestAnimationFrame(animate);
    }, [isDetectionActive, error, onGestureTrigger]); // removing dependencies that change often

    useEffect(() => {
        requestRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(requestRef.current!);
    }, [animate]);

    // Render Cursor
    if (!gesture || loadingProgress <= 0) return null;

    // Mirror X for cursor position to match mirrored video
    const left = `${gesture.x * 100}%`;
    const top = `${gesture.y * 100}%`;
    const color = gesture.name === 'Open_Palm' ? 'text-pink-400' : 'text-emerald-400';

    let message = '';
    // Simple mapping based on known stage names from parent
    if (stage === 'IDLE') {
        message = gesture.name === 'Open_Palm' ? 'โบกมือค้างไว้...' : 'เสร็จสิ้น...';
    } else if (stage === 'RESULT') {
        message = 'โบกมือเพื่อเริ่ม...';
    }

    return (
        <div
            className="absolute w-28 h-28 pointer-events-none transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-[70]"
            style={{ left, top }}
        >
            <div className="relative w-full h-full">
                {/* Glow Effect */}
                <div className={`absolute inset-0 rounded-full blur-xl opacity-40 ${gesture.name === 'Open_Palm' ? 'bg-pink-500' : 'bg-emerald-500'}`} />

                <svg className="w-full h-full transform -rotate-90 drop-shadow-lg relative z-10">
                    <circle cx="50%" cy="50%" r="46%" stroke="rgba(255,255,255,0.2)" strokeWidth="8" fill="transparent" />
                    <circle
                        cx="50%" cy="50%" r="46%"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="transparent"
                        className={`${color} transition-all duration-75`}
                        strokeDasharray="289" // 2 * pi * 46
                        strokeDashoffset={289 * (1 - loadingProgress)}
                        strokeLinecap="round"
                    />
                </svg>

                {/* Cute Badge */}
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-2">
                    <span className="inline-block bg-white/90 text-slate-800 text-sm font-black px-3 py-1 rounded-2xl shadow-lg border-2 border-pink-200 whitespace-nowrap">
                        {message}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default GestureCanvas;
