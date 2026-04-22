import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────
interface FeedbackEntry {
  id:                 string;
  actionType:         string;
  controllerApproved: boolean;
  aiSuggestedDelay:   number;
  actualDelaySaved?:  number;
  timestamp:          any;
  severity?:          string;
  blockId?:           string;
  trainCount?:        number;
}

// ── Config ────────────────────────────────────────────────────
const ACTION_CONFIG: Record<string, { color: string; icon: string }> = {
  hold:    { color: "#4ade80", icon: "⏸" },
  slow:    { color: "#fbbf24", icon: "🐢" },
  reroute: { color: "#60a5fa", icon: "↩" },
};

const TOOLTIP_STYLE: React.CSSProperties = {
  background: "rgba(10,10,10,0.95)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10, color: "#fff", fontSize: 11,
};

// ── Sub-components ────────────────────────────────────────────
function StatCard({ label, value, sub, color = "#fff" }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14, padding: "14px 16px",
    }}>
      <p style={{
        fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700,
        letterSpacing: "0.08em", marginBottom: 6,
      }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 800, color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700,
      letterSpacing: "0.08em", marginBottom: 10,
    }}>{children}</p>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function RLDashboard() {
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "rl_feedback"), orderBy("timestamp", "desc"), limit(100)),
      (snap) => setFeedback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeedbackEntry)))
    );
    return () => unsub();
  }, []);

  // ── Stats ─────────────────────────────────────────────────
  const total    = feedback.length;
  const approved = feedback.filter((f) => f.controllerApproved).length;
  const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;

  const totalDelaySaved = feedback
    .filter((f) => f.controllerApproved)
    .reduce((s, f) => s + (f.actualDelaySaved ?? f.aiSuggestedDelay ?? 0), 0);

  const avgDelaySaved = approved > 0
    ? (totalDelaySaved / approved).toFixed(1) : "0.0";

  // Action breakdown
  const actionCounts:   Record<string, number> = {};
  const actionApproved: Record<string, number> = {};
  for (const f of feedback) {
    const a = f.actionType ?? "unknown";
    actionCounts[a]   = (actionCounts[a]   ?? 0) + 1;
    if (f.controllerApproved)
      actionApproved[a] = (actionApproved[a] ?? 0) + 1;
  }

  const mostUsed = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  // Severity breakdown
  const sevCount: Record<string, number> = { low: 0, medium: 0, high: 0 };
  for (const f of feedback) {
    const s = f.severity ?? "medium";
    sevCount[s] = (sevCount[s] ?? 0) + 1;
  }

  // Recent 8
  const recent = [...feedback].slice(0, 8);

  // 🆕 Learning curve — rolling approval rate over last 20 decisions
  const learningCurve = [...feedback]
    .slice(0, 20)
    .reverse()
    .map((f, i, arr) => {
      const window  = arr.slice(0, i + 1);
      const winRate = Math.round((window.filter((x) => x.controllerApproved).length / window.length) * 100);
      return {
        sample:   i + 1,
        approval: winRate,
        target:   80, // target approval rate line
      };
    });

  // 🆕 Delay accuracy — AI suggested vs actual
  const accuracyData = feedback
    .filter((f) => f.controllerApproved && f.actualDelaySaved != null)
    .slice(0, 10)
    .reverse()
    .map((f, i) => ({
      name:      `#${i + 1}`,
      aiSuggested: f.aiSuggestedDelay,
      actual:      f.actualDelaySaved ?? 0,
    }));

  // 🆕 AI confidence score — based on approval rate + sample size
  const confidenceScore = total === 0 ? 0
    : Math.min(100, Math.round(
        (approvalRate * 0.6) +
        (Math.min(total, 50) / 50 * 30) +
        (accuracyData.length > 0 ? 10 : 0)
      ));

  const confidenceColor =
    confidenceScore >= 75 ? "#4ade80" :
    confidenceScore >= 50 ? "#fbbf24" : "#ef4444";

  const confidenceLabel =
    confidenceScore >= 75 ? "High" :
    confidenceScore >= 50 ? "Learning" : "Low";

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 18, padding: 20,
    }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>RL Agent Performance</h3>
            <span style={{
              fontSize: 9, fontWeight: 800, color: "#a78bfa",
              background: "rgba(167,139,250,0.1)",
              border: "1px solid rgba(167,139,250,0.2)",
              borderRadius: 99, padding: "2px 8px", letterSpacing: "0.08em",
            }}>Q-LEARNING</span>
          </div>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
            Controller feedback trains the conflict resolution agent
          </p>
        </div>

        {/* 🆕 Confidence badge */}
        <div style={{
          textAlign: "center", padding: "8px 14px", borderRadius: 12,
          background: `${confidenceColor}10`,
          border: `1px solid ${confidenceColor}30`,
        }}>
          <p style={{ fontSize: 18, fontWeight: 800, color: confidenceColor, lineHeight: 1 }}>
            {confidenceScore}
          </p>
          <p style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontWeight: 700,
            letterSpacing: "0.06em", marginTop: 3 }}>
            {confidenceLabel.toUpperCase()}
          </p>
        </div>
      </div>

      {/* KPI grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
        gap: 10, marginBottom: 20,
      }}>
        <StatCard label="TOTAL FEEDBACK" value={total}
          sub="Training samples" color="rgba(255,255,255,0.8)" />
        <StatCard label="APPROVAL RATE" value={`${approvalRate}%`}
          sub={`${approved} of ${total} applied`}
          color={approvalRate >= 70 ? "#4ade80" : approvalRate >= 50 ? "#fbbf24" : "#ef4444"} />
        <StatCard label="DELAY SAVED" value={`${totalDelaySaved.toFixed(0)} min`}
          sub={`~${avgDelaySaved} min / action`} color="#60a5fa" />
        <StatCard label="TOP ACTION"
          value={mostUsed === "—" ? "—" : `${ACTION_CONFIG[mostUsed]?.icon ?? ""} ${mostUsed}`}
          sub="Most recommended"
          color={ACTION_CONFIG[mostUsed]?.color ?? "#fff"} />
      </div>

      {/* 🆕 Learning Curve Chart */}
      <div style={{ marginBottom: 20 }}>
        <SectionLabel>LEARNING CURVE — ROLLING APPROVAL RATE</SectionLabel>
        {learningCurve.length < 2 ? (
          <div style={{ height: 100, display: "flex", alignItems: "center",
            justifyContent: "center", color: "rgba(255,255,255,0.15)", fontSize: 12 }}>
            Need 2+ feedback entries to show curve
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={110}>
            <AreaChart data={learningCurve}>
              <defs>
                <linearGradient id="approvalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="sample" tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }}
                axisLine={false} tickLine={false} label={{ value: "samples", position: "insideBottomRight", offset: -5, fill: "rgba(255,255,255,0.2)", fontSize: 9 }} />
              <YAxis domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }}
                axisLine={false} tickLine={false} unit="%" />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [`${v}%`]} />
              {/* Target line */}
              <Line type="monotone" dataKey="target" name="Target"
                stroke="rgba(255,255,255,0.15)" strokeWidth={1}
                strokeDasharray="4 4" dot={false} />
              <Area type="monotone" dataKey="approval" name="Approval"
                stroke="#a78bfa" strokeWidth={2} fill="url(#approvalGrad)"
                dot={{ fill: "#a78bfa", r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 🆕 AI Accuracy Chart */}
      {accuracyData.length >= 2 && (
        <div style={{ marginBottom: 20 }}>
          <SectionLabel>AI PREDICTION ACCURACY — SUGGESTED vs ACTUAL DELAY SAVED</SectionLabel>
          <ResponsiveContainer width="100%" height={110}>
            <LineChart data={accuracyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }}
                axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }}
                axisLine={false} tickLine={false} unit=" m" />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="aiSuggested" name="AI Suggested"
                stroke="#60a5fa" strokeWidth={2}
                dot={{ fill: "#60a5fa", r: 3, strokeWidth: 0 }} />
              <Line type="monotone" dataKey="actual" name="Actual"
                stroke="#4ade80" strokeWidth={2}
                dot={{ fill: "#4ade80", r: 3, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Action breakdown */}
      <div style={{ marginBottom: 20 }}>
        <SectionLabel>ACTION BREAKDOWN</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(actionCounts).map(([action, count]) => {
            const ac   = ACTION_CONFIG[action] ?? { color: "#fff", icon: "?" };
            const pct  = total > 0 ? Math.round((count / total) * 100) : 0;
            const appR = count > 0
              ? Math.round(((actionApproved[action] ?? 0) / count) * 100) : 0;
            return (
              <div key={action}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13 }}>{ac.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700,
                      color: ac.color, textTransform: "capitalize" }}>{action}</span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                      {count}× · {appR}% approved
                    </span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700,
                    color: "rgba(255,255,255,0.5)", fontVariantNumeric: "tabular-nums" }}>
                    {pct}%
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 99,
                  background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 99, width: `${pct}%`,
                    background: ac.color, transition: "width 0.5s ease",
                  }} />
                </div>
              </div>
            );
          })}
          {Object.keys(actionCounts).length === 0 && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
              No actions recorded yet
            </p>
          )}
        </div>
      </div>

      {/* Severity distribution */}
      <div style={{ marginBottom: 20 }}>
        <SectionLabel>CONFLICT SEVERITY HANDLED</SectionLabel>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { key: "high",   color: "#ef4444", label: "High"   },
            { key: "medium", color: "#fb923c", label: "Medium" },
            { key: "low",    color: "#4ade80", label: "Low"    },
          ].map(({ key, color, label }) => (
            <div key={key} style={{
              flex: 1, textAlign: "center",
              background: `${color}10`,
              border: `1px solid ${color}25`,
              borderRadius: 10, padding: "10px 0",
            }}>
              <p style={{ fontSize: 18, fontWeight: 800, color,
                fontVariantNumeric: "tabular-nums" }}>
                {sevCount[key] ?? 0}
              </p>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)",
                fontWeight: 600, marginTop: 2 }}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent feedback log */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <SectionLabel>RECENT FEEDBACK ({recent.length})</SectionLabel>
          {feedback.length > 8 && (
            <button
              onClick={() => setExpanded((e) => !e)}
              style={{
                fontSize: 10, color: "#a78bfa", background: "none",
                border: "none", cursor: "pointer", fontWeight: 700,
              }}
            >
              {expanded ? "Show less ↑" : `+${feedback.length - 8} more ↓`}
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {(expanded ? feedback : recent).map((fb) => {
            const ac   = ACTION_CONFIG[fb.actionType] ?? { color: "#fff", icon: "?" };
            const time = fb.timestamp?.toDate?.()
              ?.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })
              ?? "—";
            const delaySaved = fb.actualDelaySaved ?? fb.aiSuggestedDelay;
            return (
              <div key={fb.id} style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between",
                padding: "7px 12px", borderRadius: 8,
                background: fb.controllerApproved
                  ? "rgba(74,222,128,0.03)"
                  : "rgba(239,68,68,0.03)",
                border: `1px solid ${fb.controllerApproved
                  ? "rgba(74,222,128,0.08)"
                  : "rgba(239,68,68,0.08)"}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12 }}>{ac.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700,
                    color: ac.color, textTransform: "capitalize" }}>
                    {fb.actionType}
                  </span>
                  {fb.blockId && (
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                      {fb.blockId}
                    </span>
                  )}
                  {delaySaved != null && (
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                      {delaySaved} min
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 6,
                    background: fb.controllerApproved
                      ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)",
                    color: fb.controllerApproved ? "#4ade80" : "#ef4444",
                  }}>
                    {fb.controllerApproved ? "✓ Applied" : "✕ Dismissed"}
                  </span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>{time}</span>
                </div>
              </div>
            );
          })}
          {recent.length === 0 && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", padding: "10px 0" }}>
              Apply or dismiss recommendations to build feedback log
            </p>
          )}
        </div>
      </div>
    </div>
  );
}