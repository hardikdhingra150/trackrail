import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PassengerPageShell from "../components/PassengerPageShell";
import { getStationName } from "../utils/seedData";
import { getLiveStatus } from "../utils/passengerInsights";

function inputStyle() {
  return {
    width: "100%",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 14,
    padding: "12px 14px",
    fontSize: 14,
    color: "#fff",
    outline: "none",
  } as const;
}

export default function LiveTrainStatus() {
  const [query, setQuery] = useState("12301");
  const results = useMemo(() => getLiveStatus(query).slice(0, 6), [query]);
  const lead = results[0];

  return (
    <PassengerPageShell
      badge="Live Running Status"
      title={
        <>
          Running position,
          <span className="block text-white/90" style={{ WebkitTextStroke: "1px rgba(255,255,255,0.35)" }}>
            with delay and route context.
          </span>
        </>
      }
      description="Search any demo train by number or name to see where it is now, what comes next, and how late it is trending."
      actions={
        <>
          <Link
            to="/platform-alerts"
            className="rounded-full bg-white px-5 py-3 text-sm font-bold text-black transition-all duration-200 hover:-translate-y-0.5"
          >
            Open Platform Alerts
          </Link>
          <Link
            to="/journey-planner"
            className="rounded-full px-5 py-3 text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.2)",
              backdropFilter: "blur(12px)",
            }}
          >
            Journey Planner
          </Link>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div
          className="rounded-[30px] p-5 md:p-6"
          style={{
            background: "rgba(0,0,0,0.34)",
            border: "1px solid rgba(255,255,255,0.11)",
            backdropFilter: "blur(28px)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
          }}
        >
          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Search Train</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try 12301, Rajdhani, Telangana..."
            style={inputStyle()}
          />

          <div className="mt-5 space-y-3">
            {results.map((status) => (
              <button
                key={status.trainNumber}
                onClick={() => setQuery(status.trainNumber)}
                className="w-full rounded-2xl border border-white/8 bg-white/4 p-4 text-left hover:bg-white/6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-white">{status.trainName}</p>
                    <p className="mt-1 text-xs text-white/45">{status.trainNumber}</p>
                  </div>
                  <span className="text-xs text-white/45">{status.delayMinutes} min late</span>
                </div>
                <p className="mt-3 text-sm text-white/70">
                  {getStationName(status.currentStation)} → {getStationName(status.nextStation)}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div
          className="rounded-[30px] p-5 md:p-6"
          style={{
            background: "rgba(0,0,0,0.34)",
            border: "1px solid rgba(255,255,255,0.11)",
            backdropFilter: "blur(28px)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
          }}
        >
          {!lead ? (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-white/4 p-8 text-center text-white/45">
              No train matched that search yet.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/35">Live Snapshot</p>
                  <h2 className="mt-2 text-3xl font-extrabold text-white">{lead.trainName}</h2>
                  <p className="mt-2 text-sm text-white/45">
                    {lead.trainNumber} · {getStationName(lead.fromStation)} → {getStationName(lead.toStation)}
                  </p>
                </div>
                <span
                  className="rounded-full px-3 py-1.5 text-xs font-bold"
                  style={{
                    background:
                      lead.status === "ON_TIME"
                        ? "rgba(74,222,128,0.12)"
                        : lead.status === "DELAYED"
                          ? "rgba(251,191,36,0.12)"
                          : "rgba(248,113,113,0.12)",
                    color:
                      lead.status === "ON_TIME"
                        ? "#4ade80"
                        : lead.status === "DELAYED"
                          ? "#fbbf24"
                          : "#f87171",
                  }}
                >
                  {lead.status}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  { label: "Current station", value: getStationName(lead.currentStation) },
                  { label: "Next station", value: getStationName(lead.nextStation) },
                  { label: "Speed", value: `${lead.speedKmph} km/h` },
                  { label: "Delay", value: `${lead.delayMinutes} min` },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/8 bg-white/4 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/30">{item.label}</p>
                    <p className="mt-3 text-lg font-extrabold text-white">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-white/8 bg-white/4 p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-bold text-white">Route progress</p>
                  <p className="text-xs text-white/45">{lead.progress}% covered</p>
                </div>
                <div className="mt-3 h-2 rounded-full bg-white/8">
                  <div className="h-full rounded-full bg-white" style={{ width: `${lead.progress}%` }} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {lead.route.map((stop) => (
                    <span
                      key={`${lead.trainNumber}-${stop}`}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold"
                      style={{
                        background:
                          stop === lead.currentStation
                            ? "rgba(255,255,255,0.16)"
                            : stop === lead.nextStation
                              ? "rgba(255,255,255,0.1)"
                              : "rgba(255,255,255,0.04)",
                        color: stop === lead.currentStation ? "#fff" : "rgba(255,255,255,0.6)",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      {getStationName(stop)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/30">Platform</p>
                  <p className="mt-3 text-xl font-extrabold text-white">{lead.estimatedPlatform}</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/30">Scheduled arrival</p>
                  <p className="mt-3 text-xl font-extrabold text-white">{lead.scheduledArrival}</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/30">Estimated arrival</p>
                  <p className="mt-3 text-xl font-extrabold text-white">{lead.estimatedArrival}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </PassengerPageShell>
  );
}
