import { FilesetResolver, HandLandmarker, DrawingUtils } from "@mediapipe/tasks-vision";

let handLandmarker: HandLandmarker | undefined = undefined;

export const initializeHandLandmarker = async () => {
  if (handLandmarker) return handLandmarker;

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  return handLandmarker;
};

export const detectGestureInVideo = (video: HTMLVideoElement, timestamp: number) => {
  if (!handLandmarker) return null;

  const result = handLandmarker.detectForVideo(video, timestamp);

  if (result.landmarks.length > 0) {
    const landmarks = result.landmarks[0]; // Take primary hand

    // Logic to detect "OK" vs "Open Palm"
    
    // 1. Check for Open Palm (All fingers extended)
    // We assume the model's classification is decent, but we can also use geometry.
    // Let's rely on simple geometry for robustness.
    
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const wrist = landmarks[0];

    // Calculate distance between thumb tip and index tip
    const pinchDistance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    
    // Check if other fingers are extended (distance from wrist)
    const isMiddleExtended = Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y) > 0.3;
    const isRingExtended = Math.hypot(ringTip.x - wrist.x, ringTip.y - wrist.y) > 0.3;
    const isPinkyExtended = Math.hypot(pinkyTip.x - wrist.x, pinkyTip.y - wrist.y) > 0.3;

    // Determine Gesture
    let gestureName = 'None';
    
    // OK Gesture Logic: Thumb and Index close, others extended
    if (pinchDistance < 0.05 && isMiddleExtended && isRingExtended && isPinkyExtended) {
      gestureName = 'OK_Hand';
    } 
    // Open Palm Logic: All fingers extended and spread
    else if (isMiddleExtended && isRingExtended && isPinkyExtended && pinchDistance > 0.1) {
      gestureName = 'Open_Palm';
    }

    // Return the gesture and the center position (using wrist or middle mcp for tracking UI)
    // Using Index finger MCP (5) or Wrist (0) usually stable. Let's use Index MCP.
    const trackingPoint = landmarks[9]; // Middle finger MCP

    return {
      name: gestureName,
      x: 1 - trackingPoint.x, // Mirror effect adjustment
      y: trackingPoint.y
    };
  }

  return null;
};
