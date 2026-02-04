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


// HAND TRACKING STATE
interface TrackedHand {
  id: number;
  lastTime: number;
  history: { x: number, y: number, time: number }[];
  lastPalmSize: number;
  activityScore: number;
}

let nextHandId = 1;
let trackedHands: TrackedHand[] = [];

// Constants for Scoring
const MAX_HISTORY_MS = 500; // Track movement over last 500ms
const ACTIVITY_WEIGHT = 2.0; // Preference for moving hands
const SIZE_WEIGHT = 1.0; // Preference for closer/larger hands

export const detectGestureInVideo = (video: HTMLVideoElement, timestamp: number) => {
  if (!handLandmarker) return null;

  const result = handLandmarker.detectForVideo(video, timestamp);

  if (result.landmarks.length > 0) {
    const currentHands: { landmarks: any[], palmSize: number, center: { x: number, y: number } }[] = [];

    // 1. Pre-process current frame hands
    for (const landmarks of result.landmarks) {
      const wrist = landmarks[0];
      const middleMCP = landmarks[9];
      const palmSize = Math.hypot(middleMCP.x - wrist.x, middleMCP.y - wrist.y);
      const center = { x: middleMCP.x, y: middleMCP.y }; // Use Middle Finger MCP as center
      currentHands.push({ landmarks, palmSize, center });
    }

    // 2. Match with Tracked Hands (Simple Greedy Matching by Distance)
    const newTrackedHands: TrackedHand[] = [];
    const usedIndices = new Set<number>();

    // For each existing tracked hand, find closest new hand
    for (const tracked of trackedHands) {
      let bestIdx = -1;
      let minDist = 0.15; // Max distance to be considered same hand (15% of screen)

      for (let i = 0; i < currentHands.length; i++) {
        if (usedIndices.has(i)) continue;
        const dist = Math.hypot(currentHands[i].center.x - tracked.history[tracked.history.length - 1].x, currentHands[i].center.y - tracked.history[tracked.history.length - 1].y);
        if (dist < minDist) {
          minDist = dist;
          bestIdx = i;
        }
      }

      if (bestIdx !== -1) {
        // Matched! Update existing
        const matchedHand = currentHands[bestIdx];
        usedIndices.add(bestIdx);

        // Update History
        const newHistory = [...tracked.history, { x: matchedHand.center.x, y: matchedHand.center.y, time: timestamp }]
          .filter(h => timestamp - h.time < MAX_HISTORY_MS);

        // Calculate Activity (Standard Deviation of Position)
        let activity = 0;
        if (newHistory.length > 2) {
          const xs = newHistory.map(h => h.x);
          const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
          const variance = xs.reduce((a, b) => a + b + Math.pow(b - mean, 2), 0) / xs.length;
          activity = Math.sqrt(variance) * 100; // Scale up
        }

        newTrackedHands.push({
          ...tracked,
          lastTime: timestamp,
          history: newHistory,
          lastPalmSize: matchedHand.palmSize,
          activityScore: activity
        });
      }
    }

    // Add new unmatched hands
    for (let i = 0; i < currentHands.length; i++) {
      if (!usedIndices.has(i)) {
        const h = currentHands[i];
        newTrackedHands.push({
          id: nextHandId++,
          lastTime: timestamp,
          history: [{ x: h.center.x, y: h.center.y, time: timestamp }],
          lastPalmSize: h.palmSize,
          activityScore: 0 // New hand starts with 0 activity
        });
      }
    }

    // Update global state
    trackedHands = newTrackedHands;

    // 3. Select Best Hand
    // Score = (Activity * ACTIVITY_WEIGHT) + (Size * SIZE_WEIGHT * 10)
    // Note: PalmSize is usually 0.1 - 0.3. Activity is 0 - 5+.
    let bestHandIdx = -1;
    let maxScore = -1;

    // We need to map back trackedHands to result.landmarks index
    // Use the `usedIndices` logic or re-find.
    // Easier: Just loop through result.landmarks again and find which tracked hand it corresponds to (closest)
    // Actually, we can just process the "Winning" tracked hand logic first, then find which landmarks it belongs to.

    // Find the ID of the winner in `trackedHands`
    let bestTrackedHand: TrackedHand | null = null;

    for (const hand of trackedHands) {
      // Bonus for activity, but cap it so a fly on the wall doesn't win (unlikely for hand detection)
      // Activity is usually < 1 for static, > 2-3 for waving.
      const activityComponent = Math.min(hand.activityScore, 10) * ACTIVITY_WEIGHT;
      const sizeComponent = hand.lastPalmSize * 20 * SIZE_WEIGHT; // Scale palm size (0.2 -> 4)

      const totalScore = activityComponent + sizeComponent;

      if (totalScore > maxScore) {
        maxScore = totalScore;
        bestTrackedHand = hand;
      }
    }

    // Now find the original landmarks for `bestTrackedHand`
    if (bestTrackedHand) {
      // Find the landmark set closest to this tracked hand's current position
      let bestLandmarkIdx = -1;
      let minDist = 1.0;
      const targetPos = bestTrackedHand.history[bestTrackedHand.history.length - 1];

      for (let i = 0; i < result.landmarks.length; i++) {
        const lm = result.landmarks[i];
        const center = lm[9];
        const dist = Math.hypot(center.x - targetPos.x, center.y - targetPos.y);
        if (dist < minDist) {
          minDist = dist;
          bestLandmarkIdx = i;
        }
      }

      if (bestLandmarkIdx !== -1) {
        // DETECT GESTURE ON THE WINNING HAND ONLY
        const landmarks = result.landmarks[bestLandmarkIdx];

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
        if (isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended && (isThumbExtended || pinchDistance > pinchThreshold)) {
          gestureName = 'Open_Palm';
        }

        if (gestureName !== 'None') {
          const trackingPoint = landmarks[9];
          return {
            name: gestureName,
            x: 1 - trackingPoint.x,
            y: trackingPoint.y
          };
        }
      }
    }
  } else {
    // No hands -> Reset tracking to avoid stale matches
    trackedHands = [];
  }

  return null;
};
