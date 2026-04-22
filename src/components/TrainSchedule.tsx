import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { getTrainRoute } from "../lib/api";
import { getStationName } from "../utils/seedData";

interface ScheduleStop {
  station:       string;
  arrival:       string;
  departure:     string;
  platform?:     number;
  distance?:     number;
  delayMinutes?: number;
  status:        "departed" | "on-time" | "delayed" | "upcoming";
}

interface TrainScheduleProps {
  trainId?:   string;
  trainNo:   string;
  trainName: string;
  currentBlock?: string;
  fromStation?: string;
  toStation?: string;
  delayMinutes?: number;
  onClose:   () => void;
}

const STATUS_COLOR: Record<string, string> = {
  "departed": "rgba(255,255,255,0.2)",
  "on-time":  "#4ade80",
  "delayed":  "#f97316",
  "upcoming": "rgba(255,255,255,0.4)",
};

const STATUS_LABEL: Record<string, string> = {
  "departed": "DEPARTED",
  "on-time":  "ON TIME",
  "delayed":  "DELAYED",
  "upcoming": "UPCOMING",
};

function inferCurrentRouteIndex(currentBlock: string | undefined, stopCount: number) {
  if (!currentBlock || stopCount <= 1) return 0;
  const match = currentBlock.match(/(\d+)/);
  const blockNum = Number(match?.[1] ?? 1);
  const normalized = Math.max(1, Math.min(6, blockNum));
  return Math.min(
    stopCount - 1,
    Math.round(((normalized - 1) / 5) * (stopCount - 1))
  );
}

function minutesToTime(totalMinutes: number) {
  const mins = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function buildRouteSchedule(
  route: { station_code: string; station_name: string }[],
  currentBlock?: string,
  delayMinutes = 0
): ScheduleStop[] {
  if (route.length === 0) return [];

  const currentIdx = inferCurrentRouteIndex(currentBlock, route.length);
  const spacing = route.length > 10 ? 52 : 72;
  const startMinutes = 6 * 60;

  return route.map((stop, idx) => {
    const arr = startMinutes + idx * spacing;
    const dep = arr + (idx === 0 || idx === route.length - 1 ? 0 : 4);
    const status: ScheduleStop["status"] =
      idx < currentIdx ? "departed" : idx === currentIdx ? (delayMinutes > 0 ? "delayed" : "on-time") : "upcoming";

    return {
      station: `${stop.station_name} (${stop.station_code})`,
      arrival: idx === 0 ? "—" : minutesToTime(arr),
      departure: idx === route.length - 1 ? "—" : minutesToTime(dep),
      platform: (idx % 6) + 1,
      distance: idx * 68,
      delayMinutes: idx === currentIdx && delayMinutes > 0 ? delayMinutes : undefined,
      status,
    };
  });
}

function alignRouteDirection(
  route: { station_code: string; station_name: string }[],
  fromStation?: string,
  toStation?: string
) {
  if (route.length < 2) return route;
  const fromCode = fromStation?.toUpperCase();
  const toCode = toStation?.toUpperCase();
  const codes = route.map((stop) => stop.station_code.toUpperCase());

  if (fromCode && toCode) {
    if (codes[0] === fromCode && codes[codes.length - 1] === toCode) return route;
    if (codes[0] === toCode && codes[codes.length - 1] === fromCode) return [...route].reverse();
    if (codes.includes(fromCode) && codes.includes(toCode) && codes.indexOf(fromCode) > codes.indexOf(toCode)) {
      return [...route].reverse();
    }
  }

  if (fromCode && codes[codes.length - 1] === fromCode) return [...route].reverse();
  if (toCode && codes[0] === toCode) return [...route].reverse();
  return route;
}

function generateFallbackSchedule(
  trainNo: string,
  currentBlock?: string,
  fromStation?: string,
  toStation?: string,
  delayMinutes = 0
): ScheduleStop[] {
  const route = [
    { station_code: fromStation ?? "NDLS", station_name: getStationName(fromStation ?? "NDLS") },
    { station_code: "GZB", station_name: "Ghaziabad" },
    { station_code: "ALJN", station_name: "Aligarh Jn" },
    { station_code: "MTJ", station_name: "Mathura Jn" },
    { station_code: "AGC", station_name: "Agra Cantt" },
    { station_code: "GWL", station_name: "Gwalior" },
    { station_code: "BPL", station_name: "Bhopal Jn" },
    { station_code: "ET", station_name: "Itarsi Jn" },
    { station_code: toStation ?? "NGP", station_name: getStationName(toStation ?? "NGP") },
  ].filter((stop, index, arr) => arr.findIndex((candidate) => candidate.station_code === stop.station_code) === index);

  return buildRouteSchedule(route, currentBlock, delayMinutes);
}

export default function TrainSchedule({
  trainId,
  trainNo,
  trainName,
  currentBlock,
  fromStation,
  toStation,
  delayMinutes,
  onClose,
}: TrainScheduleProps) {
  const [schedule, setSchedule] = useState<ScheduleStop[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        if (trainId) {
          const snap = await getDocs(
            query(
              collection(db, "trains", trainId, "schedule"),
              orderBy("distance", "asc")
            )
          );
          if (!snap.empty) {
            setSchedule(snap.docs.map((d) => d.data() as ScheduleStop));
            return;
          }
        }

        const routeRes = await getTrainRoute(trainNo);
        if (routeRes.route.length > 0) {
          const alignedRoute = alignRouteDirection(routeRes.route, fromStation, toStation);
          setSchedule(buildRouteSchedule(alignedRoute, currentBlock, delayMinutes ?? 0));
          return;
        }

        setSchedule(generateFallbackSchedule(trainNo, currentBlock, fromStation, toStation, delayMinutes ?? 0));
      } catch {
        setSchedule(generateFallbackSchedule(trainNo, currentBlock, fromStation, toStation, delayMinutes ?? 0));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [trainId, trainNo, currentBlock, fromStation, toStation, delayMinutes]);

  const currentIdx = schedule.findIndex((s) => s.status === "on-time" || s.status === "delayed");
  const progress   = schedule.length > 0
    ? Math.round(((currentIdx < 0 ? 0 : currentIdx) / (schedule.length - 1)) * 100)
    : 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, animation: "fade-in 0.15s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(860px, calc(100vw - 32px))", maxHeight: "92vh",
          background: "#0f0f0f",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 20, overflow: "hidden",
          display: "flex", flexDirection: "column",
          boxShadow: "0 0 60px rgba(0,0,0,0.8)",
          animation: "slide-up 0.2s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "18px 20px 14px",
          background: "rgba(255,255,255,0.03)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{trainNo}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 99, padding: "2px 9px",
                  color: "rgba(255,255,255,0.5)",
                }}>📋 SCHEDULE</span>
              </div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{trainName}</p>
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

          {/* Journey progress bar */}
          {!loading && (
            <div style={{ marginTop: 12 }}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                marginBottom: 5, fontSize: 10, color: "rgba(255,255,255,0.3)",
              }}>
                <span>{schedule[0]?.station?.split("(")[1]?.replace(")", "") ?? "Origin"}</span>
                <span style={{ color: "#60a5fa", fontWeight: 700 }}>{progress}% complete</span>
                <span>{schedule[schedule.length - 1]?.station?.split("(")[1]?.replace(")", "") ?? "Destination"}</span>
              </div>
              <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,0.06)" }}>
                <div style={{
                  height: "100%", borderRadius: 99,
                  width: `${progress}%`,
                  background: "linear-gradient(90deg, #4ade80, #60a5fa)",
                  transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)",
                }} />
              </div>
            </div>
          )}
        </div>

        {/* Schedule list */}
        <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
          {loading ? (
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{
                  height: 56, borderRadius: 10,
                  background: "rgba(255,255,255,0.04)",
                  animation: `shimmer 1.5s ease ${i * 0.1}s infinite`,
                }} />
              ))}
            </div>
          ) : (
            schedule.map((stop, idx) => {
              const isCurrent  = idx === currentIdx;
              const isDeparted = stop.status === "departed";
              const color      = STATUS_COLOR[stop.status];

              return (
                <div
                  key={idx}
                  style={{
                    display: "flex", alignItems: "stretch",
                    padding: "0 20px",
                    opacity: isDeparted ? 0.45 : 1,
                    background: isCurrent ? "rgba(96,165,250,0.05)" : "transparent",
                    borderLeft: isCurrent ? "2px solid #60a5fa" : "2px solid transparent",
                  }}
                >
                  {/* Timeline spine */}
                  <div style={{
                    display: "flex", flexDirection: "column",
                    alignItems: "center", marginRight: 14,
                    paddingTop: 14,
                  }}>
                    <div style={{
                      width:  isCurrent ? 12 : 8,
                      height: isCurrent ? 12 : 8,
                      borderRadius: "50%",
                      background: isCurrent ? "#60a5fa" : color,
                      border: isCurrent ? "2px solid rgba(96,165,250,0.4)" : "none",
                      boxShadow: isCurrent ? "0 0 8px rgba(96,165,250,0.6)" : "none",
                      flexShrink: 0,
                      marginTop: 2,
                    }} />
                    {idx < schedule.length - 1 && (
                      <div style={{
                        width: 1, flex: 1, minHeight: 24,
                        background: isDeparted
                          ? "rgba(255,255,255,0.15)"
                          : "rgba(255,255,255,0.07)",
                        marginTop: 4,
                      }} />
                    )}
                  </div>

                  {/* Stop content */}
                  <div style={{
                    flex: 1, padding: "12px 0",
                    borderBottom: idx < schedule.length - 1
                      ? "1px solid rgba(255,255,255,0.04)"
                      : "none",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{
                          fontSize: 13, fontWeight: isCurrent ? 800 : 600,
                          color: isCurrent ? "#fff" : isDeparted ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.75)",
                          marginBottom: 3,
                        }}>
                          {stop.station}
                        </div>
                        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                          {stop.arrival !== "—" && (
                            <span>Arr: <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>{stop.arrival}</span></span>
                          )}
                          {stop.departure !== "—" && (
                            <span>Dep: <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>{stop.departure}</span></span>
                          )}
                          {stop.platform && (
                            <span>Pf: <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>{stop.platform}</span></span>
                          )}
                          {stop.distance != null && (
                            <span style={{ color: "rgba(255,255,255,0.2)" }}>{stop.distance} km</span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 800,
                          color,
                          background: `${color}15`,
                          border: `1px solid ${color}25`,
                          borderRadius: 99, padding: "2px 7px",
                          letterSpacing: "0.05em",
                        }}>
                          {STATUS_LABEL[stop.status]}
                        </span>
                        {stop.delayMinutes != null && stop.delayMinutes > 0 && (
                          <span style={{ fontSize: 10, color: "#f97316", fontWeight: 700 }}>
                            +{stop.delayMinutes} min
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "10px 20px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.02)",
          flexShrink: 0,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
            {schedule.length} stops · route-aware live schedule
          </span>
          <button
            onClick={onClose}
            style={{
              fontSize: 11, fontWeight: 700, cursor: "pointer",
              padding: "6px 14px", borderRadius: 8,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.5)",
            }}>
            Close
          </button>
        </div>
      </div>

      <style>{`
        @keyframes shimmer { 0%,100%{opacity:0.4} 50%{opacity:0.75} }
        @keyframes fade-in { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slide-up { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}
