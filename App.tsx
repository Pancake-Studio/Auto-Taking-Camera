import React, { useEffect, useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Camera, RefreshCw, Hand, ThumbsUp, X, Settings2, Sparkles } from 'lucide-react';
import { initializeHandLandmarker } from './services/gestureService';
import { AppStage, PhotoData } from './types';
import { COUNTDOWN_DURATION_SEC, MAX_PHOTOS } from './constants';
import PhotoStrip from './components/PhotoStrip';
import DownloadPage from './components/DownloadPage';
import GestureCanvas from './components/GestureCanvas';

declare global {
  interface Window {
    lastTriggeredGesture: string | null;
  }
}

const App: React.FC = () => {
  // Check if we should show download page
  const isDownloadPage = window.location.hash.startsWith('#download');

  if (isDownloadPage) {
    return <DownloadPage />;
  }

  // Main photobooth app
  // State
  const [stage, setStage] = useState<AppStage>(AppStage.LOADING_MODEL);
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | undefined>(undefined);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCapturingRef = useRef(false);

  // Refs
  const webcamRef = useRef<Webcam>(null);

  // Initialize
  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        // 1. Request Camera Permission explicitly
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          stream.getTracks().forEach(track => track.stop());
        } catch (permErr: any) {
          console.warn("Camera permission check failed:", permErr);
        }

        await initializeHandLandmarker();
        setStage(AppStage.IDLE);

        // 2. Get Cameras
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        setDevices(videoDevices);

        if (videoDevices.length > 0) {
          setActiveDeviceId(videoDevices[0].deviceId);
        }
      } catch (err: any) {
        console.error("Initialization Failed:", err);
        setError(`Failed to load AI System: ${err.message || 'Unknown error'}`);
        setStage(AppStage.IDLE);
      }
    };
    load();
  }, []);

  const restartApp = useCallback(() => {
    setPhotos([]);
    setError(null);
    setCountdown(null);
    setStage(AppStage.IDLE);
    isCapturingRef.current = false;
  }, []);

  const startCountdown = useCallback(() => {
    // Lock to prevent double triggering
    if (isCapturingRef.current) return;

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



  // Function to apply frame overlay to photo
  const applyFrameToPhoto = async (photoDataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject('Canvas context not available');
        return;
      }

      const photoImg = new Image();
      const frameImg = new Image();

      // Load frame first to get its dimensions
      frameImg.onload = () => {
        // Set canvas size to match FRAME (not photo)
        canvas.width = frameImg.width;
        canvas.height = frameImg.height;

        // Load photo
        photoImg.onload = () => {
          // Calculate how to crop photo to fit frame (cover mode)
          const frameAspect = frameImg.width / frameImg.height;
          const photoAspect = photoImg.width / photoImg.height;

          let drawWidth, drawHeight, offsetX, offsetY;

          if (photoAspect > frameAspect) {
            // Photo is wider - fit height and crop width
            drawHeight = frameImg.height;
            drawWidth = photoImg.width * (frameImg.height / photoImg.height);
            offsetX = (frameImg.width - drawWidth) / 2;
            offsetY = 0;
          } else {
            // Photo is taller - fit width and crop height
            drawWidth = frameImg.width;
            drawHeight = photoImg.height * (frameImg.width / photoImg.width);
            offsetX = 0;
            offsetY = (frameImg.height - drawHeight) / 2;
          }

          // Draw photo (cropped and centered)
          ctx.drawImage(photoImg, offsetX, offsetY, drawWidth, drawHeight);

          // Draw frame on top
          ctx.drawImage(frameImg, 0, 0);

          resolve(canvas.toDataURL('image/jpeg', 0.95));
        };

        photoImg.onerror = () => reject('Photo failed to load');
        photoImg.src = photoDataUrl;
      };

      frameImg.onerror = () => {
        // If frame fails to load, return photo without frame
        console.warn('Frame failed to load, using photo without frame');
        resolve(photoDataUrl);
      };

      frameImg.src = '/assets/frame.png';
    });
  };

  const takePhoto = useCallback(async () => {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true; // Lock

    setStage(AppStage.CAPTURE_FLASH);
    setFlash(true);
    setTimeout(async () => {
      if (webcamRef.current) {
        const imageSrc = webcamRef.current.getScreenshot();
        if (imageSrc) {
          try {
            // Apply frame overlay
            const framedImage = await applyFrameToPhoto(imageSrc);

            setPhotos(currentPhotos => {
              const updated = [...currentPhotos, { id: Date.now().toString(), dataUrl: framedImage, timestamp: Date.now() }];
              if (updated.length >= MAX_PHOTOS) {
                setTimeout(() => setStage(AppStage.RESULT), 500);
              } else {
                setTimeout(() => {
                  setStage(AppStage.IDLE);
                  isCapturingRef.current = false; // Unlock if taking more photos
                }, 1000);
              }
              return updated;
            });
          } catch (error) {
            console.error('Failed to apply frame:', error);
            // Fallback: use photo without frame
            setPhotos(currentPhotos => {
              const updated = [...currentPhotos, { id: Date.now().toString(), dataUrl: imageSrc, timestamp: Date.now() }];
              if (updated.length >= MAX_PHOTOS) {
                setTimeout(() => setStage(AppStage.RESULT), 500);
              } else {
                setTimeout(() => {
                  setStage(AppStage.IDLE);
                  isCapturingRef.current = false;
                }, 1000);
              }
              return updated;
            });
          }
          setFlash(false);
          // Note: isCapturingRef stays true if we go to RESULT, unlocked only on restart
          if (photos.length + 1 < MAX_PHOTOS) {
            // Logic above handles multi-photo unlock, but for MAX=1 we keep locked until restart
          }
        } else {
          // Failed to capture
          isCapturingRef.current = false;
          setStage(AppStage.IDLE);
        }
      }
    }, 150);
  }, [photos.length]);

  const finishSession = useCallback(() => {
    setStage(AppStage.RESULT);
  }, []);

  // Reset gesture lock when stage changes
  useEffect(() => {
    window.lastTriggeredGesture = null;
    if (stage === AppStage.IDLE) {
      isCapturingRef.current = false;
    }
  }, [stage]);

  const handleGestureTrigger = useCallback((gestureName: string) => {
    if (stage === AppStage.IDLE) {
      if (gestureName === 'Two_Fingers') startCountdown();
    } else if (stage === AppStage.RESULT) {
      if (gestureName === 'OK_Hand') restartApp();
    }
  }, [stage, photos.length, startCountdown, finishSession, restartApp]);

  // Logic to determine if detection should run
  const isDetectionActive = (stage === AppStage.IDLE || stage === AppStage.RESULT) && !error;

  if (stage === AppStage.LOADING_MODEL) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-pink-50 text-slate-800 font-fredoka">
        <div className="w-20 h-20 border-8 border-pink-200 border-t-pink-500 rounded-full animate-spin mb-6"></div>
        <h1 className="text-3xl font-bold animate-pulse text-pink-500">K-Pop Booth AI...</h1>
        <p className="text-slate-400 mt-2 font-medium">กำลังโหลดระบบ...</p>

        {error && (
          <div className="mt-8 p-4 bg-red-50 border-2 border-red-200 rounded-xl max-w-md text-center">
            <p className="text-red-500 mb-2 font-bold">Oops!</p>
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-6 py-2 bg-red-400 text-white rounded-full font-bold hover:bg-red-500 transition-colors shadow-lg"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pink-50 flex flex-col overflow-hidden relative font-sans text-slate-800">

      {/* Error Overlay */}
      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] bg-red-500/90 text-white px-6 py-3 rounded-full shadow-xl backdrop-blur-sm font-bold flex items-center gap-2 animate-bounce">
          <span>⚠️ {error}</span>
          <button onClick={() => window.location.reload()} className="underline text-white/80 hover:text-white ml-2">Reload</button>
        </div>
      )}

      {/* Flash Overlay */}
      {stage === AppStage.CAPTURE_FLASH && (
        <div className="absolute inset-0 bg-white z-[100] animate-out fade-out duration-500 pointer-events-none" />
      )}

      {/* Main Camera View - Always Visible */}
      <div className="absolute inset-0 z-0 bg-black">
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          videoConstraints={{ deviceId: activeDeviceId }}
          className="w-full h-full object-cover transform scale-x-[-1]"
          onUserMediaError={(err) => setError(`Camera Error: ${err.toString()}`)}
          onUserMedia={() => { }}
          disablePictureInPicture={false}
          forceScreenshotSourceSize={false}
          imageSmoothing={true}
          mirrored={false}
          screenshotQuality={0.92}
        />
        {/* Dark overlay for better UI contrast */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/40 pointer-events-none" />
      </div>

      {/* UI Overlay - Instructions & Countdown */}
      <div className="absolute inset-0 pointer-events-none z-10">

        {/* Header / Brand */}
        <div className="absolute top-6 left-6 z-20">
          <div className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-full border border-white/30 text-white font-bold flex items-center gap-2 shadow-lg">
            <Sparkles size={18} className="text-yellow-300" />
            <span>Ferrum Group X โรงเรียนสันติสุขพิทยาคม</span>
          </div>
        </div>

        {/* Instructions Overlay - Only in IDLE */}
        {stage === AppStage.IDLE && !error && (
          <div className="absolute bottom-12 left-0 right-0 flex justify-center gap-12 items-end pb-8">

            <div className="flex flex-col items-center gap-3 text-white anim-pop hover:scale-105 transition-transform duration-300">
              <div className="relative">
                <div className="absolute -inset-4 bg-blue-500/30 rounded-full blur-xl animate-pulse"></div>
                <div className="w-24 h-24 rounded-full bg-white/10 backdrop-blur-md border-[3px] border-blue-400 flex items-center justify-center shadow-2xl overflow-hidden group">
                  <div className="text-6xl">✌️</div>
                </div>
              </div>
              <div className="text-center bg-black/40 backdrop-blur-sm px-6 py-3 rounded-2xl border border-white/10">
                <span className="block text-xl font-bold text-white mb-1">ทำมือโชว์ 2 นิ้ว ค้างไว้ 3 วิ</span>
                <span className="text-sm text-blue-300 font-medium">เพื่อเริ่มถ่ายรูป ({photos.length}/{MAX_PHOTOS})</span>
              </div>
            </div>


          </div>
        )}

        {/* Countdown Overlay */}
        {stage === AppStage.COUNTDOWN && countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px] z-40">
            <div className="relative">
              <div className="absolute inset-0 bg-pink-500 blur-[80px] opacity-50 animate-pulse"></div>
              <span className="relative text-[15rem] font-black text-white animate-bounce drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)] font-fredoka">
                {countdown}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Result Overlay - PhotoStrip */}
      {stage === AppStage.RESULT && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-md animate-in fade-in duration-500">
          <PhotoStrip photos={photos} onRestart={restartApp} />
        </div>
      )}

      {/* Gesture Canvas (Detects & Renders Cursor) */}
      <GestureCanvas
        webcamRef={webcamRef}
        isDetectionActive={isDetectionActive}
        onGestureTrigger={handleGestureTrigger}
        stage={stage}
        error={error}
      />

      {/* Camera Selection Button */}
      <div className="absolute top-6 right-6 z-[60] pointer-events-auto">
        <button
          onClick={() => setShowDeviceMenu(!showDeviceMenu)}
          className="p-3 bg-white/10 backdrop-blur-md hover:bg-white/20 rounded-full text-white transition-all border border-white/20 shadow-lg"
        >
          <Settings2 size={24} />
        </button>

        {showDeviceMenu && (
          <div className="absolute top-16 right-0 bg-white rounded-2xl shadow-2xl p-3 w-72 border border-slate-100 transform origin-top-right animate-in scale-95 duration-200">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 px-2 tracking-wider">Select Camera</h3>
            {devices.map((device) => (
              <button
                key={device.deviceId}
                onClick={() => { setActiveDeviceId(device.deviceId); setShowDeviceMenu(false); }}
                className={`w-full text-left px-4 py-3 text-sm rounded-xl mb-1 transition-colors ${activeDeviceId === device.deviceId ? 'bg-pink-500 text-white font-bold shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {device.label || `Camera ${device.deviceId.slice(0, 5)}...`}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;