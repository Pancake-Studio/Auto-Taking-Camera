import React, { useEffect, useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Camera, RefreshCw, Hand, ThumbsUp, X, Settings2 } from 'lucide-react';
import { initializeHandLandmarker, detectGestureInVideo } from './services/gestureService';
import { AppStage, DetectedGesture, PhotoData } from './types';
import { GESTURE_HOLD_DURATION_MS, COUNTDOWN_DURATION_SEC, MAX_PHOTOS } from './constants';
import PhotoStrip from './components/PhotoStrip';

const App: React.FC = () => {
  // State
  const [stage, setStage] = useState<AppStage>(AppStage.LOADING_MODEL);
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | undefined>(undefined);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);

  // Gesture State
  const [gesture, setGesture] = useState<DetectedGesture | null>(null);
  const [gestureStartTime, setGestureStartTime] = useState<number | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Refs
  const webcamRef = useRef<Webcam>(null);
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);

  // Initialize
  useEffect(() => {
    const load = async () => {
      await initializeHandLandmarker();
      setStage(AppStage.IDLE);
      
      // Get Cameras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setDevices(videoDevices);
      if (videoDevices.length > 0) setActiveDeviceId(videoDevices[0].deviceId);
    };
    load();
  }, []);

  const restartApp = useCallback(() => {
    setPhotos([]);
    setStage(AppStage.IDLE);
  }, []);

  const startCountdown = useCallback(() => {
    setStage(AppStage.COUNTDOWN);
    let count = COUNTDOWN_DURATION_SEC;
    setCountdown(count);
    
    const interval = setInterval(() => {
      count--;
      if (count === 0) {
        clearInterval(interval);
        setCountdown(null);
        takePhoto();
      } else {
        setCountdown(count);
      }
    }, 1000);
  }, []);

  const takePhoto = useCallback(() => {
    setStage(AppStage.CAPTURE_FLASH);
    setFlash(true);
    setTimeout(() => {
      if (webcamRef.current) {
        const imageSrc = webcamRef.current.getScreenshot();
        if (imageSrc) {
          const newPhotos = (prev: PhotoData[]) => [...prev, { id: Date.now().toString(), dataUrl: imageSrc, timestamp: Date.now() }];
          
          setPhotos(currentPhotos => {
            const updated = [...currentPhotos, { id: Date.now().toString(), dataUrl: imageSrc, timestamp: Date.now() }];
             if (updated.length >= MAX_PHOTOS) {
                // Determine finish
                setTimeout(() => setStage(AppStage.RESULT), 500); // Small delay to show flash
             } else {
                setTimeout(() => setStage(AppStage.IDLE), 1000);
             }
             return updated;
          });
          setFlash(false);
        }
      }
    }, 150);
  }, []);

  const finishSession = useCallback(() => {
    setStage(AppStage.RESULT);
  }, []);

  // Main Loop
  const animate = useCallback((time: number) => {
    // Run detection in IDLE and RESULT stages
    const isDetectionActive = (stage === AppStage.IDLE || stage === AppStage.RESULT);

    if (isDetectionActive && webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState === 4) {
      const video = webcamRef.current.video;
      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        const result = detectGestureInVideo(video, Date.now());
        
        // Handle Gesture Logic
        if (result) {
          const currentGestureName = result.name; 
          
          // Determine the target action based on gesture
          // IDLE: Open_Palm -> Capture, OK_Hand -> Finish
          // RESULT: Open_Palm -> Restart
          
          let isTriggerGesture = false;
          
          if (stage === AppStage.IDLE) {
             const isCaptureGesture = currentGestureName === 'Open_Palm';
             const isFinishGesture = currentGestureName === 'OK_Hand';
             isTriggerGesture = isCaptureGesture || (isFinishGesture && photos.length > 0);
          } else if (stage === AppStage.RESULT) {
             const isRestartGesture = currentGestureName === 'Open_Palm';
             isTriggerGesture = isRestartGesture;
          }
          
          // Check if we have a currently tracked gesture
          setGesture((prev) => {
            const now = Date.now();
            
            if (isTriggerGesture) {
              
              if (prev && prev.name === currentGestureName) {
                const elapsed = now - (gestureStartTime || now);
                const progress = Math.min(elapsed / GESTURE_HOLD_DURATION_MS, 1);
                setLoadingProgress(progress);
                
                if (progress >= 1) {
                  // TRIGGER ACTION
                  setGestureStartTime(null);
                  setLoadingProgress(0);
                  
                  if (stage === AppStage.IDLE) {
                     if (currentGestureName === 'Open_Palm') startCountdown();
                     if (currentGestureName === 'OK_Hand') finishSession();
                  } else if (stage === AppStage.RESULT) {
                     if (currentGestureName === 'Open_Palm') restartApp();
                  }
                  
                  return null; 
                }
                return { ...result, name: currentGestureName as any };
              } else {
                setGestureStartTime(now);
                setLoadingProgress(0);
                return { ...result, name: currentGestureName as any };
              }
            } else {
              setGestureStartTime(null);
              setLoadingProgress(0);
              return null;
            }
          });
        } else {
          setGesture(null);
          setGestureStartTime(null);
          setLoadingProgress(0);
        }
      }
    } else {
        setGesture(null);
    }
    requestRef.current = requestAnimationFrame(animate);
  }, [stage, photos.length, gestureStartTime, startCountdown, finishSession, restartApp]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [animate]);


  // Rendering Helper: Loading Circle
  const renderLoadingCursor = () => {
    if (!gesture || loadingProgress <= 0) return null;

    // Mirror X for cursor position to match mirrored video
    const left = `${gesture.x * 100}%`; 
    const top = `${gesture.y * 100}%`;
    
    const isRestart = stage === AppStage.RESULT;
    const color = isRestart ? 'text-white' : (gesture.name === 'Open_Palm' ? 'text-rose-500' : 'text-emerald-500');
    let message = '';
    
    if (stage === AppStage.IDLE) {
        message = gesture.name === 'Open_Palm' ? 'กำลังเริ่มถ่าย...' : 'กำลังเสร็จสิ้น...';
    } else {
        message = 'กำลังเริ่มใหม่...';
    }

    return (
      <div 
        className="absolute w-24 h-24 pointer-events-none transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
        style={{ left, top }}
      >
        {/* SVG Circle Progress */}
        <svg className="w-full h-full transform -rotate-90 drop-shadow-lg">
          <circle cx="48" cy="48" r="40" stroke="rgba(255,255,255,0.3)" strokeWidth="8" fill="transparent" />
          <circle 
            cx="48" cy="48" r="40" 
            stroke="currentColor" 
            strokeWidth="8" 
            fill="transparent" 
            className={`${color} transition-all duration-75`}
            strokeDasharray="251.2"
            strokeDashoffset={251.2 * (1 - loadingProgress)}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute text-white font-bold text-lg bg-black/60 px-3 py-1 rounded-full whitespace-nowrap mt-28 backdrop-blur-sm border border-white/20">
          {message}
        </span>
      </div>
    );
  };

  if (stage === AppStage.LOADING_MODEL) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <div className="w-16 h-16 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h1 className="text-2xl font-bold animate-pulse">กำลังโหลดระบบ AI...</h1>
        <p className="text-slate-400 mt-2">กรุณารอสักครู่</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col overflow-hidden relative">
      
      {/* Flash Overlay */}
      {stage === AppStage.CAPTURE_FLASH && (
        <div className="absolute inset-0 bg-white z-[100] animate-out fade-out duration-300 pointer-events-none" />
      )}

      {/* Main Camera View - Always Visible */}
      <div className="absolute inset-0 z-0">
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          videoConstraints={{ deviceId: activeDeviceId }}
          className="w-full h-full object-cover transform scale-x-[-1]"
        />
      </div>
        
      {/* UI Overlay - Instructions & Countdown */}
      <div className="absolute inset-0 pointer-events-none z-10">
        
        {/* Instructions Overlay - Only in IDLE */}
        {stage === AppStage.IDLE && (
          <div className="absolute bottom-10 left-0 right-0 flex justify-center gap-8 items-end pb-8 bg-gradient-to-t from-black/80 to-transparent pt-32">
            
            <div className="flex flex-col items-center gap-2 text-white/90 anim-pop">
               <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur-md border-2 border-rose-500/50 flex items-center justify-center shadow-[0_0_15px_rgba(244,63,94,0.4)]">
                  <Hand size={40} className="text-rose-400" />
               </div>
               <div className="text-center">
                  <span className="block text-lg font-bold text-white shadow-black drop-shadow-md">แบมือค้างไว้ 3 วิ</span>
                  <span className="text-sm text-rose-300 font-medium">เพื่อถ่ายรูป ({photos.length}/{MAX_PHOTOS})</span>
               </div>
            </div>

            {photos.length > 0 && (
              <div className="flex flex-col items-center gap-2 text-white/90 anim-pop">
                <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur-md border-2 border-emerald-500/50 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.4)]">
                    <div className="relative">
                      <span className="absolute -top-3 -right-3 text-emerald-400 text-sm font-bold bg-black/50 px-1 rounded">OK</span>
                      <div className="w-8 h-8 rounded-full border-4 border-emerald-400 flex items-center justify-center" />
                    </div>
                </div>
                <div className="text-center">
                    <span className="block text-lg font-bold text-white shadow-black drop-shadow-md">ทำมือ OK ค้างไว้</span>
                    <span className="text-sm text-emerald-300 font-medium">เพื่อจบงาน</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Countdown Overlay */}
        {stage === AppStage.COUNTDOWN && countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-40">
            <span className="text-[12rem] font-black text-white animate-bounce drop-shadow-[0_0_30px_rgba(244,63,94,1)]">
              {countdown}
            </span>
          </div>
        )}
      </div>

      {/* Result Overlay - PhotoStrip */}
      {stage === AppStage.RESULT && (
         <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-500 p-4">
            <PhotoStrip photos={photos} onRestart={restartApp} />
         </div>
      )}

      {/* Loading Cursor Container - Highest Z-Index to be visible over Result Overlay */}
      <div className="absolute inset-0 pointer-events-none z-[70]">
        {renderLoadingCursor()}
      </div>

      {/* Camera Selection Button */}
      <div className="absolute top-4 right-4 z-[60] pointer-events-auto">
        <button 
          onClick={() => setShowDeviceMenu(!showDeviceMenu)}
          className="p-3 bg-black/40 backdrop-blur hover:bg-black/60 rounded-full text-white transition-all border border-white/10"
        >
          <Settings2 size={24} />
        </button>
        
        {showDeviceMenu && (
           <div className="absolute top-14 right-0 bg-slate-800 rounded-lg shadow-xl p-2 w-64 border border-slate-700">
             <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 px-2">Select Camera</h3>
             {devices.map((device) => (
               <button
                 key={device.deviceId}
                 onClick={() => { setActiveDeviceId(device.deviceId); setShowDeviceMenu(false); }}
                 className={`w-full text-left px-3 py-2 text-sm rounded ${activeDeviceId === device.deviceId ? 'bg-rose-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
               >
                 {device.label || `Camera ${device.deviceId.slice(0, 5)}...`}
               </button>
             ))}
           </div>
        )}
      </div>

       {/* Small Photo Previews (Left Side) - Hidden in Result */}
       {stage !== AppStage.RESULT && (
        <div className="absolute top-4 left-4 flex flex-col gap-3 pointer-events-none z-20">
            {photos.map((p, i) => (
              <div key={p.id} className="w-20 aspect-[4/3] bg-black border-2 border-white/50 rounded-lg overflow-hidden shadow-xl transform rotate-2 origin-left animate-in slide-in-from-left duration-500">
                <img src={p.dataUrl} className="w-full h-full object-cover transform scale-x-[-1]" />
              </div>
            ))}
        </div>
       )}

    </div>
  );
};

export default App;