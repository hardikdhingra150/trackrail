import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PassengerPageShell from "../components/PassengerPageShell";
import { getStationName } from "../utils/seedData";
import {
  getPlatformForecast,
  readPlatformAlertPreference,
  searchPassengerTrains,
  writePlatformAlertPreference,
} from "../utils/passengerInsights";
import type { PlatformAlertPreference } from "../types";

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

export default function PlatformAlerts() {
  const [query, setQuery] = useState("12301");
  const candidates = useMemo(() => searchPassengerTrains(query).slice(0, 6), [query]);
  const selectedTrainNumber = candidates[0]?.trainNumber ?? query;
  const forecast = useMemo(() => getPlatformForecast(selectedTrainNumber), [selectedTrainNumber]);
  const [preference, setPreference] = useState<PlatformAlertPreference>(() => readPlatformAlertPreference("12301"));

  useEffect(() => {
    setPreference(readPlatformAlertPreference(selectedTrainNumber));
  }, [selectedTrainNumber]);

  const updatePreference = (patch: Partial<PlatformAlertPreference>) => {
    const next = { ...preference, ...patch, trainNumber: selectedTrainNumber };
    setPreference(next);
    writePlatformAlertPreference(next);
  };

  return (
    <PassengerPageShell
      badge="Platform Prediction + Alerts"
      title={
        <>
          Boarding guidance,
          <span className="block text-white/90" style={{ WebkitTextStroke: "1px rgba(255,255,255,0.35)" }}>
            before the rush begins.
          </span>
        </>
      }
      description="Predict likely platform assignments, crowd conditions, and boarding windows, then subscribe to the alerts that matter for that train."
      actions={
        <>
          <Link
            to="/live-status"
            className="rounded-full bg-white px-5 py-3 text-sm font-bold text-black transition-all duration-200 hover:-translate-y-0.5"
          >
            Open Live Status
          </Link>
          <Link
            to="/book"
            className="rounded-full px-5 py-3 text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.2)",
              backdropFilter: "blur(12px)",
            }}
          >
            Book Ticket
          </Link>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div
          className="rounded-[30px] p-5 md:p-6"
          style={{
            background: "rgba(0,0,0,0.34)",
            border: "1px solid rgba(255,255,255,0.11)",
            backdropFilter: "blur(28px)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
          }}
        >
          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Train for alerts</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Train number or name"
            style={inputStyle()}
          />

          <div className="mt-5 space-y-3">
            {candidates.map((train) => (
              <button
                key={train.trainNumber}
                onClick={() => setQuery(train.trainNumber)}
                className="w-full rounded-2xl border border-white/8 bg-white/4 p-4 text-left hover:bg-white/6"
              >
                <p className="text-sm font-bold text-white">{train.trainName}</p>
                <p className="mt-1 text-xs text-white/45">{train.trainNumber}</p>
                <p className="mt-3 text-sm text-white/70">
                  {getStationName(train.fromStation)} → {getStationName(train.toStation)}
                </p>
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-white/8 bg-white/4 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/30">Alert preferences</p>
            <div className="mt-4 space-y-3">
              {[
                { key: "platformAlerts", label: "Platform change alerts" },
                { key: "delayAlerts", label: "Delay escalation alerts" },
                { key: "boardingReminder", label: "Boarding reminder" },
                { key: "crowdAlerts", label: "Crowd advisory alerts" },
              ].map((item) => (
                <label key={item.key} className="flex items-center justify-between gap-4 text-sm text-white/75">
                  {item.label}
                  <input
                    type="checkbox"
                    checked={Boolean(preference[item.key as keyof PlatformAlertPreference])}
                    onChange={(e) => updatePreference({ [item.key]: e.target.checked } as Partial<PlatformAlertPreference>)}
                    className="h-4 w-4 accent-white"
                  />
                </label>
              ))}
            </div>
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
          {!forecast ? (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-white/4 p-8 text-center text-white/45">
              Search a train to generate a platform prediction.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/35">Predicted platform board</p>
                  <h2 className="mt-2 text-3xl font-extrabold text-white">{forecast.trainName}</h2>
                  <p className="mt-2 text-sm text-white/45">
                    {forecast.trainNumber} · {getStationName(forecast.currentStation)} → {getStationName(forecast.nextStation)}
                  </p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white">
                  {forecast.estimatedPlatform}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  { label: "Current platform", value: forecast.currentPlatform },
                  { label: "Predicted platform", value: forecast.estimatedPlatform },
                  { label: "Coach zone", value: `Zone ${forecast.coachZone}` },
                  { label: "Boarding window", value: forecast.boardingWindow },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/8 bg-white/4 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/30">{item.label}</p>
                    <p className="mt-3 text-lg font-extrabold text-white">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/30">Crowd level</p>
                  <p className="mt-3 text-lg font-extrabold text-white">{forecast.crowdLevel}</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/30">Delay trend</p>
                  <p className="mt-3 text-lg font-extrabold text-white">{forecast.delayMinutes} min</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/30">Alerts armed</p>
                  <p className="mt-3 text-lg font-extrabold text-white">
                    {[preference.platformAlerts, preference.delayAlerts, preference.boardingReminder, preference.crowdAlerts].filter(Boolean).length}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-white/8 bg-white/4 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/30">Recommended action</p>
                <p className="mt-3 text-white/80">{forecast.recommendation}</p>
              </div>
            </>
          )}
        </div>
      </div>
    </PassengerPageShell>
  );
}
