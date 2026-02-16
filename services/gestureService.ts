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
    numHands: 10, // Detect up to 10 hands
    minHandDetectionConfidence: 0.2,
    minHandPresenceConfidence: 0.2,
    minTrackingConfidence: 0.2,
  });

  return handLandmarker;
};

// Hand tracking to maintain stable IDs
interface TrackedHand {
  id: number;
  lastPosition: { x: number, y: number };
  lastSeen: number;
}

let nextHandId = 1;
let trackedHands: TrackedHand[] = [];
const HAND_MATCH_THRESHOLD = 0.15; // 15% of screen distance
const HAND_TIMEOUT_MS = 500; // Remove hand if not seen for 500ms

export const detectGestureInVideo = (video: HTMLVideoElement, timestamp: number) => {
  if (!handLandmarker) return null;

  const result = handLandmarker.detectForVideo(video, timestamp);

  if (result.landmarks.length > 0) {
    const detectedGestures = [];
    const currentHandPositions: { x: number, y: number, landmarks: any }[] = [];

    // First pass: collect all hand positions
    for (const landmarks of result.landmarks) {
      const middleMCP = landmarks[9];
      currentHandPositions.push({
        x: middleMCP.x,
        y: middleMCP.y,
        landmarks
      });
    }

    // Match current hands with tracked hands
    const usedTrackedIndices = new Set<number>();
    const usedCurrentIndices = new Set<number>();
    const handIdMap = new Map<number, number>(); // currentIndex -> handId

    // Try to match each tracked hand with closest current hand
    trackedHands.forEach((tracked, trackedIdx) => {
      let bestCurrentIdx = -1;
      let minDist = HAND_MATCH_THRESHOLD;

      currentHandPositions.forEach((current, currentIdx) => {
        if (usedCurrentIndices.has(currentIdx)) return;
        const dist = Math.hypot(current.x - tracked.lastPosition.x, current.y - tracked.lastPosition.y);
        if (dist < minDist) {
          minDist = dist;
          bestCurrentIdx = currentIdx;
        }
      });

      if (bestCurrentIdx !== -1) {
        // Match found
        usedTrackedIndices.add(trackedIdx);
        usedCurrentIndices.add(bestCurrentIdx);
        handIdMap.set(bestCurrentIdx, tracked.id);

        // Update tracked hand position
        tracked.lastPosition = {
          x: currentHandPositions[bestCurrentIdx].x,
          y: currentHandPositions[bestCurrentIdx].y
        };
        tracked.lastSeen = timestamp;
      }
    });

    // Assign new IDs to unmatched hands
    currentHandPositions.forEach((_, currentIdx) => {
      if (!usedCurrentIndices.has(currentIdx)) {
        const newId = nextHandId++;
        handIdMap.set(currentIdx, newId);
        trackedHands.push({
          id: newId,
          lastPosition: {
            x: currentHandPositions[currentIdx].x,
            y: currentHandPositions[currentIdx].y
          },
          lastSeen: timestamp
        });
      }
    });

    // Remove old tracked hands
    trackedHands = trackedHands.filter(hand => timestamp - hand.lastSeen < HAND_TIMEOUT_MS);

    // Process gestures for each hand with stable ID
    currentHandPositions.forEach((handPos, currentIdx) => {
      const landmarks = handPos.landmarks;
      const handId = handIdMap.get(currentIdx)!;

      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const middleTip = landmarks[12];
      const ringTip = landmarks[16];
      const pinkyTip = landmarks[20];
      const wrist = landmarks[0];

      const middleMCP = landmarks[9];
      const palmSize = Math.hypot(middleMCP.x - wrist.x, middleMCP.y - wrist.y);

      const extensionThreshold = palmSize * 1.3;
      const thumbExtensionThreshold = palmSize * 1.0;
      const pinchThreshold = palmSize * 0.6;
      const pinchDistance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);

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

      let gestureName = 'None';

      // Two Fingers (Peace Sign): Index and Middle extended, Ring and Pinky folded
      if (isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended) {
        gestureName = 'Two_Fingers';
      }
      // OK Hand: Thumb and Index close together (forming circle), other fingers extended
      else if (pinchDistance < pinchThreshold && isMiddleExtended && isRingExtended && isPinkyExtended) {
        gestureName = 'OK_Hand';
      }

      if (gestureName !== 'None') {
        const trackingPoint = landmarks[9];
        detectedGestures.push({
          id: handId, // Stable ID for tracking
          name: gestureName,
          x: 1 - trackingPoint.x,
          y: trackingPoint.y
        });
      }
    });

    // Return all detected gestures with stable IDs
    return detectedGestures.length > 0 ? detectedGestures : null;
  } else {
    // No hands detected - clear tracking
    trackedHands = [];
  }

  return null;
};
