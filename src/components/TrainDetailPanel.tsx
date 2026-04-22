import { useEffect, useState } from "react";
import { predictDelay } from "../lib/api";
import { useToast } from "./ToastProvider";
import type { FirestoreTrain as Train, DelayPrediction } from "../types";
import TrainSchedule from "./TrainSchedule";

interface Props {
  train:   Train | null;
  onClose: () => void;
  variant?: "drawer" | "dock";
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  on_time:  { color: "#4ade80", label: "ON TIME",  icon: "●" },
  delayed:  { color: "#fb923c", label: "DELAYED",  icon: "▲" },
  critical: { color: "#ef4444", label: "CRITICAL", icon: "⚠" },
};

const PRIORITY_LABEL: Record<number, { label: string; color: string }> = {
  1: { label: "Express",  color: "#60a5fa" },
  2: { label: "Mail",     color: "#a78bfa" },
  3: { label: "Freight",  color: "#fb923c" },
};

const ALL_BLOCKS = ["B1", "B2", "B3", "B4", "B5", "B6"];

export default function TrainDetailPanel({ train, onClose, variant = "drawer" }: Props) {
  const [prediction, setPrediction] = useState<DelayPrediction | null>(null); // ✅ use DelayPrediction directly
  const [loading, setLoading]       = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const { showToast }               = useToast();
  const isDocked = variant === "dock";

  useEffect(() => {
    if (!train) return;
    setPrediction(null);
    setLoading(true);

    if (!train.stationCode) {
      setLoading(false);
      return;
    }

    predictDelay(train.trainNumber, train.stationCode)
      .then((data) => setPrediction(data))
      .catch(() => setPrediction(null))
      .finally(() => setLoading(false));
  }, [train?.id, train?.stationCode, train?.trainNumber]);

  if (!train) {
    if (!isDocked) return null;
    return (
      <div
        style={{
          position: "sticky",
          top: 20,
          borderRadius: 20,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          minHeight: 420,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
          Select a train
        </p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", maxWidth: 220, lineHeight: 1.6 }}>
          Keep the full list open on the left and inspect train details here without losing your scroll position.
        </p>
      </div>
    );
  }

  const sc         = STATUS_CONFIG[train.status ?? "on_time"] ?? STATUS_CONFIG.on_time;
  const pl         = PRIORITY_LABEL[train.priority] ?? PRIORITY_LABEL[2];
  const currentIdx = ALL_BLOCKS.indexOf(train.currentBlock);

  const handleFlag = () => {
    showToast(
      `Train ${train.trainNumber} flagged for manual review`,
      "warning",
      "Notification sent to section supervisor"
    );
  };

  return (
    <>
      {!isDocked && (
        <div
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, zIndex: 60,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(6px)",
            animation: "fadeIn 0.2s ease",
          }}
        />
      )}

      {/* Panel */}
      <div
        style={{
          position: isDocked ? "sticky" : "fixed",
          top: isDocked ? 20 : 0,
          right: isDocked ? "auto" : 0,
          bottom: isDocked ? "auto" : 0,
          width: isDocked ? "100%" : "min(460px, 100vw)",
          maxHeight: isDocked ? "calc(100vh - 40px)" : "100vh",
          zIndex: isDocked ? "auto" : 70,
          background: "#0d0d0c",
          border: isDocked ? "1px solid rgba(255,255,255,0.08)" : undefined,
          borderLeft: isDocked ? undefined : "1px solid rgba(255,255,255,0.08)",
          borderRadius: isDocked ? 20 : 0,
          overflowY: "auto",
          animation: "slideIn 0.28s cubic-bezier(0.16,1,0.3,1)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            position: "sticky", top: 0,
            background: "#0d0d0c",
            zIndex: 10,
            borderTopLeftRadius: isDocked ? 20 : 0,
            borderTopRightRadius: isDocked ? 20 : 0,
          }}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1 }}>
                  {train.trainNumber}
                </h2>
                <span
                  style={{
                    fontSize: 10, fontWeight: 700,
                    color: pl.color,
                    background: `${pl.color}18`,
                    border: `1px solid ${pl.color}30`,
                    borderRadius: 99, padding: "2px 8px",
                  }}
                >
                  {pl.label}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>
                {train.name}
              </p>
            </div>

            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.4)",
                borderRadius: 10,
                width: isDocked ? "auto" : 34,
                minWidth: isDocked ? 68 : 34,
                height: 34,
                padding: isDocked ? "0 12px" : 0,
                display: "grid", placeItems: "center",
                cursor: "pointer", fontSize: 14, flexShrink: 0,
              }}
            >
              {isDocked ? "Close" : "✕"}
            </button>
          </div>

          {/* Status badge */}
          <div className="flex items-center gap-2 mt-3">
            <div
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 99,
                background: `${sc.color}15`,
                border: `1px solid ${sc.color}35`,
                color: sc.color,
                fontSize: 11, fontWeight: 800, letterSpacing: "0.08em",
              }}
            >
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: sc.color,
                boxShadow: `0 0 0 3px ${sc.color}25`,
                animation: train.status === "critical" ? "ping-soft 1s ease infinite" : "none",
              }} />
              {sc.label}
            </div>

            {train.delayMinutes > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: "#fb923c",
                background: "rgba(251,146,60,0.1)",
                border: "1px solid rgba(251,146,60,0.2)",
                borderRadius: 99, padding: "4px 10px",
              }}>
                +{train.delayMinutes} min delay
              </span>
            )}
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ padding: "20px 24px", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Block position timeline */}
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 14, padding: "16px 18px",
            }}
          >
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700,
              letterSpacing: "0.1em", marginBottom: 14 }}>
              BLOCK POSITION
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
              {ALL_BLOCKS.map((block, i) => {
                const isCurrent = block === train.currentBlock;
                const isNext    = block === train.nextBlock;
                const isPast    = i < currentIdx;

                return (
                  <div key={block} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                      <div style={{
                        flex: 1, height: 2,
                        background: isPast || isCurrent ? sc.color : "rgba(255,255,255,0.08)",
                        transition: "background 0.3s ease",
                        opacity: i === 0 ? 0 : 1,
                      }} />

                      <div style={{
                        width:  isCurrent ? 28 : isNext ? 18 : 12,
                        height: isCurrent ? 28 : isNext ? 18 : 12,
                        borderRadius: "50%",
                        background: isCurrent
                          ? sc.color
                          : isPast
                            ? `${sc.color}40`
                            : isNext
                              ? "rgba(255,255,255,0.08)"
                              : "rgba(255,255,255,0.04)",
                        border: isCurrent
                          ? `2px solid ${sc.color}`
                          : isNext
                            ? "2px dashed rgba(255,255,255,0.2)"
                            : "none",
                        boxShadow: isCurrent ? `0 0 0 4px ${sc.color}25` : "none",
                        display: "grid", placeItems: "center",
                        transition: "all 0.3s ease",
                        flexShrink: 0,
                        zIndex: 1,
                      }}>
                        {isCurrent && (
                          <span style={{ fontSize: 9, color: "#000", fontWeight: 900 }}>●</span>
                        )}
                      </div>

                      <div style={{
                        flex: 1, height: 2,
                        background: isPast ? sc.color : "rgba(255,255,255,0.08)",
                        opacity: i === ALL_BLOCKS.length - 1 ? 0 : 1,
                      }} />
                    </div>

                    <p style={{
                      fontSize: isCurrent ? 11 : 9,
                      fontWeight: isCurrent ? 800 : 500,
                      color: isCurrent
                        ? sc.color
                        : isNext
                          ? "rgba(255,255,255,0.4)"
                          : isPast
                            ? "rgba(255,255,255,0.25)"
                            : "rgba(255,255,255,0.15)",
                      marginTop: 6,
                      transition: "all 0.3s ease",
                    }}>
                      {block}
                    </p>

                    {isCurrent && (
                      <p style={{ fontSize: 8, color: sc.color, fontWeight: 700, marginTop: 1 }}>HERE</p>
                    )}
                    {isNext && (
                      <p style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>NEXT</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-4 pt-3"
              style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Speed</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa",
                  fontVariantNumeric: "tabular-nums" }}>
                  {train.speed} km/h
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                  Next
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>
                  {train.nextBlock}
                </span>
              </div>
            </div>
          </div>

          {/* Live stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "Current Block", value: train.currentBlock,    accent: false },
              { label: "Next Block",    value: train.nextBlock,       accent: false },
              { label: "Speed",         value: `${train.speed} km/h`, accent: false },
              { label: "Delay",         value: train.delayMinutes > 0
                  ? `+${train.delayMinutes} min` : "None",
                accent: train.delayMinutes > 0 },
            ].map(({ label, value, accent }) => (
              <div
                key={label}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 12, padding: "12px 14px",
                }}
              >
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)",
                  marginBottom: 4, fontWeight: 600 }}>
                  {label}
                </p>
                <p style={{
                  fontSize: 15, fontWeight: 700,
                  color: accent ? "#fb923c" : "#fff",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* RF Delay Prediction */}
          <div
            style={{
              background: "rgba(74,222,128,0.05)",
              border: "1px solid rgba(74,222,128,0.15)",
              borderRadius: 14, padding: "16px 18px",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <p style={{ fontSize: 10, color: "rgba(74,222,128,0.7)", fontWeight: 800,
                letterSpacing: "0.1em" }}>
                RF DELAY PREDICTION
              </p>
              {prediction && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: "rgba(74,222,128,0.6)",
                  background: "rgba(74,222,128,0.1)",
                  border: "1px solid rgba(74,222,128,0.2)",
                  borderRadius: 99, padding: "2px 8px",
                }}>
                  {prediction.confidence}% confidence
                </span>
              )}
            </div>

            {loading ? (
              <div className="flex items-center gap-2">
                <span style={{
                  width: 12, height: 12,
                  border: "2px solid rgba(74,222,128,0.3)",
                  borderTopColor: "#4ade80",
                  borderRadius: "50%", display: "inline-block",
                  animation: "spin 0.7s linear infinite",
                }} />
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                  Analysing train data…
                </p>
              </div>
            ) : prediction ? (
              <>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
                  {prediction.explanation?.reason ?? "No explanation available."}
                </p>
                <div className="flex items-center gap-2 mt-3 pt-3"
                  style={{ borderTop: "1px solid rgba(74,222,128,0.1)" }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                    Predicted delay class:
                  </span>
                  <span style={{
                    fontSize: 13, fontWeight: 800,
                    color: prediction.delay_class === "HIGH" ? "#ef4444"
                      : prediction.delay_class === "MEDIUM" ? "#fb923c" : "#4ade80",
                  }}>
                    {prediction.delay_class}
                  </span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: 8 }}>
                    ~{prediction.average_delay_minutes} min avg
                  </span>
                </div>
                {prediction.explanation?.top_factor && (
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>
                    Top factor: <strong style={{ color: "rgba(255,255,255,0.5)" }}>
                      {prediction.explanation.top_factor}
                    </strong>
                  </p>
                )}
              </>
            ) : (
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                {train.stationCode
                  ? "Prediction unavailable — backend offline"
                  : "Prediction unavailable — no live station code for this train yet"}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 8 }}>
            <button
              onClick={() => setShowSchedule(true)}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.7)",
                borderRadius: 12, padding: "12px",
                fontWeight: 600, fontSize: 13, cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.09)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
            >
              📋 View Full Schedule
            </button>
            <button
              onClick={handleFlag}
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.18)",
                color: "#ef4444",
                borderRadius: 12, padding: "12px",
                fontWeight: 600, fontSize: 13, cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.14)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
            >
              ⚠️ Flag for Manual Review
            </button>
          </div>

        </div>
      </div>

      <style>{`
        @keyframes slideIn  { from { transform: translateX(100%) } to { transform: translateX(0) } }
        @keyframes fadeIn   { from { opacity: 0 }                  to { opacity: 1 } }
        @keyframes spin     { to   { transform: rotate(360deg) } }
        @keyframes ping-soft {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>

      {showSchedule && (
        <TrainSchedule
          trainId={train.id}
          trainNo={train.trainNumber}
          trainName={train.name ?? train.trainNumber}
          currentBlock={train.currentBlock}
          fromStation={train.fromStation}
          toStation={train.toStation}
          delayMinutes={train.delayMinutes}
          onClose={() => setShowSchedule(false)}
        />
      )}
    </>
  );
}
