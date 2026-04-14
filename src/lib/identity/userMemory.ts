import * as faceapi from "@vladmandic/face-api";

export type Role = "PRIMARY" | "KNOWN";

export type User = {
  id: string;
  name: string;
  role: Role;
  faceEmbedding: number[];
  createdAt: number;
};

const MEMORY_STORAGE_KEY = "nami_identities_memory";
const MATCH_THRESHOLD = 0.55; // Must match faceRecognition.ts threshold

/**
 * Migrate the old `nami_primary_user_descriptor` if it exists and memory is empty.
 * This satisfies the initializePrimaryUser() requirement without breaking the camera flows.
 */
export function initializePrimaryUser() {
  const allUsers = getAllUsers();
  if (allUsers.length > 0) return; // Already initialized

  const oldPrimaryDescriptorStr = localStorage.getItem("nami_primary_user_descriptor");
  if (oldPrimaryDescriptorStr) {
    try {
      const descriptor = JSON.parse(oldPrimaryDescriptorStr) as number[];
      const primary: User = {
        id: crypto.randomUUID(),
        name: "Shreyas",
        role: "PRIMARY",
        faceEmbedding: descriptor,
        createdAt: Date.now(),
      };
      saveUser(primary);
      console.log("[UserMemory] Migrated existing PRIMARY user (Shreyas) into identity memory.");
    } catch (e) {
      console.error("[UserMemory] Failed to migrate old primary descriptor.", e);
    }
  }
}

export function saveUser(user: User) {
  const users = getAllUsers();
  users.push(user);
  localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(users));
  console.log(`[UserMemory] Saved user: ${user.name} (${user.role})`);
}

export function getAllUsers(): User[] {
  const raw = localStorage.getItem(MEMORY_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as User[];
  } catch {
    return [];
  }
}

export function findBestMatch(embedding: Float32Array): { user: User | null; confidence: number } {
  const users = getAllUsers();
  if (users.length === 0) return { user: null, confidence: 0 };

  let bestMatch: User | null = null;
  let highestConfidence = 0;

  for (const user of users) {
    const distance = faceapi.euclideanDistance(
      Array.from(embedding),
      user.faceEmbedding
    );
    
    // Map distance to confidence (0 distance = 1.0 confidence, threshold = 0.0)
    const confidence = Math.max(0, 1 - distance / MATCH_THRESHOLD);
    
    if (distance < MATCH_THRESHOLD && confidence > highestConfidence) {
      highestConfidence = confidence;
      bestMatch = user;
    }
  }

  return {
    user: bestMatch,
    confidence: bestMatch ? Math.min(1, highestConfidence) : 0,
  };
}
