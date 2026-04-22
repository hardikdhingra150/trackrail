import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../lib/firebase";
import TrainSchedule from "./TrainSchedule";
import {
  BLOCKS,
  deriveLiveConflicts,
  isCompressedCorridor,
  normalizeBlock,
  spreadTrainsAcrossCorridor,
  type LiveConflict,
} from "../utils/liveConflicts";

// ── Types ──────────────────────────────────────────────────────
interface Train {
  id:           string;
  trainNo:      string;
  name?:        string;
  type:         string;
  currentBlock: string;
  speed:        number;
  status:       string;
  direction:    "up" | "down";
  delay?:       number;
  nextBlock?:   string;
  priority?:    number;
  prediction?:  {
    confidence:     number;
    status:         string;
    explanation:    string;
    predictedDelay: number;
    modelType:      string;
  };
}

// ── Constants ──────────────────────────────────────────────────
const STATIONS: Record<string, { label: string; isTerminal?: boolean }> = {
  B1:  { label: "NDLS", isTerminal: true },
  B4:  { label: "SBB"                    },
  B7:  { label: "TKJ"                    },
  B10: { label: "GZB"                    },
  B12: { label: "GZB →", isTerminal: true },
};

function normaliseStatus(raw: string): "on-time" | "delayed" | "critical" {
  const s = (raw ?? "").toLowerCase().replace(/[_\s]/g, "-");
  if (s.includes("critical")) return "critical";
  if (s.includes("delay"))    return "delayed";
  return "on-time";
}

const STATUS_COLOR: Record<string, string> = {
  "on-time":  "#4ade80",
  "delayed":  "#f97316",
  "critical": "#ef4444",
};

const STATUS_GLOW: Record<string, string> = {
  "on-time":  "rgba(74,222,128,0.3)",
  "delayed":  "rgba(249,115,22,0.3)",
  "critical": "rgba(239,68,68,0.4)",
};

const SEVERITY_COLOR: Record<string, string> = {
  high:   "#ef4444",
  medium: "#f97316",
  low:    "#fbbf24",
};

const INITIAL_CONFLICT_ROWS = 5;

// ── Train Detail Modal ─────────────────────────────────────────
function TrainDetailModal({
  train,
  onClose,
  onViewSchedule,
}: {
  train:          Train;
  onClose:        () => void;
  onViewSchedule: (train: Train) => void;
}) {
  const status = normaliseStatus(train.status);
  const color  = STATUS_COLOR[status];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, animation: "fade-in 0.15s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480,
          background: "#141414",
          border: `1px solid ${color}30`,
          borderRadius: 20, overflow: "hidden",
          boxShadow: `0 0 40px ${color}18`,
          animation: "slide-up 0.2s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "18px 20px 14px",
          background: `${color}08`,
          borderBottom: `1px solid ${color}18`,
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>
                {train.trainNo}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700,
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 99, padding: "2px 9px",
                color: "rgba(255,255,255,0.6)",
              }}>
                {train.type}
              </span>
            </div>
            {train.name && (
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>
                {train.name}
              </p>
            )}
            <span style={{
              fontSize: 11, fontWeight: 800,
              background: `${color}18`,
              border: `1px solid ${color}30`,
              borderRadius: 99, padding: "3px 10px", color,
            }}>
              ● {status.replace("-", " ").toUpperCase()}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 10,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.5)", fontSize: 16,
              display: "grid", placeItems: "center", cursor: "pointer",
            }}>✕</button>
        </div>

        {/* Stats grid */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: 1, background: "rgba(255,255,255,0.04)",
        }}>
          {([
            { label: "Current Block", val: train.currentBlock,         valColor: undefined      },
            { label: "Next Block",    val: train.nextBlock || "—",     valColor: undefined      },
            { label: "Speed",         val: `${train.speed} km/h`,      valColor: undefined      },
            { label: "Delay",
              val:      train.delay ? `+${train.delay} min` : "None",
              valColor: train.delay ? "#f97316" : "#4ade80"                                     },
          ] as { label: string; val: string; valColor?: string }[]).map(({ label, val, valColor }) => (
            <div key={label} style={{
              padding: "14px 16px",
              background: "#141414",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}>
              <div style={{
                fontSize: 9, color: "rgba(255,255,255,0.3)",
                fontWeight: 700, letterSpacing: "0.07em", marginBottom: 5,
              }}>
                {label.toUpperCase()}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: valColor ?? "#fff" }}>
                {val}
              </div>
            </div>
          ))}
        </div>

        {/* LSTM prediction box */}
        {train.prediction && (
          <div style={{
            margin: "12px 16px",
            padding: "12px 14px", borderRadius: 12,
            background: "rgba(74,222,128,0.05)",
            border: "1px solid rgba(74,222,128,0.15)",
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "center", marginBottom: 8,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 800,
                color: "rgba(74,222,128,0.8)", letterSpacing: "0.07em",
              }}>
                LSTM DELAY PREDICTION
              </span>
              <span style={{
                fontSize: 10, fontWeight: 800,
                background: "rgba(74,222,128,0.1)",
                border: "1px solid rgba(74,222,128,0.2)",
                borderRadius: 99, padding: "2px 8px", color: "#4ade80",
              }}>
                {typeof train.prediction.confidence === "number"
                  ? `${Math.min(100, Math.round(
                      train.prediction.confidence > 1
                        ? train.prediction.confidence
                        : train.prediction.confidence * 100
                    ))}%`
                  : "—"
                } confidence
              </span>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.55 }}>
              {train.prediction.explanation || "No explanation available."}
            </p>
            {train.prediction.predictedDelay > 0 && (
              <div style={{
                marginTop: 8, fontSize: 11, fontWeight: 700, color: "#f97316",
              }}>
                ⚠ Predicted additional delay: +{train.prediction.predictedDelay} min
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ padding: "4px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewSchedule(train);
            }}
            style={{
              width: "100%", padding: "11px 0", borderRadius: 12,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 700,
              cursor: "pointer",
            }}>
            📋 View Full Schedule
          </button>
          <button
            style={{
              width: "100%", padding: "11px 0", borderRadius: 12,
              background: "rgba(239,68,68,0.07)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "#f87171", fontSize: 13, fontWeight: 700,
              cursor: "pointer",
            }}>
            ⚠️ Flag for Manual Review
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────
export default function BlockMap() {
  const [trains,     setTrains]     = useState<Train[]>([]);
  const [hovered,    setHovered]    = useState<string | null>(null);
  const [selected,   setSelected]   = useState<Train | null>(null);
  const [schedTrain, setSchedTrain] = useState<Train | null>(null);
  const [expanded,   setExpanded]   = useState(false);

  // ── Firestore ────────────────────────────────────────────────
  useEffect(() => {
    const unsubT = onSnapshot(
      query(collection(db, "trains"), orderBy("trainNumber")),
      (snap) => {
        const data = snap.docs.map((d) => {
          const raw = d.data();
          // Try all possible field name variants defensively
          const rawConf =
            raw["aiConfidence"]    ??
            raw["aiConfidence85"]  ??
            raw["confidence"]      ??
            raw["lstm_confidence"] ??
            null;
          return {
            id:           d.id,
            trainNo:      raw.trainNumber  ?? d.id,
            name:         raw.name         ?? "",
            type:         raw.type         ?? "Express",
            currentBlock: normalizeBlock(raw.currentBlock ?? "B1"),
            speed:        raw.speed        ?? 0,
            direction:    raw.direction    ?? "up",
            delay:        raw.delayMinutes ?? 0,
            nextBlock:    normalizeBlock(raw.nextBlock ?? ""),
            priority:     raw.priority     ?? 1,
            status:       raw.status       ?? "on_time",
            prediction:   rawConf != null ? {
              // Handle both 85 (int) and 0.85 (decimal) formats
              confidence:     Math.min(100, Math.round(
                Number(rawConf) > 1
                  ? Number(rawConf)
                  : Number(rawConf) * 100
              )),
              explanation:    raw.aiExplanation  ?? "Train is running normally.",
              predictedDelay: raw.predictedDelay ?? 0,
              status:         raw.status         ?? "on_time",
              modelType:      "LSTM (pytorch)",
            } : undefined,
          } as Train;
        });
        const unique = data.filter((train, index, all) =>
          all.findIndex((candidate) => candidate.trainNo === train.trainNo) === index
        );
        setTrains(unique);
      },
      (err) => console.error("❌ trains snapshot error:", err)
    );

    return () => { unsubT(); };
  }, []);

  // ── Derived ──────────────────────────────────────────────────
  const displayTrains = useMemo(() => {
    const spreadSource = trains.map((train) => ({
      id: train.id,
      trainNumber: train.trainNo,
      name: train.name,
      currentBlock: train.currentBlock,
      nextBlock: train.nextBlock ?? "",
      delayMinutes: train.delay ?? 0,
      speed: train.speed,
      status: train.status,
    }));
    const spreadLookup = new Map(
      spreadTrainsAcrossCorridor(spreadSource).map((train) => [train.trainNumber, train])
    );
    return trains.map((train) => {
      const spreadTrain = spreadLookup.get(train.trainNo);
      return {
        ...train,
        currentBlock: spreadTrain?.currentBlock ?? train.currentBlock,
        nextBlock: spreadTrain?.nextBlock ?? train.nextBlock,
      };
    });
  }, [trains]);

  const fallbackSpreadActive = useMemo(
    () => isCompressedCorridor(
      trains.map((train) => ({
        id: train.id,
        trainNumber: train.trainNo,
        currentBlock: train.currentBlock,
        nextBlock: train.nextBlock ?? "",
      }))
    ),
    [trains]
  );

  const trainsByBlock = useMemo(() => {
    const map: Record<string, Train[]> = {};
    for (const t of displayTrains) {
      const b = normalizeBlock(t.currentBlock);
      if (!map[b]) map[b] = [];
      map[b].push(t);
      map[b].sort((a, b) => (b.delay ?? 0) - (a.delay ?? 0));
    }
    return map;
  }, [displayTrains]);

  const conflicts = useMemo(() => deriveLiveConflicts(
    displayTrains.map((train) => ({
      id: train.id,
      trainNumber: train.trainNo,
      name: train.name,
      currentBlock: train.currentBlock,
      nextBlock: train.nextBlock ?? "",
      delayMinutes: train.delay ?? 0,
      speed: train.speed,
      status: train.status,
    }))
  ), [displayTrains]);

  const conflictMap = useMemo(() => {
    const m = new Map<string, LiveConflict>();
    for (const c of conflicts) m.set(c.block, c);
    return m;
  }, [conflicts]);

  const activeCount      = trains.length;
  const delayedCount     = trains.filter((t) => normaliseStatus(t.status) !== "on-time").length;
  const conflictCount    = conflicts.length;
  const visibleConflicts = expanded ? conflicts : conflicts.slice(0, INITIAL_CONFLICT_ROWS);
  const hiddenCount      = conflictCount - INITIAL_CONFLICT_ROWS;
  const hoveredTrain     = hovered ? displayTrains.find((t) => t.trainNo === hovered) ?? null : null;

  // ── Schedule handler ─────────────────────────────────────────
  const handleViewSchedule = (train: Train) => {
    setSchedTrain(train);                     // mount schedule first
    setTimeout(() => setSelected(null), 50);  // then close detail
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <>
      {/* Detail modal — lower z-index (renders first in DOM) */}
      {selected && (
        <TrainDetailModal
          train={selected}
          onClose={() => setSelected(null)}
          onViewSchedule={handleViewSchedule}
        />
      )}

      {/* Schedule modal — higher in DOM = renders on top */}
      {schedTrain && (
        <TrainSchedule
          trainNo={schedTrain.trainNo}
          trainName={schedTrain.name ?? schedTrain.trainNo}
          onClose={() => setSchedTrain(null)}
        />
      )}

      <div style={{ padding: "20px 20px 16px 20px" }}>

        {/* ── Header ───────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "flex-start",
          justifyContent: "space-between", marginBottom: 20,
          flexWrap: "wrap", gap: 12,
        }}>
          <div>
            <h2 style={{
              fontWeight: 800, fontSize: 15, color: "#fff",
              marginBottom: 3, letterSpacing: "-0.01em",
            }}>
              Live Train Block Map
            </h2>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
              Section NDLS → GZB · {activeCount} train{activeCount !== 1 ? "s" : ""} · updates live
            </p>
            {fallbackSpreadActive && (
              <p style={{ fontSize: 10, color: "rgba(251,191,36,0.7)", marginTop: 4 }}>
                Visual spread fallback active while Firestore reseed is pending
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {[
              { val: activeCount,   label: "Active",    color: "rgba(255,255,255,0.9)", accent: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.1)"  },
              { val: delayedCount,  label: "Delayed",   color: "#f97316",              accent: "rgba(249,115,22,0.08)",  border: "rgba(249,115,22,0.2)"   },
              { val: conflictCount, label: "Conflicts", color: "#ef4444",              accent: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.2)"    },
            ].map(({ val, label, color, accent, border }) => (
              <div key={label} style={{
                textAlign: "center", padding: "7px 14px", borderRadius: 12,
                background: accent, border: `1px solid ${border}`, minWidth: 56,
              }}>
                <div style={{
                  fontSize: 20, fontWeight: 900, color,
                  fontVariantNumeric: "tabular-nums", lineHeight: 1,
                }}>
                  {val}
                </div>
                <div style={{
                  fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 700,
                  letterSpacing: "0.07em", marginTop: 3, textTransform: "uppercase",
                }}>
                  {label}
                </div>
              </div>
            ))}

            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 12px", borderRadius: 12,
              background: "rgba(74,222,128,0.07)",
              border: "1px solid rgba(74,222,128,0.2)",
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: "#4ade80", display: "inline-block",
                boxShadow: "0 0 0 3px rgba(74,222,128,0.25)",
                animation: "pulse-live 2s ease infinite",
              }} />
              <span style={{ fontSize: 10, fontWeight: 800, color: "#4ade80", letterSpacing: "0.08em" }}>
                LIVE
              </span>
            </div>
          </div>
        </div>

        {/* ── Legend ───────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { color: "#4ade80",               label: "On Time"  },
            { color: "#f97316",               label: "Delayed"  },
            { color: "#ef4444",               label: "Critical" },
            { color: "rgba(255,255,255,0.2)", label: "Clear"    },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: color, display: "inline-block",
                boxShadow: color !== "rgba(255,255,255,0.2)" ? `0 0 0 2px ${color}30` : "none",
              }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{label}</span>
            </div>
          ))}
          <span style={{
            marginLeft: "auto", fontSize: 11,
            color: "rgba(255,255,255,0.2)", fontStyle: "italic",
          }}>
            Click train for details
          </span>
        </div>

        {/* ── Track visualization ──────────────────────────── */}
        <div style={{ overflowX: "auto", paddingBottom: 4 }}>
          <div style={{ minWidth: 820, position: "relative" }}>

            {/* Train chips */}
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${BLOCKS.length}, 1fr)`,
              gap: 10,
              marginBottom: 12,
              minHeight: 154,
            }}>
              {BLOCKS.map((b) => {
                const blockTrains = trainsByBlock[b] ?? [];
                const visibleTrains = blockTrains.slice(0, 8);
                const hiddenTrainCount = Math.max(0, blockTrains.length - visibleTrains.length);
                return (
                  <div key={b} style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    alignItems: "stretch",
                    gap: 6,
                    padding: "10px 6px 8px",
                    borderRadius: 14,
                    minHeight: 154,
                    background: blockTrains.length
                      ? "linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.015) 100%)"
                      : "transparent",
                    border: blockTrains.length
                      ? "1px solid rgba(255,255,255,0.06)"
                      : "1px dashed rgba(255,255,255,0.03)",
                  }}>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      minHeight: 14,
                      padding: "0 2px",
                    }}>
                      <span style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        color: "rgba(255,255,255,0.22)",
                      }}>
                        {b}
                      </span>
                      {blockTrains.length > 0 && (
                        <span style={{
                          fontSize: 9,
                          fontWeight: 800,
                          color: "rgba(255,255,255,0.35)",
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 999,
                          padding: "1px 6px",
                        }}>
                          {blockTrains.length}
                        </span>
                      )}
                    </div>

                    {visibleTrains.map((t) => {
                      const st = normaliseStatus(t.status);
                      return (
                        <div
                          key={t.id}
                          onMouseEnter={() => setHovered(t.trainNo)}
                          onMouseLeave={() => setHovered(null)}
                          onClick={() => setSelected(t)}
                          style={{
                            display: "flex", alignItems: "center", gap: 3,
                            padding: "2px 7px", borderRadius: 7,
                            background: hovered === t.trainNo
                              ? `${STATUS_COLOR[st]}22`
                              : "rgba(0,0,0,0.55)",
                            border: `1px solid ${STATUS_COLOR[st]}50`,
                            cursor: "pointer", whiteSpace: "nowrap",
                            boxShadow: hovered === t.trainNo
                              ? `0 0 8px ${STATUS_GLOW[st]}`
                              : "none",
                            transition: "all 0.2s ease",
                          }}
                        >
                          <span style={{ fontSize: 8, color: STATUS_COLOR[st] }}>
                            {t.direction === "up" ? "▲" : "▼"}
                          </span>
                          <span style={{ fontSize: 9, fontWeight: 800, color: "#fff" }}>
                            {t.trainNo}
                          </span>
                        </div>
                      );
                    })}
                    {hiddenTrainCount > 0 && (
                      <div style={{
                        marginTop: 2,
                        fontSize: 9,
                        fontWeight: 800,
                        color: "rgba(255,255,255,0.45)",
                        textAlign: "center",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 7,
                        padding: "3px 6px",
                      }}>
                        +{hiddenTrainCount} more
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Station labels */}
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${BLOCKS.length}, 1fr)`,
              marginBottom: 10,
            }}>
              {BLOCKS.map((b) => (
                <div key={b} style={{ display: "flex", justifyContent: "center" }}>
                  {STATIONS[b] && (
                    <span style={{
                      fontSize: 10, fontWeight: 800,
                      color: STATIONS[b].isTerminal
                        ? "rgba(255,255,255,0.7)"
                        : "rgba(255,255,255,0.45)",
                      background: STATIONS[b].isTerminal
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(255,255,255,0.04)",
                      border: `1px solid ${STATIONS[b].isTerminal
                        ? "rgba(255,255,255,0.15)"
                        : "rgba(255,255,255,0.08)"}`,
                      borderRadius: 8, padding: "3px 10px",
                      whiteSpace: "nowrap", letterSpacing: "0.04em",
                    }}>
                      {STATIONS[b].label}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Track rail + nodes */}
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${BLOCKS.length}, 1fr)`,
              position: "relative", alignItems: "center",
              padding: "6px 0",
              background: "linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.02) 50%, transparent 100%)",
              borderRadius: 8,
            }}>
              {/* Rail lines */}
              <div style={{
                position: "absolute",
                top: "50%", left: "3%", right: "3%", height: 4,
                transform: "translateY(-50%)",
                background: "linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.30) 30%, rgba(255,255,255,0.30) 70%, rgba(255,255,255,0.06) 100%)",
                borderRadius: 99, zIndex: 0,
              }} />
              <div style={{
                position: "absolute",
                top: "calc(50% - 2px)", left: "3%", right: "3%", height: 1,
                transform: "translateY(-50%)",
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 30%, rgba(255,255,255,0.2) 70%, transparent 100%)",
                borderRadius: 99, zIndex: 0,
              }} />

              {/* Sleepers */}
              {[...Array(30)].map((_, i) => (
                <div key={i} style={{
                  position: "absolute",
                  top: "50%", left: `${(i / 30) * 94 + 3}%`,
                  width: 2, height: 12,
                  background: "rgba(255,255,255,0.13)",
                  transform: "translateY(-50%)",
                  borderRadius: 1, zIndex: 0,
                }} />
              ))}

              {/* Block nodes */}
              {BLOCKS.map((b) => {
                const blockTrains   = trainsByBlock[b] ?? [];
                const hasTrains     = blockTrains.length > 0;
                const blockConflict = conflictMap.get(b);
                const hasConflict   = !!blockConflict;
                const conflictColor = blockConflict
                  ? (SEVERITY_COLOR[blockConflict.severity] ?? "#fbbf24")
                  : "#ef4444";
                const isHovered     = blockTrains.some((t) => t.trainNo === hovered);
                const primaryStatus = normaliseStatus(blockTrains[0]?.status ?? "on-time");

                return (
                  <div
                    key={b}
                    onClick={() => blockTrains[0] && setSelected(blockTrains[0])}
                    style={{
                      display: "flex", flexDirection: "column",
                      alignItems: "center", position: "relative", zIndex: 1,
                      cursor: hasTrains ? "pointer" : "default",
                    }}
                  >
                    <div style={{
                      width:  hasConflict ? 44 : hasTrains ? 40 : 28,
                      height: hasConflict ? 44 : hasTrains ? 40 : 28,
                      borderRadius: "50%",
                      display: "grid", placeItems: "center",
                      background: hasConflict
                        ? `${conflictColor}28`
                        : hasTrains
                          ? `${STATUS_COLOR[primaryStatus]}18`
                          : "rgba(255,255,255,0.05)",
                      border: hasConflict
                        ? `2px solid ${conflictColor}`
                        : hasTrains
                          ? `2px solid ${STATUS_COLOR[primaryStatus]}`
                          : "1px solid rgba(255,255,255,0.14)",
                      boxShadow: isHovered
                        ? `0 0 0 4px ${STATUS_GLOW[primaryStatus]}, 0 0 16px ${STATUS_GLOW[primaryStatus]}`
                        : hasConflict
                          ? `0 0 14px ${conflictColor}88, 0 0 0 3px ${conflictColor}22`
                          : hasTrains
                            ? `0 0 10px ${STATUS_COLOR[primaryStatus]}40`
                            : "none",
                      transition: "all 0.3s cubic-bezier(0.16,1,0.3,1)",
                    }}>
                      {hasConflict ? (
                        <span style={{ fontSize: 16, filter: `drop-shadow(0 0 6px ${conflictColor})` }}>⚠️</span>
                      ) : hasTrains ? (
                        <span style={{ fontSize: 14 }}>🚂</span>
                      ) : (
                        <span style={{
                          width: 5, height: 5, borderRadius: "50%",
                          background: "rgba(255,255,255,0.2)", display: "inline-block",
                        }} />
                      )}
                    </div>
                    <div style={{ marginTop: 8, textAlign: "center" }}>
                      <div style={{
                        fontSize: 10, fontWeight: 700,
                        color: hasConflict
                          ? conflictColor
                          : hasTrains
                            ? "rgba(255,255,255,0.65)"
                            : "rgba(255,255,255,0.22)",
                      }}>{b}</div>
                      {hasConflict && (
                        <div style={{
                          fontSize: 8, color: conflictColor, fontWeight: 800,
                          letterSpacing: "0.05em", marginTop: 2,
                          animation: "blink 1.5s ease infinite",
                        }}>CONFLICT</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{
              textAlign: "center", marginTop: 12,
              fontSize: 10, color: "rgba(255,255,255,0.2)", letterSpacing: "0.05em",
            }}>
              → Direction of travel
            </div>
          </div>
        </div>

        {/* ── Hovered train strip ──────────────────────────── */}
        {hoveredTrain && !selected && (
          <div style={{
            marginTop: 14, padding: "10px 16px", borderRadius: 12,
            background: `${STATUS_COLOR[normaliseStatus(hoveredTrain.status)]}0d`,
            border: `1px solid ${STATUS_COLOR[normaliseStatus(hoveredTrain.status)]}30`,
            display: "flex", gap: 24, flexWrap: "wrap",
            animation: "fade-in 0.15s ease",
          }}>
            {([
              { label: "TRAIN",  val: hoveredTrain.trainNo,          color: undefined },
              { label: "TYPE",   val: hoveredTrain.type,             color: undefined },
              { label: "BLOCK",  val: hoveredTrain.currentBlock,     color: undefined },
              { label: "SPEED",  val: `${hoveredTrain.speed} km/h`, color: undefined },
              {
                label: "STATUS",
                val:   normaliseStatus(hoveredTrain.status).replace("-", " ").toUpperCase(),
                color: STATUS_COLOR[normaliseStatus(hoveredTrain.status)],
              },
              ...(hoveredTrain.delay
                ? [{ label: "DELAY", val: `+${hoveredTrain.delay} min`, color: "#f97316" }]
                : []
              ),
            ] as { label: string; val: string; color?: string }[]).map(({ label, val, color }) => (
              <div key={label}>
                <div style={{
                  fontSize: 9, color: "rgba(255,255,255,0.25)",
                  fontWeight: 700, letterSpacing: "0.07em", marginBottom: 3,
                }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: color ?? "rgba(255,255,255,0.7)" }}>
                  {val}
                </div>
              </div>
            ))}
            <div style={{ marginLeft: "auto", alignSelf: "center" }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
                Click for full details →
              </span>
            </div>
          </div>
        )}

        {/* ── Conflict rows ────────────────────────────────── */}
        {conflicts.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {visibleConflicts.map((c) => {
                const color = SEVERITY_COLOR[c.severity] ?? "#fbbf24";
                return (
                  <div key={c.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "7px 12px", borderRadius: 8,
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: color, flexShrink: 0,
                        boxShadow: `0 0 0 2px ${color}30`, display: "inline-block",
                      }} />
                      <span style={{
                        fontSize: 12, color: "rgba(255,255,255,0.65)",
                        whiteSpace: "nowrap", fontWeight: 600,
                      }}>
                        Block {c.block}
                      </span>
                      <span style={{
                        fontSize: 11, color: "rgba(255,255,255,0.3)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        — {c.trainA} vs {c.trainB} · Active conflict
                      </span>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 800, color,
                      background: `${color}15`, border: `1px solid ${color}30`,
                      borderRadius: 99, padding: "2px 8px", letterSpacing: "0.05em",
                      flexShrink: 0, marginLeft: 8, whiteSpace: "nowrap",
                    }}>OPEN</span>
                  </div>
                );
              })}
            </div>

            {conflictCount > INITIAL_CONFLICT_ROWS && (
              <button
                onClick={() => setExpanded((v) => !v)}
                style={{
                  width: "100%", marginTop: 6, padding: "8px 0",
                  borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  background: expanded ? "rgba(255,255,255,0.02)" : "rgba(96,165,250,0.07)",
                  border: `1px solid ${expanded ? "rgba(255,255,255,0.07)" : "rgba(96,165,250,0.2)"}`,
                  color: expanded ? "rgba(255,255,255,0.3)" : "#60a5fa",
                  transition: "all 0.2s ease",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                {expanded
                  ? <><span style={{ fontSize: 9 }}>▲</span> Collapse</>
                  : <><span style={{ fontSize: 9 }}>▼</span> View {hiddenCount} more conflict{hiddenCount !== 1 ? "s" : ""}</>
                }
              </button>
            )}
          </div>
        )}

        <style>{`
          @keyframes pulse-live {
            0%, 100% { opacity: 1; box-shadow: 0 0 0 3px rgba(74,222,128,0.25); }
            50%       { opacity: 0.7; box-shadow: 0 0 0 5px rgba(74,222,128,0.1); }
          }
          @keyframes blink {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.4; }
          }
          @keyframes fade-in {
            from { opacity: 0; transform: translateY(4px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes slide-up {
            from { opacity: 0; transform: translateY(16px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </>
  );
}
