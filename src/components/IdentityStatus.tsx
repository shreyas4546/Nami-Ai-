import React from "react";
import type { ConfidenceLevel } from "../lib/identity/fusion";

interface IdentityStatusProps {
  confidence: ConfidenceLevel;
  multiplePeople: boolean;
  isEnrolled: boolean;
  isModelLoaded: boolean;
}

const statusConfig: Record<ConfidenceLevel, { color: string; glow: string; label: string; icon: string }> = {
  HIGH: {
    color: "#00ff88",
    glow: "0 0 12px rgba(0, 255, 136, 0.6)",
    label: "Shreyas Verified",
    icon: "🟢",
  },
  MEDIUM: {
    color: "#00cc66",
    glow: "0 0 10px rgba(0, 204, 102, 0.5)",
    label: "Identity Confirmed",
    icon: "🟢",
  },
  LOW: {
    color: "#ffaa00",
    glow: "0 0 10px rgba(255, 170, 0, 0.5)",
    label: "Unconfirmed User",
    icon: "🟡",
  },
  NONE: {
    color: "#ff3366",
    glow: "0 0 12px rgba(255, 51, 102, 0.6)",
    label: "Unknown User",
    icon: "🔴",
  },
};

export const IdentityStatus: React.FC<IdentityStatusProps> = ({
  confidence,
  multiplePeople,
  isEnrolled,
  isModelLoaded,
}) => {
  if (!isModelLoaded) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.dot, backgroundColor: "#666", boxShadow: "0 0 8px rgba(100,100,100,0.4)" }} />
        <span style={{ ...styles.label, color: "#888" }}>Loading Vision…</span>
      </div>
    );
  }

  if (!isEnrolled) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.dot, backgroundColor: "#6666ff", boxShadow: "0 0 10px rgba(102,102,255,0.5)" }} />
        <span style={{ ...styles.label, color: "#aaaaff" }}>Enrollment Required</span>
      </div>
    );
  }

  const cfg = statusConfig[confidence];

  return (
    <div style={styles.container}>
      <div
        style={{
          ...styles.dot,
          backgroundColor: cfg.color,
          boxShadow: cfg.glow,
        }}
      />
      <span style={{ ...styles.label, color: cfg.color }}>
        {cfg.icon} {cfg.label}
      </span>
      {multiplePeople && (
        <span style={styles.multiWarning}>⚠ Multiple faces</span>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "fixed",
    top: 16,
    right: 16,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    borderRadius: 24,
    background: "rgba(10, 10, 20, 0.75)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.08)",
    zIndex: 9999,
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontSize: 12,
    transition: "all 0.3s ease",
    userSelect: "none",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    transition: "all 0.3s ease",
  },
  label: {
    fontWeight: 600,
    letterSpacing: "0.02em",
    transition: "color 0.3s ease",
  },
  multiWarning: {
    fontSize: 10,
    color: "#ffaa00",
    marginLeft: 4,
    fontWeight: 500,
  },
};
