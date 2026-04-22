import { useEffect, useState, useCallback } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useToast } from "./ToastProvider";
import type { DelayPrediction } from "../types";
import {
  dedupeTrainsByNumber,
  deriveLiveConflicts,
  spreadTrainsAcrossCorridor,
  type LiveConflict,
} from "../utils/liveConflicts";

interface ConflictPanelProps {
  delays: DelayPrediction[];
}


const SEVERITY_CONFIG = {
  high:   { dot: "#ef4444", label: "HIGH",   labelColor: "#ef4444", bg: "rgba(239,68,68,0.06)",   border: "rgba(239,68,68,0.15)"   },
  medium: { dot: "#f97316", label: "MEDIUM", labelColor: "#f97316", bg: "rgba(249,115,22,0.06)",  border: "rgba(249,115,22,0.15)"  },
  low:    { dot: "#fbbf24", label: "LOW",    labelColor: "#fbbf24", bg: "rgba(251,191,36,0.06)",  border: "rgba(251,191,36,0.15)"  },
};

// How many cards to show before "View more"
const INITIAL_VISIBLE = 3;

export default function ConflictPanel({ delays }: ConflictPanelProps) {
  const [conflicts,   setConflicts]  = useState<LiveConflict[]>([]);
  const [loading,     setLoading]    = useState(true);
  const [resolving,   setResolving]  = useState<string | null>(null);
  const [expanded,    setExpanded]   = useState(false);   // ← new
  const { showToast } = useToast();

  // ── Live conflict derivation ────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "trains"), (snap) => {
      const trains = dedupeTrainsByNumber(snap.docs.map((d) => ({
        id: d.id,
        trainNumber: String(d.data().trainNumber ?? d.id),
        name: d.data().name,
        currentBlock: String(d.data().currentBlock ?? "B1"),
        nextBlock: String(d.data().nextBlock ?? ""),
        delayMinutes: Number(d.data().delayMinutes ?? 0),
        speed: Number(d.data().speed ?? 0),
        status: d.data().status,
      })));
      setConflicts(deriveLiveConflicts(spreadTrainsAcrossCorridor(trains), delays));
      setLoading(false);
    }, (err) => {
      console.error("ConflictPanel error:", err);
      setLoading(false);
    });
    return () => unsub();
  }, [delays]);

  // ── Resolve ─────────────────────────────────────────────
  const resolve = useCallback(async (conflict: LiveConflict) => {
    if (resolving) return;
    setResolving(conflict.id);
    try {
      showToast("Conflict resolved", "success", `${conflict.trainA} ↔ ${conflict.trainB} at ${conflict.block}`);
    } catch (err) {
      showToast("Failed to resolve", "error", "Check console");
      console.error(err);
    } finally {
      setConflicts((prev) => prev.filter((item) => item.id !== conflict.id));
      setResolving(null);
    }
  }, [resolving, showToast]);

  const openCount   = conflicts.length;
  const visible     = expanded ? conflicts : conflicts.slice(0, INITIAL_VISIBLE);
  const hiddenCount = openCount - INITIAL_VISIBLE;

  // ── Skeleton ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-4 flex flex-col gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} style={{
            height: 90, borderRadius: 12,
            background: "rgba(255,255,255,0.04)",
            animation: `shimmer 1.5s ease ${i * 0.15}s infinite`,
          }} />
        ))}
        <style>{`@keyframes shimmer{0%,100%{opacity:.4}50%{opacity:.75}}`}</style>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-3">

      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-bold text-white text-base">Conflict Alerts</h2>
        {openCount > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 99,
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.2)",
            color: "#ef4444",
          }}>
            {openCount} open
          </span>
        )}
      </div>

      {/* Empty state */}
      {openCount === 0 && (
        <div className="py-10 text-center flex flex-col items-center gap-2">
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            background: "rgba(74,222,128,0.08)",
            border: "1px solid rgba(74,222,128,0.15)",
            display: "grid", placeItems: "center", fontSize: 20,
          }}>✅</div>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: 700, marginTop: 4 }}>
            No open conflicts
          </p>
          <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>
            AI is monitoring all blocks
          </p>
        </div>
      )}

      {/* Conflict cards — only `visible` subset rendered */}
      {visible.map((conflict) => {
        const cfg        = SEVERITY_CONFIG[conflict.severity] ?? SEVERITY_CONFIG.low;
        const isResolving = resolving === conflict.id;

        return (
          <div
            key={conflict.id}
            style={{
              borderRadius: 14, padding: "12px 14px",
              background: cfg.bg,
              border: `1px solid ${cfg.border}`,
              display: "flex", flexDirection: "column", gap: 8,
              transition: "opacity 0.3s ease",
              opacity: isResolving ? 0.5 : 1,
            }}
          >
            {/* Top row: severity + block */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: cfg.dot, flexShrink: 0,
                  boxShadow: `0 0 0 3px ${cfg.dot}22`,
                }} />
                <span style={{
                  fontSize: 10, fontWeight: 800,
                  color: cfg.labelColor, letterSpacing: "0.07em",
                }}>{cfg.label}</span>
              </div>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>
                Block {conflict.block}
              </span>
            </div>

            {/* Train pair */}
            <p style={{ fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: "0.01em" }}>
              {conflict.trainA} ↔ {conflict.trainB}
            </p>

            {/* Reason */}
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>
              {conflict.reason ?? `Both trains converging on Block ${conflict.block}`}
            </p>

            {/* Resolve button */}
            <button
              onClick={() => resolve(conflict)}
              disabled={!!resolving}
              style={{
                width: "100%", padding: "8px 0",
                borderRadius: 10, fontSize: 12, fontWeight: 700,
                cursor: resolving ? "not-allowed" : "pointer",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: isResolving ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (!resolving) {
                  (e.target as HTMLButtonElement).style.background = "rgba(74,222,128,0.1)";
                  (e.target as HTMLButtonElement).style.borderColor = "rgba(74,222,128,0.25)";
                  (e.target as HTMLButtonElement).style.color = "#4ade80";
                }
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
                (e.target as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.1)";
                (e.target as HTMLButtonElement).style.color = "rgba(255,255,255,0.7)";
              }}
            >
              {isResolving ? "Resolving…" : "✓ Mark as Resolved"}
            </button>
          </div>
        );
      })}

      {/* ── View more / Collapse toggle ── */}
      {openCount > INITIAL_VISIBLE && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            width: "100%", padding: "9px 0",
            borderRadius: 10, fontSize: 11, fontWeight: 700,
            cursor: "pointer",
            background: expanded ? "rgba(255,255,255,0.03)" : "rgba(96,165,250,0.07)",
            border: `1px solid ${expanded ? "rgba(255,255,255,0.08)" : "rgba(96,165,250,0.2)"}`,
            color: expanded ? "rgba(255,255,255,0.3)" : "#60a5fa",
            transition: "all 0.2s ease",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          {expanded ? (
            <>
              <span style={{ fontSize: 10 }}>▲</span> Collapse
            </>
          ) : (
            <>
              <span style={{ fontSize: 10 }}>▼</span>
              View {hiddenCount} more conflict{hiddenCount !== 1 ? "s" : ""}
            </>
          )}
        </button>
      )}
    </div>
  );
}
