import { useMemo, useState } from "react";
import { type PredictiveWarning, toWarning } from "../utils/predictiveWarnings";
import type { DelayPrediction } from "../types";

const SEV_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  critical: { color: "#ef4444", bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.2)"  },
  warning:  { color: "#fb923c", bg: "rgba(251,146,60,0.08)", border: "rgba(251,146,60,0.2)" },
  info:     { color: "#fbbf24", bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.2)" },
};

interface PredictiveWarningBannerProps {
  delays: DelayPrediction[];
}

export default function PredictiveWarningBanner({ delays }: PredictiveWarningBannerProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const MAX_VISIBLE = 3;

  const warnings = useMemo(
    () =>
      delays
        .filter((delay) => delay.delay_class === "HIGH" || delay.delay_class === "MEDIUM")
        .map((delay) => toWarning(delay))
        .sort((a, b) => b.avgDelayMinutes - a.avgDelayMinutes),
    [delays]
  );

  const visible = warnings.filter((w) => {
    const key = `${w.trainNumber}-${w.stationCode}`;
    return !dismissed.has(key);
  });
  const criticalCount = visible.filter((warning) => warning.severity === "critical").length;
  const warningCount = visible.filter((warning) => warning.severity === "warning").length;
  const visibleRows = expanded ? visible : visible.slice(0, MAX_VISIBLE);
  const hiddenCount = Math.max(0, visible.length - visibleRows.length);

  if (visible.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 16px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div>
          <p style={{ fontSize: 12, fontWeight: 800, color: "#fff", marginBottom: 2 }}>
            Prediction Alerts
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            {criticalCount} critical, {warningCount} warning
            {hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}
          </p>
        </div>
        {visible.length > MAX_VISIBLE && (
          <button
            onClick={() => setExpanded((value) => !value)}
            style={{
              background: expanded ? "rgba(255,255,255,0.04)" : "rgba(239,68,68,0.08)",
              border: `1px solid ${expanded ? "rgba(255,255,255,0.08)" : "rgba(239,68,68,0.18)"}`,
              color: expanded ? "rgba(255,255,255,0.6)" : "#ef4444",
              borderRadius: 999,
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {expanded ? "Show fewer" : `Show all ${visible.length}`}
          </button>
        )}
      </div>

      {visibleRows.map((w) => {
        const key = `${w.trainNumber}-${w.stationCode}`;
        const st  = SEV_STYLE[w.severity] ?? SEV_STYLE.warning;

        return (
          <div
            key={key}
            style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 16px", borderRadius: 12,
              background: st.bg,
              border: `1px solid ${st.border}`,
              animation: "slideDown 0.3s cubic-bezier(0.16,1,0.3,1)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Pulse icon */}
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: st.color,
                boxShadow: `0 0 0 3px ${st.color}30`,
                flexShrink: 0,
                animation: w.severity === "critical" ? "ping-soft 1s ease infinite" : "none",
              }} />

              <div>
                <span style={{
                  fontSize: 11, fontWeight: 800,
                  color: st.color, marginRight: 8,
                  letterSpacing: "0.06em",
                }}>
                  ⚠ PREDICTED CONFLICT
                </span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                  <strong style={{ color: "#fff" }}>{w.trainNumber}</strong>
                  {" at "}
                  <strong style={{ color: "#fff" }}>{w.stationCode}</strong>
                  {" · "}
                  <strong style={{ color: st.color }}>{w.delayClass}</strong>
                  {" delay · "}
                  <strong style={{ color: st.color }}>~{w.avgDelayMinutes} min</strong>
                  {` · ${w.confidence}% confidence`}
                </span>
                {w.reason && (
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                    {w.reason}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={() => setDismissed((s) => new Set([...s, key]))}
              style={{
                background: "none", border: "none",
                color: "rgba(255,255,255,0.25)",
                cursor: "pointer", fontSize: 14,
                padding: "0 4px", flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>
        );
      })}

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ping-soft {
          0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
