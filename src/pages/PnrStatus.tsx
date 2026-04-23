import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getBookingByPNR } from "../lib/api";
import type { Booking } from "../types";

export default function PnrStatus() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [pnr, setPnr] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = 0.85;
  }, []);

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
    <div style={{ background: "#050505" }}>
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        className="fixed inset-0 h-full w-full object-cover"
        style={{ zIndex: 0, opacity: 0.48 }}
      >
        <source src="/hero-video.mp4" type="video/mp4" />
      </video>

      <div
        className="fixed inset-0"
        style={{
          zIndex: 1,
          background: `
            linear-gradient(to bottom, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.7) 100%),
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
                to="/book"
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.25)",
                  backdropFilter: "blur(8px)",
                }}
              >
                Book Ticket
              </Link>
            </div>
          </div>
        </nav>

        <div className="min-h-screen px-5 pb-10 pt-28 md:px-6 md:pt-32">
          <div className="max-w-[960px] mx-auto">
            <div className="mb-8 max-w-[760px]">
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
                Passenger Self-Service
              </p>
              <h1
                className="font-display font-bold tracking-tight text-white"
                style={{
                  fontSize: "clamp(2.7rem,5.5vw,5rem)",
                  lineHeight: 0.92,
                  letterSpacing: "-0.03em",
                  textShadow: "0 4px 60px rgba(0,0,0,0.7)",
                }}
              >
                Check your journey,
                <span className="block text-white/90" style={{ WebkitTextStroke: "1px rgba(255,255,255,0.35)" }}>
                  with one live PNR.
                </span>
              </h1>
              <p className="mt-5 text-base leading-relaxed text-white/62 md:text-lg">
                Look up booking confirmation, fare, route, and passenger seat allocation in the same calm visual shell as the booking flow.
              </p>
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
      </div>
    </div>
  );
}
