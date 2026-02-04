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
    minHandDetectionConfidence: 0.2,
    minHandPresenceConfidence: 0.2,
    minTrackingConfidence: 0.2,
  });

  return handLandmarker;
};

export const detectGestureInVideo = (video: HTMLVideoElement, timestamp: number) => {
  if (!handLandmarker) return null;

  const result = handLandmarker.detectForVideo(video, timestamp);

  if (result.landmarks.length > 0) {
    // Iterate through ALL detected hands to find a hand showing 5 fingers
    for (const landmarks of result.landmarks) {

      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const middleTip = landmarks[12];
      const ringTip = landmarks[16];
      const pinkyTip = landmarks[20];
      const wrist = landmarks[0];

      // Calculate Hand Scale (Palm Size) for dynamic thresholds
      // Distance between Wrist (0) and Middle Finger MCP (9)
      const middleMCP = landmarks[9];
      const palmSize = Math.hypot(middleMCP.x - wrist.x, middleMCP.y - wrist.y);

      // Dynamic Thresholds - REFINED
      // Finger is extended if Tip distance from Wrist is > 1.3x Palm Size
      // (Closed fist ratio is ~1.0. Extended flat hand is ~2.0. 1.8 was too strict for tilted hands)
      const extensionThreshold = palmSize * 1.3;
      const thumbExtensionThreshold = palmSize * 1.0;
      const pinchThreshold = palmSize * 0.6;

      // Calculate distance between thumb tip and index tip
      const pinchDistance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);

      // Check if fingers are extended (distance from wrist)
      const distIndex = Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y);
      const distMiddle = Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y);
      const distRing = Math.hypot(ringTip.x - wrist.x, ringTip.y - wrist.y);
      const distPinky = Math.hypot(pinkyTip.x - wrist.x, pinkyTip.y - wrist.y);
      const distThumb = Math.hypot(thumbTip.x - wrist.x, thumbTip.y - wrist.y);

      const isIndexExtended = distIndex > extensionThreshold;
      const isMiddleExtended = distMiddle > extensionThreshold;
      const isRingExtended = distRing > extensionThreshold;
      const isPinkyExtended = distPinky > extensionThreshold;
      const isThumbExtended = distThumb > thumbExtensionThreshold;

      // Debug Log (throttled/only on detection) to help user debug
      if (Date.now() % 500 < 50) { // Log occasionally to avoid spam
        console.log("Hand Stats:", {
          palmSize: palmSize.toFixed(3),
          ratios: [distIndex / palmSize, distMiddle / palmSize, distThumb / palmSize].map(n => n.toFixed(2)),
          isOpen: isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended
        });
      }

      // Determine Gesture
      let gestureName = 'None';

      // Open Palm Logic: All 5 fingers extended
      // We accept if just 4 fingers are super extended and thumb is somewhat extended or far from index
      if (isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended && (isThumbExtended || pinchDistance > pinchThreshold)) {
        gestureName = 'Open_Palm';
      }

      if (gestureName !== 'None') {
        // Found a valid gesture on this hand!
        const trackingPoint = landmarks[9]; // Middle finger MCP
        return {
          name: gestureName,
          x: 1 - trackingPoint.x, // Mirror effect adjustment
          y: trackingPoint.y
        };
      }
    }
  }

  return null;
};
