import { useEffect, useState } from "react";
import {
  collection, onSnapshot, query,
  orderBy, limit,
} from "firebase/firestore";
import { db } from "../lib/firebase";

interface Conflict {
  id:            string;
  trainA:        string;
  trainB:        string;
  blockId:       string;
  severity:      string;
  status:        string;
  reason:        string;
  createdAt:     any;
  resolvedAt?:   any;
  aiStrategy?:   string;
  delaySaved?:   number;
  aiExplanation?: string;
}

interface FeedbackEntry {
  id:                 string;
  conflictId:         string;
  actionType:         string;
  aiSuggestedDelay:   number;
  actualDelaySaved?:  number;
  controllerApproved: boolean;
  controllerId:       string;
  timestamp:          any;
}

const SEV: Record<string, { dot: string; badge: string; text: string }> = {
  high:   { dot: "bg-red-400",    badge: "bg-red-500/10 border-red-500/25 text-red-400",    text: "text-red-400"    },
  medium: { dot: "bg-orange-400", badge: "bg-orange-500/10 border-orange-500/25 text-orange-400", text: "text-orange-400" },
  low:    { dot: "bg-emerald-400",badge: "bg-emerald-500/10 border-emerald-500/25 text-emerald-400", text: "text-emerald-400" },
};

const ACTION: Record<string, { color: string; icon: string }> = {
  hold:    { color: "text-emerald-400", icon: "⏸" },
  slow:    { color: "text-amber-400",   icon: "🐢" },
  reroute: { color: "text-blue-400",    icon: "↩" },
};

function timeAgo(ts: any): string {
  try {
    const ms = ts?.toMillis?.() ?? (ts?.seconds ? ts.seconds * 1000 : null);
    if (!ms) return "—";
    const diff = Math.floor((Date.now() - ms) / 1000);
    if (diff < 60)   return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  } catch { return "—"; }
}

function formatTime(ts: any): string {
  try {
    const ms = ts?.toMillis?.() ?? (ts?.seconds ? ts.seconds * 1000 : null);
    if (!ms) return "—";
    return new Date(ms).toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
  } catch { return "—"; }
}

type Filter = "all" | "open" | "resolved";

export default function ConflictHistory() {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [feedback,  setFeedback]  = useState<FeedbackEntry[]>([]);
  const [filter,    setFilter]    = useState<Filter>("all");
  const [expanded,  setExpanded]  = useState<string | null>(null);
  const [loading,   setLoading]   = useState(true);

  // ── Conflicts listener ────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, "conflicts"),
      orderBy("createdAt", "desc"),
      limit(50),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setConflicts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Conflict)));
        setLoading(false);
      },
      (err) => { console.error("ConflictHistory:", err); setLoading(false); }
    );
    return () => unsub();
  }, []);

  // ── RL feedback listener ──────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, "rl_feedback"),
      orderBy("timestamp", "desc"),
      limit(100),
    );
    const unsub = onSnapshot(q,
      (snap) => setFeedback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeedbackEntry))),
      (err)  => console.error("RLFeedback:", err)
    );
    return () => unsub();
  }, []);

  // ── Derived stats ─────────────────────────────────────────
  const totalOpen     = conflicts.filter((c) => c.status === "open").length;
  const totalResolved = conflicts.filter((c) => c.status === "resolved").length;
  const approvedFeedback = feedback.filter((entry) => entry.controllerApproved);
  const delaySavedByConflict = approvedFeedback.reduce<Record<string, number>>((acc, entry) => {
    const saved = Math.max(0, entry.actualDelaySaved ?? entry.aiSuggestedDelay ?? 0);
    acc[entry.conflictId] = (acc[entry.conflictId] ?? 0) + saved;
    return acc;
  }, {});
  const totalDelay = Object.values(delaySavedByConflict).reduce((sum, value) => sum + value, 0);

  const filtered = conflicts.filter((c) => {
    if (filter === "open")     return c.status === "open";
    if (filter === "resolved") return c.status === "resolved";
    return true;
  });

  const getFB = (id: string) => feedback.filter((f) => f.conflictId === id);

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-5 text-white">

      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-white">Conflict Resolution History</h2>
          <p className="text-xs text-white/30 mt-0.5">All conflicts detected in section NDLS-GZB</p>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.08]
          rounded-xl p-1">
          {(["all", "open", "resolved"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold capitalize cursor-pointer
                transition-all duration-150 border
                ${filter === f
                  ? f === "open"
                    ? "bg-red-500/10 border-red-500/25 text-red-400"
                    : f === "resolved"
                    ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                    : "bg-white/10 border-white/20 text-white"
                  : "bg-transparent border-transparent text-white/35 hover:text-white/60"
                }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: "Total",       val: conflicts.length,  cls: "text-white/70"   },
          { label: "Open",        val: totalOpen,         cls: "text-red-400"    },
          { label: "Resolved",    val: totalResolved,     cls: "text-emerald-400"},
          { label: "Delay Saved", val: `${totalDelay}m`,  cls: "text-blue-400"   },
        ].map(({ label, val, cls }) => (
          <div key={label}
            className="flex flex-col items-center justify-center py-3 rounded-xl
              bg-white/[0.03] border border-white/[0.06]">
            <span className={`text-xl font-black ${cls}`}
              style={{ fontVariantNumeric: "tabular-nums" }}>
              {val}
            </span>
            <span className="text-[10px] text-white/30 font-semibold mt-0.5 uppercase tracking-wide">
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-white/20 text-sm gap-2">
          <span className="animate-spin text-base">⏳</span> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 gap-2">
          <span className="text-4xl">📋</span>
          <p className="text-sm text-white/25">
            No {filter === "all" ? "" : filter} conflicts yet
          </p>
          <p className="text-xs text-white/15">Conflicts appear here as the simulation runs</p>
        </div>
      ) : (
        <div className="relative flex flex-col gap-1.5 max-h-[520px] overflow-y-auto pr-1">

          {/* Vertical timeline line */}
          <div className="absolute left-[15px] top-3 bottom-3 w-px bg-white/[0.07] pointer-events-none" />

          {filtered.map((c) => {
            const sv         = SEV[c.severity] ?? SEV.medium;
            const isOpen     = c.status === "open";
            const isExpanded = expanded === c.id;
            const cfFB       = getFB(c.id);
            const conflictDelaySaved = delaySavedByConflict[c.id] ?? c.delaySaved ?? 0;

            return (
              <div key={c.id} className="flex gap-3 items-start">

                {/* Timeline dot */}
                <div className="w-8 flex justify-center pt-[14px] flex-shrink-0 z-10">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    isOpen ? `${sv.dot} animate-pulse` : "bg-emerald-400"
                  }`}
                    style={{
                      boxShadow: isOpen
                        ? undefined
                        : "0 0 0 3px rgba(74,222,128,0.15)",
                    }}
                  />
                </div>

                {/* Card */}
                <div
                  className={`flex-1 rounded-xl border overflow-hidden mb-1.5 cursor-pointer
                    transition-all duration-200
                    ${isExpanded
                      ? "bg-white/[0.05] border-white/10"
                      : "bg-white/[0.025] border-white/[0.06] hover:bg-white/[0.04]"
                    }`}
                  onClick={() => setExpanded(isExpanded ? null : c.id)}
                >
                  {/* Card header row */}
                  <div className="px-4 py-3 flex items-center justify-between gap-3">

                    {/* Left: severity + trains + block */}
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <span className={`text-[9px] font-black uppercase tracking-widest
                        px-2 py-0.5 rounded-md border flex-shrink-0 ${sv.badge}`}>
                        {c.severity}
                      </span>
                      <p className="text-sm font-bold text-white truncate">
                        {c.trainA} ↔ {c.trainB}
                      </p>
                      <span className="text-xs text-white/30 flex-shrink-0">
                        Block {c.blockId}
                      </span>
                    </div>

                    {/* Right: status + time + chevron */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                        isOpen
                          ? "bg-orange-500/10 border-orange-500/20 text-orange-400"
                          : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                      }`}>
                        {isOpen ? "● OPEN" : "✓ RESOLVED"}
                      </span>
                      <span className="text-[10px] text-white/20 w-12 text-right"
                        style={{ fontVariantNumeric: "tabular-nums" }}>
                        {timeAgo(c.createdAt)}
                      </span>
                      <span className={`text-[10px] text-white/25 transition-transform duration-200 inline-block
                        ${isExpanded ? "rotate-180" : ""}`}>▼</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-3 border-t border-white/[0.06]
                      flex flex-col gap-3 bg-white/[0.02]">

                      {/* Reason */}
                      <div>
                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1.5">
                          Reason
                        </p>
                        <p className="text-xs text-white/60 leading-relaxed">{c.reason}</p>
                      </div>

                      {/* Timestamps row */}
                      <div className="flex flex-wrap gap-5">
                        <div>
                          <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-1">
                            Detected At
                          </p>
                          <p className="text-xs text-white font-semibold"
                            style={{ fontVariantNumeric: "tabular-nums" }}>
                            {formatTime(c.createdAt)}
                          </p>
                        </div>
                        {c.resolvedAt && (
                          <div>
                            <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-1">
                              Resolved At
                            </p>
                            <p className="text-xs text-emerald-400 font-semibold"
                              style={{ fontVariantNumeric: "tabular-nums" }}>
                              {formatTime(c.resolvedAt)}
                            </p>
                          </div>
                        )}
                        {conflictDelaySaved > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-1">
                              Delay Saved
                            </p>
                            <p className="text-xs text-blue-400 font-bold">{conflictDelaySaved} min</p>
                          </div>
                        )}
                      </div>

                      {/* AI Strategy */}
                      {c.aiStrategy && (
                        <div className="rounded-xl bg-emerald-500/[0.05] border border-emerald-500/15 p-3">
                          <p className="text-[10px] font-bold text-emerald-400/60 uppercase tracking-widest mb-1.5">
                            AI Strategy Applied
                          </p>
                          <p className="text-xs text-white/60 leading-relaxed">{c.aiStrategy}</p>
                          {c.aiExplanation && (
                            <p className="text-[11px] text-white/35 mt-1.5 leading-relaxed italic">
                              "{c.aiExplanation}"
                            </p>
                          )}
                        </div>
                      )}

                      {/* RL Feedback */}
                      {cfFB.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-2">
                            Controller Feedback ({cfFB.length})
                          </p>
                          <div className="flex flex-col gap-1.5">
                            {cfFB.map((fb) => {
                              const ac = ACTION[fb.actionType] ?? ACTION.hold;
                              return (
                                <div key={fb.id}
                                  className="flex items-center justify-between
                                    bg-white/[0.03] border border-white/[0.06]
                                    rounded-lg px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm">{ac.icon}</span>
                                    <span className={`text-[11px] font-bold uppercase ${ac.color}`}>
                                      {fb.actionType}
                                    </span>
                                    <span className="text-[11px] text-white/30">
                                      {fb.controllerApproved ? "Applied" : "Dismissed"}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-bold ${
                                      fb.controllerApproved ? "text-emerald-400" : "text-red-400"
                                    }`}>
                                      {fb.controllerApproved ? "✓ Approved" : "✕ Rejected"}
                                    </span>
                                    <span className="text-[10px] text-white/20">
                                      {timeAgo(fb.timestamp)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
