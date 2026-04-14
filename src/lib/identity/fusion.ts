/**
 * Identity Fusion Engine
 *
 * Combines face recognition and voice recognition signals into
 * a single identity verdict with confidence level and action gating.
 */

// ─── Types ───────────────────────────────────────────────────────

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "NONE";
export type IdentityLabel = "PRIMARY" | "UNKNOWN";

export interface FusionInput {
  face: {
    isMatch: boolean;
    confidence: number; // 0–1
    detected: boolean;
    faceCount: number;
  };
  voice: {
    confidence: number; // 0–1
    isAvailable: boolean;
  };
}

export interface FusionOutput {
  identity: IdentityLabel;
  confidence: ConfidenceLevel;
  allowSensitiveActions: boolean;
  reason: string;
  multiplePeople: boolean;
  userRole: "PRIMARY" | "KNOWN" | "UNKNOWN";
  currentDescriptor: Float32Array | null;
}

// ─── Fusion Logic ────────────────────────────────────────────────

import { resolveFaceMemory } from "./resolveIdentity";
import { getPermission } from "./permissionManager";

/**
 * Deterministic fusion of biometric signals with auto-learned memory.
 */
export function fuseIdentity(input: FusionInput): FusionOutput {
  const { face, voice } = input;
  const multiplePeople = face.faceCount > 1;

  // Resolve identity from memory using the raw descriptor
  const resolved = resolveFaceMemory(face.descriptor || null);

  // No face detected at all
  if (!face.detected) {
    return {
      identity: "UNKNOWN",
      confidence: "NONE",
      allowSensitiveActions: false,
      reason: "No face detected.",
      multiplePeople: false,
      userRole: "UNKNOWN",
      currentDescriptor: null,
    };
  }

  // --- PRIMARY USER ACCESS ---
  if (resolved.role === "PRIMARY") {
    return {
      identity: "PRIMARY",
      confidence: "HIGH",
      allowSensitiveActions: true,
      reason: "Face confirmed primary user.",
      multiplePeople,
      userRole: "PRIMARY",
      currentDescriptor: face.descriptor || null,
    };
  }

  // --- KNOWN USER (Needs temporary permission) ---
  if (resolved.role === "KNOWN" && resolved.user) {
    const perm = getPermission(resolved.user.id);
    if (perm) {
      return {
        identity: "UNKNOWN", // Non-primary so we use UNKNOWN identity for broader context
        confidence: "MEDIUM",
        allowSensitiveActions: true,
        reason: `Known user (${resolved.user.name}) with active temporary permission.`,
        multiplePeople,
        userRole: "KNOWN",
        currentDescriptor: face.descriptor || null,
      };
    } else {
      return {
        identity: "UNKNOWN",
        confidence: "LOW",
        allowSensitiveActions: false,
        reason: `Known user (${resolved.user.name}) detected, but lacks active permission.`,
        multiplePeople,
        userRole: "KNOWN",
        currentDescriptor: face.descriptor || null,
      };
    }
  }

  // --- STRICTLY UNKNOWN PERSON ---
  return {
    identity: "UNKNOWN",
    confidence: "NONE",
    allowSensitiveActions: false,
    reason: "Unknown face detected. Access firmly blocked.",
    multiplePeople,
    userRole: "UNKNOWN",
    currentDescriptor: face.descriptor || null,
  };
}
