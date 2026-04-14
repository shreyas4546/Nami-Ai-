import { findBestMatch, User, Role } from "./userMemory";

export type ResolvedIdentity = {
  user: User | null;
  role: Role | "UNKNOWN";
  confidence: number;
};

/**
 * Resolves a raw face descriptor into a known identity, if one exists.
 * Returns UNKNOWN if there is no confident match in the user memory.
 */
export function resolveFaceMemory(descriptor: Float32Array | null): ResolvedIdentity {
  if (!descriptor) {
    return { user: null, role: "UNKNOWN", confidence: 0 };
  }

  const match = findBestMatch(descriptor);
  
  if (match.user) {
    return {
      user: match.user,
      role: match.user.role,
      confidence: match.confidence,
    };
  }

  // No match found
  return {
    user: null,
    role: "UNKNOWN",
    confidence: 0,
  };
}
