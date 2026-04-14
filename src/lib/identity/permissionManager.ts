export type PermissionLevel = "LIMITED" | "FULL";

export type PermissionSession = {
  userId: string;
  expiresAt: number;
  level: PermissionLevel;
};

const PERMISSIONS_STORAGE_KEY = "nami_permissions";

export function getPermissions(): Record<string, PermissionSession> {
  const raw = localStorage.getItem(PERMISSIONS_STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function savePermissions(permissions: Record<string, PermissionSession>) {
  localStorage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(permissions));
}

export function grantPermission(userId: string, durationMs: number, level: PermissionLevel = "FULL") {
  cleanupExpired();
  const permissions = getPermissions();
  permissions[userId] = {
    userId,
    expiresAt: Date.now() + durationMs,
    level,
  };
  savePermissions(permissions);
  console.log(`[PermissionManager] Granted ${level} permission for user ${userId} until ${new Date(permissions[userId].expiresAt).toLocaleTimeString()}`);
}

export function getPermission(userId: string): PermissionSession | null {
  cleanupExpired();
  const permissions = getPermissions();
  return permissions[userId] || null;
}

export function cleanupExpired() {
  const permissions = getPermissions();
  const now = Date.now();
  let changed = false;

  for (const userId in permissions) {
    if (permissions[userId].expiresAt <= now) {
      delete permissions[userId];
      changed = true;
      console.log(`[PermissionManager] Cleaned up expired permission for user ${userId}`);
    }
  }

  if (changed) {
    savePermissions(permissions);
  }
}

// Ensure cleanup runs occasionally
setInterval(cleanupExpired, 60000); // Check every minute
