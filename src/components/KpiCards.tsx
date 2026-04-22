import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { dedupeTrainsByNumber, deriveLiveConflicts, spreadTrainsAcrossCorridor } from "../utils/liveConflicts";

// ── Types ─────────────────────────────────────────────────────
interface KpiData {
  activeTrains:     number;
  avgDelay:         number;
  onTimePercent:    number;
  openConflicts:    number;
  criticalTrains:   number;
  totalDelaySaved:  number;
}
// ── Animated counter hook ─────────────────────────────────────
function useAnimatedValue(target: number, decimals = 0) {
  const [display, setDisplay] = useState(target);
  const prev                  = useRef(target);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    const from     = prev.current;
    const to       = target;
    const duration = 600;
    const start    = performance.now();

    const step = (now: number) => {
      const t       = Math.min((now - start) / duration, 1);
      const eased   = 1 - Math.pow(1 - t, 3); // ease-out-cubic
      const current = from + (to - from) * eased;
      setDisplay(parseFloat(current.toFixed(decimals)));
      if (t < 1) raf.current = requestAnimationFrame(step);
      else { prev.current = to; setDisplay(to); }
    };

    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, decimals]);

  return display;
}

// ── Trend arrow ───────────────────────────────────────────────
function Trend({ current, previous, invert = false }: {
  current: number; previous: number; invert?: boolean;
}) {
  if (previous === 0 || current === previous) return null;
  const up      = current > previous;
  const good    = invert ? !up : up;
  const pct     = Math.abs(Math.round(((current - previous) / Math.max(previous, 1)) * 100));
  const color   = good ? "#4ade80" : "#f87171";
  const arrow   = up ? "↑" : "↓";
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color, marginLeft: 4 }}>
      {arrow} {pct}%
    </span>
  );
}

// ── Single KPI card ───────────────────────────────────────────
function KpiCard({
  label, value, displayValue, sub, accent, bg, border,
  pulse = false, trend, prevValue, invertTrend = false, icon,
}: {
  label: string; value: number; displayValue: string;
  sub: string; accent: string; bg: string; border: string;
  pulse?: boolean; trend?: boolean; prevValue?: number;
  invertTrend?: boolean; icon: string;
}) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-1"
      style={{
        background:  bg,
        border:      `1px solid ${border}`,
        transition:  "all 0.4s ease",
        position:    "relative",
        overflow:    "hidden",
      }}
    >
      {/* Pulse glow for critical state */}
      {pulse && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: "inherit",
          border: `1px solid ${accent}`,
          animation: "kpi-pulse 2s ease-in-out infinite",
          pointerEvents: "none",
        }} />
      )}

      {/* Icon + label row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "rgba(255,255,255,0.35)" }}>
          {label}
        </p>
        <span style={{ fontSize: 14, opacity: 0.6 }}>{icon}</span>
      </div>

      {/* Value + trend */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
        <p style={{
          fontSize: "clamp(1.8rem, 3vw, 2.4rem)",
          fontWeight: 900, lineHeight: 1,
          color: accent, fontVariantNumeric: "tabular-nums",
        }}>
          {displayValue}
        </p>
        {trend && prevValue !== undefined && (
          <Trend current={value} previous={prevValue} invert={invertTrend} />
        )}
      </div>

      {/* Sub */}
      <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>{sub}</p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function KpiCards() {
  const [kpi, setKpi] = useState<KpiData>({
    activeTrains:    0,
    avgDelay:        0,
    onTimePercent:   0,
    openConflicts:   0,
    criticalTrains:  0,
    totalDelaySaved: 0,
  });

  // Previous snapshot for trend arrows
  const prevKpi = useRef<KpiData>(kpi);
  useEffect(() => {
    const t = setTimeout(() => { prevKpi.current = kpi; }, 700);
    return () => clearTimeout(t);
  }, [kpi]);

  // ── Trains listener ──────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "trains"), (snap) => {
      const trains = dedupeTrainsByNumber(snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          trainNumber: String(data.trainNumber ?? d.id),
          name: typeof data.name === "string" ? data.name : undefined,
          currentBlock: String(data.currentBlock ?? "B1"),
          nextBlock: String(data.nextBlock ?? ""),
          delayMinutes: Number(data.delayMinutes ?? 0),
          speed: Number(data.speed ?? 0),
          status: String(data.status ?? "on_time"),
        };
      }));
      const displayTrains = spreadTrainsAcrossCorridor(trains);
      const total  = trains.length;
      if (total === 0) {
        setKpi((prev) => ({
          ...prev,
          activeTrains: 0,
          avgDelay: 0,
          onTimePercent: 0,
          criticalTrains: 0,
          openConflicts: 0,
        }));
        return;
      }
      const totalDelay    = trains.reduce((s, t) => s + (t.delayMinutes ?? 0), 0);
      const onTime        = trains.filter((t) => (t.delayMinutes ?? 0) === 0).length;
      const criticalCount = trains.filter((t) => t.status === "critical").length;
      const openConflicts = deriveLiveConflicts(displayTrains).length;

      setKpi((prev) => ({
        ...prev,
        activeTrains:   total,
        avgDelay:       parseFloat((totalDelay / total).toFixed(1)),
        onTimePercent:  Math.round((onTime / total) * 100),
        criticalTrains: criticalCount,
        openConflicts,
      }));
    });
    return () => unsub();
  }, []);

  // ── RL feedback — total delay saved ─────────────────────
  useEffect(() => {
    const q = query(
      collection(db, "rl_feedback"),
      where("controllerApproved", "==", true)
    );
    const unsub = onSnapshot(q, (snap) => {
      const total = snap.docs.reduce((s, d) => {
        const data = d.data();
        return s + (data.actualDelaySaved ?? data.aiSuggestedDelay ?? 0);
      }, 0); // ← add this
      setKpi((prev) => ({ ...prev, totalDelaySaved: Math.round(total) }));
    });
    return () => unsub();
  }, []);

  // ── Animated display values ──────────────────────────────
  const animTrains    = useAnimatedValue(kpi.activeTrains);
  const animDelay     = useAnimatedValue(kpi.avgDelay, 1);
  const animOnTime    = useAnimatedValue(kpi.onTimePercent);
  const animConflicts = useAnimatedValue(kpi.openConflicts);
  const animCritical  = useAnimatedValue(kpi.criticalTrains);
  const animSaved     = useAnimatedValue(kpi.totalDelaySaved);

  const cards = [
    {
      label:       "Active Trains",
      value:       kpi.activeTrains,
      displayValue: animTrains.toString(),
      sub:         "in section NDLS-GZB",
      accent:      "#ffffff",
      bg:          "rgba(255,255,255,0.04)",
      border:      "rgba(255,255,255,0.08)",
      icon:        "🚂",
      trend:       true,
      invertTrend: false,
    },
    {
      label:       "Avg Delay",
      value:       kpi.avgDelay,
      displayValue: animDelay.toFixed(1),
      sub:         "minutes per train",
      accent:      kpi.avgDelay > 10 ? "#f87171" : kpi.avgDelay > 5 ? "#fb923c" : "#4ade80",
      bg:          kpi.avgDelay > 5  ? "rgba(251,146,60,0.06)"   : "rgba(74,222,128,0.06)",
      border:      kpi.avgDelay > 5  ? "rgba(251,146,60,0.15)"   : "rgba(74,222,128,0.15)",
      icon:        "⏱",
      trend:       true,
      invertTrend: true, // lower is better
    },
    {
      label:       "On-Time",
      value:       kpi.onTimePercent,
      displayValue: `${animOnTime}%`,
      sub:         "of trains on schedule",
      accent:      kpi.onTimePercent >= 80 ? "#4ade80" : kpi.onTimePercent >= 50 ? "#fb923c" : "#f87171",
      bg:          kpi.onTimePercent >= 80 ? "rgba(74,222,128,0.06)"  : "rgba(251,146,60,0.06)",
      border:      kpi.onTimePercent >= 80 ? "rgba(74,222,128,0.15)"  : "rgba(251,146,60,0.15)",
      icon:        "✅",
      trend:       true,
      invertTrend: false,
    },
    {
      label:       "Open Conflicts",
      value:       kpi.openConflicts,
      displayValue: animConflicts.toString(),
      sub:         "need action",
      accent:      kpi.openConflicts > 0 ? "#f87171" : "#4ade80",
      bg:          kpi.openConflicts > 0 ? "rgba(248,113,113,0.06)" : "rgba(74,222,128,0.06)",
      border:      kpi.openConflicts > 0 ? "rgba(248,113,113,0.15)" : "rgba(74,222,128,0.15)",
      icon:        "⚠️",
      pulse:       kpi.openConflicts > 3,
      trend:       true,
      invertTrend: true,
    },
    {
      label:       "Critical Trains",
      value:       kpi.criticalTrains,
      displayValue: animCritical.toString(),
      sub:         "delay > 10 min",
      accent:      kpi.criticalTrains > 0 ? "#f87171" : "#4ade80",
      bg:          kpi.criticalTrains > 0 ? "rgba(248,113,113,0.06)" : "rgba(74,222,128,0.06)",
      border:      kpi.criticalTrains > 0 ? "rgba(248,113,113,0.15)" : "rgba(74,222,128,0.15)",
      icon:        "🚨",
      pulse:       kpi.criticalTrains > 2,
      trend:       true,
      invertTrend: true,
    },
    {
      label:       "Delay Saved",
      value:       kpi.totalDelaySaved,
      displayValue: `${animSaved} min`,
      sub:         "by AI recommendations",
      accent:      "#a78bfa",
      bg:          "rgba(167,139,250,0.06)",
      border:      "rgba(167,139,250,0.15)",
      icon:        "🤖",
      trend:       true,
      invertTrend: false,
    },
  ];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map((card) => (
          <KpiCard
            key={card.label}
            {...card}
            prevValue={prevKpi.current[
              card.label === "Active Trains"   ? "activeTrains"   :
              card.label === "Avg Delay"       ? "avgDelay"       :
              card.label === "On-Time"         ? "onTimePercent"  :
              card.label === "Open Conflicts"  ? "openConflicts"  :
              card.label === "Critical Trains" ? "criticalTrains" :
              "totalDelaySaved"
            ]}
          />
        ))}
      </div>

      <style>{`
        @keyframes kpi-pulse {
          0%, 100% { opacity: 0.6; transform: scale(1);    }
          50%       { opacity: 0;   transform: scale(1.03); }
        }
      `}</style>
    </>
  );
}
