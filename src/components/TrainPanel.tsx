import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import TrainDetailPanel from "./TrainDetailPanel";
import type { FirestoreTrain as Train, TrainStatus } from "../types";
import type { DelayPrediction } from "../types";

interface TrainPanelProps {
    delays: DelayPrediction[];
    isLoading: boolean;
  }



const priorityLabel: Record<number, string> = { 1: "Express", 2: "Mail", 3: "Freight" };
const priorityColor: Record<number, string> = {
    1: "rgba(74,222,128,0.15)",
    2: "rgba(251,191,36,0.15)",
    3: "rgba(148,163,184,0.12)",
};
const priorityBorder: Record<number, string> = {
    1: "rgba(74,222,128,0.35)",
    2: "rgba(251,191,36,0.35)",
    3: "rgba(148,163,184,0.25)",
};

const STATUS_DOT: Record<string, string> = {
    on_time: "#4ade80",
    delayed: "#fb923c",
    critical: "#ef4444",
};

type SortKey = "default" | "delay" | "speed" | "priority";
type StatusFilter = "all" | "on_time" | "delayed" | "critical";

export default function TrainPanel({ delays, isLoading }: TrainPanelProps) {
    const [trains, setTrains] = useState<Train[]>([]);
    const [selectedTrain, setSelectedTrain] = useState<Train | null>(null);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [sortKey, setSortKey] = useState<SortKey>("default");
    const [showFilters, setShowFilters] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    const INITIAL_DISPLAY_COUNT = 8;

    useEffect(() => {
        const unsub = onSnapshot(collection(db, "trains"), (snap) => {
          const allTrains = snap.docs.map((d) => {
            const data = d.data();
            const liveDelay = delays.find((delay) => delay.train_number === data.trainNumber);
            return {
              id: d.id,
              ...data,
              name: data.name ?? data.trainName ?? data.trainNumber,
              stationCode: data.stationCode ?? liveDelay?.station_code,
              status: (["on_time", "delayed", "critical"].includes(data.status)
                ? data.status
                : "on_time") as TrainStatus,
            } as Train;
          });
      
          // ✅ Deduplicate by trainNumber — keep first occurrence
          const uniqueTrains = allTrains.filter((t, i, arr) =>
            arr.findIndex((x) => x.trainNumber === t.trainNumber) === i
          );
      
          setTrains(uniqueTrains);
        });
        return () => unsub();
      }, [delays]);

    // ── Filter + sort ────────────────────────────────────────────
    const filtered = trains
        .filter((t) => {
            const q = search.toLowerCase();
            const matchSearch =
                !q ||
                t.trainNumber.toLowerCase().includes(q) ||
                t.name.toLowerCase().includes(q) ||
                t.currentBlock.toLowerCase().includes(q);

            const matchStatus =
                statusFilter === "all" || t.status === statusFilter;

            return matchSearch && matchStatus;
        })
        .sort((a, b) => {
            if (sortKey === "delay") return (b.delayMinutes ?? 0) - (a.delayMinutes ?? 0);
            if (sortKey === "speed") return (b.speed ?? 0) - (a.speed ?? 0);
            if (sortKey === "priority") return (a.priority ?? 9) - (b.priority ?? 9);
            return 0; // default — Firestore order
        });

    const activeFilterCount =
        (search ? 1 : 0) +
        (statusFilter !== "all" ? 1 : 0) +
        (sortKey !== "default" ? 1 : 0);
    const visibleTrains = filtered.slice(0, isExpanded ? filtered.length : INITIAL_DISPLAY_COUNT);
    const desktopPanelHeight = "min(76vh, 980px)";

    return (
        <>
            <div
                className="rounded-2xl p-5"
                style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                }}
            >
                {/* ── Header ── */}
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-white text-base">Live Train Status</h2>
                    <div className="flex items-center gap-2">
                        {/* Filter toggle */}
                        <button
                            onClick={() => setShowFilters((v) => !v)}
                            style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "5px 12px", borderRadius: 8,
                                fontSize: 11, fontWeight: 700, cursor: "pointer",
                                background: showFilters || activeFilterCount > 0
                                    ? "rgba(96,165,250,0.12)"
                                    : "rgba(255,255,255,0.05)",
                                border: showFilters || activeFilterCount > 0
                                    ? "1px solid rgba(96,165,250,0.25)"
                                    : "1px solid rgba(255,255,255,0.1)",
                                color: showFilters || activeFilterCount > 0
                                    ? "#60a5fa"
                                    : "rgba(255,255,255,0.4)",
                                transition: "all 0.15s ease",
                            }}
                        >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5">
                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                            Filters
                            {activeFilterCount > 0 && (
                                <span style={{
                                    background: "#60a5fa", color: "#000",
                                    borderRadius: 99, width: 16, height: 16,
                                    display: "grid", placeItems: "center",
                                    fontSize: 9, fontWeight: 900,
                                }}>
                                    {activeFilterCount}
                                </span>
                            )}
                        </button>

                        {/* Live badge */}
                        <div
                            style={{
                                display: "flex", alignItems: "center", gap: 6,
                                fontSize: 11, fontWeight: 700, padding: "5px 10px",
                                borderRadius: 99,
                                background: "rgba(74,222,128,0.1)",
                                color: "#4ade80",
                                border: "1px solid rgba(74,222,128,0.2)",
                            }}
                        >
                            <span style={{
                                width: 6, height: 6, borderRadius: "50%",
                                background: "#4ade80",
                                animation: "ping-soft 2s ease infinite",
                            }} />
                            Live
                        </div>
                    </div>
                </div>

                {/* ── Filter drawer ── */}
                {showFilters && (
                    <div
                        style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.07)",
                            borderRadius: 12, padding: "14px 16px",
                            marginBottom: 14,
                            display: "flex", flexDirection: "column", gap: 12,
                        }}
                    >
                        {/* Search */}
                        <div style={{ position: "relative" }}>
                            <svg
                                width="13" height="13" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5"
                                style={{
                                    position: "absolute", left: 10, top: "50%",
                                    transform: "translateY(-50%)",
                                    color: "rgba(255,255,255,0.25)",
                                }}
                            >
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Search by number, name, block…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{
                                    width: "100%",
                                    background: "rgba(255,255,255,0.04)",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    borderRadius: 9, padding: "8px 12px 8px 30px",
                                    fontSize: 12, color: "#fff", outline: "none",
                                }}
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch("")}
                                    style={{
                                        position: "absolute", right: 8, top: "50%",
                                        transform: "translateY(-50%)",
                                        background: "none", border: "none",
                                        color: "rgba(255,255,255,0.3)", cursor: "pointer",
                                        fontSize: 13,
                                    }}
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        {/* Status + Sort row */}
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            {/* Status filter */}
                            <div style={{ flex: 1, minWidth: 160 }}>
                                <p style={{
                                    fontSize: 10, color: "rgba(255,255,255,0.3)",
                                    fontWeight: 700, marginBottom: 6, letterSpacing: "0.08em"
                                }}>
                                    STATUS
                                </p>
                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                    {(["all", "on_time", "delayed", "critical"] as StatusFilter[]).map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => setStatusFilter(s)}
                                            style={{
                                                padding: "4px 10px", borderRadius: 7,
                                                fontSize: 10, fontWeight: 700, cursor: "pointer",
                                                border: "1px solid",
                                                background: statusFilter === s
                                                    ? s === "all"
                                                        ? "rgba(255,255,255,0.1)"
                                                        : `${STATUS_DOT[s] ?? "#fff"}18`
                                                    : "transparent",
                                                borderColor: statusFilter === s
                                                    ? s === "all"
                                                        ? "rgba(255,255,255,0.2)"
                                                        : `${STATUS_DOT[s] ?? "#fff"}40`
                                                    : "rgba(255,255,255,0.08)",
                                                color: statusFilter === s
                                                    ? s === "all" ? "#fff" : STATUS_DOT[s]
                                                    : "rgba(255,255,255,0.3)",
                                                transition: "all 0.15s ease",
                                            }}
                                        >
                                            {s === "all" ? "All" :
                                                s === "on_time" ? "On Time" :
                                                    s === "delayed" ? "Delayed" : "Critical"}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Sort */}
                            <div style={{ flex: 1, minWidth: 160 }}>
                                <p style={{
                                    fontSize: 10, color: "rgba(255,255,255,0.3)",
                                    fontWeight: 700, marginBottom: 6, letterSpacing: "0.08em"
                                }}>
                                    SORT BY
                                </p>
                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                    {([
                                        { key: "default", label: "Default" },
                                        { key: "delay", label: "Delay ↓" },
                                        { key: "speed", label: "Speed ↓" },
                                        { key: "priority", label: "Priority" },
                                    ] as { key: SortKey; label: string }[]).map(({ key, label }) => (
                                        <button
                                            key={key}
                                            onClick={() => setSortKey(key)}
                                            style={{
                                                padding: "4px 10px", borderRadius: 7,
                                                fontSize: 10, fontWeight: 700, cursor: "pointer",
                                                background: sortKey === key
                                                    ? "rgba(96,165,250,0.12)" : "transparent",
                                                border: sortKey === key
                                                    ? "1px solid rgba(96,165,250,0.3)"
                                                    : "1px solid rgba(255,255,255,0.08)",
                                                color: sortKey === key ? "#60a5fa" : "rgba(255,255,255,0.3)",
                                                transition: "all 0.15s ease",
                                            }}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Clear all */}
                        {activeFilterCount > 0 && (
                            <button
                                onClick={() => { setSearch(""); setStatusFilter("all"); setSortKey("default"); }}
                                style={{
                                    alignSelf: "flex-start",
                                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                                    background: "none", border: "none",
                                    color: "rgba(239,68,68,0.6)", padding: 0,
                                }}
                            >
                                ✕ Clear all filters
                            </button>
                        )}
                    </div>
                )}

                {/* Results count */}
                {(search || statusFilter !== "all") && (
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginBottom: 10 }}>
                        Showing {filtered.length} of {trains.length} trains
                    </p>
                )}

                <div
                    className="lg:grid lg:gap-4 lg:items-start"
                    style={{
                        gridTemplateColumns: "minmax(0, 1fr) 400px",
                        minHeight: desktopPanelHeight,
                    }}
                >
                {/* ── Train list ── */}
                <div
                    className="min-w-0"
                    style={{
                        maxHeight: desktopPanelHeight,
                        overflowY: "auto",
                        paddingRight: 6,
                    }}
                >
                <div className="space-y-3">
                    {visibleTrains.map((train) => (
                        <div
                            key={train.id}
                            onClick={() => setSelectedTrain(train)}
                            className="rounded-xl p-4 flex items-center justify-between gap-4 transition-all duration-200"
                            style={{
                                background: priorityColor[train.priority] ?? "rgba(255,255,255,0.04)",
                                border: `1px solid ${priorityBorder[train.priority] ?? "rgba(255,255,255,0.08)"}`,
                                cursor: "pointer",
                            }}
                            onMouseEnter={(e) => {
                                (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
                                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 24px rgba(0,0,0,0.3)";
                            }}
                            onMouseLeave={(e) => {
                                (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                                (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                            }}
                        >
                            {/* Left — number + name */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="flex items-center gap-2 mb-1">
                                    {/* Status dot */}
                                    <span style={{
                                        width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                                        background: STATUS_DOT[train.status ?? "on_time"] ?? "#4ade80",
                                    }} />
                                    <span className="font-bold text-white text-sm">{train.trainNumber}</span>
                                    <span
                                        className="text-xs px-2 py-0.5 rounded-full font-semibold"
                                        style={{
                                            background: "rgba(255,255,255,0.08)",
                                            color: "rgba(255,255,255,0.5)",
                                        }}
                                    >
                                        {priorityLabel[train.priority] ?? "Train"}
                                    </span>
                                </div>
                                <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.45)" }}>
                                    {train.name}
                                </p>
                            </div>

                            {/* Block */}
                            <div className="text-center hidden sm:block">
                                <p className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>
                                    Block
                                </p>
                                <p className="text-sm font-bold text-white">{train.currentBlock}</p>
                                <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
                                    → {train.nextBlock}
                                </p>
                            </div>

                            {/* Speed */}
                            <div className="text-center hidden md:block">
                                <p className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>
                                    Speed
                                </p>
                                <p className="text-sm font-bold text-white"
                                    style={{ fontVariantNumeric: "tabular-nums" }}>
                                    {train.speed}
                                </p>
                                <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>km/h</p>
                            </div>

                            {/* Delay / Status */}
                            <div className="text-right">
                                {train.delayMinutes > 0 ? (
                                    <>
                                        <p className="text-sm font-extrabold"
                                            style={{
                                                color: train.delayMinutes > 8 ? "#ef4444" : "#fb923c",
                                                fontVariantNumeric: "tabular-nums"
                                            }}>
                                            +{train.delayMinutes} min
                                        </p>
                                        <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>delayed</p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-sm font-extrabold" style={{ color: "#4ade80" }}>On time</p>
                                        <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>no delay</p>
                                    </>
                                )}
                            </div>

                            {/* Chevron */}
                            <svg
                                width="14" height="14" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor"
                                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                style={{ color: "rgba(255,255,255,0.2)", flexShrink: 0 }}
                            >
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        </div>
                    ))}

                    {/* View More / Show Less button */}
                    {filtered.length > INITIAL_DISPLAY_COUNT && (
                        <button
                            onClick={() => setIsExpanded((v) => !v)}
                            style={{
                                width: "100%",
                                padding: "10px",
                                borderRadius: 10,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: "pointer",
                                background: isExpanded
                                    ? "rgba(255,255,255,0.04)"
                                    : "rgba(96,165,250,0.08)",
                                border: isExpanded
                                    ? "1px solid rgba(255,255,255,0.1)"
                                    : "1px solid rgba(96,165,250,0.2)",
                                color: isExpanded ? "rgba(255,255,255,0.5)" : "#60a5fa",
                                transition: "all 0.2s ease",
                            }}
                        >
                            {isExpanded
                                ? `Show Less`
                                : `View ${filtered.length - INITIAL_DISPLAY_COUNT} More Trains`}
                        </button>
                    )}

                    {/* Empty states */}
                    {filtered.length === 0 && trains.length > 0 && (
                        <div className="text-center py-10" style={{ color: "rgba(255,255,255,0.2)" }}>
                            <p style={{ fontSize: 24, marginBottom: 8 }}>🔍</p>
                            <p className="text-sm">No trains match your filters</p>
                            <button
                                onClick={() => { setSearch(""); setStatusFilter("all"); setSortKey("default"); }}
                                style={{
                                    marginTop: 8, fontSize: 11, fontWeight: 700,
                                    color: "#60a5fa", background: "none",
                                    border: "none", cursor: "pointer",
                                }}
                            >
                                Clear filters
                            </button>
                        </div>
                    )}

                    {trains.length === 0 && (
                        <div className="text-center py-10" style={{ color: "rgba(255,255,255,0.2)" }}>
                            <p style={{ fontSize: 24, marginBottom: 8 }}>🚂</p>
                            <p className="text-sm">No trains in section</p>
                        </div>
                    )}
                </div>
                </div>

                <div className="hidden lg:block">
                    <TrainDetailPanel
                        train={selectedTrain}
                        onClose={() => setSelectedTrain(null)}
                        variant="dock"
                    />
                </div>
                </div>
            </div>

            <div className="lg:hidden">
                <TrainDetailPanel
                    train={selectedTrain}
                    onClose={() => setSelectedTrain(null)}
                />
            </div>

            <style>{`
        @keyframes ping-soft {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
        </>
    );
}
