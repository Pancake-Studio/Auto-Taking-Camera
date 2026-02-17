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
    qrWaitRemaining?: number;
}

interface GestureWithProgress extends DetectedGesture {
    progress: number;
    accumulatedTime: number;
}

const GestureCanvas: React.FC<GestureCanvasProps> = ({
    webcamRef,
    isDetectionActive,
    onGestureTrigger,
    stage,
    error,
    qrWaitRemaining
}) => {
    const requestRef = useRef<number>(0);
    const lastVideoTimeRef = useRef<number>(-1);

    // Track multiple gestures with their progress
    const [gestures, setGestures] = useState<GestureWithProgress[]>([]);
    const gestureTimersRef = useRef<Map<string, { time: number, gestureName: string }>>(new Map());
    const lastFrameTimeRef = useRef<number>(0);

    // Clear state when detection becomes inactive
    useEffect(() => {
        if (!isDetectionActive) {
            setGestures([]);
            gestureTimersRef.current.clear();
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
                const results = detectGestureInVideo(video, now);

                if (results && Array.isArray(results)) {
                    const newGestures: GestureWithProgress[] = [];
                    const currentGestureKeys = new Set<string>();

                    results.forEach((result, index) => {
                        // Use stable hand ID as key instead of position
                        const gestureKey = result.id ? `hand-${result.id}-${result.name}` : `temp-${index}`;
                        currentGestureKeys.add(gestureKey);

                        // Check if this gesture was already being tracked
                        let accumulatedTime = 0;
                        const existing = gestureTimersRef.current.get(gestureKey);

                        if (existing && existing.gestureName === result.name) {
                            accumulatedTime = existing.time + dt;
                        } else {
                            accumulatedTime = dt;
                        }

                        // Check if already triggered
                        if (window.lastTriggeredGesture === result.name) {
                            // Don't accumulate time for already triggered gesture
                            accumulatedTime = 0;
                        }

                        const progress = Math.min(accumulatedTime / GESTURE_HOLD_DURATION_MS, 1);

                        // Update timer
                        gestureTimersRef.current.set(gestureKey, {
                            time: accumulatedTime,
                            gestureName: result.name
                        });

                        // Trigger if complete
                        if (progress >= 1 && window.lastTriggeredGesture !== result.name) {
                            onGestureTrigger(result.name);
                            gestureTimersRef.current.delete(gestureKey);
                        } else {
                            newGestures.push({
                                ...result,
                                progress,
                                accumulatedTime
                            });
                        }
                    });

                    // Clean up gestures that are no longer detected
                    const keysToDelete: string[] = [];
                    gestureTimersRef.current.forEach((_, key) => {
                        if (!currentGestureKeys.has(key)) {
                            keysToDelete.push(key);
                        }
                    });
                    keysToDelete.forEach(key => gestureTimersRef.current.delete(key));

                    setGestures(newGestures);
                } else {
                    setGestures([]);
                    gestureTimersRef.current.clear();
                    // Clear lock if hand dropped
                    if (window.lastTriggeredGesture) {
                        window.lastTriggeredGesture = null;
                    }
                }
            }
        } else {
            // Not active
            if (gestures.length > 0) setGestures([]);
        }
        requestRef.current = requestAnimationFrame(animate);
    }, [isDetectionActive, error, onGestureTrigger]);

    useEffect(() => {
        requestRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(requestRef.current!);
    }, [animate]);

    // Render multiple cursors
    if (gestures.length === 0) return null;

    return (
        <>
            {gestures.map((gesture, index) => {
                if (gesture.progress <= 0) return null;

                const left = `${gesture.x * 100}%`;
                const top = `${gesture.y * 100}%`;
                const color = gesture.name === 'Two_Fingers' ? 'text-blue-400' : gesture.name === 'OK_Hand' ? 'text-emerald-400' : 'text-pink-400';

                let message = '';
                if (stage === 'IDLE') {
                    message = gesture.name === 'Two_Fingers' ? 'ค้างไว้ 3 วิ...' : 'เสร็จสิ้น...';
                } else if (stage === 'RESULT') {
                    if (gesture.name === 'OK_Hand') {
                        if (typeof qrWaitRemaining === 'number' && qrWaitRemaining > 0) {
                            message = `รอ ${qrWaitRemaining} วิ`;
                        } else {
                            message = 'ค้างไว้ 3 วิ...';
                        }
                    } else {
                        message = 'โชว์มือ OK...';
                    }
                }

                // Calculate circle properties
                const radius = 46;
                const circumference = 2 * Math.PI * radius;
                const offset = circumference * (1 - gesture.progress);

                return (
                    <div
                        key={`${gesture.name}-${index}`}
                        className="absolute w-28 h-28 pointer-events-none transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-[70]"
                        style={{ left, top }}
                    >
                        <div className="relative w-full h-full">
                            {/* Glow Effect */}
                            <div className={`absolute inset-0 rounded-full blur-xl opacity-40 ${gesture.name === 'Two_Fingers' ? 'bg-blue-500' : gesture.name === 'OK_Hand' ? 'bg-emerald-500' : 'bg-pink-500'}`} />

                            <svg className="w-full h-full transform -rotate-90 drop-shadow-lg relative z-10">
                                <circle cx="50%" cy="50%" r={`${radius}%`} stroke="rgba(255,255,255,0.2)" strokeWidth="8" fill="transparent" />
                                <circle
                                    cx="50%" cy="50%" r={`${radius}%`}
                                    stroke="currentColor"
                                    strokeWidth="8"
                                    fill="transparent"
                                    className={`${color} transition-all duration-75`}
                                    strokeDasharray={circumference}
                                    strokeDashoffset={offset}
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
            })}
        </>
    );
};

export default GestureCanvas;
