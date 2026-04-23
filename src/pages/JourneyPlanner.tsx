import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PassengerPageShell from "../components/PassengerPageShell";
import { formatStationDetail, formatStationLabel, resolveStationQuery, searchStations, getStationName } from "../utils/seedData";
import { buildJourneyPlans, formatJourneyDuration } from "../utils/passengerInsights";
import type { Station } from "../types";

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

export default function JourneyPlanner() {
  const [fromQuery, setFromQuery] = useState("New Delhi");
  const [toQuery, setToQuery] = useState("Kolkata");
  const [activeField, setActiveField] = useState<"from" | "to" | null>(null);

  const fromSuggestions = useMemo(() => searchStations(fromQuery).slice(0, 8), [fromQuery]);
  const toSuggestions = useMemo(() => searchStations(toQuery).slice(0, 8), [toQuery]);
  const resolvedFrom = useMemo(() => resolveStationQuery(fromQuery), [fromQuery]);
  const resolvedTo = useMemo(() => resolveStationQuery(toQuery), [toQuery]);
  const plans = useMemo(() => buildJourneyPlans(fromQuery, toQuery), [fromQuery, toQuery]);

  const selectStation = (field: "from" | "to", station: Station) => {
    if (field === "from") setFromQuery(formatStationLabel(station));
    else setToQuery(formatStationLabel(station));
    setActiveField(null);
  };

  return (
    <PassengerPageShell
      badge="Journey Planner"
      title={
        <>
          Multi-train planning,
          <span className="block text-white/90" style={{ WebkitTextStroke: "1px rgba(255,255,255,0.35)" }}>
            tuned for delay-aware travel.
          </span>
        </>
      }
      description="Compare direct and one-stop options, weigh layover risk, and choose the cleanest route before you head into booking."
      actions={
        <>
          <Link
            to="/book"
            className="rounded-full bg-white px-5 py-3 text-sm font-bold text-black transition-all duration-200 hover:-translate-y-0.5"
          >
            Go to Booking
          </Link>
          <Link
            to="/live-status"
            className="rounded-full px-5 py-3 text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.2)",
              backdropFilter: "blur(12px)",
            }}
          >
            Check Live Status
          </Link>
        </>
      }
    >
      <div
        className="rounded-[30px] p-5 md:p-6"
        style={{
          background: "rgba(0,0,0,0.34)",
          border: "1px solid rgba(255,255,255,0.11)",
          backdropFilter: "blur(28px)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
        }}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="relative">
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">From City / Station</label>
            <input
              value={fromQuery}
              onFocus={() => setActiveField("from")}
              onChange={(e) => setFromQuery(e.target.value)}
              placeholder="Search origin"
              style={inputStyle()}
            />
            {resolvedFrom && <p className="mt-2 text-xs text-white/45">{formatStationDetail(resolvedFrom)}</p>}
            {activeField === "from" && fromSuggestions.length > 0 && (
              <div
                className="absolute left-0 right-0 top-[100%] z-20 mt-2 overflow-hidden rounded-2xl"
                style={{ background: "rgba(10,10,10,0.92)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(20px)" }}
              >
                {fromSuggestions.map((station) => (
                  <button
                    key={station.code}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectStation("from", station)}
                    className="w-full border-b border-white/8 px-4 py-3 text-left last:border-b-0 hover:bg-white/5"
                  >
                    <p className="text-sm font-semibold text-white">{formatStationLabel(station)}</p>
                    <p className="text-xs text-white/45">{formatStationDetail(station)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">To City / Station</label>
            <input
              value={toQuery}
              onFocus={() => setActiveField("to")}
              onChange={(e) => setToQuery(e.target.value)}
              placeholder="Search destination"
              style={inputStyle()}
            />
            {resolvedTo && <p className="mt-2 text-xs text-white/45">{formatStationDetail(resolvedTo)}</p>}
            {activeField === "to" && toSuggestions.length > 0 && (
              <div
                className="absolute left-0 right-0 top-[100%] z-20 mt-2 overflow-hidden rounded-2xl"
                style={{ background: "rgba(10,10,10,0.92)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(20px)" }}
              >
                {toSuggestions.map((station) => (
                  <button
                    key={station.code}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectStation("to", station)}
                    className="w-full border-b border-white/8 px-4 py-3 text-left last:border-b-0 hover:bg-white/5"
                  >
                    <p className="text-sm font-semibold text-white">{formatStationLabel(station)}</p>
                    <p className="text-xs text-white/45">{formatStationDetail(station)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">Suggested itineraries</h2>
            <p className="mt-1 text-sm text-white/45">Best-ranked options based on duration, layover strength, and average delay profile.</p>
          </div>
          <span className="text-xs uppercase tracking-[0.16em] text-white/35">{plans.length} route options</span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {plans.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-white/4 p-8 text-center text-white/45 xl:col-span-2">
              No direct or one-stop route is available in the demo data for this city pair yet.
            </div>
          ) : (
            plans.map((plan) => (
              <div key={plan.id} className="rounded-[24px] border border-white/10 bg-white/4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/35">
                      {plan.type === "DIRECT" ? "Direct Journey" : `1 stop via ${getStationName(plan.transferStation ?? "")}`}
                    </p>
                    <p className="mt-2 text-2xl font-extrabold text-white">{formatJourneyDuration(plan.totalDurationMinutes)}</p>
                  </div>
                  <span
                    className="rounded-full px-3 py-1.5 text-xs font-bold"
                    style={{
                      background:
                        plan.confidenceLabel === "STEADY"
                          ? "rgba(74,222,128,0.12)"
                          : plan.confidenceLabel === "WATCH"
                            ? "rgba(251,191,36,0.12)"
                            : "rgba(248,113,113,0.12)",
                      color:
                        plan.confidenceLabel === "STEADY"
                          ? "#4ade80"
                          : plan.confidenceLabel === "WATCH"
                            ? "#fbbf24"
                            : "#f87171",
                    }}
                  >
                    {plan.confidenceLabel}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {plan.legs.map((leg, index) => (
                    <div key={`${plan.id}-${leg.trainNumber}`} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-bold text-white">{leg.trainName}</p>
                          <p className="mt-1 text-xs text-white/45">{leg.trainNumber}</p>
                        </div>
                        <span className="text-xs text-white/45">Avg delay {leg.avgDelayMinutes} min</span>
                      </div>
                      <p className="mt-3 text-sm text-white/75">
                        {getStationName(leg.fromStation)} ({leg.departureTime}) → {getStationName(leg.toStation)} ({leg.arrivalTime})
                      </p>
                      {index === 0 && plan.layoverMinutes ? (
                        <p className="mt-2 text-xs text-white/45">Layover at {getStationName(plan.transferStation ?? "")}: {formatJourneyDuration(plan.layoverMinutes)}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </PassengerPageShell>
  );
}
