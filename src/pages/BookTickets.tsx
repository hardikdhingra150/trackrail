import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "../lib/firebase";
import { createBooking } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import { TRAINS, searchStations, formatDuration, getFareForClass } from "../utils/seedData";
import type { Passenger, Train } from "../types";

const shell = {
  background: "#06080d",
  card: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.09)",
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

  const [fromQuery, setFromQuery] = useState("NDLS");
  const [toQuery, setToQuery] = useState("HWH");
  const [travelDate, setTravelDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [selectedTrain, setSelectedTrain] = useState<Train | null>(null);
  const [selectedClass, setSelectedClass] = useState("");
  const [passengers, setPassengers] = useState<Passenger[]>([defaultPassenger()]);
  const [submitting, setSubmitting] = useState(false);

  const fromSuggestions = useMemo(() => searchStations(fromQuery).slice(0, 5), [fromQuery]);
  const toSuggestions = useMemo(() => searchStations(toQuery).slice(0, 5), [toQuery]);

  const matchingTrains = useMemo(() => {
    const from = fromQuery.trim().toUpperCase();
    const to = toQuery.trim().toUpperCase();
    return TRAINS
      .filter((train) => train.fromStation === from && train.toStation === to)
      .map((train) => {
        const seed = Number(train.trainNumber.slice(-2)) || 1;
        const delayClass: Train["delayClass"] = seed % 5 === 0 ? "HIGH" : seed % 2 === 0 ? "MEDIUM" : "LOW";
        const avgDelayMinutes = delayClass === "HIGH" ? 38 : delayClass === "MEDIUM" ? 14 : 4;
        return { ...train, delayClass, avgDelayMinutes };
      });
  }, [fromQuery, toQuery]);

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
      showToast("Booking failed", "error", "Please try again in a moment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen px-5 py-8" style={{ background: shell.background }}>
      <div className="max-w-[1280px] mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35 mb-2">Smart Travel Desk</p>
            <h1 className="text-white font-extrabold tracking-tight" style={{ fontSize: "clamp(2rem,4vw,3.25rem)" }}>
              Book Tickets with Delay-Aware Suggestions
            </h1>
            <p className="text-sm text-white/45 mt-2 max-w-[760px]">
              Search routes, compare delay risk, reserve seats, and move straight into operations-aware travel planning.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link to="/pnr-status" className="px-4 py-2 rounded-full text-sm font-bold text-white/75 border border-white/10 bg-white/5">
              Check PNR
            </Link>
            <Link to="/my-bookings" className="px-4 py-2 rounded-full text-sm font-bold text-black bg-white">
              My Bookings
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-5">
          <div className="rounded-[24px] p-5" style={{ background: shell.card, border: `1px solid ${shell.border}` }}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div>
                <label className="block text-xs font-bold text-white/35 uppercase tracking-[0.16em] mb-2">From</label>
                <input value={fromQuery} onChange={(e) => setFromQuery(e.target.value.toUpperCase())} style={inputStyle()} />
                <div className="flex gap-2 flex-wrap mt-2">
                  {fromSuggestions.map((station) => (
                    <button key={station.code} onClick={() => setFromQuery(station.code)}
                      className="px-2.5 py-1.5 rounded-full text-xs font-semibold text-white/70 bg-white/5 border border-white/10">
                      {station.code}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-white/35 uppercase tracking-[0.16em] mb-2">To</label>
                <input value={toQuery} onChange={(e) => setToQuery(e.target.value.toUpperCase())} style={inputStyle()} />
                <div className="flex gap-2 flex-wrap mt-2">
                  {toSuggestions.map((station) => (
                    <button key={station.code} onClick={() => setToQuery(station.code)}
                      className="px-2.5 py-1.5 rounded-full text-xs font-semibold text-white/70 bg-white/5 border border-white/10">
                      {station.code}
                    </button>
                  ))}
                </div>
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
                            {train.fromStation} → {train.toStation} · {train.departureTime} to {train.arrivalTime} · {formatDuration(train.durationMinutes)}
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

          <div className="rounded-[24px] p-5" style={{ background: shell.card, border: `1px solid ${shell.border}` }}>
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
                    {selectedTrain.trainNumber} · {selectedTrain.fromStation} → {selectedTrain.toStation}
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
  );
}
