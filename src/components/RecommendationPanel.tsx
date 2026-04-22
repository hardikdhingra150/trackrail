import { useEffect, useState, useCallback, useMemo } from "react";
import {
  collection, onSnapshot, query, orderBy,
  doc, deleteDoc, getDocs, writeBatch,
} from "firebase/firestore";
import { db }           from "../lib/firebase";
import { saveFeedback } from "../utils/rlFeedback";
import { useToast }     from "./ToastProvider";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth }         from "../lib/firebase";
import type { DelayPrediction } from "../types";
import {
  dedupeTrainsByNumber,
  deriveLiveConflicts,
  spreadTrainsAcrossCorridor,
  type LiveConflict,
} from "../utils/liveConflicts";

// ── Types ──────────────────────────────────────────────────────
interface Recommendation {
  id:                  string;
  rank:                number;
  actionType:          string;
  conflictId:          string;
  holdBlock:           string;
  affectedTrains:      number;
  estimatedDelaySaved: number;
  explanation:         string;
  confidence:          number;
  createdAt:           any;
  source?:             "remote" | "local";
}
interface RecommendationPanelProps {
  delays: DelayPrediction[];
}

// ── Config ─────────────────────────────────────────────────────
const ACTION_CONFIG: Record<string, {
  bg: string; border: string; text: string; icon: string; label: string;
}> = {
  hold:    { bg: "rgba(74,222,128,0.08)",  border: "rgba(74,222,128,0.25)",  text: "#4ade80", icon: "⏸", label: "HOLD"    },
  slow:    { bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.25)",  text: "#fbbf24", icon: "🐢", label: "SLOW"    },
  reroute: { bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.25)",  text: "#60a5fa", icon: "↩", label: "REROUTE" },
};

// How many cards to show before "View more" button
const PREVIEW_COUNT = 3;

// ── Dedup logic ────────────────────────────────────────────────
function dedupeRecs(recs: Recommendation[]): Recommendation[] {
  const sorted = [...recs].sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() ?? a.createdAt ?? 0;
    const tb = b.createdAt?.toMillis?.() ?? b.createdAt ?? 0;
    return tb - ta;
  });
  const seen   = new Set<string>();
  const result: Recommendation[] = [];
  for (const rec of sorted) {
    const key = `${rec.actionType}|${rec.holdBlock}|${rec.conflictId}`;
    if (!seen.has(key)) { seen.add(key); result.push(rec); }
  }
  return result.sort((a, b) => a.rank - b.rank);
}

function buildLocalRecommendations(conflicts: LiveConflict[], delays: DelayPrediction[]): Recommendation[] {
  if (conflicts.length === 0) return [];

  const delayLookup = new Map(
    delays.map((delay) => [delay.train_number, Math.max(0, delay.average_delay_minutes ?? 0)])
  );
  const severityMultiplier: Record<LiveConflict["severity"], number> = {
    high: 1.45,
    medium: 1.15,
    low: 0.9,
  };

  return conflicts.flatMap((conflict) => {
    const baseDelay = Math.max(
      4,
      Math.round(
        (
          (delayLookup.get(conflict.trainA) ?? 6) +
          (delayLookup.get(conflict.trainB) ?? 4)
        ) / 2
      )
    );
    const weightedDelay = Math.round(baseDelay * severityMultiplier[conflict.severity]);
    const blockLabel = conflict.block || "B1";

    return [
      {
        id: `local:${conflict.id}:hold`,
        rank: 1,
        actionType: "hold",
        conflictId: conflict.id,
        holdBlock: blockLabel,
        affectedTrains: 2,
        estimatedDelaySaved: Math.max(3, weightedDelay + 4),
        explanation: `Hold ${conflict.trainB} at Block ${blockLabel} briefly so ${conflict.trainA} can clear the section first and remove the immediate block contention.`,
        confidence: conflict.severity === "high" ? 92 : conflict.severity === "medium" ? 86 : 79,
        createdAt: Date.now(),
        source: "local",
      },
      {
        id: `local:${conflict.id}:slow`,
        rank: 2,
        actionType: "slow",
        conflictId: conflict.id,
        holdBlock: blockLabel,
        affectedTrains: 2,
        estimatedDelaySaved: Math.max(2, weightedDelay),
        explanation: `Reduce approach speed into Block ${blockLabel} to create natural spacing without a full stop, lowering conflict risk while keeping throughput steady.`,
        confidence: conflict.severity === "high" ? 81 : 76,
        createdAt: Date.now(),
        source: "local",
      },
      {
        id: `local:${conflict.id}:reroute`,
        rank: 3,
        actionType: "reroute",
        conflictId: conflict.id,
        holdBlock: blockLabel,
        affectedTrains: 2,
        estimatedDelaySaved: Math.max(1, Math.round(weightedDelay * 0.7)),
        explanation: `Reroute one train around Block ${blockLabel} if an alternate path is available to avoid compounding downstream delay.`,
        confidence: conflict.severity === "high" ? 70 : 66,
        createdAt: Date.now(),
        source: "local",
      },
    ];
  });
}

// ── Confidence bar ─────────────────────────────────────────────
function ConfidenceBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ marginTop: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontWeight: 700, letterSpacing: "0.06em" }}>
          AI CONFIDENCE
        </span>
        <span style={{ fontSize: 9, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>
          {value}%
        </span>
      </div>
      <div style={{ height: 3, borderRadius: 99, background: "rgba(255,255,255,0.06)" }}>
        <div style={{
          height: "100%", borderRadius: 99,
          width: `${value}%`, background: color,
          transition: "width 0.6s ease",
        }} />
      </div>
    </div>
  );
}

// ── Accept rate badge ──────────────────────────────────────────
function AcceptRateBadge({ applied, total }: { applied: number; total: number }) {
  if (total === 0) return null;
  const pct   = Math.round((applied / total) * 100);
  const color = pct >= 70 ? "#4ade80" : pct >= 40 ? "#fbbf24" : "#f87171";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 5,
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 99, padding: "3px 10px",
    }}>
      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontWeight: 700, letterSpacing: "0.06em" }}>
        ACCEPTED
      </span>
      <span style={{ fontSize: 11, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>
        {applied}/{total}
      </span>
      <span style={{ fontSize: 9, color, fontWeight: 700 }}>{pct}%</span>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="text-center py-10 flex flex-col items-center gap-2">
      <div style={{
        width: 48, height: 48, borderRadius: "50%",
        background: "rgba(74,222,128,0.08)",
        border: "1px solid rgba(74,222,128,0.15)",
        display: "grid", placeItems: "center", fontSize: 22,
        animation: "float 3s ease-in-out infinite",
      }}>✅</div>
      <p style={{ color: "rgba(255,255,255,0.5)", fontWeight: 700, fontSize: 13, marginTop: 6 }}>
        All conflicts resolved
      </p>
      <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>
        Section running smoothly — AI is monitoring
      </p>
    </div>
  );
}

// ── Skeleton loader ────────────────────────────────────────────
function SkeletonCards() {
  return (
    <div className="flex flex-col gap-4">
      {[...Array(2)].map((_, g) => (
        <div key={g}>
          <div style={{ height: 20, width: 180, borderRadius: 8, marginBottom: 12,
            background: "rgba(255,255,255,0.05)", animation: "shimmer 1.5s ease infinite" }} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} style={{ height: 160, borderRadius: 14,
                background: "rgba(255,255,255,0.04)", animation: `shimmer 1.5s ease ${i * 0.15}s infinite` }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Card component ─────────────────────────────────────────────
function RecCard({
  item, colors, isApplied, isDismissed, isApplying, applying,
  onApply, onDismiss,
}: {
  item: Recommendation;
  colors: typeof ACTION_CONFIG[string];
  isApplied: boolean; isDismissed: boolean; isApplying: boolean; applying: string | null;
  onApply: () => void; onDismiss: () => void;
}) {
  return (
    <div style={{
      borderRadius: 14, padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 10,
      background: isApplied ? "rgba(74,222,128,0.04)" : colors.bg,
      border: `1px solid ${isApplied ? "rgba(74,222,128,0.2)" : colors.border}`,
      opacity:       isDismissed ? 0   : 1,
      transform:     isDismissed ? "scale(0.95) translateY(-4px)" : "scale(1)",
      transition:    "all 0.35s cubic-bezier(0.16,1,0.3,1)",
      pointerEvents: isDismissed ? "none" : "auto",
    }}>
      {/* Rank + action type */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{
            width: 24, height: 24, borderRadius: 8,
            display: "grid", placeItems: "center",
            fontSize: 11, fontWeight: 900,
            background: isApplied ? "rgba(74,222,128,0.1)" : colors.border,
            color:      isApplied ? "#4ade80" : colors.text,
          }}>{item.rank}</span>
          <span style={{ fontSize: 13 }}>{colors.icon}</span>
          <span style={{
            fontSize: 11, fontWeight: 800,
            textTransform: "uppercase", letterSpacing: "0.07em",
            color: isApplied ? "#4ade80" : colors.text,
          }}>{colors.label}</span>
        </div>
        {item.rank === 1 && !isApplied && (
          <span style={{
            fontSize: 10,
            background: "rgba(251,191,36,0.1)",
            border: "1px solid rgba(251,191,36,0.2)",
            borderRadius: 99, padding: "1px 7px",
            color: "#fbbf24", fontWeight: 700,
          }}>⭐ Best</span>
        )}
        {isApplied && (
          <span style={{
            fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 99,
            background: "rgba(74,222,128,0.1)",
            border: "1px solid rgba(74,222,128,0.2)",
            color: "#4ade80",
          }}>✓ Applied</span>
        )}
      </div>

      {/* Explanation */}
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", lineHeight: 1.55, flex: 1 }}>
        {item.explanation}
      </p>

      {/* Confidence bar */}
      <ConfidenceBar value={item.confidence ?? 80} color={colors.text} />

      {/* Stats row */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        borderTop: `1px solid ${isApplied ? "rgba(74,222,128,0.1)" : colors.border}`,
        paddingTop: 8, fontSize: 11, color: "rgba(255,255,255,0.4)",
      }}>
        <span>
          <span style={{ fontWeight: 800, color: isApplied ? "#4ade80" : colors.text }}>
            -{item.estimatedDelaySaved} min
          </span> saved
        </span>
        <span>{item.affectedTrains} train{item.affectedTrains !== 1 ? "s" : ""}</span>
      </div>

      {/* Action buttons */}
      {!isApplied && !isDismissed && (
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={onApply}
            disabled={!!applying}
            style={{
              flex: 1,
              background: isApplying ? colors.border : colors.bg,
              border: `1px solid ${colors.border}`,
              color: colors.text, borderRadius: 10,
              padding: "8px 0", fontSize: 11, fontWeight: 700,
              cursor: applying ? "not-allowed" : "pointer",
              opacity: applying && !isApplying ? 0.5 : 1,
              transition: "all 0.2s ease",
            }}>
            {isApplying ? "Applying…" : "✓ Apply"}
          </button>
          <button
            onClick={onDismiss}
            title="Dismiss — saves negative RL feedback"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.25)",
              borderRadius: 10, padding: "8px 10px",
              fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────
export default function RecommendationPanel({ delays }: RecommendationPanelProps) {
  const [items,          setItems]          = useState<Recommendation[]>([]);
  const [conflicts,      setConflicts]      = useState<LiveConflict[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [conflictsReady, setConflictsReady] = useState(false);
  const [applying,       setApplying]       = useState<string | null>(null);
  const [applied,        setApplied]        = useState<Set<string>>(new Set());
  const [dismissed,      setDismissed]      = useState<Set<string>>(new Set());
  const [sessionApplied, setSessionApplied] = useState(0);
  const [sessionTotal,   setSessionTotal]   = useState(0);
  const [showAll,        setShowAll]        = useState(false);  // partial expand
  const { showToast }                       = useToast();
  const [user, loadingAuth]                 = useAuthState(auth);
  const hasRemoteItems                      = items.some((item) => item.source === "remote");

  useEffect(() => {
    if (!loadingAuth && !user) setLoading(false);
  }, [loadingAuth, user]);

  // ── Firestore subscription ─────────────────────────────────
  useEffect(() => {
    if (loadingAuth || !user) return;
    const q = query(collection(db, "recommendations"), orderBy("rank", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const now = Date.now();
      const raw = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Recommendation))
        .filter((r) => {
          const age = now - (r.createdAt?.toMillis?.() ?? 0);
          return age < 5 * 60 * 1000;
        });
      setItems(dedupeRecs(raw).map((item) => ({ ...item, source: "remote" })));
      setLoading(false);
    }, (err) => {
      console.error("RecommendationPanel snapshot error:", err);
      setLoading(false);
    });
    return () => unsub();
  }, [user, loadingAuth]);

  useEffect(() => {
    if (loadingAuth || !user) return;
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
      setConflictsReady(true);
    }, (err) => {
      console.error("RecommendationPanel conflicts snapshot error:", err);
      setConflictsReady(true);
    });
    return () => unsub();
  }, [user, loadingAuth, delays]);

  // ── Auto-delete stale recs ─────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const cleanup = async () => {
      const cutoff = Date.now() - 5 * 60 * 1000;
      const snap   = await getDocs(collection(db, "recommendations"));
      const stale  = snap.docs.filter((d) => {
        const ts = d.data().createdAt?.toMillis?.() ?? 0;
        return ts < cutoff;
      });
      if (stale.length === 0) return;
      const batch = writeBatch(db);
      stale.forEach((d) => batch.delete(doc(db, "recommendations", d.id)));
      await batch.commit();
      console.log(`🗑 Cleaned ${stale.length} stale recommendations`);
    };
    cleanup();
    const t = setInterval(cleanup, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [user]);

  // ── Apply ──────────────────────────────────────────────────
  const applyRecommendation = useCallback(async (item: Recommendation) => {
    if (!user || applied.has(item.id) || applying) return;
    setApplying(item.id);
    try {
      await saveFeedback({
        recommendationId:   item.id,
        conflictId:         item.conflictId ?? "unknown",
        actionType:         item.actionType,
        aiSuggestedDelay:   item.estimatedDelaySaved,
        actualDelaySaved:   item.estimatedDelaySaved,
        controllerApproved: true,
        trainCount:         item.affectedTrains,
        blockId:            item.holdBlock ?? "—",
        severity:           item.rank === 1 ? "high" : item.rank === 2 ? "medium" : "low",
        controllerId:       user.uid,
      });
      setApplied((prev)    => new Set(prev).add(item.id));
      setSessionApplied((n) => n + 1);
      setSessionTotal((n)   => n + 1);
      showToast(
        `${item.actionType.toUpperCase()} applied`,
        "success",
        `AI saved ~${item.estimatedDelaySaved} min · RL agent updated`
      );
      if (item.source !== "local") {
        setTimeout(() => deleteDoc(doc(db, "recommendations", item.id)), 2500);
      }
    } catch (err) {
      showToast("Failed to apply", "error", "Check console for details");
      console.error(err);
    } finally {
      setApplying(null);
    }
  }, [user, applied, applying, showToast, conflicts]);

  // ── Dismiss ────────────────────────────────────────────────
  const dismissRecommendation = useCallback(async (item: Recommendation) => {
    if (!user || dismissed.has(item.id)) return;
    setDismissed((prev) => new Set(prev).add(item.id));
    setSessionTotal((n)  => n + 1);
    try {
      await saveFeedback({
        recommendationId:   item.id,
        conflictId:         item.conflictId ?? "unknown",
        actionType:         item.actionType,
        aiSuggestedDelay:   item.estimatedDelaySaved,
        controllerApproved: false,
        trainCount:         item.affectedTrains,
        blockId:            item.holdBlock ?? "—",
        severity:           item.rank === 1 ? "high" : item.rank === 2 ? "medium" : "low",
        controllerId:       user.uid,
      });
      showToast("Dismissed", "info", `${item.actionType.toUpperCase()} negative feedback saved`);
      if (item.source !== "local") {
        setTimeout(() => deleteDoc(doc(db, "recommendations", item.id)), 400);
      }
    } catch (err) {
      setDismissed((prev) => { const s = new Set(prev); s.delete(item.id); return s; });
      console.error(err);
    }
  }, [user, dismissed, showToast]);

  // ── Dismiss all ────────────────────────────────────────────
  const dismissAll = useCallback(async () => {
    const pending = items.filter((r) => !applied.has(r.id) && !dismissed.has(r.id));
    if (pending.length === 0) return;
    for (const item of pending) await dismissRecommendation(item);
  }, [items, applied, dismissed, dismissRecommendation]);

  useEffect(() => {
    if (hasRemoteItems) return;
    if (!conflictsReady) return;
    setItems(buildLocalRecommendations(conflicts, delays));
  }, [hasRemoteItems, conflicts, delays, conflictsReady]);

  // ── Derived ────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const visible = items.filter((r) => !dismissed.has(r.id));
    return visible.reduce<Record<string, Recommendation[]>>((acc, r) => {
      const key = r.conflictId ?? "unknown";
      if (!acc[key]) acc[key] = [];
      acc[key].push(r);
      return acc;
    }, {});
  }, [items, dismissed]);

  const totalPending = useMemo(
    () => items.filter((r) => !applied.has(r.id) && !dismissed.has(r.id)).length,
    [items, applied, dismissed]
  );

  const totalSavable = useMemo(
    () => items
      .filter((r) => !applied.has(r.id) && !dismissed.has(r.id))
      .reduce((s, r) => s + (r.estimatedDelaySaved ?? 0), 0),
    [items, applied, dismissed]
  );

  const conflictIds = Object.keys(grouped);

  const totalCards = useMemo(
    () => conflictIds.reduce((sum, id) => sum + grouped[id].length, 0),
    [conflictIds, grouped]
  );
  const hiddenCount = Math.max(0, totalCards - PREVIEW_COUNT);

  // ── Auth / loading shell ───────────────────────────────────
  if (loadingAuth || loading) {
    return (
      <div className="rounded-2xl p-5"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <SkeletonCards />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-2xl p-5"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <p className="text-sm text-center py-10" style={{ color: "rgba(255,255,255,0.3)" }}>
          Please log in to view recommendations.
        </p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div
      className="rounded-2xl"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          {totalPending > 0 && (
            <span style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              display: "inline-block", background: "#ef4444",
              boxShadow: "0 0 0 3px rgba(239,68,68,0.2)",
              animation: "ping-soft 2s ease infinite",
            }} />
          )}
          <div>
            <h2 className="font-bold text-white" style={{ fontSize: 13 }}>
              AI Recommendations
            </h2>
            <p style={{ fontSize: 10, marginTop: 1, color: "rgba(255,255,255,0.3)" }}>
              {totalPending > 0
                ? `${totalPending} pending · ~${totalSavable} min savable`
                : "All recommendations actioned ✅"}
            </p>
          </div>
          <div style={{
            fontSize: 9, fontWeight: 700,
            padding: "2px 8px", borderRadius: 99,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.09)",
            color: "rgba(255,255,255,0.35)",
            letterSpacing: "0.05em",
          }}>MILP + RL</div>
        </div>

        <div className="flex items-center gap-2">
          <AcceptRateBadge applied={sessionApplied} total={sessionTotal} />
          {totalPending > 1 && (
            <button
              onClick={dismissAll}
              style={{
                fontSize: 10, fontWeight: 700,
                padding: "4px 10px", borderRadius: 99, cursor: "pointer",
                background: "rgba(248,113,113,0.07)",
                border: "1px solid rgba(248,113,113,0.15)",
                color: "rgba(248,113,113,0.7)",
                letterSpacing: "0.05em",
              }}>
              DISMISS ALL
            </button>
          )}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────── */}
      <div style={{
        borderTop: "1px solid rgba(255,255,255,0.06)",
        padding: "14px 16px 0",
      }}>
        {conflictIds.length === 0 && <EmptyState />}

        <div className="flex flex-col gap-6">
          {conflictIds.map((conflictId, groupIdx) => {
            const recs         = grouped[conflictId];
            const firstRec     = recs[0];
            const groupSavable = recs.reduce((s, r) => s + (r.estimatedDelaySaved ?? 0), 0);

            // how many cards have been rendered in previous groups
            const cardsBefore = conflictIds
              .slice(0, groupIdx)
              .reduce((sum, id) => sum + grouped[id].length, 0);

            // skip entire group if it starts beyond preview limit
            if (!showAll && cardsBefore >= PREVIEW_COUNT) return null;

            return (
              <div key={conflictId}>
                {/* Conflict group header */}
                <div className="flex items-center gap-2 mb-3">
                  <span style={{
                    fontSize: 10, fontWeight: 800, color: "#ef4444",
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    borderRadius: 99, padding: "2px 8px", letterSpacing: "0.06em",
                  }}>CONFLICT</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
                    Block {firstRec?.holdBlock ?? "—"}
                  </span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
                    {recs.length} option{recs.length !== 1 ? "s" : ""}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "rgba(251,191,36,0.7)" }}>
                    up to -{groupSavable} min savable
                  </span>
                </div>

                {/* Cards grid — trim partial last group */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {recs.map((item, cardIdx) => {
                    const globalIdx = cardsBefore + cardIdx;
                    if (!showAll && globalIdx >= PREVIEW_COUNT) return null;

                    const colors      = ACTION_CONFIG[item.actionType] ?? ACTION_CONFIG.hold;
                    const isApplied   = applied.has(item.id);
                    const isDismissed = dismissed.has(item.id);
                    const isApplying  = applying === item.id;

                    return (
                      <RecCard
                        key={item.id}
                        item={item}
                        colors={colors}
                        isApplied={isApplied}
                        isDismissed={isDismissed}
                        isApplying={isApplying}
                        applying={applying}
                        onApply={() => applyRecommendation(item)}
                        onDismiss={() => dismissRecommendation(item)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Show more / show less ─────────────────────── */}
        {hiddenCount > 0 && (
          <div style={{ position: "relative", marginTop: 4 }}>
            {/* Fade gradient when collapsed */}
            {!showAll && (
              <div style={{
                position: "absolute", bottom: "100%", left: 0, right: 0, height: 72,
                background: "linear-gradient(to bottom, transparent, rgba(14,14,16,0.96))",
                pointerEvents: "none",
              }} />
            )}
            <div style={{
              display: "flex", justifyContent: "center",
              padding: "10px 0 16px",
            }}>
              <button
                onClick={() => setShowAll((v) => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
                  padding: "7px 20px", borderRadius: 99, cursor: "pointer",
                  background: showAll ? "rgba(255,255,255,0.04)" : "rgba(96,165,250,0.07)",
                  border: `1px solid ${showAll ? "rgba(255,255,255,0.08)" : "rgba(96,165,250,0.2)"}`,
                  color: showAll ? "rgba(255,255,255,0.35)" : "#60a5fa",
                  transition: "all 0.2s ease",
                }}>
                <span style={{
                  display: "inline-block", fontSize: 8,
                  transform: showAll ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.25s ease",
                }}>▼</span>
                {showAll
                  ? "Show less"
                  : `View ${hiddenCount} more recommendation${hiddenCount !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes shimmer {
          0%,100% { opacity: 0.4; }
          50%      { opacity: 0.75; }
        }
        @keyframes ping-soft {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
