import { useState } from "react";
import { Link } from "react-router-dom";
import { getBookingByPNR } from "../lib/api";
import type { Booking } from "../types";

export default function PnrStatus() {
  const [pnr, setPnr] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    if (!pnr.trim()) return;
    setSearching(true);
    setError("");
    try {
      const result = await getBookingByPNR(pnr.trim());
      setBooking(result);
      if (!result) setError("No booking found for this PNR.");
    } catch (err) {
      console.error(err);
      setError("Could not fetch PNR status right now.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="min-h-screen px-5 py-8" style={{ background: "#06080d" }}>
      <div className="max-w-[860px] mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/35 font-bold mb-2">Passenger Self-Service</p>
            <h1 className="text-white font-extrabold tracking-tight" style={{ fontSize: "clamp(2rem,4vw,3rem)" }}>
              PNR Status
            </h1>
            <p className="text-sm text-white/45 mt-2">Check booking confirmation, fare, route, and passenger seat allocation with a single code.</p>
          </div>
          <Link to="/book" className="px-4 py-2 rounded-full text-black font-bold bg-white">Book Ticket</Link>
        </div>

        <div className="rounded-[24px] p-5 border border-white/10 bg-white/4">
          <div className="flex flex-col md:flex-row gap-3">
            <input
              value={pnr}
              onChange={(e) => setPnr(e.target.value.toUpperCase())}
              placeholder="Enter 10-character PNR"
              className="flex-1 rounded-2xl px-4 py-4 text-white bg-white/5 border border-white/10 outline-none"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-6 py-4 rounded-2xl font-extrabold text-black bg-white"
            >
              {searching ? "Checking..." : "Check Status"}
            </button>
          </div>

          {error && <p className="text-sm text-red-300 mt-3">{error}</p>}

          {booking && (
            <div className="mt-5 rounded-[22px] p-5 border border-white/10 bg-white/4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-white font-extrabold text-xl">{booking.trainName}</p>
                  <p className="text-white/45 text-sm mt-1">{booking.trainNumber} · {booking.fromStation} → {booking.toStation}</p>
                </div>
                <span
                  className="px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{
                    background: booking.status === "CONFIRMED" ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                    color: booking.status === "CONFIRMED" ? "#4ade80" : "#f87171",
                  }}
                >
                  {booking.status}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                {[
                  { label: "PNR", value: booking.pnr },
                  { label: "Travel Date", value: booking.travelDate },
                  { label: "Class", value: booking.seatClass },
                  { label: "Fare", value: `₹${booking.totalFare}` },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl p-3 bg-white/4 border border-white/8">
                    <p className="text-xs uppercase tracking-[0.14em] text-white/30 font-bold">{item.label}</p>
                    <p className="text-white font-extrabold mt-2">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl p-4 bg-white/4 border border-white/8">
                <p className="text-xs uppercase tracking-[0.14em] text-white/30 font-bold mb-3">Passenger Manifest</p>
                <div className="flex flex-col gap-2">
                  {booking.passengers.map((passenger) => (
                    <div key={`${booking.id}-${passenger.idNumber}`} className="flex items-center justify-between text-sm">
                      <span className="text-white/75">{passenger.name} · {passenger.age} · {passenger.idType}</span>
                      <span className="text-white font-semibold">{passenger.seatNumber ?? "TBD"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
