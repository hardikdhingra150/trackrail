import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "../lib/firebase";
import { cancelBooking, getUserBookings } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import { getStationName } from "../utils/seedData";
import type { Booking } from "../types";

export default function MyBookings() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [user] = useAuthState(auth);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = 0.85;
  }, []);

  useEffect(() => {
    if (!user) return;
    getUserBookings(user.uid)
      .then(setBookings)
      .catch((error) => {
        console.error(error);
        showToast("Could not load bookings", "error", "Please refresh the page");
      })
      .finally(() => setLoading(false));
  }, [user, showToast]);

  const handleCancel = async (booking: Booking) => {
    setCancelling(booking.id);
    try {
      const refundAmount = Math.round(booking.totalFare * 0.85);
      await cancelBooking(booking.id, refundAmount);
      setBookings((prev) => prev.map((item) => item.id === booking.id
        ? { ...item, status: "CANCELLED", refundAmount }
        : item));
      showToast("Ticket cancelled", "info", `Refund initiated: ₹${refundAmount}`);
    } catch (error) {
      console.error(error);
      showToast("Cancellation failed", "error", "Please try again later");
    } finally {
      setCancelling(null);
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
                Book Another
              </Link>
            </div>
          </div>
        </nav>

        <div className="min-h-screen px-5 pb-10 pt-28 md:px-6 md:pt-32">
          <div className="max-w-[1200px] mx-auto">
            <div className="mb-8 max-w-[780px]">
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
                Passenger Workspace
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
                Your active journeys,
                <span className="block text-white/90" style={{ WebkitTextStroke: "1px rgba(255,255,255,0.35)" }}>
                  in one calm ledger.
                </span>
              </h1>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  to="/book"
                  className="rounded-full bg-white px-5 py-3 text-sm font-bold text-black transition-all duration-200 hover:-translate-y-0.5"
                >
                  Book Another
                </Link>
                <Link
                  to="/pnr-status"
                  className="rounded-full px-5 py-3 text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  PNR Status
                </Link>
              </div>
              <p className="mt-5 text-base leading-relaxed text-white/62 md:text-lg">
                Track active tickets, PNRs, class, fare, passengers, and cancellations in the same passenger-side theme as booking and status lookup.
              </p>
            </div>

            {loading ? (
              <div
                className="rounded-[30px] p-6 text-white/45"
                style={{
                  background: "rgba(0,0,0,0.34)",
                  border: "1px solid rgba(255,255,255,0.11)",
                  backdropFilter: "blur(28px)",
                  boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
                }}
              >
                Loading bookings…
              </div>
            ) : bookings.length === 0 ? (
              <div
                className="rounded-[30px] p-8 text-center"
                style={{
                  background: "rgba(0,0,0,0.34)",
                  border: "1px dashed rgba(255,255,255,0.14)",
                  backdropFilter: "blur(28px)",
                  boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
                }}
              >
                <p className="text-white font-bold text-lg">No tickets booked yet</p>
                <p className="text-white/40 mt-2">Create your first passenger booking and your travel ledger will start appearing here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {bookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="rounded-[30px] p-5 md:p-6"
                    style={{
                      background: "rgba(0,0,0,0.34)",
                      border: "1px solid rgba(255,255,255,0.11)",
                      backdropFilter: "blur(28px)",
                      boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-white font-extrabold text-lg">{booking.trainName}</p>
                        <p className="text-white/45 text-sm mt-1">
                          {booking.trainNumber} · {getStationName(booking.fromStation)} → {getStationName(booking.toStation)}
                        </p>
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

                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <div className="rounded-2xl p-3 bg-white/4 border border-white/8">
                        <p className="text-xs uppercase tracking-[0.14em] text-white/30 font-bold">PNR</p>
                        <p className="text-white font-extrabold mt-2">{booking.pnr}</p>
                      </div>
                      <div className="rounded-2xl p-3 bg-white/4 border border-white/8">
                        <p className="text-xs uppercase tracking-[0.14em] text-white/30 font-bold">Fare</p>
                        <p className="text-white font-extrabold mt-2">₹{booking.totalFare}</p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl p-4 bg-white/4 border border-white/8">
                      <p className="text-xs uppercase tracking-[0.14em] text-white/30 font-bold mb-3">Passengers</p>
                      <div className="flex flex-col gap-2">
                        {booking.passengers.map((passenger) => (
                          <div key={`${booking.id}-${passenger.idNumber}`} className="flex items-center justify-between text-sm">
                            <span className="text-white/75">{passenger.name} · {passenger.gender} · {passenger.age}</span>
                            <span className="text-white font-semibold">{passenger.seatNumber ?? "TBD"}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-4">
                      <div className="text-sm text-white/40">
                        Travel date: <span className="text-white/70">{booking.travelDate}</span>
                      </div>
                      {booking.status === "CONFIRMED" ? (
                        <button
                          onClick={() => handleCancel(booking)}
                          disabled={cancelling === booking.id}
                          className="px-4 py-2 rounded-full text-sm font-bold text-red-300 bg-red-500/10 border border-red-500/20"
                        >
                          {cancelling === booking.id ? "Cancelling..." : "Cancel Ticket"}
                        </button>
                      ) : (
                        <span className="text-sm text-white/35">Refund: ₹{booking.refundAmount ?? 0}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
