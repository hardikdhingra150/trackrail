import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "../lib/firebase";
import { createBooking } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import {
  TRAINS,
  searchStations,
  formatDuration,
  getFareForClass,
  formatStationLabel,
  formatStationDetail,
  resolveStationQuery,
  getStationName,
} from "../utils/seedData";
import type { Passenger, Station, Train } from "../types";

const shell = {
  background: "#050505",
  card: "rgba(255,255,255,0.05)",
  cardStrong: "rgba(0,0,0,0.34)",
  border: "rgba(255,255,255,0.11)",
};

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

function buildSeatLabel(seatClass: string, index: number) {
  return `${seatClass}-${String(index + 1).padStart(2, "0")}`;
}

function riskTone(delayClass: Train["delayClass"]) {
  if (delayClass === "HIGH") return { text: "#f87171", bg: "rgba(248,113,113,0.1)" };
  if (delayClass === "MEDIUM") return { text: "#fbbf24", bg: "rgba(251,191,36,0.12)" };
  return { text: "#4ade80", bg: "rgba(74,222,128,0.1)" };
}

const defaultPassenger = (): Passenger => ({
  name: "",
  age: 30,
  gender: "M",
  idType: "Aadhaar",
  idNumber: "",
  berthPreference: "No Preference",
});

export default function BookTickets() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [user] = useAuthState(auth);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [fromQuery, setFromQuery] = useState("NDLS");
  const [toQuery, setToQuery] = useState("HWH");
  const [travelDate, setTravelDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [selectedTrain, setSelectedTrain] = useState<Train | null>(null);
  const [selectedClass, setSelectedClass] = useState("");
  const [passengers, setPassengers] = useState<Passenger[]>([defaultPassenger()]);
  const [submitting, setSubmitting] = useState(false);
  const [activeField, setActiveField] = useState<"from" | "to" | null>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = 0.85;
  }, []);

  const fromSuggestions = useMemo(() => searchStations(fromQuery).slice(0, 8), [fromQuery]);
  const toSuggestions = useMemo(() => searchStations(toQuery).slice(0, 8), [toQuery]);

  const resolvedFrom = useMemo(() => resolveStationQuery(fromQuery), [fromQuery]);
  const resolvedTo = useMemo(() => resolveStationQuery(toQuery), [toQuery]);

  const matchingTrains = useMemo(() => {
    const from = resolvedFrom?.code;
    const to = resolvedTo?.code;
    if (!from || !to) return [];
    return TRAINS
      .filter((train) => train.fromStation === from && train.toStation === to)
      .map((train) => {
        const seed = Number(train.trainNumber.slice(-2)) || 1;
        const delayClass: Train["delayClass"] = seed % 5 === 0 ? "HIGH" : seed % 2 === 0 ? "MEDIUM" : "LOW";
        const avgDelayMinutes = delayClass === "HIGH" ? 38 : delayClass === "MEDIUM" ? 14 : 4;
        return { ...train, delayClass, avgDelayMinutes };
      });
  }, [resolvedFrom, resolvedTo]);

  const fareSummary = selectedTrain && selectedClass
    ? getFareForClass(selectedTrain, selectedClass) * passengers.length
    : 0;

  const updatePassenger = (index: number, patch: Partial<Passenger>) => {
    setPassengers((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const addPassenger = () => setPassengers((prev) => [...prev, defaultPassenger()]);
  const removePassenger = (index: number) => {
    setPassengers((prev) => prev.length === 1 ? prev : prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const selectStation = (field: "from" | "to", station: Station) => {
    if (field === "from") {
      setFromQuery(formatStationLabel(station));
    } else {
      setToQuery(formatStationLabel(station));
    }
    setActiveField(null);
    setSelectedTrain(null);
    setSelectedClass("");
  };

  const handleBook = async () => {
    if (!user || !selectedTrain || !selectedClass) {
      showToast("Booking incomplete", "error", "Select train, class, and sign in first");
      return;
    }
    if (passengers.some((passenger) => !passenger.name || !passenger.idNumber)) {
      showToast("Passenger details missing", "error", "Fill all passenger names and ID numbers");
      return;
    }

    setSubmitting(true);
    try {
      const booking = await createBooking({
        userId: user.uid,
        trainNumber: selectedTrain.trainNumber,
        trainName: selectedTrain.trainName,
        fromStation: selectedTrain.fromStation,
        toStation: selectedTrain.toStation,
        travelDate,
        seatClass: selectedClass,
        status: "CONFIRMED",
        totalFare: fareSummary,
        passengers: passengers.map((passenger, index) => ({
          ...passenger,
          seatNumber: buildSeatLabel(selectedClass, index),
        })),
      });

      showToast("Ticket booked", "success", `PNR ${booking.pnr} generated successfully`);
      navigate("/my-bookings");
    } catch (error) {
      console.error(error);
      showToast("Booking failed", "error", error instanceof Error ? error.message : "Please try again in a moment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ background: shell.background }}>
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        className="fixed inset-0 h-full w-full object-cover"
        style={{ zIndex: 0, opacity: 0.5 }}
      >
        <source src="/hero-video.mp4" type="video/mp4" />
      </video>

      <div
        className="fixed inset-0"
        style={{
          zIndex: 1,
          background: `
            linear-gradient(to bottom, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.68) 100%),
            linear-gradient(to right, rgba(0,0,0,0.32) 0%, transparent 58%)
          `,
        }}
      />

      <div className="relative min-h-screen" style={{ zIndex: 2 }}>
        <nav className="fixed left-0 right-0 top-0" style={{ zIndex: 50, background: "transparent", border: "none" }}>
          <div className="mx-auto flex max-w-[1220px] items-center justify-between gap-8 px-6 py-5">
            <Link to="/" className="flex items-center gap-3 shrink-0">
              <div
                className="grid h-10 w-10 place-items-center rounded-[14px] font-black text-lg"
                style={{
                  background: "#ffffff",
                  color: "#050505",
                  boxShadow: "0 8px 24px rgba(255,255,255,0.2)",
                }}
              >
                T
              </div>
              <span className="text-base font-extrabold tracking-tight text-white">TrackMind AI</span>
            </Link>

            <div className="hidden flex-1 items-center justify-end gap-10 md:flex">
              <div className="flex items-center gap-8 text-sm font-medium text-white/60">
                <Link to="/" className="transition-colors duration-200 hover:text-white">Home</Link>
                <Link to="/book" className="transition-colors duration-200 hover:text-white">Book Ticket</Link>
                <Link to="/pnr-status" className="transition-colors duration-200 hover:text-white">PNR Status</Link>
                <Link to="/my-bookings" className="transition-colors duration-200 hover:text-white">My Bookings</Link>
                <Link to="/dashboard" className="transition-colors duration-200 hover:text-white">Dashboard</Link>
              </div>

              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.25)",
                  backdropFilter: "blur(8px)",
                }}
              >
                Live Dashboard →
              </Link>
            </div>
          </div>
        </nav>

        <div className="min-h-screen px-5 pb-10 pt-28 md:px-6 md:pt-32">
          <div className="max-w-[1220px] mx-auto">
            <div className="mb-8 max-w-[900px]">
              <p
                className="mb-4 inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/80"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  backdropFilter: "blur(12px)",
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full bg-white"
                  style={{ boxShadow: "0 0 0 4px rgba(255,255,255,0.15)" }}
                />
                Smart Travel Desk
              </p>

              <h1
                className="font-display font-bold tracking-tight text-white"
                style={{
                  fontSize: "clamp(2.8rem,6vw,5.75rem)",
                  lineHeight: 0.92,
                  letterSpacing: "-0.03em",
                  textShadow: "0 4px 60px rgba(0,0,0,0.7)",
                }}
              >
                Delay-aware booking,
                <span className="block text-white/90" style={{ WebkitTextStroke: "1px rgba(255,255,255,0.35)" }}>
                  wrapped in calm control.
                </span>
              </h1>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link
                  to="/pnr-status"
                  className="rounded-full px-5 py-3 text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  Check PNR
                </Link>
                <Link
                  to="/my-bookings"
                  className="rounded-full bg-white px-5 py-3 text-sm font-bold text-black transition-all duration-200 hover:-translate-y-0.5"
                >
                  My Bookings
                </Link>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  { to: "/journey-planner", label: "Journey Planner" },
                  { to: "/live-status", label: "Live Train Status" },
                  { to: "/platform-alerts", label: "Platform Alerts" },
                  { to: "/pnr-status", label: "PNR Status" },
                  { to: "/my-bookings", label: "My Bookings" },
                ].map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="rounded-full px-4 py-2 text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5"
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.18)",
                      backdropFilter: "blur(12px)",
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>

              <p className="mt-5 max-w-[720px] text-base leading-relaxed text-white/62 md:text-lg">
                Search routes, compare delay risk, reserve seats, and move through ticketing in the same visual language as the live rail command center.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.12fr_0.88fr]">
              <div
                className="rounded-[30px] p-5 md:p-6"
                style={{
                  background: shell.cardStrong,
                  border: `1px solid ${shell.border}`,
                  backdropFilter: "blur(28px)",
                  boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
                }}
              >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div className="relative">
                <label className="block text-xs font-bold text-white/35 uppercase tracking-[0.16em] mb-2">From</label>
                <input
                  value={fromQuery}
                  onFocus={() => setActiveField("from")}
                  onChange={(e) => setFromQuery(e.target.value)}
                  placeholder="Search city or station"
                  style={inputStyle()}
                />
                {resolvedFrom && (
                  <p className="mt-2 text-xs text-white/45">
                    {resolvedFrom.name}, {resolvedFrom.city}
                  </p>
                )}
                {activeField === "from" && fromSuggestions.length > 0 && (
                  <div
                    className="absolute left-0 right-0 top-[100%] z-20 mt-2 overflow-hidden rounded-2xl"
                    style={{
                      background: "rgba(10,10,10,0.92)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      backdropFilter: "blur(20px)",
                    }}
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
                <label className="block text-xs font-bold text-white/35 uppercase tracking-[0.16em] mb-2">To</label>
                <input
                  value={toQuery}
                  onFocus={() => setActiveField("to")}
                  onChange={(e) => setToQuery(e.target.value)}
                  placeholder="Search city or station"
                  style={inputStyle()}
                />
                {resolvedTo && (
                  <p className="mt-2 text-xs text-white/45">
                    {resolvedTo.name}, {resolvedTo.city}
                  </p>
                )}
                {activeField === "to" && toSuggestions.length > 0 && (
                  <div
                    className="absolute left-0 right-0 top-[100%] z-20 mt-2 overflow-hidden rounded-2xl"
                    style={{
                      background: "rgba(10,10,10,0.92)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      backdropFilter: "blur(20px)",
                    }}
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

              <div>
                <label className="block text-xs font-bold text-white/35 uppercase tracking-[0.16em] mb-2">Travel Date</label>
                <input type="date" value={travelDate} onChange={(e) => setTravelDate(e.target.value)} style={inputStyle()} />
              </div>
            </div>

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold text-lg">Available Trains</h2>
              <span className="text-xs text-white/35">{matchingTrains.length} result{matchingTrains.length !== 1 ? "s" : ""}</span>
            </div>

            {matchingTrains.length === 0 ? (
              <div className="rounded-2xl p-6 text-center border border-dashed border-white/10 text-white/40">
                No direct demo trains found for this route yet. Try `NDLS → HWH`, `NDLS → BCT`, `NDLS → MAS`, or `NDLS → SBC`.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {matchingTrains.map((train) => {
                  const active = selectedTrain?.trainNumber === train.trainNumber;
                  const tone = riskTone(train.delayClass);
                  return (
                    <button
                      key={train.trainNumber}
                      onClick={() => {
                        setSelectedTrain(train);
                        setSelectedClass(Object.keys(train.classes)[0] ?? "");
                      }}
                      className="w-full text-left rounded-2xl p-4 transition-all"
                      style={{
                        background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}`,
                      }}
                    >
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-white font-extrabold">{train.trainNumber}</span>
                            <span className="text-xs px-2 py-1 rounded-full" style={{ color: tone.text, background: tone.bg }}>
                              {train.delayClass} delay risk
                            </span>
                          </div>
                          <p className="text-white/85 font-semibold">{train.trainName}</p>
                          <p className="text-sm text-white/40 mt-1">
                            {getStationName(train.fromStation)} → {getStationName(train.toStation)} · {train.departureTime} to {train.arrivalTime} · {formatDuration(train.durationMinutes)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-white/35 uppercase tracking-[0.12em]">Best fare</p>
                          <p className="text-white font-extrabold mt-1">₹{Math.min(...Object.values(train.classes).map((seat) => seat.fare))}</p>
                          <p className="text-xs text-white/35 mt-1">Avg delay {train.avgDelayMinutes} min</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
              </div>

              <div
                className="rounded-[30px] p-5 md:p-6"
                style={{
                  background: shell.cardStrong,
                  border: `1px solid ${shell.border}`,
                  backdropFilter: "blur(28px)",
                  boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
                }}
              >
            <div className="mb-5">
              <h2 className="text-white font-bold text-lg">Booking Summary</h2>
              <p className="text-sm text-white/40 mt-1">Select a train and passenger details to generate a live PNR.</p>
            </div>

            {!selectedTrain ? (
              <div className="rounded-2xl p-6 text-center border border-dashed border-white/10 text-white/40">
                Pick a train from the left to start booking.
              </div>
            ) : (
              <>
                <div className="rounded-2xl p-4 mb-4 border border-white/10 bg-white/5">
                  <p className="text-white font-extrabold">{selectedTrain.trainName}</p>
                  <p className="text-sm text-white/40 mt-1">
                    {selectedTrain.trainNumber} · {getStationName(selectedTrain.fromStation)} → {getStationName(selectedTrain.toStation)}
                  </p>
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    {Object.entries(selectedTrain.classes).map(([className, seat]) => (
                      <button
                        key={className}
                        onClick={() => setSelectedClass(className)}
                        className="rounded-xl p-3 text-left transition-all"
                        style={{
                          background: selectedClass === className ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
                          border: `1px solid ${selectedClass === className ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}`,
                        }}
                      >
                        <p className="text-white font-bold">{className}</p>
                        <p className="text-sm text-white/45">₹{seat.fare} · {seat.seatsAvailable} seats</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-bold">Passengers</h3>
                  <button onClick={addPassenger} className="px-3 py-2 rounded-full text-xs font-bold text-black bg-white">
                    + Add Passenger
                  </button>
                </div>

                <div className="flex flex-col gap-3">
                  {passengers.map((passenger, index) => (
                    <div key={index} className="rounded-2xl p-4 border border-white/10 bg-white/4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-white font-semibold">Passenger {index + 1}</p>
                        {passengers.length > 1 && (
                          <button onClick={() => removePassenger(index)} className="text-xs font-bold text-red-300">
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input placeholder="Full name" value={passenger.name} onChange={(e) => updatePassenger(index, { name: e.target.value })} style={inputStyle()} />
                        <input type="number" placeholder="Age" value={passenger.age} onChange={(e) => updatePassenger(index, { age: Number(e.target.value) })} style={inputStyle()} />
                        <select value={passenger.gender} onChange={(e) => updatePassenger(index, { gender: e.target.value as Passenger["gender"] })} style={inputStyle()}>
                          <option value="M">Male</option>
                          <option value="F">Female</option>
                          <option value="Other">Other</option>
                        </select>
                        <select value={passenger.idType} onChange={(e) => updatePassenger(index, { idType: e.target.value as Passenger["idType"] })} style={inputStyle()}>
                          <option value="Aadhaar">Aadhaar</option>
                          <option value="PAN">PAN</option>
                          <option value="Passport">Passport</option>
                          <option value="Voter ID">Voter ID</option>
                        </select>
                        <input placeholder="ID number" value={passenger.idNumber} onChange={(e) => updatePassenger(index, { idNumber: e.target.value })} style={inputStyle()} />
                        <select value={passenger.berthPreference} onChange={(e) => updatePassenger(index, { berthPreference: e.target.value as Passenger["berthPreference"] })} style={inputStyle()}>
                          <option value="No Preference">No Preference</option>
                          <option value="Lower">Lower</option>
                          <option value="Middle">Middle</option>
                          <option value="Upper">Upper</option>
                          <option value="Side Lower">Side Lower</option>
                          <option value="Side Upper">Side Upper</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl p-4 border border-white/10 bg-white/5 mt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-white/35 font-bold">Fare Estimate</p>
                      <p className="text-3xl font-extrabold text-white mt-2">₹{fareSummary || 0}</p>
                    </div>
                    <div className="text-right text-sm text-white/45">
                      <p>{passengers.length} passenger{passengers.length !== 1 ? "s" : ""}</p>
                      <p>{selectedClass || "Select class"}</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleBook}
                  disabled={submitting || !user}
                  className="w-full mt-4 py-4 rounded-2xl font-extrabold text-base transition-all disabled:opacity-50"
                  style={{ background: "#fff", color: "#050505" }}
                >
                  {user ? (submitting ? "Booking..." : "Confirm Ticket") : "Sign in to book"}
                </button>
              </>
            )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
