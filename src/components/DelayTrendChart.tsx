import { useEffect, useState, useRef } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";

interface TickEntry {
  tick:       number;
  label:      string;
  avgDelay:   number;
  maxDelay:   number;
  onTimeRate: number;
}

interface CustomTooltipProps {
  active?:  boolean;
  payload?: any[];
  label?:   string;
}

const HISTORY_STORAGE_KEY = "analytics-delay-trend-history";
const SAMPLE_INTERVAL_MS = 20_000;

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#1a1a18",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 10, padding: "10px 14px",
    }}>
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>
        {label}
      </p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ fontSize: 12, fontWeight: 700, color: p.color, marginBottom: 2 }}>
          {p.name}: {
            p.dataKey === "onTimeRate"
              ? `${p.value}%`
              : `${p.value} min`
          }
        </p>
      ))}
    </div>
  );
}

export default function DelayTrendChart() {
  const [history, setHistory] = useState<TickEntry[]>(() => {
    try {
      const raw = sessionStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as TickEntry[];
      return Array.isArray(parsed) ? parsed.slice(-20) : [];
    } catch {
      return [];
    }
  });
  const tickRef = useRef(history.length > 0 ? history[history.length - 1].tick : 0);
  const latestMetricsRef = useRef<Omit<TickEntry, "tick" | "label"> | null>(null);

  const appendTick = (metrics: Omit<TickEntry, "tick" | "label">) => {
    tickRef.current += 1;
    const now = new Date();
    const label = now.toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", hour12: false,
    });

    setHistory((prev) => {
      const last = prev[prev.length - 1];
      const nextEntry = { tick: tickRef.current, label, ...metrics };
      if (
        last &&
        last.avgDelay === nextEntry.avgDelay &&
        last.maxDelay === nextEntry.maxDelay &&
        last.onTimeRate === nextEntry.onTimeRate &&
        last.label === nextEntry.label
      ) {
        return prev;
      }
      return [...prev, nextEntry].slice(-20);
    });
  };

  useEffect(() => {
    try {
      sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch {
      // Ignore storage failures in private browsing / restricted contexts.
    }
  }, [history]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "trains"), (snap) => {
      const trains = snap.docs.map((d) => d.data());
      if (trains.length === 0) return;

      const delays    = trains.map((t) => t.delayMinutes ?? 0);
      const avgDelay  = Math.round(delays.reduce((s, d) => s + d, 0) / delays.length * 10) / 10;
      const maxDelay  = Math.max(...delays);
      const onTimeCount = trains.filter((t) => (t.delayMinutes ?? 0) === 0).length;
      const onTimeRate  = Math.round((onTimeCount / trains.length) * 100);
      const metrics = { avgDelay, maxDelay, onTimeRate };
      latestMetricsRef.current = metrics;
      appendTick(metrics);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!latestMetricsRef.current) return;
      appendTick(latestMetricsRef.current);
    }, SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  const trend = history.length >= 2
    ? history[history.length - 1].avgDelay - history[0].avgDelay
    : 0;

  const trendColor = trend > 0 ? "#ef4444" : trend < 0 ? "#4ade80" : "#60a5fa";
  const trendLabel = trend > 0 ? `↑ +${trend.toFixed(1)} min` :
                     trend < 0 ? `↓ ${trend.toFixed(1)} min` : "→ Stable";

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 18, padding: 20,
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between", marginBottom: 16,
        flexWrap: "wrap", gap: 10,
      }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
            Delay Trend — Last {history.length} Ticks
          </h3>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>
            Average delay across all trains over simulation ticks
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {/* Trend indicator */}
          <div style={{
            padding: "6px 14px", borderRadius: 99,
            background: `${trendColor}15`,
            border: `1px solid ${trendColor}30`,
            fontSize: 12, fontWeight: 800, color: trendColor,
          }}>
            {trendLabel}
          </div>

          {/* Current avg */}
          {history.length > 0 && (
            <div style={{
              padding: "6px 14px", borderRadius: 99,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              fontSize: 12, fontWeight: 700,
              color: "rgba(255,255,255,0.6)",
              fontVariantNumeric: "tabular-nums",
            }}>
              Avg: {history[history.length - 1]?.avgDelay} min
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      {history.length === 0 ? (
        <div style={{
          height: 200, display: "flex",
          alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 22, marginBottom: 8 }}>📊</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
              Waiting for simulation ticks…
            </p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.1)", marginTop: 4 }}>
              Chart fills after 2+ ticks
            </p>
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={history} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
            <CartesianGrid
              stroke="rgba(255,255,255,0.04)"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="label"
              tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              unit=" min"
            />
            <YAxis
              yAxisId={1}
              orientation="right"
              tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              unit="%"
              domain={[0, 100]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.4)", paddingTop: 8 }}
            />
            <ReferenceLine
              y={5}
              stroke="rgba(251,146,60,0.3)"
              strokeDasharray="4 4"
              label={{ value: "Alert (5 min)", fill: "rgba(251,146,60,0.4)", fontSize: 9 }}
            />
            <Line
              type="monotone"
              dataKey="avgDelay"
              name="Avg Delay"
              stroke="#fb923c"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#fb923c" }}
            />
            <Line
              type="monotone"
              dataKey="maxDelay"
              name="Max Delay"
              stroke="#ef4444"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 3, fill: "#ef4444" }}
            />
            <Line
              type="monotone"
              dataKey="onTimeRate"
              name="On-Time %"
              stroke="#4ade80"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#4ade80" }}
              yAxisId={1}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
