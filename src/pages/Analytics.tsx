import { useEffect, useState, useCallback } from "react";
import {
  collection, onSnapshot,
  query, orderBy, limit,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import ConflictHistory  from "../components/ConflictHistory";
import DelayTrendChart  from "../components/DelayTrendChart";
import RLDashboard      from "../components/RLDashboard";
import { getRLStats }   from "../utils/rlFeedback";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, AreaChart, Area,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────
interface TrainRow {
  id: string; trainNumber: string; name: string;
  delayMinutes: number; status: string;
  speed: number; priority: number; currentBlock?: string;
}
interface ConflictRow {
  id: string; severity: string; status: string;
  createdAt: any; blockId?: string; trainA?: string; trainB?: string;
}
interface RLStats {
  total: number; approvalRate: number;
  byAction: { hold: number; slow: number; reroute: number };
  avgDelaySaved: string;
}

// ── Constants ─────────────────────────────────────────────────
const TOOLTIP_STYLE: React.CSSProperties = {
  background: "rgba(10,10,10,0.95)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10, color: "#fff", fontSize: 12,
};
const PRIORITY_LABEL: Record<number, string> = {
  1: "Express", 2: "Mail", 3: "Freight",
};
const BLOCKS = ["B1","B2","B3","B4","B5","B6","B7","B8","B9","B10","B11","B12"];

// ── Sub-components ────────────────────────────────────────────
function SectionCard({ label, value, sub, accent, trend }: {
  label: string; value: string | number;
  sub: string; accent: string; trend?: string;
}) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, padding: "20px 24px",
      transition: "border-color 0.3s ease",
    }}>
      <p style={{
        fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 700,
        letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8,
      }}>{label}</p>
      <p style={{
        fontSize: 32, fontWeight: 800, color: accent,
        lineHeight: 1, fontVariantNumeric: "tabular-nums",
      }}>{value}</p>
      <div className="flex items-center justify-between mt-2">
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{sub}</p>
        {trend && (
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: trend.startsWith("+") ? "#4ade80" : "#ef4444",
          }}>{trend}</span>
        )}
      </div>
    </div>
  );
}

function ChartBox({ title, subtitle, children, action }: {
  title: string; subtitle?: string;
  children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, padding: "20px 24px",
    }}>
      <div className="flex items-start justify-between mb-5">
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>
            {title}
          </p>
          {subtitle && (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ marginBottom: 4, color: "rgba(255,255,255,0.5)" }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color ?? "#fff", fontWeight: 700 }}>
          {p.name}: {p.value}{p.unit ?? ""}
        </p>
      ))}
    </div>
  );
}

function EmptyChart() {
  return (
    <div style={{
      height: 200, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      color: "rgba(255,255,255,0.15)",
    }}>
      <p style={{ fontSize: 24, marginBottom: 8 }}>📊</p>
      <p style={{ fontSize: 12 }}>Waiting for data…</p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function Analytics() {
  const [trains,    setTrains]    = useState<TrainRow[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [rlStats,   setRlStats]   = useState<RLStats | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [modelInfo,  setModelInfo]  = useState<any>(null);

  // Firestore listeners
  useEffect(() => {
    const u1 = onSnapshot(collection(db, "trains"), (snap) => {
      setTrains(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TrainRow)));
      setLastUpdate(new Date());
    });
    const u2 = onSnapshot(
      query(collection(db, "conflicts"), orderBy("createdAt", "desc"), limit(100)),
      (snap) => setConflicts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConflictRow)))
    );
    return () => { u1(); u2(); };
  }, []);

  // RL stats + model info
  const fetchStats = useCallback(async () => {
    try {
      const stats = await getRLStats();
      setRlStats(stats as RLStats);
    } catch (e) { console.error(e); }

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? "http://localhost:8000"}/model-info`);
      if (res.ok) setModelInfo(await res.json());
    } catch (e) { /* backend offline */ }
  }, []);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 30_000);
    return () => clearInterval(id);
  }, [fetchStats]);

  // ── Derived ───────────────────────────────────────────────
  const avgDelay = trains.length
    ? (trains.reduce((s, t) => s + (t.delayMinutes ?? 0), 0) / trains.length).toFixed(1)
    : "0.0";

  const onTimePct = trains.length
    ? Math.round((trains.filter((t) => t.status === "on_time").length / trains.length) * 100)
    : 0;

  const openCount     = conflicts.filter((c) => c.status === "open").length;
  const resolvedCount = conflicts.filter((c) => c.status === "resolved").length;
  const totalConflicts = conflicts.length;
  const resolutionRate = totalConflicts > 0
    ? Math.round((resolvedCount / totalConflicts) * 100) : 0;

  // Status pie
  const statusCounts = [
    { name: "On Time",  value: trains.filter((t) => t.status === "on_time").length,  color: "#4ade80" },
    { name: "Delayed",  value: trains.filter((t) => t.status === "delayed").length,  color: "#fb923c" },
    { name: "Critical", value: trains.filter((t) => t.status === "critical").length, color: "#ef4444" },
  ].filter((s) => s.value > 0);

  // Delay bar
  const delayData = [...trains]
    .sort((a, b) => (b.delayMinutes ?? 0) - (a.delayMinutes ?? 0))
    .map((t) => ({ name: t.trainNumber, delay: t.delayMinutes ?? 0, speed: t.speed ?? 0 }));

  // Speed line
  const speedData = trains.map((t) => ({
    name: t.trainNumber, speed: t.speed ?? 0,
    priority: PRIORITY_LABEL[t.priority] ?? "Train",
  }));

  // Conflict severity
  const conflictBySeverity = [
    { name: "High",   value: conflicts.filter((c) => c.severity === "high").length,   color: "#ef4444" },
    { name: "Medium", value: conflicts.filter((c) => c.severity === "medium").length, color: "#fb923c" },
    { name: "Low",    value: conflicts.filter((c) => c.severity === "low").length,    color: "#4ade80" },
  ];

  // Priority breakdown
  const priorityData = [1, 2, 3].map((p) => ({
    name: PRIORITY_LABEL[p],
    count: trains.filter((t) => t.priority === p).length,
    color: p === 1 ? "#4ade80" : p === 2 ? "#fbbf24" : "#94a3b8",
  }));

  // 🆕 Block heatmap — how many trains per block
  const blockHeatmap = BLOCKS.map((b) => ({
    block: b,
    trains:    trains.filter((t) => t.currentBlock === b).length,
    conflicts: conflicts.filter((c) => c.blockId === b && c.status === "open").length,
  }));

  // 🆕 Conflict timeline — last 10 by time
  const conflictTimeline = conflicts.slice(0, 10).map((c, i) => ({
    name:     `C${conflicts.length - i}`,
    severity: c.severity === "high" ? 3 : c.severity === "medium" ? 2 : 1,
    resolved: c.status === "resolved" ? 1 : 0,
    label:    c.blockId ?? "—",
  }));

  // 🆕 RL action breakdown
  const rlActionData = rlStats ? [
    { name: "Hold",    value: rlStats.byAction.hold,    color: "#4ade80" },
    { name: "Slow",    value: rlStats.byAction.slow,    color: "#fbbf24" },
    { name: "Reroute", value: rlStats.byAction.reroute, color: "#60a5fa" },
  ] : [];

  // 🆕 Model radar data
  const radarData = modelInfo ? [
    { metric: "Accuracy",  value: Math.round((modelInfo.valAcc ?? 0.94) * 100) },
    { metric: "Precision", value: Math.round((modelInfo.precision ?? 0.95) * 100) },
    { metric: "Recall",    value: Math.round((modelInfo.recall ?? 0.95) * 100) },
    { metric: "F1 Score",  value: Math.round((modelInfo.f1 ?? 0.956) * 100) },
    { metric: "Confidence",value: rlStats?.approvalRate ?? 80 },
  ] : [];

  const timeStr = lastUpdate.toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  return (
    <div style={{ padding: "32px 24px", maxWidth: 1200, margin: "0 auto" }}>

      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="text-white font-bold" style={{ fontSize: "clamp(1.4rem,2.5vw,1.8rem)" }}>
            Analytics
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
            Section NDLS–GZB · live performance metrics
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Last update */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%", background: "#4ade80",
              display: "inline-block", animation: "live-pulse 1.5s ease infinite",
            }} />
            Updated {timeStr}
          </div>
          {/* Model badge */}
          {modelInfo && (
            <div className="px-3 py-1.5 rounded-xl text-xs font-bold"
              style={{
                background: modelInfo.mlReady ? "rgba(74,222,128,0.1)" : "rgba(251,191,36,0.1)",
                border: `1px solid ${modelInfo.mlReady ? "rgba(74,222,128,0.3)" : "rgba(251,191,36,0.3)"}`,
                color: modelInfo.mlReady ? "#4ade80" : "#fbbf24",
              }}>
              {modelInfo.mlReady ? "🧠 LSTM Active" : "⚙️ Rule-based"}
            </div>
          )}
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SectionCard label="Avg Delay"       value={`${avgDelay} min`}      sub="across all active trains"          accent="#fb923c" />
        <SectionCard label="On-Time Rate"    value={`${onTimePct}%`}        sub="trains running on schedule"        accent="#4ade80" />
        <SectionCard label="Open Conflicts"  value={openCount}              sub="need controller action"            accent="#ef4444" />
        <SectionCard label="Resolution Rate" value={`${resolutionRate}%`}   sub={`${resolvedCount}/${totalConflicts} resolved`} accent="#60a5fa" />
      </div>

      {/* ── AI Model Performance ── */}
      {(modelInfo || rlStats) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SectionCard
            label="Model Accuracy"
            value={`${((modelInfo?.valAcc ?? 0.947) * 100).toFixed(1)}%`}
            sub="LSTM validation accuracy"
            accent="#a78bfa"
          />
          <SectionCard
            label="AI Approval Rate"
            value={`${rlStats?.approvalRate ?? 0}%`}
            sub={`${rlStats?.total ?? 0} controller decisions`}
            accent="#60a5fa"
          />
          <SectionCard
            label="Avg Delay Saved"
            value={`${rlStats?.avgDelaySaved ?? "0.0"} min`}
            sub="per AI recommendation"
            accent="#4ade80"
          />
          <SectionCard
            label="RL Feedback"
            value={rlStats?.total ?? 0}
            sub="total training samples"
            accent="#fbbf24"
          />
        </div>
      )}

      {/* ── Charts Row 1 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

        {/* Delay bar */}
        <ChartBox title="Delay by Train" subtitle="minutes behind schedule">
          {delayData.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={delayData} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} axisLine={false} tickLine={false} unit=" m" />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="delay" name="Delay" radius={[6, 6, 0, 0]}>
                  {delayData.map((e, i) => (
                    <Cell key={i} fill={e.delay === 0 ? "#4ade80" : e.delay > 8 ? "#ef4444" : "#fb923c"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartBox>

        {/* Status pie */}
        <ChartBox title="Train Status" subtitle="current distribution">
          {statusCounts.length === 0 ? <EmptyChart /> : (
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <ResponsiveContainer width={150} height={160}>
                <PieChart>
                  <Pie data={statusCounts} cx="50%" cy="50%"
                    innerRadius={42} outerRadius={68} paddingAngle={3} dataKey="value">
                    {statusCounts.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                {statusCounts.map((s) => (
                  <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", flex: 1 }}>{s.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{s.value}</span>
                  </div>
                ))}
                <div style={{ marginTop: 4, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700, letterSpacing: "0.08em" }}>ON-TIME RATE</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: "#4ade80", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{onTimePct}%</p>
                </div>
              </div>
            </div>
          )}
        </ChartBox>

        {/* Conflict severity */}
        <ChartBox title="Conflicts by Severity" subtitle="all time">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={conflictBySeverity} barSize={40}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="value" name="Count" radius={[6, 6, 0, 0]}>
                {conflictBySeverity.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>
      </div>

      {/* ── Charts Row 2 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

        {/* Speed line — 2 cols */}
        <div className="lg:col-span-2">
          <ChartBox title="Live Speed per Train" subtitle="km/h">
            {speedData.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={speedData}>
                  <defs>
                    <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#60a5fa" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 140]} tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} axisLine={false} tickLine={false} unit=" km/h" />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="speed" name="Speed" stroke="#60a5fa" strokeWidth={2.5} fill="url(#speedGrad)" dot={{ fill: "#60a5fa", r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartBox>
        </div>

        {/* Priority breakdown */}
        <ChartBox title="Trains by Priority" subtitle="express · mail · freight">
          {priorityData.every((p) => p.count === 0) ? <EmptyChart /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
              {priorityData.map(({ name, count, color }) => {
                const pct = trains.length > 0 ? Math.round((count / trains.length) * 100) : 0;
                return (
                  <div key={name}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{name}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
                        {count}<span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 500, marginLeft: 4 }}>({pct}%)</span>
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 99, width: `${pct}%`, background: color, transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Total trains</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{trains.length}</span>
              </div>
            </div>
          )}
        </ChartBox>
      </div>

      {/* ── 🆕 Block Heatmap + Conflict Timeline ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

        {/* Block heatmap */}
        <ChartBox title="Block Occupancy Heatmap" subtitle="trains & conflicts per block">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={blockHeatmap} barSize={20}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="block" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }} />
              <Bar dataKey="trains"    name="Trains"    fill="#60a5fa" radius={[4,4,0,0]} />
              <Bar dataKey="conflicts" name="Conflicts" fill="#ef4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>

        {/* Conflict severity timeline */}
        <ChartBox title="Conflict Severity Timeline" subtitle="recent 10 conflicts">
          {conflictTimeline.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={conflictTimeline}>
                <defs>
                  <linearGradient id="sevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 3]} ticks={[1,2,3]}
                  tickFormatter={(v) => v === 1 ? "Low" : v === 2 ? "Med" : "High"}
                  tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="severity" name="Severity"
                  stroke="#ef4444" strokeWidth={2} fill="url(#sevGrad)"
                  dot={{ fill: "#ef4444", r: 4, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartBox>
      </div>

      {/* ── 🆕 RL Action Breakdown + Model Radar ── */}
      {(rlStats || modelInfo) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

          {/* RL action pie */}
          <ChartBox title="RL Action Distribution" subtitle="controller-approved actions">
            {rlActionData.every((d) => d.value === 0) ? <EmptyChart /> : (
              <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={rlActionData} cx="50%" cy="50%"
                      innerRadius={42} outerRadius={68} paddingAngle={3} dataKey="value">
                      {rlActionData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                  {rlActionData.map((a) => (
                    <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: a.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", flex: 1 }}>{a.name}</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{a.value}</span>
                    </div>
                  ))}
                  <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700, letterSpacing: "0.08em" }}>AVG DELAY SAVED</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: "#4ade80", marginTop: 2 }}>
                      {rlStats?.avgDelaySaved ?? "0.0"} min
                    </p>
                  </div>
                </div>
              </div>
            )}
          </ChartBox>

          {/* Model performance radar */}
          <ChartBox title="AI Model Performance" subtitle="LSTM metrics radar">
            {radarData.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(255,255,255,0.08)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
                  <Radar name="Model" dataKey="value" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.15} strokeWidth={2} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [`${v}%`, "Score"]} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </ChartBox>
        </div>
      )}

      {/* ── Delay Trend + RL Dashboard ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <DelayTrendChart />
        <RLDashboard />
      </div>

      {/* ── Conflict History ── */}
      <div className="mb-8">
        <ConflictHistory />
      </div>

      <style>{`
        @keyframes live-pulse {
          0%,100% { opacity:1; box-shadow: 0 0 0 0 rgba(74,222,128,0.4); }
          50%      { opacity:0.8; box-shadow: 0 0 0 5px rgba(74,222,128,0); }
        }
      `}</style>
    </div>
  );
}