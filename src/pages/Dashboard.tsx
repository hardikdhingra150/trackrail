import { signOut } from "firebase/auth";
import { Link, useNavigate } from "react-router-dom";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "../lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useEffect, useState, useCallback, useRef } from "react";
import TrainPanel from "../components/TrainPanel";
import ConflictPanel from "../components/ConflictPanel";
import RecommendationPanel from "../components/RecommendationPanel";
import KpiCards from "../components/KpiCards";
import BlockMap from "../components/BlockMap";
import Analytics from "./Analytics";
import OptimizationStudio from "../components/OptimizationStudio";
import OnboardingTour from "../components/OnboardingTour";
import PredictiveWarningBanner from "../components/PredictiveWarningBanner";
import { getAllTrainDelays } from '../utils/simulateTrains';
import { seedFirestoreTrains } from '../utils/seedData';
import { useToast } from "../components/ToastProvider";
import type { DelayPrediction, FirestoreTrain } from "../types";

type Tab = "dashboard" | "analytics" | "optimization";



interface Notification {
  id: string;
  title: string;
  body: string;
  type: "error" | "warning" | "info";
  time: string;
  read: boolean;
}

const POLL_INTERVAL_MS = 60_000;
export default function Dashboard() {
  const navigate = useNavigate();
  const [user] = useAuthState(auth);
  const [clock, setClock] = useState(new Date());
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastTick, setLastTick] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [tickCount, setTickCount] = useState(0);
  const [notifications, setNotifs] = useState<Notification[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showTour, setShowTour] = useState(() => !sessionStorage.getItem("tourDone"));
  const [delays, setDelays] = useState<DelayPrediction[]>([]);
  const [liveTrains, setLiveTrains] = useState<FirestoreTrain[]>([]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seenHighAlertsRef = useRef<Set<string>>(new Set());
  const { showToast } = useToast();

  // ── Clock ────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Fetch RF delay predictions ───────────────────────────
  const fetchDelays = useCallback(async () => {
    if (liveTrains.length === 0) return;
    setIsLoading(true);
    try {
      const predictions = await getAllTrainDelays(liveTrains);
      setDelays(predictions);

      const currentHighKeys = new Set(
        predictions
          .filter((prediction) => prediction.delay_class === "HIGH")
          .map((prediction) => `${prediction.train_number}-${prediction.station_code}-${prediction.delay_class}`)
      );

      const newHighPredictions = predictions.filter((prediction) => {
        if (prediction.delay_class !== "HIGH") return false;
        const key = `${prediction.train_number}-${prediction.station_code}-${prediction.delay_class}`;
        return !seenHighAlertsRef.current.has(key);
      });

      newHighPredictions.slice(0, 2).forEach((p) => {
          showToast(
            `HIGH delay predicted`,
            "error",
            `Train ${p.train_number} at ${p.station_code} — avg ${p.average_delay_minutes}min`,
          );
          setNotifs(prev => [{
            id: `${p.train_number}-${Date.now()}`,
            title: `🚨 High Delay — Train ${p.train_number}`,
            body: p.explanation?.reason ?? `Avg delay ${p.average_delay_minutes}min at ${p.station_code}`,
            type: "error",
            time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }),
            read: false,
          }, ...prev.slice(0, 19)]);
        });

      seenHighAlertsRef.current = currentHighKeys;

      setLastTick(new Date().toLocaleTimeString("en-IN", { hour12: false }));
      setTickCount(c => c + 1);
    } catch (err) {
      console.error("[Dashboard] fetchDelays failed:", err);
      showToast("API Error", "error", "Could not reach prediction server");
    } finally {
      setIsLoading(false);
    }
  }, [liveTrains, showToast]);

  // ── Shared trains subscription ───────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "trains"), (snap) => {
      const seen = new Set<string>();
      const trains = snap.docs.flatMap((doc) => {
        const data = doc.data();
        const trainNumber = String(data.trainNumber ?? doc.id);
        if (seen.has(trainNumber)) return [];
        seen.add(trainNumber);
        return [{
          id: doc.id,
          trainNumber,
          name: String(data.name ?? data.trainName ?? trainNumber),
          currentBlock: String(data.currentBlock ?? "B1"),
          nextBlock: String(data.nextBlock ?? ""),
          speed: Number(data.speed ?? 0),
          delayMinutes: Number(data.delayMinutes ?? 0),
          priority: Number(data.priority ?? 1),
          stationCode: data.stationCode ? String(data.stationCode) : undefined,
          fromStation: data.fromStation ? String(data.fromStation) : undefined,
          toStation: data.toStation ? String(data.toStation) : undefined,
          departureTime: data.departureTime ? String(data.departureTime) : undefined,
          arrivalTime: data.arrivalTime ? String(data.arrivalTime) : undefined,
          status: (["on_time", "delayed", "critical"].includes(String(data.status))
            ? String(data.status)
            : "on_time") as FirestoreTrain["status"],
        }];
      });
      setLiveTrains(trains);
    });
    return () => unsub();
  }, []);

  // ── Start / stop live polling ────────────────────────────
  const startLive = useCallback(() => {
    if (intervalRef.current) return;
    fetchDelays();
    intervalRef.current = setInterval(fetchDelays, POLL_INTERVAL_MS);
    setIsLive(true);
  }, [fetchDelays]);

  const stopLive = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsLive(false);
  }, []);

  const toggleLive = useCallback(() =>
    isLive ? stopLive() : startLive(),
    [isLive, startLive, stopLive]);

  // ── Seed Firestore + auto-start on mount ─────────────────
  useEffect(() => {
    if (liveTrains.length === 0) {
      seedFirestoreTrains();
    }
    startLive();
    return () => stopLive();
  }, [liveTrains.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard shortcuts ───────────────────────────────────
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "1") setActiveTab("dashboard");
      if (e.key === "2") setActiveTab("analytics");
      if (e.key === "3") setActiveTab("optimization");
      if (e.key === " ") { e.preventDefault(); toggleLive(); }
      if (e.key === "Escape") setShowNotifs(false);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [toggleLive]);

  const handleSignOut = async () => {
    stopLive();
    await signOut(auth);
    navigate("/login", { replace: true });
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const markAllRead = () => setNotifs(p => p.map(n => ({ ...n, read: true })));

  const timeStr = clock.toLocaleTimeString("en-IN",
    { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const dateStr = clock.toLocaleDateString("en-IN",
    { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="min-h-screen flex flex-col bg-[#080c14] text-white relative overflow-x-hidden">

      {/* Ambient video */}
      <video
        autoPlay muted loop playsInline
        className="fixed inset-0 w-full h-full object-cover opacity-[0.18] pointer-events-none z-0"
      >
        <source src="/hero-video.mp4" type="video/mp4" />
      </video>

      {/* Radial glows */}
      <div className="fixed -top-48 -left-48 w-[700px] h-[700px] rounded-full pointer-events-none z-0"
        style={{ background: "radial-gradient(circle, rgba(245,158,11,0.13) 0%, transparent 70%)" }} />
      <div className="fixed -bottom-48 -right-48 w-[600px] h-[600px] rounded-full pointer-events-none z-0"
        style={{ background: "radial-gradient(circle, rgba(96,165,250,0.10) 0%, transparent 70%)" }} />

      {/* ══════════════════════ NAVBAR ══════════════════════ */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-5 py-3
        bg-transparent border-b border-white/[0.04] backdrop-blur-sm">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl grid place-items-center font-black text-sm
            bg-white text-[#080c14] shadow-[0_4px_16px_rgba(255,255,255,0.12)]">
            T
          </div>
          <div className="hidden sm:block">
            <p className="font-extrabold text-sm tracking-tight leading-none">
              TrackMind<span className="text-amber-400"> AI</span>
            </p>
            <p className="text-[10px] mt-0.5 text-white/30 leading-none">
              Railway Intelligence Platform
            </p>
          </div>
        </div>

        {/* Center — Live pill + clock */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold
            bg-black/30 border border-white/[0.08] text-white/50">
            <span className={`w-1.5 h-1.5 rounded-full inline-block ${isLive
                ? "bg-emerald-400 shadow-[0_0_0_3px_rgba(74,222,128,0.2)] animate-pulse"
                : "bg-white/20"
              }`} />
            {isLoading
              ? "Fetching predictions…"
              : isLive
                ? `Live · multi-route · ${delays.length} trains`
                : "Paused · RF Model"}
          </div>
          <div
            className="flex flex-col items-center px-3 py-1.5 rounded-full
              bg-white/[0.04] border border-white/[0.07] text-xs leading-tight"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            <span className="font-bold text-white tracking-widest">{timeStr}</span>
            <span className="text-[10px] text-white/25">{dateStr}</span>
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">

          {/* Keyboard hints */}
          <div className="hidden lg:flex items-center gap-3 mr-1">
            {[
              { key: "1", label: "Dash" },
              { key: "2", label: "Analytics" },
              { key: "3", label: "Optimizer" },
              { key: "Space", label: "Live" },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-1 text-[10px] text-white/20">
                <kbd className="bg-white/[0.06] border border-white/10 rounded
                  px-1.5 py-0.5 font-mono text-[9px] text-white/30">{key}</kbd>
                {label}
              </div>
            ))}
          </div>

          {/* Notification bell */}
          <div className="relative">
            <button
              onClick={() => { setShowNotifs(v => !v); markAllRead(); }}
              className={`w-9 h-9 rounded-xl grid place-items-center cursor-pointer transition-all
                ${unreadCount > 0
                  ? "bg-red-500/10 border border-red-500/30 text-red-400"
                  : "bg-white/[0.04] border border-white/[0.08] text-white/35 hover:bg-white/[0.08]"
                }`}
              title="Notifications"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500
                  text-white text-[9px] font-black grid place-items-center
                  border-2 border-[#080c14]">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute top-[calc(100%+10px)] right-0 w-80 max-h-96
                overflow-y-auto bg-[#111218]/95 border border-white/10 rounded-2xl z-50
                shadow-[0_16px_48px_rgba(0,0,0,0.7)] backdrop-blur-xl">
                <div className="flex items-center justify-between px-4 py-3
                  border-b border-white/[0.07]">
                  <p className="text-sm font-bold text-white">Notifications</p>
                  <button
                    onClick={markAllRead}
                    className="text-[10px] text-blue-400 hover:text-blue-300
                      transition-colors cursor-pointer bg-transparent border-none"
                  >Mark all read</button>
                </div>
                {notifications.length === 0 ? (
                  <div className="py-10 text-center text-xs text-white/20">
                    No notifications yet
                  </div>
                ) : (
                  notifications.slice(0, 10).map(n => (
                    <div
                      key={n.id}
                      className={`px-4 py-3 border-b border-white/[0.05]
                        ${n.read ? "bg-transparent" : "bg-white/[0.02]"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{n.title}</p>
                          <p className="text-[11px] mt-0.5 text-white/40 truncate">{n.body}</p>
                        </div>
                        <span className="text-[10px] text-white/20 shrink-0">{n.time}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* User info */}
          {user && (
            <div className="hidden sm:flex items-center gap-2 px-2 py-1.5 rounded-xl
              bg-white/[0.04] border border-white/[0.07]">
              {user.photoURL ? (
                <img
                  src={user.photoURL} alt="avatar" width={26} height={26}
                  className="w-6 h-6 rounded-full object-cover border border-white/15"
                />
              ) : (
                <div className="w-6 h-6 rounded-full grid place-items-center text-[10px]
                  font-bold bg-white/10 border border-white/15 text-white/70">
                  {user.email?.[0].toUpperCase() ?? "U"}
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold text-white/70 leading-none">
                  {user.displayName ?? user.email?.split("@")[0] ?? "Controller"}
                </span>
                <span className="text-[9px] text-white/25 mt-0.5">Section Controller</span>
              </div>
            </div>
          )}

          {/* Tour replay */}
          <Link
            to="/book"
            className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold
              cursor-pointer bg-white/[0.04] border border-white/[0.08] text-white/55
              hover:bg-white/[0.1] hover:text-white transition-all"
          >
            Book Ticket
          </Link>

          <Link
            to="/my-bookings"
            className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold
              cursor-pointer bg-white/[0.04] border border-white/[0.08] text-white/55
              hover:bg-white/[0.1] hover:text-white transition-all"
          >
            My Bookings
          </Link>

          <button
            onClick={() => {
              sessionStorage.removeItem("tourDone");
              setActiveTab("dashboard");
              setShowTour(true);
            }}
            title="Replay onboarding tour"
            className="w-9 h-9 rounded-xl grid place-items-center text-sm cursor-pointer
              bg-white/[0.04] border border-white/[0.08] text-white/30
              hover:bg-white/[0.08] hover:text-white/60 transition-all"
          >?</button>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold
              cursor-pointer bg-white/[0.04] border border-white/[0.08] text-white/40
              hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 transition-all"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      </header>

      {/* ══════════════════════ MAIN ══════════════════════ */}
      <main className="relative z-10 flex-1 px-5 py-6 max-w-[1400px] mx-auto w-full">

        {/* Onboarding tour */}
        {showTour && activeTab === "dashboard" && (
          <OnboardingTour onComplete={() => {
            sessionStorage.setItem("tourDone", "1");
            setShowTour(false);
          }} />
        )}

        {/* Page heading */}
        <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1
              className="font-extrabold text-white tracking-tight leading-none"
              style={{ fontSize: "clamp(1.4rem, 2.5vw, 1.9rem)" }}
            >
              Section Dashboard
            </h1>
            <p className="text-xs mt-1.5 text-white/35">
              Real-time RF delay predictions · SHAP explanations · Auto-refresh every 60s
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {tickCount > 0 && (
              <span
                className="text-xs px-2.5 py-1 rounded-full bg-blue-500/10
                  border border-blue-500/20 text-blue-400 font-semibold"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {tickCount} fetches
              </span>
            )}
            {lastTick && (
              <span className="text-xs text-white/20 hidden sm:block">
                Last update: {lastTick}
              </span>
            )}

            {/* Live toggle */}
            <button
              data-tour="simtoggle"
              onClick={toggleLive}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold
                cursor-pointer transition-all duration-200
                ${isLive
                  ? "bg-amber-400/10 border border-amber-400/25 text-amber-400"
                  : "bg-white/[0.05] border border-white/10 text-white/40 hover:bg-white/10 hover:text-white/70"
                }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full inline-block flex-shrink-0 ${isLive
                  ? "bg-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.2)] animate-pulse"
                  : "bg-white/25"
                }`} />
              {isLoading ? "⏳ Loading…" : isLive ? "⏸ Pause" : "▶ Start Live"}
            </button>

            {/* Mobile clock */}
            <div
              className="flex md:hidden flex-col items-end"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              <span className="text-sm font-bold text-white tracking-widest">{timeStr}</span>
              <span className="text-[10px] text-white/25">{dateStr}</span>
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div className={`mb-0 px-5 py-3 rounded-t-2xl flex items-center justify-between
          flex-wrap gap-2 border border-b-0 transition-all duration-500
          ${isLive
            ? "bg-emerald-500/[0.04] border-emerald-500/15"
            : "bg-white/[0.02] border-white/[0.06]"
          }`}>
          <div className="flex items-center gap-6 flex-wrap">
            {[
              {
                label: "Engine", val: isLive ? "Running" : "Paused",
                cls: isLive ? "text-emerald-400" : "text-amber-400"
              },
              { label: "Interval", val: "60s", cls: "text-white/50" },
              { label: "Coverage", val: "Multi-route", cls: "text-white/50" },
              {
                label: "Trains", val: `${delays.length} tracked`,
                cls: delays.length > 0 ? "text-blue-400" : "text-white/50"
              },
              { label: "Model", val: "Random Forest + SHAP", cls: "text-purple-400" },
            ].map(({ label, val, cls }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="text-white/30 text-xs">{label}:</span>
                <span className={`font-bold text-sm ${cls}`}>{val}</span>
              </div>
            ))}
          </div>
          <span className="text-xs text-white/20">
            Press{" "}
            <kbd className="bg-white/[0.07] border border-white/10 rounded
              px-1.5 py-0.5 font-mono text-[9px] text-white/30">Space</kbd>
            {" "}to toggle
          </span>
        </div>

        {/* Tab switcher */}
        <div className={`flex items-center gap-0 mb-6 border border-t-0 rounded-b-2xl
          px-2 transition-all duration-500
          ${isLive
            ? "bg-emerald-500/[0.02] border-emerald-500/15"
            : "bg-white/[0.015] border-white/[0.06]"
          }`}>
          {(["dashboard", "analytics", "optimization"] as Tab[]).map((tab) => (
            <button
              key={tab}
              data-tour={tab === "analytics" ? "analytics-tab" : undefined}
              onClick={() => setActiveTab(tab)}
              className={`relative px-7 py-3.5 text-base font-bold cursor-pointer
                bg-transparent border-none transition-all duration-200
                ${activeTab === tab
                  ? "text-white"
                  : "text-white/35 hover:text-white/60"
                }`}
            >
              {tab === "dashboard"
                ? "🗺  Dashboard"
                : tab === "analytics"
                  ? "📊  Analytics"
                  : "🧠  Optimization"}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-4 right-4 h-[2px]
                  rounded-full bg-amber-400" />
              )}
            </button>
          ))}
        </div>

        {/* ── Tab content ───────────────────────────────── */}
        {activeTab === "dashboard" ? (
          <div className="flex flex-col gap-5">

            {/* Pass live delays to warning banner */}
            <PredictiveWarningBanner delays={delays} />

            {/* KPIs */}
            <div data-tour="kpi">
              <KpiCards />
            </div>

            {/* Block map */}
            <div
              data-tour="blockmap"
              className="rounded-2xl bg-white/[0.03] border border-white/[0.07]
                backdrop-blur-xl overflow-hidden"
            >
              <BlockMap />
            </div>

            {/* Train + Conflict side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
              <div
                data-tour="trainpanel"
                className="lg:col-span-2 rounded-2xl bg-white/[0.03]
                  border border-white/[0.07] backdrop-blur-xl overflow-visible"
              >
                <TrainPanel delays={delays} isLoading={isLoading} />
              </div>

              <div
                data-tour="conflictpanel"
                className="rounded-2xl bg-white/[0.03] border border-white/[0.07]
                  backdrop-blur-xl overflow-hidden self-start"
              >
                <ConflictPanel delays={delays} />
              </div>
            </div>

            {/* Recommendations */}
            <div
              data-tour="recommendations"
              className="mb-4 rounded-2xl bg-white/[0.03] border border-white/[0.07]
                backdrop-blur-xl overflow-hidden"
            >
              <RecommendationPanel delays={delays} />
            </div>
          </div>
        ) : activeTab === "analytics" ? (
          <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07]
            backdrop-blur-xl overflow-hidden">
            <Analytics />
          </div>
        ) : (
          <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07]
            backdrop-blur-xl overflow-hidden">
            <OptimizationStudio liveTrains={liveTrains} delays={delays} />
          </div>
        )}

        {/* Keyboard hints footer */}
        <div className="mt-8 mb-2 flex justify-center items-center gap-6 flex-wrap">
          {[
            ["1", "dashboard"],
            ["2", "analytics"],
            ["3", "optimization"],
            ["Space", "pause / resume"],
            ["Esc", "close panel"],
          ].map(([key, desc]) => (
            <span key={key} className="flex items-center gap-1.5 text-[10px] text-white/15">
              <kbd className="bg-white/[0.05] border border-white/[0.09] rounded
                px-1.5 py-0.5 font-mono text-[9px] text-white/25">{key}</kbd>
              {desc}
            </span>
          ))}
        </div>
      </main>
    </div>
  );
}
