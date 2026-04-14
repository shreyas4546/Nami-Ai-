import * as faceapi from "@vladmandic/face-api";

const MODELS_URL = "/models";
const STORAGE_KEY = "nami_primary_user_descriptor";
const MATCH_THRESHOLD = 0.55; // Euclidean distance threshold — lower = stricter

let modelsLoaded = false;

// ─── Model Loading ───────────────────────────────────────────────

export async function loadModels(): Promise<void> {
  if (modelsLoaded) return;
  try {
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL);
    modelsLoaded = true;
    console.log("[FaceRecognition] Models loaded successfully");
  } catch (err) {
    console.error("[FaceRecognition] Failed to load models:", err);
    throw err;
  }
}

export function areModelsLoaded(): boolean {
  return modelsLoaded;
}

// ─── Types ───────────────────────────────────────────────────────

export interface FaceDetectionResult {
  detected: boolean;
  faceCount: number;
  isPrimaryUser: boolean;
  confidence: number; // 0–1, where 1 = perfect match
  descriptor: Float32Array | null; // Added to let identity system extract features
}

export interface FaceMatchResult {
  isMatch: boolean;
  confidence: number;
  distance: number;
}

// ─── Enrollment ──────────────────────────────────────────────────

/**
 * Captures multiple frames from the video element, extracts face descriptors,
 * averages them, and stores the result in localStorage.
 */
export async function enrollPrimaryUser(
  video: HTMLVideoElement,
  sampleCount = 7
): Promise<boolean> {
  if (!modelsLoaded) {
    console.error("[FaceRecognition] Models not loaded. Call loadModels() first.");
    return false;
  }

  const descriptors: Float32Array[] = [];
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });

  for (let i = 0; i < sampleCount; i++) {
    // Wait briefly between captures for slight pose variance
    await new Promise((r) => setTimeout(r, 400));

    const detection = await faceapi
      .detectSingleFace(video, options)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (detection) {
      descriptors.push(detection.descriptor);
      console.log(`[Enroll] Captured sample ${i + 1}/${sampleCount}`);
    } else {
      console.warn(`[Enroll] No face detected for sample ${i + 1}, retrying...`);
      i--; // retry this index
      if (descriptors.length === 0 && i < -3) {
        // Give up if we can't find a face at all after several tries
        console.error("[Enroll] Cannot detect face. Aborting enrollment.");
        return false;
      }
    }
  }

  if (descriptors.length < 3) {
    console.error("[Enroll] Not enough valid samples captured.");
    return false;
  }

  // Average the descriptors
  const avgDescriptor = new Float32Array(128);
  for (const d of descriptors) {
    for (let j = 0; j < 128; j++) {
      avgDescriptor[j] += d[j];
    }
  }
  for (let j = 0; j < 128; j++) {
    avgDescriptor[j] /= descriptors.length;
  }

  // Persist to localStorage
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(avgDescriptor)));
  console.log("[Enroll] Primary user enrolled successfully ✅");
  return true;
}

/**
 * Returns the stored primary user descriptor, or null if not enrolled.
 */
export function getStoredDescriptor(): Float32Array | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw) as number[];
    return new Float32Array(arr);
  } catch {
    return null;
  }
}

export function isEnrolled(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export function clearEnrollment(): void {
  localStorage.removeItem(STORAGE_KEY);
  console.log("[FaceRecognition] Enrollment cleared.");
}

// ─── Matching ────────────────────────────────────────────────────

/**
 * Compare two face descriptors using Euclidean distance.
 * Returns a match result with confidence mapped to 0–1.
 */
export function compareFace(
  descriptorA: Float32Array,
  descriptorB: Float32Array
): FaceMatchResult {
  const distance = faceapi.euclideanDistance(
    Array.from(descriptorA),
    Array.from(descriptorB)
  );
  // Map distance to confidence: 0 distance = 1.0 confidence, threshold distance = 0.0
  const confidence = Math.max(0, 1 - distance / MATCH_THRESHOLD);
  return {
    isMatch: distance < MATCH_THRESHOLD,
    confidence: Math.min(1, confidence),
    distance,
  };
}

// ─── Real-time Detection ─────────────────────────────────────────

/**
 * Analyzes a single frame from the video element.
 * Compares the largest detected face against the stored primary user descriptor.
 */
export async function detectAndIdentify(
  video: HTMLVideoElement
): Promise<FaceDetectionResult> {
  if (!modelsLoaded) {
    return { detected: false, faceCount: 0, isPrimaryUser: false, confidence: 0, descriptor: null };
  }

  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 });

  try {
    const detections = await faceapi
      .detectAllFaces(video, options)
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (!detections || detections.length === 0) {
      return { detected: false, faceCount: 0, isPrimaryUser: false, confidence: 0, descriptor: null };
    }

    // Pick the largest face (closest to camera)
    const largest = detections.reduce((a, b) =>
      a.detection.box.area > b.detection.box.area ? a : b
    );

    const storedDescriptor = getStoredDescriptor();
    if (!storedDescriptor) {
      // Not enrolled yet — can detect but can't identify
      return {
        detected: true,
        faceCount: detections.length,
        isPrimaryUser: false,
        confidence: 0,
        descriptor: largest.descriptor,
      };
    }

    const match = compareFace(storedDescriptor, largest.descriptor);

    return {
      detected: true,
      faceCount: detections.length,
      isPrimaryUser: match.isMatch,
      confidence: match.confidence,
      descriptor: largest.descriptor,
    };
  } catch (err) {
    console.error("[FaceRecognition] Detection error:", err);
    return { detected: false, faceCount: 0, isPrimaryUser: false, confidence: 0, descriptor: null };
  }
}
